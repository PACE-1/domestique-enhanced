"""#10 - the wellness, history and notice models accept what the server sends."""
import pytest
from fastapi.testclient import TestClient

import api_models
import app as app_module


@pytest.fixture
def c():
    with TestClient(app_module.app) as client:
        yield client


def test_manual_hrv_validates_and_rejects_out_of_range(c):
    ok = c.post("/api/wellness/manual-hrv", json={"rmssd": 61.5})
    assert api_models.HrvSaved.model_validate(ok.json()).hrv_manual_rmssd == 61.5
    assert c.post("/api/wellness/manual-hrv", json={"rmssd": 400}).status_code == 400
    assert c.post("/api/wellness/manual-hrv", json={"rmssd": "abc"}).status_code == 400


def test_hrv_csv_import_counts_good_and_skipped_rows(c):
    csv = b"date,rmssd\n2026-10-01,60\n2026-10-02,\nbad,xx\n,55\n"
    r = c.post("/api/wellness/import-hrv4training", files={"file": ("h.csv", csv, "text/csv")})
    out = api_models.HrvImported.model_validate(r.json())
    assert (out.imported, out.skipped) == (1, 3)


def test_hrv_prompt_status_and_dismissal(c):
    s = api_models.HrvPromptStatus.model_validate(c.get("/api/wellness/hrv-recording-status").json())
    assert s.version
    d = c.post("/api/wellness/hrv-recording-dismiss", json={"level": "version"})
    assert api_models.HrvPromptDismissed.model_validate(d.json()).level == "version"
    assert c.post("/api/wellness/hrv-recording-dismiss", json={"level": "bogus"}).status_code == 400


def test_metric_history_ftp_history_and_projection_without_a_plan(c):
    assert c.post("/api/metrics/log", json={"metric": "weight", "value": 70.5, "date": "2026-10-10"}).status_code == 200
    pts = [api_models.MetricPoint.model_validate(p) for p in c.get("/api/metrics/history?metric=weight&days=30").json()]
    assert pts and pts[-1].value == 70.5
    h = api_models.FtpHistory.model_validate(c.get("/api/profile/ftp-history").json())
    assert h.ftp_current > 0
    assert c.post("/api/profile/update-ftp", json={"ftp": 233, "method": "manual", "source": "manual", "applied": True}).status_code == 200
    h2 = api_models.FtpHistory.model_validate(c.get("/api/profile/ftp-history").json())
    assert h2.ftp_current == 233 and h2.history[-1].applied is True
    p = api_models.EventProjection.model_validate(c.get("/api/event/projection").json())
    assert p.available is False and p.reason


def test_energy_system_status_and_backfill_and_migration_notice(c):
    s = api_models.Fitness3dStatus.model_validate(c.get("/api/wellness/3d-fitness-status").json())
    assert s.rides_with_ss <= s.rides_total_post_v106
    b = c.post("/api/wellness/backfill-3d-fitness")
    assert b.status_code == 200
    api_models.Backfill3d.model_validate(b.json())
    m = api_models.MigrationResult.model_validate(c.get("/api/migrations/last-run-result").json())
    assert isinstance(m.show_toast, bool)


def test_retest_snooze_returns_a_date(c):
    out = api_models.RetestSnoozed.model_validate(c.post("/api/retest-nudge/snooze", json={}).json())
    assert out.until and len(out.until) >= 10
