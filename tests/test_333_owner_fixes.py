"""3.3.3 (owner) — three owner-reported UX fixes.

A   Phase-split editor: a custom split summing to FEWER (or more) weeks than
    the plan length now shows a PROMINENT red error at the BOTTOM of the
    editor + a mirror next to the (disabled) Generate button, live-updated on
    every stepper click via _syncPhaseSplitError() — no server round-trip
    needed. One message generator (_phaseSplitErrorText) feeds all surfaces.

B   Wizard per-day hours seed the Availability Calendar on generate. The old
    plan's dense "available" rows (the PREVIOUS wizard's defaults) are no
    longer fed to generate_plan as availability_overrides — only explicit
    blocks (holiday/injury/illness/unavailable) survive, exactly the rows the
    v1.8.21 calendar rebuild preserves. Symptom killed: wizard said 1h/day
    but the engine kept building 2h sessions off the stale rows.

C   The green goal ring on the calendar (event day / end-of-plan day) was
    misread as the today marker — it now carries a small green pill badge
    (EVENT on event goals, PLAN END otherwise). The red ring stays TODAY.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module  # noqa: E402
import training_planner as tp  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

REPO = Path(__file__).resolve().parent.parent

needs_node = pytest.mark.skipif(shutil.which("node") is None,
                                reason="node not installed")


def _run_node(harness: str) -> None:
    res = subprocess.run(["node", "-e", harness], capture_output=True,
                         text=True, timeout=30)
    assert res.returncode == 0, f"stderr:\n{res.stderr}\nstdout:\n{res.stdout}"
    assert "OK" in res.stdout


# ═══════════════════════════════════════════════════════════════════════════
# A — phase-split under/over-distribution error
# ═══════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════
# B — wizard per-day hours seed the availability calendar on generate
# ═══════════════════════════════════════════════════════════════════════════

class TestWizardHoursSeedAvailability(unittest.TestCase):
    """TestClient round-trip: old plan carries dense 2h 'available' rows (the
    previous wizard's defaults) + two explicit blocks; the new wizard says
    1h/day. The engine must see ONLY the explicit blocks as overrides, the
    persisted calendar must read 1h everywhere else, and no session may be
    built to the stale 2h."""

    @classmethod
    def setUpClass(cls):
        tp.load_workout_library()

    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self._tmp = Path(self._tmpdir.name)
        self._orig_plan_dir = tp.PLAN_DIR
        tp.PLAN_DIR = self._tmp
        self._patch_plan_dir = patch.object(
            app_module, "_plan_dir", return_value=self._tmp)
        self._patch_plan_dir.start()
        self._fit_dir = self._tmp / "fit"
        self._fit_dir.mkdir(parents=True, exist_ok=True)
        self._patch_fit = patch.object(
            app_module, "_rides_fit_dir", return_value=self._fit_dir)
        self._patch_fit.start()
        import ride_storage as _rs
        self._patch_rides = patch.object(_rs, "list_rides", return_value=[])
        self._patch_rides.start()
        self.client = TestClient(app_module.app)

    def tearDown(self):
        self._patch_rides.stop()
        self._patch_fit.stop()
        self._patch_plan_dir.stop()
        tp.PLAN_DIR = self._orig_plan_dir
        self._tmpdir.cleanup()

    def _write_old_plan_with_2h_calendar(self, holiday: str, injury: str):
        monday = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)
        weeks = []
        for w_idx in range(2):
            wstart = monday + timedelta(weeks=w_idx)
            sessions = []
            for off in range(7):
                d = wstart + timedelta(days=off)
                sessions.append({
                    "day": d.isoformat(), "day_name": d.strftime("%a"),
                    "session_type": "z2" if off in (1, 3) else "rest",
                    "duration_min": 60 if off in (1, 3) else 0,
                    "tss_estimate": 45 if off in (1, 3) else 0,
                    "description": "",
                    "zwo_file": "z2_test.zwo" if off in (1, 3) else "",
                    "zwo_name": "Z2" if off in (1, 3) else "",
                    "status": "pending",
                })
            weeks.append({
                "week_num": w_idx + 1, "start": wstart.isoformat(),
                "end": (wstart + timedelta(days=6)).isoformat(),
                "phase": "base", "tss_target": 200, "is_stepback": False,
                "sessions": sessions, "hit_per_week": 0,
            })
        # Dense old calendar: 2h "available" everywhere (the OLD wizard's
        # defaults materialized by the v1.8.21 rebuild) + explicit blocks.
        avail = {}
        for i in range(60):
            avail[(date.today() + timedelta(days=i)).isoformat()] = {
                "hours": 2.0, "type": "available"}
        avail[holiday] = {"hours": 0, "type": "holiday"}
        avail[injury] = {"hours": 0, "type": "injury"}
        plan = {
            "goal": {"type": "general", "hours_per_week": 14.0,
                     "rest_days": [], "max_weekday_hours": 2.0,
                     "max_weekend_hours": 2.0},
            "phases": [], "weeks": weeks,
            "generated": "2026-04-19T00:00:00", "availability": avail,
        }
        (self._tmp / "current_plan.json").write_text(json.dumps(plan))

    def test_wizard_1h_seeds_calendar_and_engine(self):
        holiday = (date.today() + timedelta(days=10)).isoformat()
        injury = (date.today() + timedelta(days=12)).isoformat()
        self._write_old_plan_with_2h_calendar(holiday, injury)

        captured: dict = {}
        real_generate = tp.generate_plan

        def spy(goal, **kw):
            captured.update(kw)
            return real_generate(goal, **kw)

        with patch.object(tp, "generate_plan", side_effect=spy):
            r = self.client.post("/api/plan/generate", json={
                "goal": "general",
                "hours_per_week": 7.0,
                "max_weekday": 1.0,
                "max_weekend": 1.0,
                "plan_weeks": 8,
                "rest_days": [],
                "daily_availability": {str(i): 1.0 for i in range(7)},
            })
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertNotIn("error", d)

        # 1. Engine overrides: ONLY the explicit blocks — the stale 2h
        #    "available" rows must NOT reach generate_plan.
        passed = captured.get("availability_overrides") or {}
        self.assertEqual(
            set(passed), {holiday, injury},
            f"engine must see only explicit blocks, got {sorted(passed)[:5]}…",
        )
        self.assertEqual(passed[holiday], 0.0)

        # 2. Persisted calendar: wizard's 1h/day everywhere in the plan span,
        #    explicit blocks preserved verbatim.
        saved = json.loads((self._tmp / "current_plan.json").read_text())
        avail = saved.get("availability") or {}
        self.assertTrue(avail, "generate must write a dense availability dict")
        self.assertEqual(avail.get(holiday), {"hours": 0, "type": "holiday"})
        self.assertEqual(avail.get(injury), {"hours": 0, "type": "injury"})
        others = {k: v for k, v in avail.items() if k not in (holiday, injury)}
        self.assertTrue(others)
        for day_iso, entry in others.items():
            self.assertEqual(
                (entry.get("hours"), entry.get("type")), (1.0, "available"),
                f"{day_iso} must carry the wizard's 1h, got {entry}",
            )

        # 3. The owner-visible symptom: no session built to the stale 2h.
        #    Every cap the wizard sent says 60 min.
        over = [
            (s["day"], s["session_type"], s["duration_min"])
            for w in d["plan_json"]["weeks"] for s in w["sessions"]
            if s["session_type"] != "rest" and s["duration_min"] > 60
        ]
        self.assertEqual(over, [], f"sessions exceed the wizard's 1h/day cap: {over}")


# ═══════════════════════════════════════════════════════════════════════════
# C — green goal ring labeled (EVENT / PLAN END), not mistakable for today
# ═══════════════════════════════════════════════════════════════════════════

_CAL_STUBS = """
const esc = s => String(s == null ? '' : s);
const calCardTitleWithStructure = p => (p && p.session_type) || '';
const calContentCss = () => '';
const calCellTooltip = () => '';
const calActualClass = () => '';
const _calMatchBadge = () => '';
const _classifColor = () => null;
// v3.4.4 — renderCalDay sources card content from the shared helper.
const plannedCardParts = (p, cs) => ({ title: calCardTitleWithStructure(p),
  cssCls: calContentCss(), metaText: '', warn: '' });
"""


if __name__ == "__main__":
    unittest.main()
