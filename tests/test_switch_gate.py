"""#5 — a profile switch never overtakes an in-flight write."""
import asyncio

import httpx
import pytest

import app as app_module
import switch_gate


@pytest.fixture(autouse=True)
def _remove_test_route():
    """The slow route is registered on the shared app; take it off again so
    route-enumerating tests that run later in this process never see it."""
    yield
    app_module.app.router.routes[:] = [
        r for r in app_module.app.router.routes if getattr(r, "path", "") != "/api/_gate_test/slow"]
    app_module.app.state._gate_test_route = False


def _slow_route():
    """Register (once) a mutating test route whose body we can hold open."""
    if getattr(app_module.app.state, "_gate_test_route", False):
        return
    state = {"started": None, "release": None}
    app_module.app.state._gate_state = state

    @app_module.app.post("/api/_gate_test/slow")
    async def slow():
        state["started"].set()
        await state["release"].wait()
        return {"ok": True}

    app_module.app.state._gate_test_route = True


async def _client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app_module.app), base_url="http://localhost")


def test_switch_waits_for_an_in_flight_write_then_proceeds():
    _slow_route()
    st = app_module.app.state._gate_state
    order = []

    async def run():
        st["started"], st["release"] = asyncio.Event(), asyncio.Event()
        async with await _client() as c:
            write = asyncio.create_task(c.post("/api/_gate_test/slow"))
            await st["started"].wait()
            switch = asyncio.create_task(c.post("/api/profiles/switch", json={"id": "does-not-exist"}))
            await asyncio.sleep(0.3)
            order.append(("switch done while write in flight", switch.done()))
            st["release"].set()
            w, sw = await asyncio.gather(write, switch)
            order.append(("write", w.status_code))
            order.append(("switch", sw.status_code))
            return sw

    sw = asyncio.run(run())
    assert order[0] == ("switch done while write in flight", False)   # it waited
    assert order[1] == ("write", 200)
    assert sw.status_code != 503                                      # it ran once the write ended


def test_switch_is_refused_when_writes_do_not_finish_in_time(monkeypatch):
    _slow_route()
    st = app_module.app.state._gate_state
    real = switch_gate.SwitchGate.exclusive

    def quick(self, timeout_s=5.0):
        return real(self, 0.2)

    monkeypatch.setattr(switch_gate.SwitchGate, "exclusive", quick)

    async def run():
        st["started"], st["release"] = asyncio.Event(), asyncio.Event()
        async with await _client() as c:
            write = asyncio.create_task(c.post("/api/_gate_test/slow"))
            await st["started"].wait()
            sw = await c.post("/api/profiles/switch", json={"id": "x"})
            st["release"].set()
            await write
            return sw

    sw = asyncio.run(run())
    assert sw.status_code == 503 and sw.headers.get("retry-after") == "2"


def test_a_write_arriving_during_a_switch_waits_behind_it():
    async def run():
        gate = switch_gate.SwitchGate()
        events = []
        release = asyncio.Event()

        async def switcher():
            async with gate.exclusive():
                events.append("switch start")
                await release.wait()
                events.append("switch end")

        async def writer():
            async with gate.shared():
                events.append("write")

        s = asyncio.create_task(switcher())
        await asyncio.sleep(0.05)
        w = asyncio.create_task(writer())
        await asyncio.sleep(0.1)
        assert events == ["switch start"]          # the write is held back
        release.set()
        await asyncio.gather(s, w)
        return events

    assert asyncio.run(run()) == ["switch start", "switch end", "write"]


def test_reads_are_not_gated_and_responses_name_the_profile():
    async def run():
        async with await _client() as c:
            return await c.get("/healthz")

    r = asyncio.run(run())
    assert r.status_code == 200
    assert "x-profile-id" in {k.lower() for k in r.headers}
