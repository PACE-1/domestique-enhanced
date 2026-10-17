"""#10 - the settings-side models accept what the server sends, and the refusals the UI shows exist."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api_models
import app as app_module


@pytest.fixture
def c():
    with TestClient(app_module.app, client=("127.0.0.1", 50000)) as client:
        yield client


def test_icu_push_status_and_disconnect(c):
    s = api_models.IcuPushStatus.model_validate(c.get("/api/icu/push").json())
    assert s.horizon_days == 14 and s.connected is False
    r = c.post("/api/icu/push", json={"sync": True})
    out = api_models.IcuPushResult.model_validate(r.json())
    assert out.ok is False and (out.needs_reconnect or out.error)   # nothing to write to when not connected
    assert api_models.Ok.model_validate(c.post("/api/icu/disconnect").json()).ok is True


def test_workout_folder_validation_and_clearing(c, tmp_path):
    f = api_models.WorkoutFolders.model_validate(c.get("/api/settings/workout-folders").json())
    assert f.builtin.count > 0
    empty = Path.home() / "dq-empty-folder"
    empty.mkdir(exist_ok=True)
    try:
        r = c.post("/api/settings/workout-folders", json={"extra_dir": str(empty)})
        assert r.status_code == 400 and ".zwo" in r.json()["error"]
    finally:
        empty.rmdir()
    assert c.post("/api/settings/workout-folders", json={"extra_dir": "/definitely/outside/home"}).status_code == 400
    cleared = api_models.WorkoutFolders.model_validate(c.post("/api/settings/workout-folders", json={"extra_dir": ""}).json())
    assert cleared.extra is None


def test_custom_zones_save_validate_and_reset(c):
    zones = [{"zone": "Z1", "name": "Easy", "low": 0, "high": 120}, {"zone": "Z2", "name": "Steady", "low": 121, "high": 180}]
    saved = api_models.ZonesSaved.model_validate(c.post("/api/settings/zones", json={"kind": "power", "zones": zones}).json())
    assert [z.high for z in saved.zones] == [120, 180]
    read = api_models.SettingsRead.model_validate(c.get("/api/settings").json())
    assert [z.high for z in read.power_zones] == [120, 180]
    assert c.post("/api/settings/zones", json={"kind": "power", "zones": [{"low": 100, "high": 50}]}).status_code == 400
    assert c.post("/api/settings/zones", json={"kind": "bogus", "zones": zones}).status_code == 400
    reset = api_models.ZonesSaved.model_validate(c.post("/api/settings/zones", json={"kind": "power", "zones": None}).json())
    assert reset.reset is True
    assert len(api_models.SettingsRead.model_validate(c.get("/api/settings").json()).power_zones) == 7


def test_logs_errors_and_health_validate(c):
    api_models.LogTail.model_validate(c.get("/api/logs?lines=5").json())
    api_models.DiagErrors.model_validate(c.get("/api/diag/recent-errors?limit=5").json())
    h = api_models.DiagHealth.model_validate(c.get("/api/diag/health").json())
    assert "workout_library" in h.checks


def test_diagnostics_refuse_a_remote_peer():
    with TestClient(app_module.app, client=("203.0.113.9", 50000)) as remote:
        assert remote.get("/api/diag/health").status_code == 403


def test_history_backfill_starts_and_reports_status(c):
    started = api_models.BackfillHistoryStarted.model_validate(c.post("/api/profile/backfill-history").json())
    assert started.status in ("started", "already_running") and started.task_id
    st = c.get(f"/api/profile/backfill-history/status?task_id={started.task_id}")
    assert st.status_code == 200
    assert api_models.BackfillHistoryStatus.model_validate(st.json()).state in ("running", "done", "error")
    assert c.get("/api/profile/backfill-history/status?task_id=nope").status_code == 404
