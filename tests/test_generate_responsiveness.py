"""#4 — plan generation does not block the event loop."""
import asyncio
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

import httpx

import app as app_module
import training_planner as tp

BODY = dict(
    goal="ftp", plan_mode="fixed_core", plan_weeks=16, hours_per_week=10,
    max_weekday=2.0, max_weekend=4.0, rest_days=[0],
    daily_availability={str(d): (2.0 if d < 5 else 4.0) for d in range(1, 7)},
)


def test_a_light_request_is_answered_while_a_plan_generates():
    tmp = Path(tempfile.mkdtemp(prefix="gen_resp_"))
    slow_s = 1.5
    real = tp.generate_plan

    def slow_generate(*a, **k):          # stand-in for a heavy build
        time.sleep(slow_s)
        return real(*a, **k)

    async def run():
        transport = httpx.ASGITransport(app=app_module.app)
        worst = 0.0
        stop = False

        async def watchdog():
            # How late does the loop wake a 50 ms sleep? A blocked loop shows up
            # as a long overshoot, whatever the other tasks are doing.
            nonlocal worst
            while not stop:
                t0 = time.perf_counter()
                await asyncio.sleep(0.05)
                worst = max(worst, time.perf_counter() - t0 - 0.05)

        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as c:
            dog = asyncio.create_task(watchdog())
            await asyncio.sleep(0.1)
            resp = await c.post("/api/plan/generate", json=BODY)
            stop = True
            await dog
            ping = await c.get("/healthz")
            assert ping.status_code == 200
            return worst, resp

    with patch.object(app_module, "_plan_dir", return_value=tmp), \
         patch.object(tp, "generate_plan", slow_generate), \
         patch.object(app_module, "cached",
                      side_effect=lambda k, fn, **kw: fn() if k != "training" else {"ctl": 45}), \
         patch.object(app_module.db, "query_activities", return_value=[]):
        worst, resp = asyncio.run(run())

    assert resp.status_code == 200, resp.text
    assert (tmp / "current_plan.json").is_file()
    # Before the change the loop was blocked for the whole sleep (>= 1.5 s).
    assert worst < 0.5, f"event loop was blocked for {worst:.2f}s while generating"
