"""3.4.1 M3 — adjustment-aware day modal: card and click agree.

Owner incident: the home card showed the EFFECTIVE session (HRV/glyco-
adjusted: "Z2, 60 TSS") per the 3.3.1 B1 decision, but clicking the card
opened the day modal (openDayWorkout via openTodayRich/calOpenDay) rendering
the ORIGINAL stored session ("Sweet Spot Steady 80min", 95% FTP ramps) with
zero trace of the adjustment.

Contract (locked):
  1. The modal consumes the SAME effective-session decision the card uses —
     ONE shared function (_effectiveTodaySession) feeds _todayPreviewSource
     (card) and _dayModalModel (modal).
  2. Pending adjustment on the opened day → the modal LEADS with the
     adjusted view (type/duration/TSS + the synthetic approximate shape via
     the existing fileless render branch) behind a banner.
  3. The original matched file demotes to a labeled collapsed block
     ("Original plan: …").
  4. Banner actions: accept → EXISTING /api/today-session/persist +
     /api/plan/re-draw; keep-original → EXISTING /api/readiness/revert-cap
     (C6), which now suppresses the whole live adjustment server-side.
  5. Downloads while pending serve the ADJUSTED targets: FIT synthesizes
     from type+duration (zwo_file=null), ZWO generates from the adjusted
     zone targets (downloadGeneratedZwo); calendar-push hidden (fileless).
  6. Unadjusted / non-today days render EXACTLY as before (pinned).
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import os
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

requires_node = pytest.mark.skipif(shutil.which("node") is None,
                                   reason="node not installed")


def _extract_js_function(src: str, name: str) -> str:
    """Brace-count slice of `[async ]function <name>(...) {...}`."""
    start = src.find(f"async function {name}")
    if start < 0:
        start = src.index(f"function {name}")
    i = src.index("{", start)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[start:j + 1]
    raise AssertionError(f"unbalanced braces extracting {name}")


def _run_node(harness: str) -> None:
    res = subprocess.run(["node", "-e", harness], capture_output=True,
                         text=True, timeout=30)
    assert res.returncode == 0, f"stderr:\n{res.stderr}\nstdout:\n{res.stdout}"
    assert "OK" in res.stdout


def _fns(src: str, *names: str) -> str:
    return "\n".join(_extract_js_function(src, n) for n in names)


# Shared stubs for harnesses that exercise the HTML builders / modal body.
_STUBS = """
global.esc = s => String(s == null ? '' : s);
global.escJs = s => String(s == null ? '' : s).replace(/'/g, "\\\\'");
global.fixZeroMin = s => s;
global.CAL_SESSION_LABEL = {rest:'REST', recovery:'RECOVERY', z2:'Z2',
  long_z2:'LONG Z2', tempo:'TEMPO', sweetspot:'SWEET SPOT',
  threshold:'THRESHOLD', vo2max:'VO2MAX', overunder:'OVER/UNDER',
  sprint:'SPRINTS', ftp_test:'FTP TEST'};
global.CAL_CONTENT_LABEL = {};
"""

# The owner's incident, as an /api/today-session fixture: sweet-spot stored
# plan (matched file) live-adjusted to Z2.
_TODAY_FIXTURE = """
const TODAY_D = {
  was_modified: true,
  planned: {session_type: 'sweetspot', duration_min: 80, tss_estimate: 95,
            description: 'Sweet Spot Steady 80min',
            zwo_file: 'sweet_spot_steady_80.zwo'},
  adjusted: {session_type: 'z2', duration_min: 60, tss_estimate: 42,
             description: 'z2 (was sweetspot)'},
  adjustment_reason: "Yesterday had 12 minutes at sprint intensity — easing today to Z2",
  reason: "Yesterday had 12 minutes at sprint intensity — easing today to Z2",
};
const SESSION = {
  day: new Date().toLocaleDateString('en-CA'), day_name: 'Monday',
  session_type: 'sweetspot', content_class: '', duration_min: 80,
  tss_estimate: 95, zwo_file: 'sweet_spot_steady_80.zwo',
  zwo_name: 'Sweet Spot Steady 80min', display_name: '',
  zwo_duration_min: 80, description: 'Sweet Spot Steady 80min',
  zone_dist: null, status: 'pending',
};
"""


# ═══════════════════════════════════════════════════════════════════════════
# 1 — the modal model chooses adjusted when was_modified (shared decision fn)
# ═══════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════
# 2/3 — banner text + original-plan secondary block
# ═══════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════
# 4 — accept calls the EXISTING persist + re-draw pair; keep-original calls
#     the EXISTING revert-cap. Both refresh card + calendar + grid.
# ═══════════════════════════════════════════════════════════════════════════

_ACTION_STUBS = """
let calls = [];
let closed = 0, refreshed = [];
global.showToast = () => {};
global.closeModal = () => { closed++; };
global.loadTodaySession = async () => { refreshed.push('today'); };
global.loadCalendar = async () => { refreshed.push('cal'); };
global.loadPlan = async () => { refreshed.push('plan'); };
global.loadWeeklyCalendar = () => { refreshed.push('week'); };
// keepOriginalToday dims the modal and shows a reflow note before closing —
// browser-only chrome the sandbox doesn't need to render, only tolerate.
global.document = { querySelector: () => null, getElementById: () => null };
global._calTodayStr = () => '2026-01-01';
global.openDayWorkout = async () => {};
"""


# ═══════════════════════════════════════════════════════════════════════════
# 5/6 — the full modal render: adjusted day leads adjusted with effective-
#       target downloads; unadjusted day renders exactly as before.
# ═══════════════════════════════════════════════════════════════════════════

_MODAL_STUBS = _STUBS + """
global.buildPowerBlocks = (type, dur) => [{name: String(type), min: dur || 0,
  pctLow: 70, pctHigh: 70, kind: 'steady'}];
global.renderPowerBlocksSVG = blocks => `<svg data-blocks="${blocks.map(b=>b.name).join(',')}"></svg>`;
global.workoutProfileSVG = () => '<svg data-real="1"></svg>';
global.ftpTestChooserHtml = () => '';
let modalHtml = null;
global.openModal = h => { modalHtml = h; };
"""


# ═══════════════════════════════════════════════════════════════════════════
# server — the C6 revert flag suppresses the WHOLE live adjustment (without
# this, [Keep original] is a visible no-op for HRV/score/DFA causes)
# ═══════════════════════════════════════════════════════════════════════════

def _mk_today_plan(today: date) -> dict:
    monday = today - timedelta(days=today.weekday())
    sessions = []
    for off in range(7):
        d = monday + timedelta(days=off)
        if d == today:
            sessions.append({"day": d.isoformat(), "day_name": d.strftime("%a"),
                             "session_type": "tempo", "duration_min": 75,
                             "tss_estimate": 60, "description": "3x15min @ 88% FTP",
                             "zwo_file": "tempo_test.zwo", "zwo_name": "tempo test",
                             "status": "pending"})
        else:
            sessions.append({"day": d.isoformat(), "day_name": d.strftime("%a"),
                             "session_type": "rest", "duration_min": 0,
                             "tss_estimate": 0, "description": "Rest day",
                             "zwo_file": "", "zwo_name": "", "status": "pending"})
    return {"goal": {"type": "general", "hours_per_week": 8.0},
            "phases": [],
            "weeks": [{"week_num": 1, "start": monday.isoformat(),
                       "end": (monday + timedelta(days=6)).isoformat(),
                       "phase": "base", "tss_target": 60, "is_stepback": False,
                       "sessions": sessions}],
            "generated": "2026-07-01T00:00:00"}


class TestRevertFlagSuppressesLiveAdjustment(unittest.TestCase):
    """3.4.1 M3 app.py gate: reverted flag → adjusted == planned,
    was_modified False; unreverted → the HRV adjustment stands."""

    def setUp(self):
        app_module.clear_cache()
        self._tmpdir = tempfile.TemporaryDirectory()
        tmp = Path(self._tmpdir.name)
        (tmp / "current_plan.json").write_text(json.dumps(_mk_today_plan(date.today())))
        self._orig_plan_dir = tp.PLAN_DIR
        tp.PLAN_DIR = tmp
        self._patches = [
            patch.object(app_module, "_maybe_lazy_icu_sync", return_value=None),
            patch.object(app_module, "_kick_lazy_icu_sync", return_value=None),
            patch.object(app_module.db, "query_activities", return_value=[]),
            # HRV streak day 1 + tempo planned → Z2 downgrade (the control).
            patch.object(app_module, "get_sleep_metrics",
                         return_value={"red_hrv_streak": 1, "ln_rmssd_7d": None,
                                       "swc_lower": None, "swc_upper": None,
                                       "sleep_h": 7.5, "rhr_delta": 0}),
            patch.object(app_module, "get_today_metrics",
                         return_value={"ctl": 50, "atl": 45, "tsb": 5}),
        ]
        for p in self._patches:
            p.start()
        self.client = TestClient(app_module.app)

    def tearDown(self):
        for p in self._patches:
            p.stop()
        tp.PLAN_DIR = self._orig_plan_dir
        self._tmpdir.cleanup()
        app_module.clear_cache()

    def test_unreverted_adjustment_stands(self):
        with patch.object(app_module, "_is_readiness_cap_reverted_today",
                          return_value=False):
            data = self.client.get("/api/today-session").json()
        self.assertTrue(data.get("was_modified"))
        self.assertEqual(data["adjusted"]["session_type"], "z2")

    def test_reverted_flag_restores_planned(self):
        with patch.object(app_module, "_is_readiness_cap_reverted_today",
                          return_value=True):
            data = self.client.get("/api/today-session").json()
        self.assertFalse(data.get("was_modified"),
                         f"revert flag must suppress the adjustment: {data.get('reason')!r}")
        self.assertEqual(data["adjusted"]["session_type"], "tempo")
        self.assertEqual(data["adjusted"]["duration_min"], 75)
        self.assertEqual(data.get("adjustment_reason", ""), "")
        # Targets follow the restored planned session too.
        self.assertEqual(data["planned"]["session_type"], "tempo")

    def test_accept_flow_converges(self):
        """The accept button's server side: persisting the adjusted block
        makes the NEXT /api/today-session read unadjusted (planned == the
        accepted z2; the HRV gate has nothing hard left to demote) — card,
        modal and grid then all tell the same story."""
        with patch.object(app_module, "_is_readiness_cap_reverted_today",
                          return_value=False):
            before = self.client.get("/api/today-session").json()
            self.assertTrue(before.get("was_modified"))
            adj = before["adjusted"]
            r = self.client.post("/api/today-session/persist", json={
                "reason": before.get("adjustment_reason") or "adapted",
                "session_type": adj["session_type"],
                "duration_min": adj["duration_min"],
                "tss_estimate": adj["tss_estimate"],
                "description": adj.get("description") or "",
            })
            self.assertEqual(r.status_code, 200, r.text)
            self.assertTrue(r.json().get("ok"))
            after = self.client.get("/api/today-session").json()
        self.assertEqual(after["planned"]["session_type"], "z2")
        self.assertFalse(after.get("was_modified"),
                         f"accepted day must not re-adjust: {after.get('reason')!r}")
        # The stale sweet-spot ZWO was cleared for the re-match pass.
        plan = json.loads((Path(tp.PLAN_DIR) / "current_plan.json").read_text())
        sess = next(s for w in plan["weeks"] for s in w["sessions"]
                    if s["day"] == date.today().isoformat())
        self.assertEqual(sess["zwo_file"], "")
        self.assertTrue(sess.get("adapted"))


if __name__ == "__main__":
    unittest.main()
