"""Background work: named, bounded and stoppable (#17).

Every long-running thread the app starts goes through ``start_thread`` so it has
a name, an owner and a cancel hook, and so shutdown can find it. Long loops call
``stopping()`` between units of work; that is the cooperative cancellation the
workers honour. ``shutdown`` asks everything to stop, waits for a shared budget,
and reports what did not stop. It never kills a thread.

Three different things are kept apart on purpose:

* a *request timeout* only abandons the wait (``run_with_timeout`` returns
  ``"timeout"``);
* *cancellation* of queued work is the cancel hook / ``stopping()`` flag;
* *termination* of running work is only guaranteed where the worker checks
  ``stopping()``. A computation that never checks it keeps running until it
  ends, but it runs on a daemon thread so it cannot hold up process exit, and
  ``run_with_timeout`` allows at most one such leaked computation per slot.

Restart semantics: nothing is persisted. An interrupted job simply runs again
on the next trigger; the jobs here are idempotent (a recomputed DFA record, a
re-fetched ride envelope, a re-sent calendar event keyed by its own id).
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

log = logging.getLogger("shepherd.jobs")

_stop = threading.Event()
_owner = threading.local()   # the profile a job thread was started under
_lock = threading.Lock()
_jobs: "dict[int, _Job]" = {}


@dataclass
class _Job:
    name: str
    thread: threading.Thread
    cancel: Optional[Callable[[], None]] = None
    started: float = field(default_factory=time.monotonic)


def _active_profile_id() -> str:
    try:
        from profile_manager import ProfileManager
        return ProfileManager.get().active_id or ""
    except Exception:  # noqa: BLE001 - no profile layer (tests, early boot)
        return ""


def stopping() -> bool:
    """True once shutdown was requested, or - on a job thread - once the active
    profile is no longer the one the job started under (#5): a backfill must not
    carry on writing into the profile the rider switched to. Long loops check
    this between units."""
    if _stop.is_set():
        return True
    owner = getattr(_owner, "profile", None)
    return bool(owner) and owner != _active_profile_id()


def start_thread(target: Callable[..., Any], *, name: str, args: tuple = (),
                 cancel: Optional[Callable[[], None]] = None) -> threading.Thread:
    """Start a registered daemon thread. ``cancel`` is called on shutdown."""
    profile = _active_profile_id()

    def _run() -> None:
        _owner.profile = profile
        try:
            target(*args)
        finally:
            with _lock:
                _jobs.pop(threading.get_ident(), None)

    t = threading.Thread(target=_run, name=name, daemon=True)
    t.start()
    with _lock:
        _jobs[t.ident or id(t)] = _Job(name=name, thread=t, cancel=cancel)
    return t


def running() -> list[str]:
    with _lock:
        return sorted(j.name for j in _jobs.values() if j.thread.is_alive())


def request_stop() -> None:
    _stop.set()
    with _lock:
        jobs = list(_jobs.values())
    for j in jobs:
        if j.cancel is not None:
            try:
                j.cancel()
            except Exception as e:  # noqa: BLE001 - shutdown must not raise
                log.debug("cancel hook for %s failed: %s", j.name, e)


def shutdown(budget_s: float = 8.0) -> dict:
    """Stop everything within ``budget_s`` seconds in total.

    Returns ``{"stopped": [...], "still_running": [...]}``. Threads that are
    still running are daemons and do not delay process exit.
    """
    request_stop()
    deadline = time.monotonic() + max(0.0, budget_s)
    with _lock:
        jobs = list(_jobs.values())
    stopped, alive = [], []
    for j in jobs:
        j.thread.join(timeout=max(0.0, deadline - time.monotonic()))
        (alive if j.thread.is_alive() else stopped).append(j.name)
    if alive:
        # Stragglers keep seeing stopping() == True until the process ends or
        # begin() starts a new run.
        log.warning("shutdown: %d job(s) still running after %.1fs: %s",
                    len(alive), budget_s, ", ".join(sorted(alive)))
    else:
        _stop.clear()     # everything stopped: a later run in this process starts clean
    return {"stopped": sorted(stopped), "still_running": sorted(alive)}


def begin() -> None:
    """Start a new run: clear the stop flag a previous shutdown set. Called at
    application startup, so a process that starts the app more than once (tests,
    an embedded server) is not left permanently stopping."""
    _stop.clear()


def reset_for_tests() -> None:
    begin()
    with _lock:
        _jobs.clear()


class Slot:
    """At most one computation at a time; a timed-out one keeps the slot."""

    def __init__(self) -> None:
        self._sem = threading.Semaphore(1)

    def run(self, fn: Callable[[], Any], timeout_s: float, *, name: str):
        """Run ``fn`` on a daemon thread and wait up to ``timeout_s``.

        Returns ``("ok", value)``, ``("error", exc)``, ``("timeout", None)`` or
        ``("busy", None)``. ``busy`` means an earlier timed-out computation still
        holds the slot and ``fn`` was not started. The slot is released only when
        the computation itself ends, so leaked work cannot pile up.
        """
        if not self._sem.acquire(timeout=max(0.0, timeout_s)):
            return "busy", None
        out: dict = {}
        done = threading.Event()

        def _work() -> None:
            try:
                out["v"] = fn()
            except BaseException as e:  # noqa: BLE001 - reported to the caller
                out["e"] = e
            finally:
                self._sem.release()
                done.set()

        threading.Thread(target=_work, name=name, daemon=True).start()
        if not done.wait(timeout=timeout_s):
            return "timeout", None
        if "e" in out:
            return "error", out["e"]
        return "ok", out.get("v")
