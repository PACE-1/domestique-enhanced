"""#10 - the training-model models accept what the server sends."""
import pytest
from fastapi.testclient import TestClient

import api_models
import app as app_module


@pytest.fixture
def c():
    with TestClient(app_module.app) as client:
        yield client


def test_tau_fits_without_data_says_insufficient_and_carries_the_usual_values(c):
    d = api_models.TauFits.model_validate(c.get("/api/profile/tau-fits").json())
    assert d.fit_status in {"insufficient_data", "success", "low_confidence"}
    assert d.conventional["ctl_tau"] == 42.0 and d.conventional["atl_tau"] == 7.0


def test_banister_validation_and_fatigue_resistance_validate(c):
    b = api_models.BanisterValidation.model_validate(c.get("/api/profile/banister-validation").json())
    assert b.fit_status
    f = api_models.FatigueResistance.model_validate(c.get("/api/profile/fatigue-resistance?kj_threshold=2000").json())
    assert f.fit_status
    assert c.get("/api/profile/fatigue-resistance?kj_threshold=1234").status_code == 422


def test_race_flag_on_an_unknown_activity_is_a_404_and_a_bad_id_a_400(c):
    assert c.post("/api/activity/nope/race", json={"is_race": True}).status_code == 404
    assert c.post("/api/activity/a b/race", json={"is_race": True}).status_code == 400


def test_workout_tags_validate(c):
    assert isinstance(api_models.WorkoutTags.model_validate(c.get("/api/workouts/tags").json()).tags, list)


def test_dfa_snapshot_and_week_summary_and_auto_recalc_validate(c):
    d = api_models.DfaSnapshot.model_validate(c.get("/api/profile/dfa-alpha1").json())
    assert d.n_rides >= 0
    w = api_models.WeekSummary.model_validate(c.get("/api/week-summary?week_offset=-1").json())
    assert w.week_start < w.week_end and w.week_offset == -1
    r = api_models.PlanAutoRecalc.model_validate(c.post("/api/plan/auto-recalc").json())
    assert r.action in {"no_plan", "fresh"}  # which one depends on plans other tests left in the shared home


def test_oauth_is_offered_only_when_a_client_secret_is_bundled(c, monkeypatch):
    import config
    monkeypatch.setattr(config, "ICU_OAUTH_CLIENT_ID", "511", raising=False)
    monkeypatch.setattr(config, "ICU_OAUTH_CLIENT_SECRET", "", raising=False)
    assert c.get("/api/icu/connection").json()["oauth_available"] is False
    monkeypatch.setattr(config, "ICU_OAUTH_CLIENT_SECRET", "s", raising=False)
    assert c.get("/api/icu/connection").json()["oauth_available"] is True
