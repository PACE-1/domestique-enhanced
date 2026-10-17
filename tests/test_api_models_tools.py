"""#10 - the plan-tool and today response models accept what the server really sends."""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

import api_models
import training_planner as tp


@pytest.fixture()
def client(monkeypatch, tmp_path):
    import app
    monkeypatch.setattr(tp, "PLAN_DIR", tmp_path / "plans", raising=False)
    c = TestClient(app.app)
    r = c.post("/api/plan/generate", json={
        "goal_type": "ftp", "hours_per_week": 8, "plan_weeks": 8,
        "available_days": [1, 2, 3, 4, 5, 6], "rest_days": [0]})
    assert r.status_code == 200, r.text[:300]
    return c


def _ok(r, model):
    assert r.status_code == 200, r.text[:300]
    return getattr(api_models, model).model_validate(r.json())


def _future_session(c):
    today = date.today().isoformat()
    plan = c.get("/api/plan").json()["plan_json"]
    return next(s for w in plan["weeks"] for s in w["sessions"]
                if s["day"] > today and s["session_type"] not in ("rest", "ftp_test"))


def test_availability_and_race(client):
    day = (date.today() + timedelta(days=2)).isoformat()
    _ok(client.post("/api/plan/save-availability",
                    json={"availability": {day: {"hours": 1.0, "type": "available"}}}), "AvailabilitySaved")
    stored = client.get("/api/plan").json()["plan_json"]["availability"]
    assert stored[day]["hours"] == 1.0
    race = (date.today() + timedelta(days=28)).isoformat()
    added = _ok(client.post("/api/plan/add-race", json={"date": race, "name": "Crit", "priority": "B"}), "RaceAdded")
    assert added.added["date"] == race and added.plan_json.weeks


def test_ftp_test_type(client):
    s = _future_session(client)
    r = client.post("/api/plan/swap-type", json={"date": s["day"], "session_type": "ftp_test", "duration_min": 60})
    assert r.status_code == 200, r.text[:300]
    out = _ok(client.post("/api/plan/ftp-test-type", json={"date": s["day"], "test_type": "ramp"}), "FtpTestTypeSet")
    assert out.test_type == "ramp" and out.zwo_file


def test_rematch_preview_and_apply(client):
    _ok(client.post("/api/plan/rematch?apply=0"), "RematchResult")
    assert _ok(client.post("/api/plan/rematch?apply=1"), "RematchResult").apply is True


def test_redraw_preview_then_accept(client):
    s = _future_session(client)
    cand = _ok(client.post("/api/plan/preview-redraw", json={"date": s["day"], "exclude_extra": []}), "RedrawCandidate")
    assert cand.ok and cand.zwo_file
    again = _ok(client.post("/api/plan/preview-redraw",
                            json={"date": s["day"], "exclude_extra": [cand.zwo_name]}), "RedrawCandidate")
    assert again.zwo_name != cand.zwo_name or again.exhausted
    _ok(client.post("/api/plan/accept-redraw", json={
        "date": cand.day, "zwo_file": cand.zwo_file, "zwo_name": cand.zwo_name, "variation": cand.variation,
        "tss_estimate": cand.tss_estimate, "duration_min": cand.duration_min}), "RedrawAccepted")


def test_deload_revert_with_nothing_to_revert(client):
    out = _ok(client.post("/api/plan/continuous/deload-revert", json={}), "DeloadReverted")
    assert out.reverted is False and out.reason == "nothing_to_revert"


def test_today_reads_and_writes(client):
    _ok(client.get("/api/readiness"), "Readiness")
    _ok(client.get("/api/today-session"), "TodaySession")
    _ok(client.post("/api/readiness/revert-cap", json={}), "CapReverted")
    r = client.post("/api/readiness/apply-tier-down", json={})
    assert r.status_code in (200, 404), r.text[:300]
    if r.status_code == 200:
        api_models.TierDownApplied.model_validate(r.json())
    adj = _ok(client.post("/api/plan/auto-adjust", json={"scope": "week", "dry_run": True}), "AutoAdjustResult")
    assert adj.dry_run is True


def test_daily_log_round_trip(client):
    saved = _ok(client.post("/api/daily-log", json={
        "sleep_quality": 3, "fatigue": 5, "stress": 4, "soreness": 2, "mood": 3}), "DailyLogSaved")
    assert saved.entry.fatigue == 5
    read = _ok(client.get("/api/daily-log"), "DailyLogRead")
    assert read.today and read.today.hooper_index is not None
    assert client.post("/api/daily-log", json={"fatigue": 9}).status_code == 400
