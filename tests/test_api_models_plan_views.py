"""#10 - calendar, preview, ride scan, update, races and workout push."""
import pytest
from fastapi.testclient import TestClient

import api_models
import app as app_module
import training_planner as tp


@pytest.fixture
def c(monkeypatch, tmp_path):
    monkeypatch.setattr(tp, "PLAN_DIR", tmp_path / "plans", raising=False)
    with TestClient(app_module.app) as client:
        r = client.post("/api/plan/generate", json={
            "goal": "ftp", "hours_per_week": 8, "plan_weeks": 8, "rest_days": [0]})
        assert r.status_code == 200, r.text[:300]
        yield client


def test_calendar_validates_and_every_week_has_seven_days(c):
    cal = api_models.CalendarRead.model_validate(c.get("/api/calendar").json())
    assert cal.weeks and all(len(w.days) == 7 for w in cal.weeks)
    first_planned = next(d for w in cal.weeks for d in w.days if d.planned and d.planned.session_type != "rest")
    assert first_planned.planned.zwo_file


def test_calendar_move_through_the_drag_route(c):
    from datetime import date
    cal = api_models.CalendarRead.model_validate(c.get("/api/calendar").json())
    today = date.today().isoformat()
    pair = None
    for w in cal.weeks:
        future = [d for d in w.days if d.date > today and d.planned]
        src = next((d for d in future if d.planned.session_type not in ("rest", "ftp_test") and not d.planned.is_race), None)
        dst = next((d for d in future if d.planned.session_type == "rest"), None)
        if src and dst:
            pair = (src, dst)
            break
    assert pair, "the generated plan has no week with a movable session and a rest day"
    src, dst = pair
    r = c.post("/api/plan/move-session", json={"date": src.date, "new_date": dst.date})
    assert r.status_code == 200, r.text[:200]
    after = api_models.CalendarRead.model_validate(c.get("/api/calendar").json())
    moved = next(d for w in after.weeks for d in w.days if d.date == dst.date)
    assert moved.planned.session_type != "rest"


def test_a_move_into_another_week_is_refused(c):
    from datetime import date
    cal = api_models.CalendarRead.model_validate(c.get("/api/calendar").json())
    today = date.today().isoformat()
    future = [(w, d) for w in cal.weeks for d in w.days if d.date > today and d.planned and d.planned.session_type not in ("rest", "ftp_test") and not d.planned.is_race]
    (w1, a), (w2, b) = future[0], next(x for x in future if x[0].start_date != future[0][0].start_date)
    r = c.post("/api/plan/move-session", json={"date": a.date, "new_date": b.date})
    assert r.status_code == 400 and "ISO week" in r.json()["error"]


def test_preview_and_ride_scan_validate(c):
    p = api_models.PlanPreview.model_validate(c.get("/api/plan/preview?goal=ftp&plan_weeks=12&hours_per_week=8").json())
    assert p.phases and sum(x.weeks for x in p.phases) == 12
    rec = p.phase_weeks_rec
    assert rec
    bad = c.get("/api/plan/preview?goal=ftp&plan_weeks=12&hours_per_week=8&phase_weeks=" + '{"base":1}')
    assert bad.status_code == 200
    s = api_models.EntryScan.model_validate(c.get("/api/plan/entry-scan?goal=ftp&plan_weeks=12").json())
    assert s.plan_weeks == 12
    assert c.get("/api/plan/entry-scan?goal=event&plan_weeks=12").status_code == 400


def test_the_advanced_generate_options_are_accepted_and_stored(c):
    from datetime import date, timedelta
    race = (date.today() + timedelta(days=30)).isoformat()
    r = c.post("/api/plan/generate", json={
        "goal": "ftp", "hours_per_week": 9, "plan_weeks": 10, "rest_days": [0],
        "distribution": "pyramidal", "block_periodization": True,
        "events": [{"date": race, "priority": "B", "name": "Crit"}],
        "daily_availability": {"0": 0, "1": 1.5, "2": 1.5, "3": 1.5, "4": 1.5, "5": 2, "6": 1.5}, "max_weekday": 1.5, "max_weekend": 2})
    assert r.status_code == 200, r.text[:300]
    plan = c.get("/api/plan").json()["plan_json"]
    assert any(e.get("name") == "Crit" for e in plan["goal"].get("events", []))


def test_update_and_reforecast_and_daily_adapt_validate(c):
    u = api_models.PlanUpdated.model_validate(c.post("/api/plan/update").json())
    assert u.ok and u.plan_json
    rf = c.post("/api/plan/reforecast", json={})
    assert rf.status_code == 200
    api_models.PlanReforecasted.model_validate(rf.json())
    d = api_models.DailyAdapt.model_validate(c.get("/api/plan/daily-adapt").json())
    assert d.projection_only is True


def test_races_and_workout_push_answer_when_intervals_is_not_connected(c):
    races = api_models.IcuRaces.model_validate(c.get("/api/icu/races").json())
    assert races.error or races.needs_reconnect or races.races == []
    from datetime import date, timedelta
    day = (date.today() + timedelta(days=3)).isoformat()
    push = api_models.WorkoutPushed.model_validate(c.post("/api/calendar/push-workout", json={"source": "planner", "zwo_file": "x.zwo", "date": day}).json())
    assert push.error or push.needs_reconnect
    assert api_models.WorkoutPushed.model_validate(c.post("/api/calendar/push-workout", json={"source": "bogus", "zwo_file": "x", "date": day}).json()).error == "bad_source"


def test_session_exports_serve_files(c):
    plan = c.get("/api/plan").json()["plan_json"]
    s = next(x for w in plan["weeks"] for x in w["sessions"] if x.get("zwo_file"))
    z = c.get(f"/api/download/zwo/{s['zwo_file']}")
    assert z.status_code == 200 and b"<workout_file" in z.content
    f = c.get("/api/export/fit-workout", params={"zwo_file": s["zwo_file"], "name": "x", "session_type": s["session_type"], "duration_min": int(s["duration_min"])})
    assert f.status_code == 200 and f.content[8:12] == b".FIT"
    png = c.get("/api/programme/summary/png")
    assert png.status_code == 200 and png.content[:4] == b"\x89PNG"
