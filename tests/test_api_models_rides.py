"""#10 - the ride models accept what the server sends, and the routes the UI uses behave."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api_models
import app as app_module
import ride_storage
import training


@pytest.fixture
def client(monkeypatch, tmp_path):
    rides = tmp_path / "rides"
    icu = tmp_path / "icu"
    rides.mkdir()
    icu.mkdir()
    monkeypatch.setattr(app_module, "_rides_fit_dir", lambda: rides)
    monkeypatch.setattr(ride_storage, "_icu_rides_dir", lambda: icu)
    monkeypatch.setattr(ride_storage, "_fit_rides_dir", lambda: rides)
    monkeypatch.setattr(app_module, "_maybe_auto_reforecast", lambda *a, **k: None)
    monkeypatch.setattr(training, "upload_fit_to_icu", lambda *a, **k: {"ok": False, "skipped": True})
    c = TestClient(app_module.app)
    c.rides, c.icu = rides, icu
    return c


def _fit(tmp_path):
    from test_hrtss_ingestion import _build_fit
    return _build_fit(tmp_path / "v.fit", n=120, power=200, hr=140).read_bytes()


def test_import_detail_rpe_download_and_delete_of_a_fit_ride(client, tmp_path):
    r = client.post("/api/ride/import", files={"fit_file": ("a.fit", _fit(tmp_path), "application/octet-stream")})
    assert r.status_code == 200, r.text
    imported = api_models.RideImported.model_validate(r.json())
    rid = f"fit_{imported.ride_id}"

    d = client.get(f"/api/ride/{rid}/detail?include=samples")
    assert d.status_code == 200, d.text[:300]
    detail = api_models.RideDetail.model_validate(d.json())
    assert detail.ride_id == rid and detail.samples and detail.samples.get("power_w")

    ok = client.post(f"/api/ride/{rid}/rpe", json={"rpe": 7})
    assert api_models.RideRpeSaved.model_validate(ok.json()).rpe == 7
    assert client.post(f"/api/ride/{rid}/rpe", json={"rpe": 11}).status_code == 400
    assert client.post(f"/api/ride/{rid}/rpe", json={"rpe": None}).json()["rpe"] is None

    assert client.get(f"/api/rides/{imported.ride_id}/fit").status_code == 200
    assert client.delete(f"/api/rides/{imported.ride_id}").json() == {"ok": True}
    assert client.delete(f"/api/rides/{imported.ride_id}").status_code == 404


def _icu_ride(client, ext="123", **extra):
    rec = ride_storage._normalize_icu_activity({
        "id": ext, "name": "Test", "start_date_local": "2026-10-10T07:30:00", "type": "Ride",
        "moving_time": 3600, "elapsed_time": 3700, "distance": 30000, "icu_pm_p_avg": 180, "icu_training_load": 65})
    rec.update(extra)
    (client.icu / f"{ext}.json").write_text(json.dumps(rec))
    return f"icu_{ext}"


def test_an_icu_ride_validates_and_a_non_test_has_no_ftp_analysis(client):
    rid = _icu_ride(client)
    detail = api_models.RideDetail.model_validate(client.get(f"/api/ride/{rid}/detail").json())
    assert detail.tss == 65.0 and detail.avg_power_w == 180
    assert client.get(f"/api/ride/{rid}/ftp-test-analysis").status_code == 404
    prs = api_models.RidePrs.model_validate(client.get(f"/api/ride/{rid}/prs").json())
    assert prs.ride_id == rid


def test_an_ftp_test_ride_is_analysed_and_the_verdict_persists(client):
    sugg = {"ftp": 268, "method": "ramp", "prior_ftp": 250, "window_start_s": 100, "window_end_s": 160}
    rid = _icu_ride(client, ext="456", ftp_test_suggestion=sugg, streams={"watts": [150] * 300})
    a = api_models.FtpTestAnalysis.model_validate(client.get(f"/api/ride/{rid}/ftp-test-analysis").json())
    assert a.suggestion["ftp"] == 268 and a.series and a.windows[0]["kind"] == "scored"
    r = client.post(f"/api/ride/{rid}/ftp-test-review", json={"action": "accepted", "ftp": 268})
    assert api_models.FtpReviewSaved.model_validate(r.json()).persisted is True
    stored = json.loads((client.icu / "456.json").read_text())
    assert stored["ftp_test_review"]["action"] == "accepted"
    assert client.post(f"/api/ride/{rid}/ftp-test-review", json={"action": "maybe"}).status_code == 400


def test_the_pr_queue_reads_and_drains(client):
    q = api_models.PrToastQueue.model_validate(client.get("/api/profile/pr-toast-queue?drain=1").json())
    assert q.count == len(q.queue)
