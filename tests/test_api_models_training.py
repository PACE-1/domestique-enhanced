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


def test_route_suggestions_and_tags_and_surfaces_validate(c):
    s = api_models.RouteSuggestions.model_validate(
        c.post("/api/routes/suggest", json={"distance_km": {"min": 20, "max": 60}, "max_results": 5}).json())
    assert s.count == len(s.results)
    assert all(r.route.id for r in s.results)
    assert isinstance(api_models.WorkoutTags.model_validate(c.get("/api/workouts/tags").json()).tags, list)
    assert api_models.SurfaceTypes.model_validate(c.get("/api/surface-types").json()).routes is not None
