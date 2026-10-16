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
