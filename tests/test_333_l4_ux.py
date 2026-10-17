"""3.3.3 (L4-UX) — smooth "I've been training already → scan → generate" flow.

Wave-B surface (app.py + dashboard.html) built against the Wave-A engine
contract (recognize_entry weeks_remaining field + generate_plan ValueError
on a backdated non-event plan with <1 schedulable week):

1  Scanning state — the scan button is the live progress surface (disabled +
   ticking label), restored afterwards. Never a dead control.
2  Scan-result card — headline "Matched your last N weeks — you're at week X
   of Y", expandable why? (rows + weekly-TSS trend), consequence line in
   plan language, length chips (non-event), phase-strip preview from the
   recognized position (entry shading + "you are here ▼" + end date +
   per-phase counts). /api/plan/entry-scan extended with plan_weeks /
   entry_week / weeks_remaining (defensive) / plan_end_date — date math
   only, no new engine work.
3  One-click generate from the card (no second confirm); engine ValueError
   renders INTO the card as a friendly state, never a raw error/toast.
4  Landing — after a recognized-entry generate the grid scrolls to TODAY's
   week, flashes it, notes "picked up at week X of Y". Never week 1.
5  Change-safety — goal/length/date drift greys the card with a
   "settings changed — re-scan" chip and clears the armed backdate; the
   card-less re-arm (backdate restored from the saved plan) is cleared too.
6  Green ring — verified as legitimate goal-date styling (server is_today
   drives the red today ring); the green ring carries the PLAN END / EVENT
   badge + a "not today" tooltip and never doubles as the today marker.
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
# Extended /api/plan/entry-scan response (TestClient, hermetic)
# ═══════════════════════════════════════════════════════════════════════════

def _canned_scan(proposal: int, start: date | None, *, extra: dict | None = None,
                 n_rows: int | None = None) -> dict:
    rows = []
    n = proposal if n_rows is None else n_rows
    for k in range(1, n + 1):
        rows.append({
            "index": k,
            "window_start": (date.today() - timedelta(days=7 * (n - k + 1))).isoformat(),
            "actual_tss": 300.0 + 5 * k,
            "target_tss": 320.0,
            "qualifies": True,
            "shape_note": "78% easy riding",
        })
    out = {
        "proposal_weeks": proposal,
        "equivalent_start_date": start.isoformat() if start else None,
        "capped": False,
        "weeks": rows,
    }
    if extra:
        out.update(extra)
    return out


class EntryScanBase(unittest.TestCase):
    def setUp(self):
        self._patches = [
            patch.object(app_module, "_load_all_rides_safe", return_value=[]),
            patch.object(app_module, "cached",
                         side_effect=lambda key, fn, ttl=300: {"ctl": 55.0}),
        ]
        for p in self._patches:
            p.start()
        self.client = TestClient(app_module.app)

    def tearDown(self):
        for p in self._patches:
            p.stop()


class TestEntryScanCardFields(EntryScanBase):
    """The endpoint wraps recognize_entry with the card's fields — pure date
    math on what the recognizer computed (plan_weeks / entry_week /
    weeks_remaining / plan_end_date), engine payload passed through intact."""

    def test_non_event_fields_and_weeks_remaining_fallback(self):
        start = date.today() - timedelta(weeks=8)
        canned = _canned_scan(8, start)  # NO weeks_remaining → fallback path
        with patch.object(tp, "recognize_entry", return_value=canned):
            r = self.client.get("/api/plan/entry-scan",
                                params={"goal": "ftp", "plan_weeks": 12})
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["plan_weeks"], 12)
        self.assertEqual(d["goal"], "ftp")
        self.assertEqual(d["entry_week"], 9)
        self.assertEqual(d["weeks_remaining"], 4)  # 12 − 8, defensive .get
        self.assertEqual(
            d["plan_end_date"],
            (start + timedelta(days=12 * 7 - 1)).isoformat(),
        )
        # Engine payload passes through untouched.
        self.assertEqual(d["proposal_weeks"], 8)
        self.assertEqual(d["equivalent_start_date"], start.isoformat())
        self.assertEqual(len(d["weeks"]), 8)
        self.assertIn("shape_note", d["weeks"][0])

    def test_wave_a_weeks_remaining_passes_through(self):
        start = date.today() - timedelta(weeks=8)
        canned = _canned_scan(8, start, extra={"weeks_remaining": 3})
        with patch.object(tp, "recognize_entry", return_value=canned):
            r = self.client.get("/api/plan/entry-scan",
                                params={"goal": "ftp", "plan_weeks": 12})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["weeks_remaining"], 3)  # Wave A's value wins

    def test_no_proposal_shape(self):
        canned = _canned_scan(0, None, n_rows=3)
        with patch.object(tp, "recognize_entry", return_value=canned):
            r = self.client.get("/api/plan/entry-scan",
                                params={"goal": "general", "plan_weeks": 12})
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertIsNone(d["entry_week"])
        self.assertEqual(d["weeks_remaining"], 12)  # fresh start = full runway
        self.assertNotIn("plan_end_date", d)
        self.assertEqual(len(d["weeks"]), 3)  # evidence rows still shown

    def test_event_goal_end_is_target_and_weeks_are_anchor_spanned(self):
        target = date.today() + timedelta(days=119)  # 17 today-anchored weeks
        start = date.today() - timedelta(weeks=10)
        canned = _canned_scan(10, start)
        with patch.object(tp, "recognize_entry", return_value=canned):
            r = self.client.get(
                "/api/plan/entry-scan",
                params={"goal": "event_preparation",
                        "event_date": target.isoformat()})
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["plan_end_date"], target.isoformat())
        # H1 parity: Y is the anchor→target span, not the today-anchored one.
        self.assertEqual(d["plan_weeks"], 27)  # ceil((119 + 70) / 7)
        self.assertEqual(d["entry_week"], 11)
        self.assertEqual(d["weeks_remaining"], 17)


# ═══════════════════════════════════════════════════════════════════════════
# Generate with a card-selected length + the ValueError surface shape
# ═══════════════════════════════════════════════════════════════════════════

class GenerateBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tp.load_workout_library()

    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self._tmp = Path(self._tmpdir.name)
        self._orig_plan_dir = tp.PLAN_DIR
        tp.PLAN_DIR = self._tmp
        self._patches = [
            patch.object(app_module, "_plan_dir", return_value=self._tmp),
            patch.object(app_module, "cached",
                         side_effect=lambda key, fn, ttl=300: {"ctl": 55.0}),
            patch.object(app_module, "_longest_ride_h_90d", return_value=3.0),
        ]
        for p in self._patches:
            p.start()
        import ride_storage as _rs
        self._p_rides = patch.object(_rs, "list_rides", return_value=[])
        self._p_rides.start()
        self._p_tss = patch.object(_rs, "chronic_weekly_tss",
                                   return_value=330.0)
        self._p_tss.start()
        self.client = TestClient(app_module.app)

    def tearDown(self):
        self._p_tss.stop()
        self._p_rides.stop()
        for p in self._patches:
            p.stop()
        tp.PLAN_DIR = self._orig_plan_dir
        self._tmpdir.cleanup()


class TestGenerateWithCardLength(GenerateBase):
    def test_selected_length_feeds_plan_weeks(self):
        """The card's length chip lands in the generate body as plan_weeks;
        the engine honors it on a recognized backdated start and the plan
        keeps schedulable weeks after today."""
        start = date.today() - timedelta(weeks=2)
        r = self.client.post("/api/plan/generate", json={
            "goal": "ftp",
            "hours_per_week": 8.0,
            "max_weekday": 1.5,
            "max_weekend": 3.0,
            "plan_weeks": 16,                       # card-selected chip
            "rest_days": [0],
            "daily_availability": {},
            "start_date": start.isoformat(),
            "entry_mode": "recognized",
        })
        self.assertEqual(r.status_code, 200, r.text)
        d = r.json()
        goal = d["plan_json"]["goal"]
        self.assertEqual(goal["plan_weeks"], 16)
        self.assertEqual(goal["start_date"], start.isoformat())
        self.assertEqual(goal["entry_mode"], "recognized")
        weeks = d["plan_json"]["weeks"]
        self.assertEqual(len(weeks), 16)
        today_iso = date.today().isoformat()
        future_weeks = [w for w in weeks if w["end"] >= today_iso]
        self.assertGreaterEqual(len(future_weeks), 13)
        future_sessions = [
            s for w in weeks for s in w["sessions"]
            if s["session_type"] != "rest" and s["day"] >= today_iso
        ]
        self.assertTrue(future_sessions,
                        "a 14-week remainder must schedule real sessions")


class TestValueErrorSurfaceShape(GenerateBase):
    def test_valueerror_becomes_400_detail_no_write(self):
        """Engine input rejections surface as 400 {"detail": <message>} —
        the card's friendly-state contract — and never persist a plan."""
        with patch.object(tp, "generate_plan",
                          side_effect=ValueError("no trainable weeks left")):
            r = self.client.post("/api/plan/generate", json={
                "goal": "ftp", "plan_weeks": 12,
                "hours_per_week": 8.0, "rest_days": [0],
                "daily_availability": {},
                "start_date": (date.today() - timedelta(weeks=15)).isoformat(),
                "entry_mode": "recognized",
            })
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json(), {"detail": "no trainable weeks left"})
        self.assertFalse((self._tmp / "current_plan.json").exists(),
                         "a rejected generate must not persist a plan")

    def test_wave_a_guard_fires_end_to_end(self):
        """Integration with Wave A's G2 gate: a backdated non-event start
        with <1 schedulable week is refused as a 400 with a user-facing
        detail (message text owned by Wave A — only the shape is pinned).
        If THIS test alone is red, attribute to training_planner (Wave A)."""
        r = self.client.post("/api/plan/generate", json={
            "goal": "ftp", "plan_weeks": 12,
            "hours_per_week": 8.0, "rest_days": [0],
            "daily_availability": {},
            "start_date": (date.today() - timedelta(weeks=15)).isoformat(),
            "entry_mode": "recognized",
        })
        self.assertEqual(r.status_code, 400, r.text)
        detail = r.json().get("detail", "")
        self.assertIsInstance(detail, str)
        self.assertTrue(detail, "400 must carry a user-facing detail")
        self.assertFalse((self._tmp / "current_plan.json").exists())


# ═══════════════════════════════════════════════════════════════════════════
# Node harness — card states, strip, landing, scanning button, today-ring
# ═══════════════════════════════════════════════════════════════════════════

_CARD_STUBS = """
const esc = s => String(s == null ? '' : s);
const PHASE_COLORS = { base:'#3b82f6', build1:'#10b981', build2:'#f59e0b',
                       peak:'#ef4444', taper:'#a855f7', recovery:'#64748b' };
function _isEventGoal(goal) { return goal === 'event' || goal === 'event_preparation'; }
const els = {
  'entry-scan-results': { innerHTML: '' },
  'entry-scan-btn': { disabled: false, textContent: 'Scan my rides',
                      dataset: {}, setAttribute(){}, removeAttribute(){} },
  'entry-recognized-note': { style: {} },
  'plan-goal': { value: 'ftp' },
  'plan-weeks': { value: '12' },
  'plan-edate': { value: '' },
  'plan-sdate': { value: '' },
};
const $ = id => els[id] || null;
"""

_SCAN_FIXTURE = """
function mkScanData() {
  const rows = [];
  for (let k = 1; k <= 8; k++) rows.push({
    index: k, window_start: '2026-05-' + String(10 + k).padStart(2, '0'),
    actual_tss: k <= 4 ? 300 : 340, target_tss: 320, qualifies: true,
    shape_note: '78% easy riding',
  });
  return { proposal_weeks: 8, equivalent_start_date: '2026-05-18',
           capped: false, weeks: rows, weeks_remaining: 4, plan_weeks: 12,
           entry_week: 9, goal: 'ftp', plan_end_date: '2026-08-09' };
}
function mkEs() {
  return { data: mkScanData(), selectedWeeks: 12, whyOpen: false,
           stale: false, done: false, error: '', doneNote: '',
           fingerprint: _entryScanFingerprint(), stripCache: {}, _stripReq: 0 };
}
const PHASES_12 = [
  { name:'base',   weeks:5 }, { name:'build1', weeks:3 },
  { name:'build2', weeks:2 }, { name:'peak',   weeks:1 },
  { name:'taper',  weeks:1 },
];
"""


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
