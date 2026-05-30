"""printcast - HTTP->ESC/POS bridge for a homelab network thermal printer.

Many notification sources (n8n, Home Assistant, ntfy, curl) POST JSON here and
this service prints to a single 80mm ESC/POS printer reached over raw TCP 9100.

This module also exposes an admin API consumed by the bundled React frontend:
a first-run setup wizard, a supervision dashboard, and analytics over the
SQLite-backed job history.
"""
import base64
import hmac
import io
import json
import logging
import os
import secrets
import socket
import sqlite3
import sys
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Literal, Optional
from zoneinfo import ZoneInfo

import httpx
import requests
import uvicorn
from escpos.printer import Network
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field

from discovery import discover_printers


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


SERVICE_NAME = "printcast"
DATA_DIR = Path(os.environ.get("PRINTCAST_DATA_DIR", "/app/data"))
CONFIG_FILE = DATA_DIR / "config.json"
DB_FILE = DATA_DIR / "printcast.db"
FRONTEND_DIR = Path(os.environ.get("PRINTCAST_FRONTEND_DIR",
                                   str(Path(__file__).parent / "frontend" / "dist")))
# Auto-detect a printer at startup when no host is configured. Disable when you
# need deterministic behavior (e.g. tests) by setting PRINTER_AUTODETECT=false.
PRINTER_AUTODETECT = _bool_env("PRINTER_AUTODETECT", True)

# Populated when the host comes from auto-detection rather than the env var,
# so /health can advertise how it found the printer.
PRINTER_DISCOVERY: Optional[dict] = None

LINE_WIDTH = 48          # 72mm print area at 203 dpi
MAX_IMG_WIDTH = 512      # dots; images wider than this are downscaled
HEALTH_TCP_TIMEOUT = 3   # seconds for the /health connect probe
IMAGE_FETCH_TIMEOUT = 15
JOB_HISTORY_LIMIT = 5000

# Runtime config -- starts from env, gets overlaid by the persisted config.json.
CONFIG: dict[str, Any] = {
    "printer_host": os.environ.get("PRINTER_HOST", ""),
    "printer_port": _int_env("PRINTER_PORT", 9100),
    "printer_codepage": os.environ.get("PRINTER_CODEPAGE", "CP858"),
    "printer_token": os.environ.get("PRINTER_TOKEN", ""),
    "printer_timeout": _int_env("PRINTER_TIMEOUT", 20),
    "printer_retries": max(1, _int_env("PRINTER_RETRIES", 3)),
    "tz": os.environ.get("TZ", "Europe/Paris"),
    # Per-IP rate limit for /print* endpoints. Set either limit to 0 to
    # disable that window. Defaults are conservative so a public deployment
    # is not DOS'd through paper/ink even if the bearer token leaks.
    "rate_limit_per_minute": max(0, _int_env("RATE_LIMIT_PER_MINUTE", 10)),
    "rate_limit_per_hour": max(0, _int_env("RATE_LIMIT_PER_HOUR", 100)),
    # Offline print queue: when the printer is unreachable at submit time, the
    # job is persisted to SQLite and flushed (FIFO) by a background worker once
    # the printer comes back. queue_max caps the queue; queue_poll_seconds is
    # how often the worker probes the printer between flush attempts.
    "queue_enabled": _bool_env("PRINTER_QUEUE_ENABLED", True),
    "queue_poll_seconds": max(5, _int_env("PRINTER_QUEUE_POLL_SECONDS", 30)),
    "queue_max": max(1, _int_env("PRINTER_QUEUE_MAX", 500)),
    "setup_completed": False,
}
CONFIG_LOCK = threading.Lock()

# The better-auth sidecar runs as a separate process inside the container.
# FastAPI reverse-proxies /api/auth/* to it and validates session cookies via
# the sidecar's /__auth/whoami helper endpoint.
AUTH_INTERNAL_URL = os.environ.get("PRINTCAST_AUTH_URL", "http://127.0.0.1:8090")


def _load_persisted_config() -> None:
    if not CONFIG_FILE.exists():
        return
    try:
        with CONFIG_FILE.open("r", encoding="utf-8") as fh:
            persisted = json.load(fh)
        for key, value in persisted.items():
            if key in CONFIG:
                CONFIG[key] = value
    except (OSError, json.JSONDecodeError) as exc:
        logging.getLogger(SERVICE_NAME).warning(
            "could not load %s: %s", CONFIG_FILE, exc)


def _save_persisted_config() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_FILE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(CONFIG, fh, indent=2)
    tmp.replace(CONFIG_FILE)


def _resolve_tz() -> Any:
    try:
        return ZoneInfo(CONFIG["tz"])
    except Exception:
        return timezone.utc


# --------------------------------------------------------------------------
# Structured logging
# --------------------------------------------------------------------------
logger = logging.getLogger(SERVICE_NAME)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "event": record.getMessage(),
        }
        fields = getattr(record, "fields", None)
        if fields:
            payload.update(fields)
        if record.exc_info:
            payload["traceback"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False


def log(event: str, level: int = logging.INFO, **fields) -> None:
    logger.log(level, event, extra={"fields": fields})


_setup_logging()
_load_persisted_config()


# --------------------------------------------------------------------------
# Job history (SQLite)
# --------------------------------------------------------------------------
DB_LOCK = threading.Lock()


def _init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL NOT NULL,
                job_type TEXT NOT NULL,
                status TEXT NOT NULL,
                duration_ms INTEGER,
                attempts INTEGER,
                error TEXT,
                source TEXT,
                payload_summary TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_ts ON jobs(ts)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
        # Durable offline print queue. Kept separate from `jobs` so analytics
        # (which filters status in ('success','error')) is never polluted by
        # pending items; a flushed job lands in `jobs` via record_job().
        conn.execute("""
            CREATE TABLE IF NOT EXISTS print_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL NOT NULL,
                job_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                source TEXT,
                summary TEXT,
                attempts INTEGER DEFAULT 0,
                last_error TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_queue_id ON print_queue(id)")


@contextmanager
def _db():
    with DB_LOCK:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def record_job(job_type: str, status: str, duration_ms: Optional[int],
               attempts: int, error: Optional[str], source: Optional[str],
               summary: Optional[str]) -> None:
    try:
        with _db() as conn:
            conn.execute(
                """INSERT INTO jobs
                   (ts, job_type, status, duration_ms, attempts, error, source, payload_summary)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (time.time(), job_type, status, duration_ms, attempts,
                 error, source, summary),
            )
            # Trim the table to JOB_HISTORY_LIMIT most recent rows.
            conn.execute(
                """DELETE FROM jobs WHERE id IN (
                       SELECT id FROM jobs ORDER BY ts DESC LIMIT -1 OFFSET ?
                   )""",
                (JOB_HISTORY_LIMIT,),
            )
    except sqlite3.Error as exc:
        log("db.write.failed", level=logging.WARNING, error=str(exc))


# --------------------------------------------------------------------------
# Offline print queue storage (SQLite, FIFO by id)
# --------------------------------------------------------------------------
def enqueue_job(job_type: str, payload: dict, source: Optional[str],
                summary: Optional[str]) -> int:
    """Persist a pending print job; returns its queue id."""
    with _db() as conn:
        cur = conn.execute(
            """INSERT INTO print_queue (ts, job_type, payload, source, summary)
               VALUES (?, ?, ?, ?, ?)""",
            (time.time(), job_type, json.dumps(payload), source, summary),
        )
        return int(cur.lastrowid)


def list_queue(limit: int = 500) -> list[dict]:
    """Pending jobs oldest-first. `payload` is returned as the parsed dict."""
    limit = max(1, int(limit))
    with _db() as conn:
        rows = conn.execute(
            """SELECT id, ts, job_type, payload, source, summary, attempts, last_error
               FROM print_queue ORDER BY id ASC LIMIT ?""",
            (limit,),
        ).fetchall()
    out: list[dict] = []
    for r in rows:
        d = dict(r)
        try:
            d["payload"] = json.loads(d["payload"])
        except (TypeError, ValueError):
            d["payload"] = {}
        out.append(d)
    return out


def queue_depth() -> int:
    try:
        with _db() as conn:
            return int(conn.execute(
                "SELECT COUNT(*) AS n FROM print_queue").fetchone()["n"])
    except sqlite3.Error:
        return 0


def oldest_queued() -> Optional[sqlite3.Row]:
    with _db() as conn:
        return conn.execute(
            """SELECT id, ts, job_type, payload, source, summary, attempts, last_error
               FROM print_queue ORDER BY id ASC LIMIT 1""").fetchone()


def delete_queued(queue_id: int) -> None:
    with _db() as conn:
        conn.execute("DELETE FROM print_queue WHERE id = ?", (int(queue_id),))


def clear_queue() -> int:
    with _db() as conn:
        cur = conn.execute("DELETE FROM print_queue")
        return cur.rowcount or 0


def _mark_queue_error(queue_id: int, error: str) -> None:
    """Record a flush error against a queued row before it is removed."""
    with _db() as conn:
        conn.execute(
            "UPDATE print_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?",
            (error, int(queue_id)),
        )


# --------------------------------------------------------------------------
# Metrics and job serialization
# --------------------------------------------------------------------------
METRICS = {"success": 0, "error": 0, "queued": 0, "last_job_ts": 0.0}
PRINT_LOCK = threading.Lock()
QUEUE_FLUSH_LOCK = threading.Lock()
# Set to wake the worker for an immediate flush (manual or after an enqueue);
# QUEUE_SHUTDOWN stops the worker loop on application shutdown.
QUEUE_WAKE = threading.Event()
QUEUE_SHUTDOWN = threading.Event()


class PrintError(Exception):
    """Raised when a print job fails after exhausting all retries."""


def now_str() -> str:
    return datetime.now(_resolve_tz()).strftime("%Y-%m-%d %H:%M:%S %Z")


def describe_error(exc: Exception) -> str:
    msg = str(exc).strip()
    return f"{type(exc).__name__}: {msg}" if msg else type(exc).__name__


# --------------------------------------------------------------------------
# Printer plumbing
# --------------------------------------------------------------------------
def tcp_reachable(host: str, port: int, timeout: int = HEALTH_TCP_TIMEOUT) -> bool:
    if not host:
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def autodetect_printer() -> Optional[dict]:
    """Return the first reachable printer candidate on the LAN, or None.

    Records the discovered host into CONFIG and the discovery metadata into
    PRINTER_DISCOVERY so /health can surface how the printer was found.
    """
    global PRINTER_DISCOVERY
    port = int(CONFIG["printer_port"])
    log("printer.autodetect.start", port=port)
    candidates = discover_printers(port=port)
    for c in candidates:
        if tcp_reachable(c["host"], c["port"]):
            with CONFIG_LOCK:
                CONFIG["printer_host"] = c["host"]
                CONFIG["printer_port"] = c["port"]
            PRINTER_DISCOVERY = c
            log("printer.autodetect.found", **c)
            return c
    log("printer.autodetect.none", level=logging.WARNING,
        candidates=len(candidates))
    return None


def _apply_codepage(printer: Network) -> None:
    try:
        printer.charcode(CONFIG["printer_codepage"])
    except Exception as exc:
        log("printer.codepage.fallback", level=logging.WARNING,
            requested=CONFIG["printer_codepage"], error=str(exc))
        printer.charcode("AUTO")


def _do_print(render: Callable[[Network], None]) -> tuple[int, int]:
    """Run `render` against a fresh connection with backoff retry.

    Serializes through PRINT_LOCK, opens a Network per attempt, applies the
    codepage and renders. Returns (duration_ms, attempts) on success; raises
    PrintError after exhausting retries. Does NOT record the job or touch
    METRICS — callers decide how to account for the outcome.
    """
    if not CONFIG["printer_host"]:
        raise PrintError("printer is not configured")
    started = time.monotonic()
    retries = max(1, int(CONFIG["printer_retries"]))
    with PRINT_LOCK:
        last_exc: Optional[Exception] = None
        for attempt in range(1, retries + 1):
            printer = None
            try:
                printer = Network(CONFIG["printer_host"],
                                  port=int(CONFIG["printer_port"]),
                                  timeout=int(CONFIG["printer_timeout"]))
                printer.open()
                _apply_codepage(printer)
                render(printer)
                printer.close()
                duration_ms = round((time.monotonic() - started) * 1000)
                return duration_ms, attempt
            except Exception as exc:
                last_exc = exc
                if printer is not None:
                    try:
                        printer.close()
                    except Exception:
                        pass
                log("print.job.attempt_failed", level=logging.WARNING,
                    attempt=attempt, error=describe_error(exc))
                if attempt < retries:
                    time.sleep(min(2 ** attempt, 8))
        detail = describe_error(last_exc) if last_exc else "unknown error"
        raise PrintError(detail)


def run_print_job(job_name: str, render: Callable[[Network], None],
                  source: Optional[str] = None,
                  summary: Optional[str] = None,
                  rehydrate: Optional[dict] = None,
                  queueable: bool = True) -> str:
    """Print `render`, or queue it for later when the printer is offline.

    Returns "printed" on a successful print, or "queued" when the job was
    persisted to the offline queue. Raises PrintError (→ 502) on a genuine
    failure that is NOT a connectivity problem.

    Queueing kicks in only when CONFIG["queue_enabled"], `queueable` is True
    and a JSON-serializable `rehydrate` descriptor was supplied (so the worker
    can rebuild the render later). Otherwise behavior is unchanged: attempt,
    record, raise on failure.
    """
    host = CONFIG["printer_host"]
    port = int(CONFIG["printer_port"])
    can_queue = (bool(CONFIG.get("queue_enabled"))
                 and queueable and rehydrate is not None)

    # Pre-check: if the printer is plainly offline at submit time, don't burn
    # retry/backoff delays on the request — queue immediately.
    if can_queue and not tcp_reachable(host, port):
        _enqueue_for_later(job_name, rehydrate, source, summary)
        return "queued"

    if not host:
        raise PrintError("printer is not configured")

    try:
        duration_ms, attempts = _do_print(render)
    except PrintError as exc:
        if can_queue and not tcp_reachable(host, port):
            # The printer dropped between the pre-check and now → queue it
            # rather than fail. Avoids poison-requeue of jobs that connect
            # but fail for content reasons (handled below).
            _enqueue_for_later(job_name, rehydrate, source, summary)
            return "queued"
        # Genuine error (printer reachable but the job failed) → 502.
        METRICS["error"] += 1
        duration_ms = round(0)
        detail = str(exc)
        log("print.job.failed", level=logging.ERROR, job=job_name,
            attempts=int(CONFIG["printer_retries"]), error=detail)
        record_job(job_name, "error", duration_ms,
                   int(CONFIG["printer_retries"]), detail, source, summary)
        raise

    METRICS["success"] += 1
    METRICS["last_job_ts"] = time.time()
    log("print.job.success", job=job_name, attempt=attempts,
        duration_ms=duration_ms)
    record_job(job_name, "success", duration_ms, attempts, None, source, summary)
    return "printed"


def _enqueue_for_later(job_name: str, rehydrate: dict,
                       source: Optional[str], summary: Optional[str]) -> int:
    """Enqueue a job for offline flush, enforcing the queue cap. Returns the
    new queue depth. Raises HTTP 503 when the queue is full."""
    if queue_depth() >= int(CONFIG["queue_max"]):
        log("print.queue.full", level=logging.WARNING, job=job_name,
            queue_max=int(CONFIG["queue_max"]))
        raise HTTPException(status_code=503, detail="print queue is full")
    enqueue_job(rehydrate["job_type"], rehydrate["payload"], source, summary)
    METRICS["queued"] += 1
    depth = queue_depth()
    log("print.queued", job=job_name, queue_depth=depth)
    # Nudge the worker so a queued job is flushed promptly once the printer is
    # back, without waiting for the next poll tick.
    QUEUE_WAKE.set()
    return depth


def flush_queue_once() -> dict[str, int]:
    """Flush pending queued jobs in FIFO order while the printer is reachable.

    Single-flight via QUEUE_FLUSH_LOCK (concurrent callers no-op). Returns
    {"flushed": n, "remaining": m}. Each job acquires PRINT_LOCK independently
    (inside _do_print) so live print requests can interleave between jobs.

    Stop/keep policy on a per-job PrintError: re-check reachability — if the
    printer went away, STOP and leave this and the remaining jobs queued; if it
    is still reachable the failure is genuine/poison, so the job is recorded as
    an error and removed so it cannot block the queue forever.
    """
    if not CONFIG.get("queue_enabled"):
        return {"flushed": 0, "remaining": queue_depth()}
    if not QUEUE_FLUSH_LOCK.acquire(blocking=False):
        return {"flushed": 0, "remaining": queue_depth()}
    flushed = 0
    try:
        if queue_depth() == 0:
            return {"flushed": 0, "remaining": 0}
        host = CONFIG["printer_host"]
        port = int(CONFIG["printer_port"])
        if not host or not tcp_reachable(host, port):
            return {"flushed": 0, "remaining": queue_depth()}
        while not QUEUE_SHUTDOWN.is_set():
            row = oldest_queued()
            if row is None:
                break
            queue_id = int(row["id"])
            source = row["source"]
            summary = row["summary"]
            try:
                payload = json.loads(row["payload"])
            except (TypeError, ValueError):
                payload = {}
            try:
                render = render_from_payload(row["job_type"], payload)
            except Exception as exc:
                # Unrenderable/poison payload — record and drop it.
                detail = describe_error(exc)
                _mark_queue_error(queue_id, detail)
                record_job(row["job_type"], "error", 0, 0, detail, source, summary)
                delete_queued(queue_id)
                METRICS["error"] += 1
                log("queue.flush.dropped", level=logging.WARNING,
                    queue_id=queue_id, error=detail)
                continue
            try:
                duration_ms, attempts = _do_print(render)
            except PrintError as exc:
                detail = str(exc)
                if not tcp_reachable(host, port):
                    # Printer dropped mid-flush: stop and keep everything queued.
                    log("queue.flush.paused", queue_id=queue_id, error=detail,
                        remaining=queue_depth())
                    break
                # Reachable but failing → genuine/poison error: record and drop.
                _mark_queue_error(queue_id, detail)
                record_job(row["job_type"], "error",
                           0, int(CONFIG["printer_retries"]), detail,
                           source, summary)
                delete_queued(queue_id)
                METRICS["error"] += 1
                log("queue.flush.error", level=logging.WARNING,
                    queue_id=queue_id, error=detail)
                continue
            record_job(row["job_type"], "success", duration_ms, attempts,
                       None, source, summary)
            delete_queued(queue_id)
            METRICS["success"] += 1
            METRICS["last_job_ts"] = time.time()
            flushed += 1
            log("queue.flush.printed", queue_id=queue_id,
                duration_ms=duration_ms, attempt=attempts)
        remaining = queue_depth()
        if flushed:
            log("queue.flush.done", flushed=flushed, remaining=remaining)
        return {"flushed": flushed, "remaining": remaining}
    finally:
        QUEUE_FLUSH_LOCK.release()


def _queue_worker() -> None:
    """Background loop: probe the printer and flush the queue on recovery.

    Sleeps queue_poll_seconds between flushes, but wakes early when QUEUE_WAKE
    is set (manual flush / new enqueue). Tolerates any exception so the worker
    thread never dies.
    """
    log("queue.worker.started", poll_seconds=int(CONFIG["queue_poll_seconds"]))
    while not QUEUE_SHUTDOWN.is_set():
        try:
            flush_queue_once()
        except Exception as exc:
            log("queue.worker.error", level=logging.ERROR,
                error=describe_error(exc))
        QUEUE_WAKE.wait(max(5, int(CONFIG["queue_poll_seconds"])))
        QUEUE_WAKE.clear()
    log("queue.worker.stopped")


# --------------------------------------------------------------------------
# Rendering helpers
# --------------------------------------------------------------------------
def reset(p: Network) -> None:
    p.set(align="left", bold=False, underline=0,
          double_width=False, double_height=False)


def line(p: Network, text: str = "") -> None:
    p.text(text + "\n")


def rule(p: Network) -> None:
    line(p, "-" * LINE_WIDTH)


def finish(p: Network, cut: bool) -> None:
    reset(p)
    p.text("\n\n\n")
    if cut:
        p.cut()


def barcode_code(code: str, bc_type: str) -> str:
    if bc_type.upper() == "CODE128" and not code.startswith("{"):
        return "{B" + code
    return code


def load_image(src: str) -> Image.Image:
    if src.startswith("http://") or src.startswith("https://"):
        resp = requests.get(src, timeout=IMAGE_FETCH_TIMEOUT)
        resp.raise_for_status()
        data = resp.content
    else:
        blob = src.split(",", 1)[1] if src.startswith("data:") else src
        data = base64.b64decode(blob)

    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        background = Image.new("RGBA", img.size, (255, 255, 255, 255))
        background.alpha_composite(img.convert("RGBA"))
        img = background.convert("RGB")
    else:
        img = img.convert("RGB")

    if img.width > MAX_IMG_WIDTH:
        height = round(img.height * MAX_IMG_WIDTH / img.width)
        img = img.resize((MAX_IMG_WIDTH, height))
    return img


# --------------------------------------------------------------------------
# Request models
# --------------------------------------------------------------------------
Align = Literal["left", "center", "right"]


class TextJob(BaseModel):
    text: str
    align: Align = "left"
    bold: bool = False
    underline: bool = False
    # Free-text sender handle from the public page; printed as a byline and
    # recorded as the job source so the owner knows who sent each print.
    username: Optional[str] = Field(default=None, max_length=32)
    cut: bool = True


class ReceiptJob(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    lines: list[str] = Field(default_factory=list)
    qr: Optional[str] = None
    barcode: Optional[str] = None
    barcode_type: str = "CODE128"
    footer: Optional[str] = None
    timestamp: bool = False
    cut: bool = True


class ImageJob(BaseModel):
    image: str
    align: Align = "center"
    caption: Optional[str] = None
    username: Optional[str] = Field(default=None, max_length=32)
    cut: bool = True


class GenericJob(BaseModel):
    text: Optional[str] = None
    title: Optional[str] = None
    qr: Optional[str] = None
    barcode: Optional[str] = None
    image: Optional[str] = None
    cut: bool = True


class SetupPayload(BaseModel):
    printer_host: str
    printer_port: int = 9100
    printer_codepage: str = "CP858"
    printer_token: str
    printer_timeout: int = 20
    printer_retries: int = 3
    tz: str = "Europe/Paris"
    admin_email: str
    admin_password: str
    admin_name: Optional[str] = None


class ConfigUpdate(BaseModel):
    printer_host: Optional[str] = None
    printer_port: Optional[int] = None
    printer_codepage: Optional[str] = None
    printer_token: Optional[str] = None
    printer_timeout: Optional[int] = None
    printer_retries: Optional[int] = None
    tz: Optional[str] = None
    rate_limit_per_minute: Optional[int] = None
    rate_limit_per_hour: Optional[int] = None
    queue_enabled: Optional[bool] = None
    queue_poll_seconds: Optional[int] = None
    queue_max: Optional[int] = None


class TestConnectionPayload(BaseModel):
    printer_host: str
    printer_port: int = 9100


# --------------------------------------------------------------------------
# Renderers
# --------------------------------------------------------------------------
def render_byline(p: Network, username: Optional[str]) -> None:
    """Print a centered '— @handle —' byline when a public username is set."""
    handle = (username or "").strip()
    if not handle:
        return
    p.set(align="center", bold=True)
    line(p, f"— @{handle} —")
    reset(p)


def render_text(p: Network, job: TextJob) -> None:
    reset(p)
    render_byline(p, job.username)
    p.set(align=job.align, bold=job.bold, underline=1 if job.underline else 0)
    p.text(job.text if job.text.endswith("\n") else job.text + "\n")
    finish(p, job.cut)


def render_receipt(p: Network, job: ReceiptJob) -> None:
    reset(p)
    if job.title:
        p.set(align="center", bold=True, double_width=True, double_height=True)
        line(p, job.title)
        reset(p)
    if job.subtitle:
        p.set(align="center")
        line(p, job.subtitle)
        reset(p)
    if job.title or job.subtitle:
        rule(p)
    for entry in job.lines:
        reset(p)
        line(p, str(entry))
    if job.qr:
        p.text("\n")
        p.qr(job.qr, size=6, center=True)
    if job.barcode:
        p.text("\n")
        p.barcode(barcode_code(job.barcode, job.barcode_type), job.barcode_type,
                  height=64, width=3, pos="BELOW", align_ct=True)
    if job.footer:
        rule(p)
        p.set(align="center")
        line(p, job.footer)
        reset(p)
    if job.timestamp:
        p.set(align="center")
        line(p, now_str())
        reset(p)
    finish(p, job.cut)


def render_image(p: Network, img: Image.Image, align: str,
                 caption: Optional[str], cut: bool,
                 username: Optional[str] = None) -> None:
    reset(p)
    render_byline(p, username)
    p.set(align=align)
    p.image(img, center=(align == "center"))
    if caption:
        p.set(align="center")
        line(p, caption)
    finish(p, cut)


def render_generic(p: Network, job: GenericJob, img: Optional[Image.Image]) -> None:
    reset(p)
    if job.title:
        p.set(align="center", bold=True, double_width=True, double_height=True)
        line(p, job.title)
        reset(p)
    if img is not None:
        p.image(img, center=True)
        p.text("\n")
    if job.text:
        reset(p)
        p.text(job.text if job.text.endswith("\n") else job.text + "\n")
    if job.qr:
        p.text("\n")
        p.qr(job.qr, size=6, center=True)
    if job.barcode:
        p.text("\n")
        p.barcode(barcode_code(job.barcode, "CODE128"), "CODE128",
                  height=64, width=3, pos="BELOW", align_ct=True)
    finish(p, job.cut)


def render_test(p: Network) -> None:
    reset(p)
    p.set(align="center", bold=True, double_width=True, double_height=True)
    line(p, SERVICE_NAME)
    reset(p)
    p.set(align="center")
    line(p, "Test d'impression")
    reset(p)
    rule(p)
    line(p, "Accents : é è à ç ù ê î ô û")
    line(p, "Majuscules : É È À Ç Ù")
    line(p, "Ça marche ! Voilà un café à 2€.")
    rule(p)
    p.qr("https://printcast.battistella.ovh/health", size=6, center=True)
    p.set(align="center")
    line(p, now_str())
    finish(p, True)


def render_selftest(p: Network) -> None:
    """Trigger the printer's built-in hardware status sheet.

    ESC/POS `GS ( A pL pH n m` with n=0 (roll paper), m=2 (printer status):
    the printer's firmware prints model, firmware version, codepage and — on
    networked models — interface info (IP, MAC, subnet, gateway). Bypasses
    software text rendering, so it still works when the codepage/encoding is
    wrong or the host has no font mapping for what we send.
    """
    p._raw(bytes([0x1D, 0x28, 0x41, 0x02, 0x00, 0x00, 0x02]))


def render_from_payload(job_type: str, payload: dict) -> Callable[[Network], None]:
    """Rebuild a render callable from a persisted queue payload.

    Image payloads are expected to carry a self-contained base64 PNG data URL
    in payload["image"] (stored at enqueue time), so flushing never depends on
    the original URL still resolving.
    """
    if job_type == "text":
        job = TextJob(**payload)
        return lambda p: render_text(p, job)
    if job_type == "receipt":
        job = ReceiptJob(**payload)
        return lambda p: render_receipt(p, job)
    if job_type == "image":
        img = load_image(payload["image"])
        align = payload.get("align", "center")
        caption = payload.get("caption")
        cut = payload.get("cut", True)
        username = payload.get("username")
        return lambda p: render_image(p, img, align, caption, cut, username)
    if job_type == "generic":
        job = GenericJob(**payload)
        img = load_image(job.image) if job.image else None
        return lambda p: render_generic(p, job, img)
    raise PrintError(f"unknown queued job_type: {job_type}")


def _image_to_data_url(img: Image.Image) -> str:
    """Re-encode a loaded PIL image as a base64 PNG data URL for durable queue
    storage (the original src/URL may not resolve again later)."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
def _require_bearer(authorization: Optional[str] = Header(default=None)) -> dict:
    """Bearer-token gate for machine-to-machine webhook callers (n8n, HA,
    ntfy). The admin UI uses session cookies instead — see require_session."""
    token = CONFIG.get("printer_token", "")
    if not token:
        raise HTTPException(status_code=500,
                            detail="server auth token not configured")
    expected = f"Bearer {token}"
    provided = authorization or ""
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401,
                            detail="missing or invalid bearer token")
    return {"username": "webhook", "role": "service", "auth": "bearer"}


def require_session(request: Request) -> dict:
    """Validate the better-auth session cookie by calling the sidecar's
    /__auth/whoami. Returns {id, email, name, role}."""
    cookie = request.headers.get("cookie", "")
    if not cookie:
        raise HTTPException(status_code=401, detail="not authenticated")
    try:
        r = requests.get(f"{AUTH_INTERNAL_URL}/__auth/whoami",
                         headers={"cookie": cookie},
                         timeout=5)
    except requests.RequestException as exc:
        raise HTTPException(status_code=503,
                            detail=f"auth service unreachable: {exc}") from exc
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="not authenticated")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="auth service error")
    user = r.json().get("user") or {}
    user["auth"] = "session"
    return user


def require_admin(user: dict = Depends(require_session)) -> dict:
    """Gate admin-only routes (settings, analytics, test print)."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403,
                            detail="admin role required")
    return user


def require_admin_or_bearer(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> dict:
    """Accept either a logged-in admin (session cookie) or the shared bearer
    token. Used by /print/* endpoints so the admin UI and machine callers can
    both trigger prints."""
    if authorization:
        return _require_bearer(authorization)
    return require_admin(require_session(request))


def _effective_setup_completed() -> bool:
    """True only when persisted config says so AND the auth sidecar has a user.
    Mirrors the funnel-back-to-wizard logic in /api/setup/status so the wizard
    endpoints stay open whenever the wizard is being shown."""
    if not CONFIG.get("setup_completed"):
        return False
    try:
        r = requests.get(f"{AUTH_INTERNAL_URL}/__auth/has-users", timeout=3)
        if r.status_code == 200 and not r.json().get("has_users"):
            return False
    except requests.RequestException:
        pass
    return True


def _admin_required_when_setup(request: Request) -> None:
    """Wizard endpoints: open before setup is complete, session-protected after."""
    if not _effective_setup_completed():
        return
    require_admin(require_session(request))


def _client_ip(request: Request) -> str:
    # When behind a trusted reverse proxy the real caller is in X-Forwarded-For;
    # otherwise everyone shares the proxy's IP and a single client can starve
    # the bucket for the whole internet. Fall back to the socket peer.
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if forwarded:
        first = forwarded.split(",", 1)[0].strip()
        if first:
            return first
    return request.client.host if request.client else "?"


def _request_source(request: Request) -> Optional[str]:
    ua = request.headers.get("user-agent", "")
    return f"{_client_ip(request)} {ua[:60]}".strip() or None


def _print_source(request: Request, username: Optional[str] = None) -> Optional[str]:
    """Job source, prefixed with the public '@handle' when one was supplied."""
    handle = (username or "").strip()
    base = _request_source(request)
    if handle:
        return f"@{handle} · {base}" if base else f"@{handle}"
    return base


# Per-IP sliding-window rate limiter for /print* endpoints. In-memory and
# thread-safe; a single printer instance does not need anything heavier.
RATE_LIMIT_LOCK = threading.Lock()
RATE_LIMIT_BUCKETS: dict[str, list[float]] = {}
RATE_LIMIT_MAX_CLIENTS = 1000


def enforce_rate_limit(request: Request) -> None:
    per_min = max(0, int(CONFIG.get("rate_limit_per_minute", 0) or 0))
    per_hour = max(0, int(CONFIG.get("rate_limit_per_hour", 0) or 0))
    if per_min == 0 and per_hour == 0:
        return
    ip = _client_ip(request)
    now = time.monotonic()
    window = 3600.0 if per_hour else 60.0
    with RATE_LIMIT_LOCK:
        history = RATE_LIMIT_BUCKETS.setdefault(ip, [])
        cutoff = now - window
        history[:] = [t for t in history if t > cutoff]
        # Cap tracked clients so a flood from many IPs can't exhaust memory.
        if len(RATE_LIMIT_BUCKETS) > RATE_LIMIT_MAX_CLIENTS:
            for k in list(RATE_LIMIT_BUCKETS.keys()):
                if not RATE_LIMIT_BUCKETS[k] and k != ip:
                    del RATE_LIMIT_BUCKETS[k]
                    if len(RATE_LIMIT_BUCKETS) <= RATE_LIMIT_MAX_CLIENTS:
                        break
        retry_after: Optional[int] = None
        if per_min:
            recent = [t for t in history if t > now - 60.0]
            if len(recent) >= per_min:
                retry_after = max(1, int(min(recent) + 60.0 - now) + 1)
        if per_hour and retry_after is None:
            recent_h = [t for t in history if t > now - 3600.0]
            if len(recent_h) >= per_hour:
                retry_after = max(1, int(min(recent_h) + 3600.0 - now) + 1)
        if retry_after is not None:
            log("ratelimit.blocked", level=logging.WARNING,
                ip=ip, retry_after=retry_after,
                per_minute=per_min, per_hour=per_hour)
            raise HTTPException(
                status_code=429,
                detail=f"rate limit exceeded, retry in {retry_after}s",
                headers={"Retry-After": str(retry_after)},
            )
        history.append(now)


def _summarize_payload(payload: BaseModel) -> str:
    d = payload.model_dump()
    return ", ".join(f"{k}={_short(v)}" for k, v in d.items() if v not in (None, "", [], False))


def _short(v: Any) -> str:
    s = str(v)
    return s if len(s) <= 40 else s[:37] + "..."


# --------------------------------------------------------------------------
# Application
# --------------------------------------------------------------------------
app = FastAPI(title="printcast", description="HTTP->ESC/POS print bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(PrintError)
def _print_error_handler(_request, exc: PrintError) -> JSONResponse:
    return JSONResponse(status_code=502,
                        content={"status": "error", "detail": str(exc)})


@app.get("/health")
def health() -> dict:
    reachable = tcp_reachable(CONFIG["printer_host"], int(CONFIG["printer_port"]))
    printer = {
        "host": CONFIG["printer_host"],
        "port": int(CONFIG["printer_port"]),
        "reachable": reachable,
    }
    if PRINTER_DISCOVERY:
        printer["discovered_via"] = PRINTER_DISCOVERY.get("method")
        if PRINTER_DISCOVERY.get("name"):
            printer["name"] = PRINTER_DISCOVERY["name"]
    return {
        "status": "ok" if reachable else "degraded",
        "service": SERVICE_NAME,
        "printer": printer,
        "queue_depth": queue_depth(),
    }


@app.get("/discover")
def discover(_: dict = Depends(_require_bearer)) -> dict:
    """List printer candidates currently reachable on the LAN."""
    port = int(CONFIG["printer_port"])
    candidates = discover_printers(port=port)
    for c in candidates:
        c["reachable"] = tcp_reachable(c["host"], c["port"])
    return {"port": port, "candidates": candidates}


@app.get("/metrics")
def metrics() -> PlainTextResponse:
    body = "\n".join([
        "# HELP printer_jobs_total Total print jobs processed.",
        "# TYPE printer_jobs_total counter",
        f'printer_jobs_total{{status="success"}} {METRICS["success"]}',
        f'printer_jobs_total{{status="error"}} {METRICS["error"]}',
        "# HELP printer_last_job_timestamp_seconds Unix time of last successful job.",
        "# TYPE printer_last_job_timestamp_seconds gauge",
        f'printer_last_job_timestamp_seconds {METRICS["last_job_ts"]}',
        "",
    ])
    return PlainTextResponse(body, media_type="text/plain; version=0.0.4; charset=utf-8")


# --------------------------------------------------------------------------
# Print endpoints
# --------------------------------------------------------------------------
def _print_result_response(status: str, job_name: str) -> JSONResponse:
    """Build the endpoint response for a run_print_job() result.

    "queued" -> HTTP 202 with the current queue depth; "printed" -> HTTP 200.
    """
    if status == "queued":
        return JSONResponse(
            status_code=202,
            content={"status": "queued", "job": job_name,
                     "queue_depth": queue_depth()},
        )
    return JSONResponse(status_code=200,
                        content={"status": "printed", "job": job_name})


@app.post("/print/text")
def print_text(job: TextJob, request: Request,
               _rl: None = Depends(enforce_rate_limit)) -> JSONResponse:
    status = run_print_job(
        "text", lambda p: render_text(p, job),
        source=_print_source(request, job.username),
        summary=_summarize_payload(job),
        rehydrate={"job_type": "text", "payload": job.model_dump()})
    return _print_result_response(status, "text")


@app.post("/print/receipt")
def print_receipt(job: ReceiptJob, request: Request,
                  _rl: None = Depends(enforce_rate_limit),
                  _: dict = Depends(_require_bearer)) -> JSONResponse:
    status = run_print_job(
        "receipt", lambda p: render_receipt(p, job),
        source=_request_source(request),
        summary=_summarize_payload(job),
        rehydrate={"job_type": "receipt", "payload": job.model_dump()})
    return _print_result_response(status, "receipt")


@app.post("/print/image")
def print_image(job: ImageJob, request: Request,
                _rl: None = Depends(enforce_rate_limit)) -> JSONResponse:
    try:
        img = load_image(job.image)
    except Exception as exc:
        raise HTTPException(status_code=400,
                            detail=f"could not load image: {exc}")
    # Persist the already-resolved image as a self-contained data URL so a
    # queued job stays reprintable even if the original URL stops resolving.
    payload = job.model_dump()
    payload["image"] = _image_to_data_url(img)
    status = run_print_job(
        "image",
        lambda p: render_image(p, img, job.align, job.caption,
                               job.cut, job.username),
        source=_print_source(request, job.username),
        summary=_summarize_payload(job),
        rehydrate={"job_type": "image", "payload": payload})
    return _print_result_response(status, "image")


@app.post("/print")
def print_generic(job: GenericJob, request: Request,
                  _rl: None = Depends(enforce_rate_limit),
                  _: dict = Depends(_require_bearer)) -> JSONResponse:
    if not any([job.text, job.title, job.qr, job.barcode, job.image]):
        raise HTTPException(
            status_code=400,
            detail="provide at least one of: text, title, qr, barcode, image")
    img = None
    payload = job.model_dump()
    if job.image:
        try:
            img = load_image(job.image)
        except Exception as exc:
            raise HTTPException(status_code=400,
                                detail=f"could not load image: {exc}")
        payload["image"] = _image_to_data_url(img)
    status = run_print_job(
        "generic", lambda p: render_generic(p, job, img),
        source=_request_source(request),
        summary=_summarize_payload(job),
        rehydrate={"job_type": "generic", "payload": payload})
    return _print_result_response(status, "generic")


@app.post("/print/test")
def print_test(request: Request,
               _rl: None = Depends(enforce_rate_limit),
               _: dict = Depends(require_admin)) -> dict:
    # Diagnostics must never pile up in the queue.
    run_print_job("test", render_test,
                  source=_request_source(request), summary="test",
                  queueable=False)
    return {"status": "printed", "job": "test"}


@app.post("/print/selftest")
def print_selftest(request: Request, _: dict = Depends(require_admin)) -> dict:
    run_print_job("selftest", render_selftest,
                  source=_request_source(request), summary="selftest",
                  queueable=False)
    return {"status": "printed", "job": "selftest"}


# --------------------------------------------------------------------------
# Admin / wizard / analytics API
# --------------------------------------------------------------------------
def _public_config() -> dict[str, Any]:
    token = CONFIG.get("printer_token") or ""
    return {
        "printer_host": CONFIG["printer_host"],
        "printer_port": int(CONFIG["printer_port"]),
        "printer_codepage": CONFIG["printer_codepage"],
        "printer_timeout": int(CONFIG["printer_timeout"]),
        "printer_retries": int(CONFIG["printer_retries"]),
        "tz": CONFIG["tz"],
        "rate_limit_per_minute": int(CONFIG.get("rate_limit_per_minute", 0) or 0),
        "rate_limit_per_hour": int(CONFIG.get("rate_limit_per_hour", 0) or 0),
        "queue_enabled": bool(CONFIG.get("queue_enabled")),
        "queue_poll_seconds": int(CONFIG.get("queue_poll_seconds", 30) or 30),
        "queue_max": int(CONFIG.get("queue_max", 500) or 500),
        "setup_completed": bool(CONFIG.get("setup_completed")),
        "token_set": bool(token),
        "token_preview": (token[:4] + "…" + token[-4:]) if len(token) >= 12 else ("set" if token else ""),
    }


@app.get("/api/setup/status")
def setup_status() -> dict:
    return {
        "setup_completed": _effective_setup_completed(),
        "has_token": bool(CONFIG.get("printer_token")),
        "has_host": bool(CONFIG.get("printer_host")),
    }


@app.post("/api/setup/generate-token")
def generate_token(_: None = Depends(_admin_required_when_setup)) -> dict:
    return {"token": secrets.token_hex(32)}


@app.post("/api/setup/test-connection")
def test_connection(payload: TestConnectionPayload,
                    _: None = Depends(_admin_required_when_setup)) -> dict:
    reachable = tcp_reachable(payload.printer_host, payload.printer_port, timeout=5)
    return {"reachable": reachable, "host": payload.printer_host, "port": payload.printer_port}


@app.post("/api/setup/discover")
def setup_discover(_: None = Depends(_admin_required_when_setup)) -> dict:
    """Run printer auto-discovery during first-run setup (no token required)."""
    port = int(CONFIG.get("printer_port") or 9100)
    candidates = discover_printers(port=port, mdns_timeout=3.0, scan_timeout=0.4)
    for c in candidates:
        c["reachable"] = tcp_reachable(c["host"], c["port"], timeout=1.5)
    return {"port": port, "candidates": candidates}


@app.post("/api/setup/complete")
def setup_complete(payload: SetupPayload,
                   _: None = Depends(_admin_required_when_setup)) -> dict:
    # Create the first user in the auth sidecar BEFORE persisting setup state,
    # so a sidecar failure doesn't leave the deploy half-configured.
    try:
        r = requests.post(
            f"{AUTH_INTERNAL_URL}/__auth/bootstrap-admin",
            json={
                "email": payload.admin_email.strip(),
                "password": payload.admin_password,
                "name": (payload.admin_name or payload.admin_email).strip(),
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=503,
                            detail=f"auth service unreachable: {exc}") from exc
    if r.status_code == 409:
        raise HTTPException(status_code=409,
                            detail="an admin user already exists")
    if r.status_code != 200:
        try:
            detail = r.json().get("error", r.text)
        except Exception:
            detail = r.text
        raise HTTPException(status_code=400, detail=f"signup failed: {detail}")

    with CONFIG_LOCK:
        CONFIG["printer_host"] = payload.printer_host.strip()
        CONFIG["printer_port"] = int(payload.printer_port)
        CONFIG["printer_codepage"] = payload.printer_codepage.strip() or "CP858"
        CONFIG["printer_token"] = payload.printer_token.strip()
        CONFIG["printer_timeout"] = max(1, int(payload.printer_timeout))
        CONFIG["printer_retries"] = max(1, int(payload.printer_retries))
        CONFIG["tz"] = payload.tz.strip() or "Europe/Paris"
        CONFIG["setup_completed"] = True
        _save_persisted_config()
    log("setup.completed",
        host=CONFIG["printer_host"], port=CONFIG["printer_port"],
        admin_email=payload.admin_email.strip())
    return {"status": "ok", "config": _public_config()}


@app.get("/api/me")
def get_me(user: dict = Depends(require_session)) -> dict:
    return user


@app.get("/api/config")
def get_config(_: dict = Depends(require_admin)) -> dict:
    return _public_config()


@app.put("/api/config")
def update_config(payload: ConfigUpdate, _: dict = Depends(require_admin)) -> dict:
    with CONFIG_LOCK:
        data = payload.model_dump(exclude_none=True)
        for key, value in data.items():
            if isinstance(value, str):
                value = value.strip()
            if key in ("printer_port", "printer_timeout", "printer_retries"):
                value = max(1, int(value))
            elif key in ("rate_limit_per_minute", "rate_limit_per_hour"):
                value = max(0, int(value))
            elif key == "queue_poll_seconds":
                value = max(5, int(value))
            elif key == "queue_max":
                value = max(1, int(value))
            elif key == "queue_enabled":
                value = bool(value)
            CONFIG[key] = value
        _save_persisted_config()
    log("config.updated", changed=list(data.keys()))
    return {"status": "ok", "config": _public_config()}


@app.get("/api/jobs")
def list_jobs(limit: int = 100, status: Optional[str] = None,
              _: dict = Depends(require_admin)) -> dict:
    limit = max(1, min(int(limit), 500))
    query = "SELECT id, ts, job_type, status, duration_ms, attempts, error, source, payload_summary FROM jobs"
    params: list[Any] = []
    if status in ("success", "error"):
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY ts DESC LIMIT ?"
    params.append(limit)
    with _db() as conn:
        rows = [dict(r) for r in conn.execute(query, params).fetchall()]
    return {"jobs": rows}


# -----------------------------------------------------------------------
# Offline queue admin API
# -----------------------------------------------------------------------
@app.get("/api/queue")
def get_queue(_: dict = Depends(require_admin)) -> dict:
    return {"queue": list_queue(), "depth": queue_depth()}


@app.post("/api/queue/flush")
def post_queue_flush(_: dict = Depends(require_admin)) -> dict:
    result = flush_queue_once()
    QUEUE_WAKE.set()
    return {"result": result, "depth": queue_depth()}


@app.delete("/api/queue")
def delete_queue(_: dict = Depends(require_admin)) -> dict:
    removed = clear_queue()
    log("queue.cleared", removed=removed)
    return {"removed": removed, "depth": queue_depth()}


@app.delete("/api/queue/{queue_id}")
def delete_queue_item(queue_id: int, _: dict = Depends(require_admin)) -> dict:
    delete_queued(queue_id)
    log("queue.item.deleted", queue_id=queue_id)
    return {"removed": queue_id, "depth": queue_depth()}


@app.get("/api/analytics/summary")
def analytics_summary(_: dict = Depends(require_admin)) -> dict:
    now = time.time()
    cutoff_24h = now - 86400
    cutoff_7d = now - 7 * 86400
    with _db() as conn:
        totals = {r["status"]: r["n"] for r in conn.execute(
            "SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").fetchall()}
        day_counts = {r["status"]: r["n"] for r in conn.execute(
            "SELECT status, COUNT(*) AS n FROM jobs WHERE ts >= ? GROUP BY status",
            (cutoff_24h,)).fetchall()}
        week_counts = {r["status"]: r["n"] for r in conn.execute(
            "SELECT status, COUNT(*) AS n FROM jobs WHERE ts >= ? GROUP BY status",
            (cutoff_7d,)).fetchall()}
        avg_duration = conn.execute(
            "SELECT AVG(duration_ms) AS d FROM jobs WHERE status='success' AND ts >= ?",
            (cutoff_7d,)).fetchone()["d"] or 0
        by_type = [dict(r) for r in conn.execute(
            """SELECT job_type, status, COUNT(*) AS n
               FROM jobs WHERE ts >= ?
               GROUP BY job_type, status""", (cutoff_7d,)).fetchall()]
        last_job = conn.execute(
            "SELECT ts, job_type, status, error FROM jobs ORDER BY ts DESC LIMIT 1").fetchone()
        recent_errors = [dict(r) for r in conn.execute(
            """SELECT id, ts, job_type, error, source FROM jobs
               WHERE status='error' ORDER BY ts DESC LIMIT 10""").fetchall()]
    total_success = totals.get("success", 0)
    total_error = totals.get("error", 0)
    total_all = total_success + total_error
    success_rate = (total_success / total_all * 100) if total_all else 0.0
    return {
        "totals": {"success": total_success, "error": total_error, "all": total_all,
                   "success_rate": round(success_rate, 2)},
        "last_24h": {"success": day_counts.get("success", 0),
                     "error": day_counts.get("error", 0)},
        "last_7d": {"success": week_counts.get("success", 0),
                    "error": week_counts.get("error", 0)},
        "avg_duration_ms_7d": round(avg_duration, 1),
        "by_type_7d": by_type,
        "last_job": dict(last_job) if last_job else None,
        "recent_errors": recent_errors,
        "printer_reachable": tcp_reachable(CONFIG["printer_host"],
                                           int(CONFIG["printer_port"])),
        "queue_depth": queue_depth(),
        "metrics": METRICS,
    }


@app.get("/api/analytics/timeseries")
def analytics_timeseries(hours: int = 24,
                         _: dict = Depends(require_admin)) -> dict:
    hours = max(1, min(int(hours), 24 * 30))
    bucket_seconds = 3600 if hours <= 48 else 86400
    now = time.time()
    cutoff = now - hours * 3600
    buckets: dict[int, dict[str, int]] = {}
    with _db() as conn:
        for row in conn.execute(
            "SELECT ts, status FROM jobs WHERE ts >= ?", (cutoff,)
        ).fetchall():
            bucket = int(row["ts"] // bucket_seconds) * bucket_seconds
            slot = buckets.setdefault(bucket, {"success": 0, "error": 0})
            slot[row["status"]] = slot.get(row["status"], 0) + 1
    start_bucket = int(cutoff // bucket_seconds) * bucket_seconds
    end_bucket = int(now // bucket_seconds) * bucket_seconds
    series = []
    bucket = start_bucket
    while bucket <= end_bucket:
        slot = buckets.get(bucket, {"success": 0, "error": 0})
        series.append({
            "ts": bucket,
            "success": slot.get("success", 0),
            "error": slot.get("error", 0),
        })
        bucket += bucket_seconds
    return {"series": series, "bucket_seconds": bucket_seconds}


# --------------------------------------------------------------------------
# Reverse proxy: /api/auth/* -> better-auth sidecar
# --------------------------------------------------------------------------
# Better-auth runs as a sibling Node process inside the container so the
# browser sees a single origin. httpx (not requests) is used because it
# preserves multiple Set-Cookie headers — important for sign-in responses.
_PROXY_STRIP_REQ_HEADERS = {"host", "content-length"}
_PROXY_STRIP_RES_HEADERS = {"content-encoding", "transfer-encoding",
                            "connection", "keep-alive"}


@app.api_route("/api/auth/{path:path}",
               methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def auth_proxy(path: str, request: Request) -> Response:
    headers = [(k, v) for k, v in request.headers.raw
               if k.lower().decode() not in _PROXY_STRIP_REQ_HEADERS]
    body = await request.body()
    url = f"{AUTH_INTERNAL_URL}/api/auth/{path}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.request(
                request.method, url,
                params=dict(request.query_params),
                content=body,
                headers={k.decode(): v.decode() for k, v in headers},
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503,
                                detail=f"auth service unreachable: {exc}") from exc
    response = Response(content=r.content, status_code=r.status_code)
    # Preserve multiple Set-Cookie headers (Response()'s dict init would
    # collapse them). We bypass the init by replacing raw_headers wholesale.
    response.raw_headers = [
        (k.encode(), v.encode())
        for k, v in r.headers.multi_items()
        if k.lower() not in _PROXY_STRIP_RES_HEADERS
    ]
    return response


# --------------------------------------------------------------------------
# Frontend static files
# --------------------------------------------------------------------------
INDEX_HTML = FRONTEND_DIR / "index.html"


def _mount_frontend() -> None:
    if not FRONTEND_DIR.exists() or not INDEX_HTML.exists():
        log("frontend.missing", level=logging.WARNING, path=str(FRONTEND_DIR))
        return
    assets = FRONTEND_DIR / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.get("/")
    def _root() -> FileResponse:
        return FileResponse(str(INDEX_HTML))

    @app.get("/{full_path:path}")
    def _spa(full_path: str) -> FileResponse:
        if full_path.startswith(("api/", "print", "health", "metrics", "assets/")):
            raise HTTPException(status_code=404)
        candidate = FRONTEND_DIR / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(INDEX_HTML))


# --------------------------------------------------------------------------
# Background queue worker lifecycle
# --------------------------------------------------------------------------
_QUEUE_THREAD: Optional[threading.Thread] = None


@app.on_event("startup")
def _start_queue_worker() -> None:
    global _QUEUE_THREAD
    if _QUEUE_THREAD is not None and _QUEUE_THREAD.is_alive():
        return
    QUEUE_SHUTDOWN.clear()
    _QUEUE_THREAD = threading.Thread(
        target=_queue_worker, name="printcast-queue", daemon=True)
    _QUEUE_THREAD.start()


@app.on_event("shutdown")
def _stop_queue_worker() -> None:
    QUEUE_SHUTDOWN.set()
    QUEUE_WAKE.set()


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def main() -> None:
    if not CONFIG["printer_host"] and PRINTER_AUTODETECT:
        autodetect_printer()

    log("service.start", service=SERVICE_NAME, listen="0.0.0.0:8080",
        printer_host=CONFIG["printer_host"] or "(unconfigured)",
        printer_port=CONFIG["printer_port"],
        printer_discovered_via=(PRINTER_DISCOVERY or {}).get("method"),
        codepage=CONFIG["printer_codepage"],
        retries=CONFIG["printer_retries"], tz=CONFIG["tz"],
        setup_completed=CONFIG["setup_completed"],
        data_dir=str(DATA_DIR), frontend_dir=str(FRONTEND_DIR))
    if not CONFIG["printer_host"] or not CONFIG["printer_token"]:
        log("service.awaiting_setup", level=logging.WARNING,
            detail="open the web UI at / to complete the setup wizard")
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")


# Initialize for module-level import (uvicorn `app:app`). Wrapped so a
# read-only or missing data dir at import time (e.g. CI smoke tests) does
# not crash the module — main() retries and surfaces real failures.
try:
    _init_db()
except OSError as _exc:
    log("db.init.deferred", level=logging.WARNING, error=str(_exc))
_mount_frontend()


if __name__ == "__main__":
    main()
