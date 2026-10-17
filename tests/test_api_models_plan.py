"""#10 - the plan response models cover every field the planner stores."""
import api_models
import training_planner as tp


def _declared(model):
    return set(model.model_fields)


def test_plan_session_declares_every_planned_session_field():
    assert set(tp._SESSION_FIELDS) <= _declared(api_models.PlanSession)


def test_plan_week_declares_its_core_fields_and_sessions():
    core = {"week_num", "start", "end", "phase", "tss_target", "is_stepback", "sessions"}
    assert core <= _declared(api_models.PlanWeek)
    assert core <= set(tp._WEEK_FIELDS) | {"sessions"}


def test_a_generated_plan_validates_against_the_model(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    import app
    monkeypatch.setattr(tp, "PLAN_DIR", tmp_path / "plans", raising=False)
    client = TestClient(app.app)
    r = client.post("/api/plan/generate", json={
        "goal_type": "ftp", "hours_per_week": 8, "plan_weeks": 6,
        "available_days": [1, 2, 3, 4, 5, 6], "rest_days": [0]})
    assert r.status_code == 200, r.text[:300]
    parsed = api_models.PlanRead.model_validate(r.json())
    assert parsed.plan_json.weeks and parsed.plan_json.weeks[0].sessions
    assert parsed.plan_json.weeks[0].sessions[0].session_type


def test_time_off_is_recorded_and_the_plan_rebuilt(monkeypatch, tmp_path):
    from datetime import date, timedelta
    from fastapi.testclient import TestClient
    import app
    monkeypatch.setattr(tp, "PLAN_DIR", tmp_path / "plans", raising=False)
    client = TestClient(app.app)
    assert client.post("/api/plan/generate", json={
        "goal_type": "ftp", "hours_per_week": 8, "plan_weeks": 6,
        "available_days": [1, 2, 3, 4, 5, 6], "rest_days": [0]}).status_code == 200
    d = date.today()
    start, end = (d + timedelta(days=3)).isoformat(), (d + timedelta(days=5)).isoformat()
    r = client.post("/api/plan/mark-unavailable", json={"start": start, "end": end, "type": "injury"})
    assert r.status_code == 200, r.text[:300]
    parsed = api_models.UnavailableMarked.model_validate(r.json())
    assert (parsed.period.start, parsed.period.type) == (start, "injury")
    r = client.post("/api/plan/regenerate", json={})
    assert r.status_code == 200, r.text[:300]
    assert api_models.PlanRegenerated.model_validate(r.json()).plan_json.weeks


def test_time_off_ending_before_it_starts_is_refused(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    import app
    monkeypatch.setattr(tp, "PLAN_DIR", tmp_path / "plans", raising=False)
    client = TestClient(app.app)
    client.post("/api/plan/generate", json={
        "goal_type": "ftp", "hours_per_week": 8, "plan_weeks": 6,
        "available_days": [1, 2, 3, 4, 5, 6], "rest_days": [0]})
    r = client.post("/api/plan/mark-unavailable", json={"start": "2026-11-05", "end": "2026-11-01"})
    assert r.status_code == 400
