"""printcast - HTTP->ESC/POS bridge for a homelab network thermal printer.

Many notification sources (n8n, Home Assistant, ntfy, curl) POST JSON here and
this service prints to a single 80mm ESC/POS printer reached over raw TCP 9100.
"""
import base64
import hmac
import io
import json
import logging
import os
import socket
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Callable, Literal, Optional
from zoneinfo import ZoneInfo

import requests
import uvicorn
from escpos.printer import Network
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
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
PRINTER_HOST = os.environ.get("PRINTER_HOST", "")
PRINTER_PORT = _int_env("PRINTER_PORT", 9100)
PRINTER_CODEPAGE = os.environ.get("PRINTER_CODEPAGE", "CP858")
PRINTER_TOKEN = os.environ.get("PRINTER_TOKEN", "")
PRINTER_TIMEOUT = _int_env("PRINTER_TIMEOUT", 20)
RETRIES = max(1, _int_env("PRINTER_RETRIES", 3))
# Auto-detect a printer at startup when PRINTER_HOST is empty. Disable when you
# need deterministic behavior (e.g. tests) by setting PRINTER_AUTODETECT=false.
PRINTER_AUTODETECT = _bool_env("PRINTER_AUTODETECT", True)
TZ_NAME = os.environ.get("TZ", "Europe/Paris")

# Populated when the host comes from auto-detection rather than the env var,
# so /health can advertise how it found the printer.
PRINTER_DISCOVERY: Optional[dict] = None

LINE_WIDTH = 48          # 72mm print area at 203 dpi
MAX_IMG_WIDTH = 512      # dots; images wider than this are downscaled
HEALTH_TCP_TIMEOUT = 3   # seconds for the /health connect probe
IMAGE_FETCH_TIMEOUT = 15 # seconds for downloading a remote image

try:
    LOCAL_TZ = ZoneInfo(TZ_NAME)
except Exception:
    LOCAL_TZ = timezone.utc


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


# --------------------------------------------------------------------------
# Metrics and job serialization
# --------------------------------------------------------------------------
METRICS = {"success": 0, "error": 0, "last_job_ts": 0.0}
PRINT_LOCK = threading.Lock()


class PrintError(Exception):
    """Raised when a print job fails after exhausting all retries."""


def now_str() -> str:
    return datetime.now(LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")


def describe_error(exc: Exception) -> str:
    """Some socket/escpos errors stringify to '' -- keep the type name then."""
    msg = str(exc).strip()
    return f"{type(exc).__name__}: {msg}" if msg else type(exc).__name__


# --------------------------------------------------------------------------
# Printer plumbing
# --------------------------------------------------------------------------
def tcp_reachable(host: str, port: int, timeout: int = HEALTH_TCP_TIMEOUT) -> bool:
    """Plain TCP connect probe -- ESC/POS status reads are unreliable over 9100."""
    if not host:
        return False
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def autodetect_printer() -> Optional[dict]:
    """Return the first reachable printer candidate on the LAN, or None.

    Reassigns the PRINTER_HOST module global and records discovery metadata
    in PRINTER_DISCOVERY so /health can surface how the printer was found.
    """
    global PRINTER_HOST, PRINTER_DISCOVERY
    log("printer.autodetect.start", port=PRINTER_PORT)
    candidates = discover_printers(port=PRINTER_PORT)
    for c in candidates:
        if tcp_reachable(c["host"], c["port"]):
            PRINTER_HOST = c["host"]
            PRINTER_DISCOVERY = c
            log("printer.autodetect.found", **c)
            return c
    log("printer.autodetect.none", level=logging.WARNING,
        candidates=len(candidates))
    return None


def _apply_codepage(printer: Network) -> None:
    """Select the codepage so French accents (e e a c u) render correctly."""
    try:
        printer.charcode(PRINTER_CODEPAGE)
    except Exception as exc:
        log("printer.codepage.fallback", level=logging.WARNING,
            requested=PRINTER_CODEPAGE, error=str(exc))
        printer.charcode("AUTO")


def run_print_job(job_name: str, render: Callable[[Network], None]) -> None:
    """Serialize, then run `render` against a fresh connection with backoff retry.

    The printer cannot multiplex jobs and drops idle sockets, so every job opens
    its own connection and all jobs are funneled through a single lock.
    """
    started = time.monotonic()
    with PRINT_LOCK:
        last_exc: Optional[Exception] = None
        for attempt in range(1, RETRIES + 1):
            printer = None
            try:
                printer = Network(PRINTER_HOST, port=PRINTER_PORT,
                                  timeout=PRINTER_TIMEOUT)
                printer.open()
                _apply_codepage(printer)
                render(printer)
                printer.close()
                METRICS["success"] += 1
                METRICS["last_job_ts"] = time.time()
                log("print.job.success", job=job_name, attempt=attempt,
                    duration_ms=round((time.monotonic() - started) * 1000))
                return
            except Exception as exc:
                last_exc = exc
                if printer is not None:
                    try:
                        printer.close()
                    except Exception:
                        pass
                log("print.job.attempt_failed", level=logging.WARNING,
                    job=job_name, attempt=attempt, error=describe_error(exc))
                if attempt < RETRIES:
                    time.sleep(min(2 ** attempt, 8))

        METRICS["error"] += 1
        detail = describe_error(last_exc) if last_exc else "unknown error"
        log("print.job.failed", level=logging.ERROR, job=job_name,
            attempts=RETRIES, error=detail)
        raise PrintError(detail)


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
    """python-escpos hardware CODE128 needs a {A/{B/{C code-set selector."""
    if bc_type.upper() == "CODE128" and not code.startswith("{"):
        return "{B" + code
    return code


def load_image(src: str) -> Image.Image:
    """Load an image from an http(s) URL or a (optionally data-URL) base64 blob."""
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
    cut: bool = True


class GenericJob(BaseModel):
    text: Optional[str] = None
    title: Optional[str] = None
    qr: Optional[str] = None
    barcode: Optional[str] = None
    image: Optional[str] = None
    cut: bool = True


# --------------------------------------------------------------------------
# Renderers
# --------------------------------------------------------------------------
def render_text(p: Network, job: TextJob) -> None:
    reset(p)
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
                 caption: Optional[str], cut: bool) -> None:
    reset(p)
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


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
def require_auth(authorization: Optional[str] = Header(default=None)) -> None:
    if not PRINTER_TOKEN:
        raise HTTPException(status_code=500,
                            detail="server auth token not configured")
    expected = f"Bearer {PRINTER_TOKEN}"
    provided = authorization or ""
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401,
                            detail="missing or invalid bearer token")


# --------------------------------------------------------------------------
# Application
# --------------------------------------------------------------------------
app = FastAPI(title="printcast", description="HTTP->ESC/POS print bridge")


@app.exception_handler(PrintError)
def _print_error_handler(_request, exc: PrintError) -> JSONResponse:
    return JSONResponse(status_code=502,
                        content={"status": "error", "detail": str(exc)})


@app.get("/health")
def health() -> dict:
    reachable = tcp_reachable(PRINTER_HOST, PRINTER_PORT)
    printer = {
        "host": PRINTER_HOST,
        "port": PRINTER_PORT,
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
    }


@app.get("/discover")
def discover(_: None = Depends(require_auth)) -> dict:
    """List printer candidates currently reachable on the LAN."""
    candidates = discover_printers(port=PRINTER_PORT)
    for c in candidates:
        c["reachable"] = tcp_reachable(c["host"], c["port"])
    return {"port": PRINTER_PORT, "candidates": candidates}


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


@app.post("/print/text")
def print_text(job: TextJob, _: None = Depends(require_auth)) -> dict:
    run_print_job("text", lambda p: render_text(p, job))
    return {"status": "printed", "job": "text"}


@app.post("/print/receipt")
def print_receipt(job: ReceiptJob, _: None = Depends(require_auth)) -> dict:
    run_print_job("receipt", lambda p: render_receipt(p, job))
    return {"status": "printed", "job": "receipt"}


@app.post("/print/image")
def print_image(job: ImageJob, _: None = Depends(require_auth)) -> dict:
    try:
        img = load_image(job.image)
    except Exception as exc:
        raise HTTPException(status_code=400,
                            detail=f"could not load image: {exc}")
    run_print_job("image",
                  lambda p: render_image(p, img, job.align, job.caption, job.cut))
    return {"status": "printed", "job": "image"}


@app.post("/print")
def print_generic(job: GenericJob, _: None = Depends(require_auth)) -> dict:
    if not any([job.text, job.title, job.qr, job.barcode, job.image]):
        raise HTTPException(
            status_code=400,
            detail="provide at least one of: text, title, qr, barcode, image")
    img = None
    if job.image:
        try:
            img = load_image(job.image)
        except Exception as exc:
            raise HTTPException(status_code=400,
                                detail=f"could not load image: {exc}")
    run_print_job("generic", lambda p: render_generic(p, job, img))
    return {"status": "printed", "job": "generic"}


@app.post("/print/test")
def print_test(_: None = Depends(require_auth)) -> dict:
    run_print_job("test", render_test)
    return {"status": "printed", "job": "test"}


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def main() -> None:
    if not PRINTER_TOKEN:
        log("config.error", level=logging.ERROR, missing=["PRINTER_TOKEN"],
            detail="required environment variable is not set")
        sys.exit(1)

    if not PRINTER_HOST and PRINTER_AUTODETECT:
        autodetect_printer()

    if not PRINTER_HOST:
        log("config.error", level=logging.ERROR, missing=["PRINTER_HOST"],
            detail="PRINTER_HOST not set and auto-detection found no printer")
        sys.exit(1)

    log("service.start", service=SERVICE_NAME, listen="0.0.0.0:8080",
        printer_host=PRINTER_HOST, printer_port=PRINTER_PORT,
        printer_discovered_via=(PRINTER_DISCOVERY or {}).get("method"),
        codepage=PRINTER_CODEPAGE, retries=RETRIES, tz=TZ_NAME)
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")


if __name__ == "__main__":
    main()
