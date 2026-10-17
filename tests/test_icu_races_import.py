"""3.13.0 — races planned in intervals.icu load into the plan builder.

GET /api/icu/races reads the rider's RACE_A/B/C events (read-only) and the
builder's table lets the rider map each one: one goal event, B/C rows, skip.
Hermetic: intervals.icu only through a fake behind icu_calendar_push._http.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import icu_calendar_push as icp  # noqa: E402
from test_icu_push import stub, _apikey  # noqa: E402,F401  (stub is a fixture)

TODAY = date(2026, 10, 13)


def _d(n):
    return (TODAY + timedelta(days=n)).isoformat()


class Fake:
    def __init__(self, rows=None, status=200, raw=None):
        self.rows, self.status, self.raw, self.calls = rows or [], status, raw, []

    def __call__(self, method, path, payload=None, timeout=30.0):
        self.calls.append((method, path))
        body = self.raw if self.raw is not None else json.dumps(self.rows).encode()
        return self.status, body


@pytest.fixture()
def env(stub, freeze_clock, monkeypatch):
    freeze_clock(TODAY)
    stub.fake = Fake()
    monkeypatch.setattr(icp, "_http", stub.fake)
    return stub


def _get(env):
    return env.client.get("/api/icu/races").json()


def _ev(day, cat, name="", **kw):
    return dict({"id": 1, "category": cat, "name": name,
                 "start_date_local": f"{day}T00:00:00"}, **kw)


def test_races_are_read_mapped_and_sorted(env):
    _apikey(env)
    env.fake.rows = [
        _ev(_d(90), "RACE_B", "Tour of the Hills", type="Ride", distance=112400),
        _ev(_d(30), "RACE_A", "Gran Fondo", type="Ride", distance=160000.0),
        _ev(_d(40), "WORKOUT", "Z2 Endurance", type="Ride"),
        _ev(_d(50), "NOTE", "Holiday"),
        _ev(_d(-3), "RACE_A", "Last week's race"),
        _ev(_d(60), "RACE_C", "Club crit", type="Ride", distance=True),
        _ev(_d(70), "RACE_C", "Trail run", type="Run", distance=-5),
        _ev("garbled", "RACE_A", "No date"),
        "not an event",
    ]
    r = _get(env)
    assert r == {"races": [
        {"date": _d(30), "name": "Gran Fondo", "priority": "A", "sport": "Ride", "distance_km": 160.0},
        {"date": _d(60), "name": "Club crit", "priority": "C", "sport": "Ride", "distance_km": None},
        {"date": _d(70), "name": "Trail run", "priority": "C", "sport": "Run", "distance_km": None},
        {"date": _d(90), "name": "Tour of the Hills", "priority": "B", "sport": "Ride", "distance_km": 112.4},
    ]}
    (method, path), = env.fake.calls
    assert method == "GET"
    assert f"oldest={_d(0)}" in path and f"newest={_d(365)}" in path


def test_a_race_today_is_included(env):
    _apikey(env)
    env.fake.rows = [_ev(_d(0), "RACE_A", "Today")]
    assert [x["date"] for x in _get(env)["races"]] == [_d(0)]


def test_not_connected_reads_nothing(env):
    assert _get(env) == {"error": "not_connected"}
    assert env.fake.calls == []


def test_oauth_without_calendar_scope_asks_to_reconnect(env, monkeypatch):
    import config
    monkeypatch.setattr(config, "ICU_ACCESS_TOKEN", "tok", raising=False)
    monkeypatch.setattr(config, "ICU_ATHLETE_ID", "i123", raising=False)
    monkeypatch.setattr(type(env.pm), "icu_has_scope", lambda self, s: False)
    assert _get(env) == {"needs_reconnect": True}
    assert env.fake.calls == []


@pytest.mark.parametrize("status,raw,expect", [
    (403, b'{"error":"insufficient scope CALENDAR:READ"}', {"needs_reconnect": True}),
    (401, b'{"error":"token expired"}', {"needs_reconnect": True}),
    (0, b"", {"error": "network"}),
    (500, b"down", {"error": "http_500"}),
    (200, b"<html>", {"error": "bad_response"}),
])
def test_failures_are_plain_answers(env, status, raw, expect):
    _apikey(env)
    env.fake.status, env.fake.raw = status, raw
    assert _get(env) == expect


# ── the builder's table (node) ───────────────────────────────────────────────

needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")

_DOM = r"""
const els = {};
function el(id, value) { els[id] = {id, value: value || '', style: {display: 'none'}, innerHTML: ''}; return els[id]; }
['plan-goal', 'plan-edate', 'plan-ename', 'plan-ekm', 'icu-races-panel'].forEach(i => el(i));
els['plan-goal'].value = 'ftp';
els['plan-ekm'].value = '150';
let bcRows = [];
let picks = [];
const document = {
  getElementById: id => els[id] || null,
  querySelectorAll: sel => sel.includes('icu-race-pick') ? picks
    : sel.includes('plan-bc-row') ? bcRows.map(r => r.node) : [],
};
function addBcRaceRow(ev) {
  const r = {ev: Object.assign({}, ev)};
  r.node = {querySelector: q => q === '.bc-date' ? {value: r.ev.date} : null,
            remove: () => { bcRows = bcRows.filter(x => x !== r); }};
  bcRows.push(r);
}
function readBcRaces() { return bcRows.map(r => ({date: r.ev.date, priority: r.ev.priority})); }
function _isEventGoal(g) { return g === 'event' || g === 'event_preparation'; }
let toggled = 0, synced = 0;
function togglePlanFields() { toggled++; }
function _syncPlanDateToWeeks() { synced++; }
const toasts = [];
function showToast(m) { toasts.push(m); }
"""


def _run(js):
    res = subprocess.run(["node", "-e", js], capture_output=True, text=True, timeout=30)
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout)


