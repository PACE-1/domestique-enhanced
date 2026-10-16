"""Orders profile switches against in-flight writes (#5).

A mutating request reads the active profile in several places (its directory,
its database, its credentials). If a switch lands between two of those reads the
request writes half of one rider's data into another's. The gate removes that
window without per-endpoint changes:

* a mutating request (POST/PUT/PATCH/DELETE) holds a shared slot while it runs;
* a switch holds the gate exclusively: it waits (bounded) for in-flight writes to
  finish, and requests that arrive meanwhile wait (bounded) behind it.

Behaviour for in-flight work is therefore defined: a switch never overtakes a
write, and when writes do not finish inside ``timeout_s`` the switch is refused
with ``Busy`` (HTTP 503, "try again") instead of risking a mixed write.
Background threads are covered separately by ``db.sync_write_gate``.

Every response also carries ``X-Profile-Id`` (the profile that served it), so a
client can discard a response that answers for a profile it has since left.
"""
from __future__ import annotations

import asyncio
import weakref
from contextlib import asynccontextmanager


class Busy(Exception):
    """In-flight writes did not finish in time; the switch was not applied."""


class _State:
    def __init__(self) -> None:
        self.cond = asyncio.Condition()
        self.writers = 0
        self.switching = False


class SwitchGate:
    """State is kept per event loop: the app has one, and test clients create one
    per request, which a loop-bound ``asyncio.Condition`` could not survive."""

    def __init__(self) -> None:
        self._states: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, _State]" = (
            weakref.WeakKeyDictionary())

    def _state(self) -> _State:
        loop = asyncio.get_running_loop()
        st = self._states.get(loop)
        if st is None:
            st = self._states[loop] = _State()
        return st

    @asynccontextmanager
    async def shared(self, timeout_s: float = 10.0):
        st = self._state()
        async with st.cond:
            try:
                await asyncio.wait_for(st.cond.wait_for(lambda: not st.switching), timeout_s)
            except asyncio.TimeoutError:
                raise Busy("a profile switch is in progress")
            st.writers += 1
        try:
            yield
        finally:
            async with st.cond:
                st.writers -= 1
                st.cond.notify_all()

    @asynccontextmanager
    async def exclusive(self, timeout_s: float = 5.0):
        st = self._state()
        async with st.cond:
            await st.cond.wait_for(lambda: not st.switching)       # one switch at a time
            st.switching = True                                     # new writers now wait
            try:
                await asyncio.wait_for(st.cond.wait_for(lambda: st.writers == 0), timeout_s)
            except asyncio.TimeoutError:
                st.switching = False
                st.cond.notify_all()
                raise Busy("requests are still writing; try again in a moment")
        try:
            yield
        finally:
            async with st.cond:
                st.switching = False
                st.cond.notify_all()


gate = SwitchGate()
SWITCH_PATH = "/api/profiles/switch"
WRITE_METHODS = ("POST", "PUT", "PATCH", "DELETE")
