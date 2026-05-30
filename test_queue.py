#!/usr/bin/env python3
"""Tests for the offline print queue.

No real hardware is required: ``app.tcp_reachable`` and ``app._do_print`` are
replaced with stubs (saved/restored per test) so nothing touches the network.

The print endpoints are exercised by calling their handler functions directly
with a tiny fake Request. This runs the exact code FastAPI would run (the same
``run_print_job`` choke point) while staying deterministic and single-threaded.
"""
import base64
import io
import json
import os
import tempfile

import pytest

# Configure the environment before importing app (module-level constants such as
# DB_FILE are computed at import time). The module is imported once; per-test
# state is reset in the fixture and the queue lives in SQLite.
os.environ.setdefault("PRINTER_AUTODETECT", "false")
os.environ.setdefault("PRINTER_TOKEN", "")
os.environ.setdefault("PRINTER_HOST", "127.0.0.1")
os.environ.setdefault("PRINTCAST_DATA_DIR", tempfile.mkdtemp())

import app as _app  # noqa: E402


class _FakeRequest:
    """Minimal stand-in for starlette Request used by the print handlers."""

    headers: dict = {}

    class _Client:
        host = "127.0.0.1"

    client = _Client()


@pytest.fixture()
def app_mod(tmp_path):
    orig_reachable = _app.tcp_reachable
    orig_do_print = _app._do_print
    orig_data_dir = _app.DATA_DIR
    orig_db_file = _app.DB_FILE
    _app.DATA_DIR = tmp_path
    _app.DB_FILE = tmp_path / "printcast.db"
    _app.CONFIG["printer_host"] = "127.0.0.1"
    _app.CONFIG["queue_enabled"] = True
    _app.CONFIG["printer_retries"] = 1
    _app._init_db()
    _app.clear_queue()
    try:
        yield _app
    finally:
        _app.tcp_reachable = orig_reachable
        _app._do_print = orig_do_print
        _app.DATA_DIR = orig_data_dir
        _app.DB_FILE = orig_db_file


def _set_reachable(value):
    _app.tcp_reachable = lambda *a, **k: value


def _post_text(text):
    return _app.print_text(_app.TextJob(text=text), _FakeRequest(), None)


def _post_image(image):
    return _app.print_image(_app.ImageJob(image=image), _FakeRequest(), None)


def _png_data_url() -> str:
    from PIL import Image

    img = Image.new("RGB", (4, 4), (255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _success_rows(app_mod) -> int:
    with app_mod._db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM jobs WHERE status='success'").fetchone()
    return int(row["c"])


def _error_rows(app_mod) -> int:
    with app_mod._db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM jobs WHERE status='error'").fetchone()
    return int(row["c"])


# 1. Offline submit -> 202 queued, depth 1, no success row.
def test_offline_submit_queues(app_mod):
    _set_reachable(False)
    resp = _post_text("hello")
    assert resp.status_code == 202
    body = json.loads(resp.body)
    assert body["status"] == "queued"
    assert body["queue_depth"] == 1
    assert app_mod.queue_depth() == 1
    assert _success_rows(app_mod) == 0


# 2. Enqueue 3 offline, then reachable + flush -> FIFO order, empty, 3 success.
def test_flush_fifo_order(app_mod):
    _set_reachable(False)
    for i in range(3):
        resp = _post_text("job-%d" % i)
        assert resp.status_code == 202
    assert app_mod.queue_depth() == 3

    printed: list[str] = []
    _set_reachable(True)

    class _Recorder:
        # Captures text the rebuilt render emits, so we can assert FIFO order.
        def __init__(self):
            self.buf = []

        def text(self, s):
            self.buf.append(s)

        def __getattr__(self, _name):
            return lambda *a, **k: None

    def fake_do_print(render):
        rec = _Recorder()
        render(rec)
        joined = "".join(rec.buf)
        for marker in ("job-0", "job-1", "job-2"):
            if marker in joined:
                printed.append(marker)
                break
        return 5, 1

    _app._do_print = fake_do_print

    result = app_mod.flush_queue_once()
    assert result == {"flushed": 3, "remaining": 0}
    assert printed == ["job-0", "job-1", "job-2"]
    assert app_mod.queue_depth() == 0
    assert _success_rows(app_mod) == 3


# 3. Persistence: queue lives in SQLite (a fresh list_queue == a restart).
def test_persistence(app_mod):
    _set_reachable(False)
    _post_text("persist-me")
    rows = app_mod.list_queue()
    assert len(rows) == 1
    assert rows[0]["job_type"] == "text"
    assert rows[0]["payload"]["text"] == "persist-me"


# 4. Bad input is rejected, never queued.
def test_bad_input_not_queued(app_mod):
    _set_reachable(False)
    # Missing required 'text' -> pydantic ValidationError (422 over HTTP).
    with pytest.raises(Exception):
        _app.TextJob()
    assert app_mod.queue_depth() == 0
    # Invalid image while offline -> HTTP 400 raised before any queue decision.
    with pytest.raises(_app.HTTPException) as ei:
        _post_image("not-a-valid-image!!!")
    assert ei.value.status_code == 400
    assert app_mod.queue_depth() == 0


# 5. Mid-flush stop on connectivity loss: succeeds once, then unreachable.
def test_mid_flush_stop(app_mod):
    _set_reachable(False)
    for i in range(3):
        _post_text("job-%d" % i)
    assert app_mod.queue_depth() == 3

    reach = {"v": True}
    _app.tcp_reachable = lambda *a, **k: reach["v"]
    calls = {"n": 0}

    def fake_do_print(render):
        calls["n"] += 1
        if calls["n"] == 1:
            return 5, 1
        reach["v"] = False  # printer dropped; recheck will see unreachable
        raise app_mod.PrintError("connection refused")

    _app._do_print = fake_do_print

    result = app_mod.flush_queue_once()
    assert result["flushed"] == 1
    assert app_mod.queue_depth() == 2
    assert json.loads(app_mod.oldest_queued()["payload"])["text"] == "job-1"


# 6. Genuine error (reachable) is NOT queued -> PrintError (502 over HTTP).
def test_genuine_error_not_queued(app_mod):
    _set_reachable(True)

    def boom(render):
        raise app_mod.PrintError("printer jam")

    _app._do_print = boom

    with pytest.raises(app_mod.PrintError):
        _post_text("boom")
    assert app_mod.queue_depth() == 0
    assert _error_rows(app_mod) == 1
