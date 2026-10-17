"""#10 - the analysis models accept what the server's own builders produce."""
import api_models
import ride_storage


def test_a_wellness_record_validates():
    import app
    rec = app._wellness_record_to_api_dict({
        "id": "2026-10-10", "ctl": 55.2, "atl": 61.0, "restingHR": 48, "sleepSecs": 27000,
        "sportInfo": [{"eftp": 251}]})
    day = api_models.WellnessDay.model_validate(rec)
    assert day.date == "2026-10-10" and day.tsb == -5.8 and day.eftp == 251


def test_an_icu_ride_summary_validates():
    norm = ride_storage._normalize_icu_activity({
        "id": "i123", "name": "Morning ride", "start_date_local": "2026-10-10T07:30:00",
        "type": "Ride", "moving_time": 3600, "elapsed_time": 3700, "distance": 30000,
        "icu_pm_p_avg": 180, "icu_training_load": 65})
    ride = api_models.RideSummary.model_validate(norm)
    assert ride.ride_id == "icu_i123" and ride.tss == 65.0 and ride.avg_power_w == 180


def test_the_power_curve_endpoint_validates_when_there_is_no_data():
    from fastapi.testclient import TestClient
    import app
    with TestClient(app.app) as c:
        r = c.get("/api/profile/power-curve?window_days=30")
        assert r.status_code == 200
        pc = api_models.PowerCurve.model_validate(r.json())
        assert pc.window_days == 30 and pc.rider_curve == [] and pc.pg_2011_baseline
        assert c.get("/api/wellness?days=5").json() == []
        assert c.get("/api/rides?limit=5").json() == []


def test_a_power_curve_point_validates():
    p = api_models.PowerCurvePoint.model_validate({
        "duration_s": 300, "watts": 310, "watts_per_kg": 4.4, "pct_ftp": 124.0, "ride_id": "icu_1", "date": "2026-10-01"})
    assert p.watts == 310
