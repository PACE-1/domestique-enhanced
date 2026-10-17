"""#10 - the library and picker models accept what the server really sends."""
from fastapi.testclient import TestClient

import api_models


def test_library_rows_detail_and_picker_validate():
    import app
    c = TestClient(app.app)
    r = c.get("/api/workouts?limit=3&sort=name_asc")
    assert r.status_code == 200
    assert r.headers.get("x-library-total")
    rows = [api_models.WorkoutRow.model_validate(x) for x in r.json()]
    assert rows and rows[0].file and rows[0].duration_min > 0
    d = c.get(f"/api/workout/{rows[0].category}/{rows[0].file}")
    assert d.status_code == 200
    detail = api_models.WorkoutDetail.model_validate(d.json())
    assert detail.total_seconds > 0 and detail.segments
    p = c.get("/api/picker?subjective=7&duration=75")
    assert p.status_code == 200
    pick = api_models.PickerResult.model_validate(p.json())
    assert pick.workouts and len(pick.workouts) <= 5


def test_the_download_route_the_ui_links_to_serves_a_file():
    import app
    c = TestClient(app.app)
    row = c.get("/api/workouts?limit=1").json()[0]
    r = c.get(f"/api/workout/download/{row['File']}")
    assert r.status_code == 200
    assert "attachment" in r.headers.get("content-disposition", "")


def test_routes_and_regions_validate_and_the_course_download_works():
    import app
    c = TestClient(app.app)
    r = c.get("/api/routes?limit=3")
    assert r.status_code == 200
    listing = api_models.RoutesList.model_validate(r.json())
    assert listing.total_matching >= listing.returned == len(listing.routes) > 0
    first = listing.routes[0]
    assert first.preview_profile and first.crs_region and first.file
    reg = api_models.RegionsList.model_validate(c.get("/api/routes/regions").json())
    assert reg.worlds
    d = c.get(f"/api/course/{first.crs_region}/{first.file}/download")
    assert d.status_code == 200
    loops = c.get("/api/routes?limit=5&loop_only=true").json()["routes"]
    assert all(x["loop"] for x in loops)
