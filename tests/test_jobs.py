"""#17 — background work is registered, bounded and stoppable."""
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import pytest

import jobs

SRC = Path(__file__).resolve().parent.parent / "src"


@pytest.fixture(autouse=True)
def _clean():
    jobs.reset_for_tests()
    yield
    jobs.reset_for_tests()


def test_cooperative_job_stops_quickly_on_shutdown():
    started = threading.Event()

    def loop():
        started.set()
        while not jobs.stopping():
            time.sleep(0.01)

    jobs.start_thread(loop, name="coop")
    assert started.wait(2) and jobs.running() == ["coop"]
    t0 = time.monotonic()
    rep = jobs.shutdown(budget_s=5)
    assert rep == {"stopped": ["coop"], "still_running": []}
    assert time.monotonic() - t0 < 1.0
    assert jobs.running() == []


def test_cancel_hook_runs_on_stop():
    seen = []
    ev = threading.Event()
    jobs.start_thread(ev.wait, name="hooked", cancel=lambda: (seen.append("cancelled"), ev.set()))
    rep = jobs.shutdown(budget_s=2)
    assert seen == ["cancelled"] and rep["still_running"] == []


def test_uncooperative_job_is_reported_within_the_budget():
    release = threading.Event()
    jobs.start_thread(lambda: release.wait(30), name="stubborn")
    t0 = time.monotonic()
    rep = jobs.shutdown(budget_s=0.4)
    assert rep["still_running"] == ["stubborn"]
    assert time.monotonic() - t0 < 1.5          # the budget, not the job, sets the wait
    release.set()


def test_slot_reports_ok_error_timeout_and_busy_without_piling_up():
    slot = jobs.Slot()
    assert slot.run(lambda: 7, 1, name="t") == ("ok", 7)
    state, exc = slot.run(lambda: 1 / 0, 1, name="t")
    assert state == "error" and isinstance(exc, ZeroDivisionError)

    release = threading.Event()
    started = []

    def slow():
        started.append(1)
        release.wait(30)
        return "late"

    assert slot.run(slow, 0.1, name="t")[0] == "timeout"
    # The abandoned computation still holds the slot: a new one is not started.
    assert slot.run(lambda: started.append(2), 0.1, name="t")[0] == "busy"
    assert started == [1]
    release.set()
    time.sleep(0.2)
    assert slot.run(lambda: "again", 1, name="t") == ("ok", "again")


def test_a_leaked_computation_does_not_block_process_exit():
    code = (
        "import sys, time, threading; sys.path.insert(0, %r)\n"
        "import jobs\n"
        "s = jobs.Slot()\n"
        "print(s.run(lambda: time.sleep(60), 0.1, name='leak')[0], flush=True)\n"
    ) % str(SRC)
    t0 = time.monotonic()
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=20)
    assert out.stdout.strip() == "timeout" and out.returncode == 0
    assert time.monotonic() - t0 < 10


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_server_exits_cleanly_on_sigterm_within_the_budget(tmp_path):
    port = _free_port()
    env = dict(os.environ, DOMESTIQUE_HOME=str(tmp_path / "home"), HOME=str(tmp_path),
               PYTHONPATH=str(SRC), DOMESTIQUE_SHUTDOWN_BUDGET_S="3")
    for k in ("DOMESTIQUE_ACCESS_TOKEN", "DOMESTIQUE_SERVER_MODE"):
        env.pop(k, None)
    p = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", str(port),
         "--workers", "1", "--log-level", "warning"],
        cwd=str(SRC), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            try:
                # No proxy: a sandbox http_proxy would swallow loopback requests.
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                opener.open(f"http://127.0.0.1:{port}/api/version", timeout=2)
                break
            except OSError:
                if p.poll() is not None:
                    pytest.fail("server exited early: " + p.stdout.read().decode()[-500:])
                time.sleep(0.3)
        else:
            pytest.fail("server did not start")
        t0 = time.monotonic()
        p.send_signal(signal.SIGTERM)
        # uvicorn re-raises the captured SIGTERM after a graceful shutdown, so a
        # clean stop reads as 0 or -SIGTERM; a hung server would be killed (-9).
        assert p.wait(timeout=15) in (0, -signal.SIGTERM)
        assert time.monotonic() - t0 < 10
    finally:
        if p.poll() is None:
            p.kill()

