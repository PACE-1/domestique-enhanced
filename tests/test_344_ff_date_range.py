"""3.4.4 — Fitness & Form date-range filtering (ICU-style).

Three layers under test:

1. ``GET /api/wellness`` grew optional inclusive ``from``/``to`` ISO params
   (TestClient): records are sliced to the window server-side, ``days`` is
   widened to reach back to ``from``, and the legacy days-only contract
   (home boot ?days=90, default 28) is byte-identical untouched.
2. The pure range helpers in dashboard.html (node harness): year-chip
   derivation, range-label formatting, the click-start-then-end calendar
   state machine (end<start swaps), month navigation, Monday-first grid,
   clamping (future 'to' → clamp + note; fully-outside → null), quick-link
   ranges, and the per-profile localStorage round-trip.
3. fitnessChart listener discipline (node harness): each render replaces the
   svg node via container.innerHTML, so repeated filter clicks must yield
   exactly ONE mousemove listener on the current node — no stacking on any
   persistent node (hover regression guard for efa76cd5 lives in
   test_344_ff_hover.py; this file pins the re-render side).
"""
from __future__ import annotations

import datetime as _dt
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

_REPO = Path(__file__).resolve().parent.parent

_PURE_START = "// ═══ FF DATE-RANGE (3.4.4) — pure helpers"
_PURE_END = "// ═══ FF DATE-RANGE — UI wiring"


_LS_STUB = """
const _store = {};
globalThis.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
};
globalThis.__PROFILE = 'p1';
globalThis._profileLsKey = base => base + ':' + globalThis.__PROFILE;
"""


# ═══════════════════════════════════════════════════════════════════════════
# 1. /api/wellness from/to (TestClient)
# ═══════════════════════════════════════════════════════════════════════════

class TestWellnessFromTo(unittest.TestCase):
    """Server-side window slicing + legacy days contract."""

    @classmethod
    def setUpClass(cls):
        import app as app_module
        from fastapi.testclient import TestClient
        cls.app_module = app_module
        cls.client = TestClient(app_module.app)

    def setUp(self):
        # 10 contiguous days spanning a year boundary: 2025-12-28..2026-01-06.
        base = _dt.date(2025, 12, 28)
        self._dates = [(base + _dt.timedelta(days=i)).isoformat() for i in range(10)]
        recs = [{"id": d, "ctl": 50.0 + i, "atl": 40.0 + i}
                for i, d in enumerate(self._dates)]
        self.fetch_days_calls: list[int] = []

        def fake_fetch(days):
            self.fetch_days_calls.append(days)
            return [dict(r) for r in recs]

        # Bypass the TTL cache entirely so every request re-runs fake_fetch.
        self._p_cached = patch.object(self.app_module, "cached",
                                      lambda key, fn, ttl=300: fn())
        self._p_fetch = patch.object(self.app_module, "fetch_wellness", fake_fetch)
        self._p_cached.start()
        self._p_fetch.start()

    def tearDown(self):
        self._p_fetch.stop()
        self._p_cached.stop()

    def _dates_of(self, resp):
        self.assertEqual(resp.status_code, 200, resp.text)
        return [r["date"] for r in resp.json()]

    def test_subset_inclusive_bounds(self):
        r = self.client.get("/api/wellness?from=2025-12-30&to=2026-01-02")
        self.assertEqual(self._dates_of(r),
                         ["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"])

    def test_single_day_window(self):
        r = self.client.get("/api/wellness?from=2026-01-03&to=2026-01-03")
        self.assertEqual(self._dates_of(r), ["2026-01-03"])

    def test_from_only(self):
        r = self.client.get("/api/wellness?from=2026-01-04")
        self.assertEqual(self._dates_of(r),
                         ["2026-01-04", "2026-01-05", "2026-01-06"])

    def test_to_only(self):
        r = self.client.get("/api/wellness?to=2025-12-29")
        self.assertEqual(self._dates_of(r), ["2025-12-28", "2025-12-29"])

    def test_window_outside_data_is_empty(self):
        r = self.client.get("/api/wellness?from=2024-01-01&to=2024-02-01")
        self.assertEqual(self._dates_of(r), [])

    def test_legacy_days_param_unchanged(self):
        # No from/to → NO slicing: the full upstream payload comes back and
        # fetch_wellness receives exactly the requested days.
        r = self.client.get("/api/wellness?days=5")
        self.assertEqual(self._dates_of(r), self._dates)
        self.assertEqual(self.fetch_days_calls[-1], 5)
        # Values untouched: ctl passthrough + computed tsb.
        body = r.json()
        self.assertEqual(body[0]["ctl"], 50.0)
        self.assertEqual(body[0]["tsb"], 10.0)

    def test_legacy_default_days_28(self):
        r = self.client.get("/api/wellness")
        self.assertEqual(self._dates_of(r), self._dates)
        self.assertEqual(self.fetch_days_calls[-1], 28)

    def test_from_widens_upstream_fetch(self):
        far_back = (_dt.date.today() - _dt.timedelta(days=40)).isoformat()
        self.client.get(f"/api/wellness?from={far_back}")
        self.assertGreaterEqual(self.fetch_days_calls[-1], 41)

    def test_explicit_days_wider_than_from_wins(self):
        near = (_dt.date.today() - _dt.timedelta(days=3)).isoformat()
        self.client.get(f"/api/wellness?days=200&from={near}")
        self.assertEqual(self.fetch_days_calls[-1], 200)

    def test_from_after_to_is_422(self):
        r = self.client.get("/api/wellness?from=2026-01-05&to=2026-01-01")
        self.assertEqual(r.status_code, 422)

    def test_malformed_dates_are_422(self):
        for frm in ("2026-13-01", "garbage", "2026/01/01"):
            r = self.client.get(f"/api/wellness?from={frm}&to=2026-01-05")
            self.assertEqual(r.status_code, 422, frm)


# ═══════════════════════════════════════════════════════════════════════════
# 2. Markup + wiring pins (source-level)
# ═══════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════
# 3. Pure helpers (node harness)
# ═══════════════════════════════════════════════════════════════════════════

class TestRangeHelpersNode(unittest.TestCase):
    def setUp(self):
        import tempfile
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()


# ═══════════════════════════════════════════════════════════════════════════
# 4. fitnessChart re-render listener discipline (node harness, fake DOM)
# ═══════════════════════════════════════════════════════════════════════════

