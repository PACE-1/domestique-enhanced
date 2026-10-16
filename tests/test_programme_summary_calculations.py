"""Recap calculations operate on supplied data, without reading profile state."""
import copy
from datetime import date

import pytest

import programme_summary as summary


def test_supplied_snapshots_drive_totals_trends_and_power_without_io(monkeypatch):
    import db
    import fitness
    import ride_storage

    def unexpected_read(*args, **kwargs):
        raise AssertionError("calculation attempted a profile read")

    monkeypatch.setattr(db, "query_metric_history", unexpected_read)
    monkeypatch.setattr(db, "query_daily_log", unexpected_read)
    monkeypatch.setattr(fitness, "stored_ctl_on", unexpected_read)
    monkeypatch.setattr(ride_storage, "load_all_rides", unexpected_read)
    plan = {"weeks": [{"start": "2026-10-01", "end": "2026-10-09", "phase": "base"}],
            "phases": [{"name": "base", "start": "2026-10-01", "end": "2026-10-09",
                        "weeks": 1, "weekly_tss": 200}]}
    rides = [{"started_at": "2026-10-01T08:00:00", "tss": 100,
              "distance_km": 40, "duration_s": 3600, "kj": 700,
              "elevation_m": 300, "decoupling_pct": 4,
              "time_in_zone": {"z1": 600, "z2": 2400, "z3": 600, "ss": 900},
              "efforts": [{"secs": 1200, "label": "20min", "watts": 300}]},
             {"started_at": "2026-10-09T08:00:00",
              "summary": {"tss": 120, "distance_km": 60, "duration_sec": 7200,
                          "calories": 800, "elevation_gain_m": 500, "decoupling_pct": 2,
                          "peak_20min": 320}}]
    log_rows = [{"date": "2026-10-01", "hooper_index": 10},
                {"date": "2026-10-08", "hooper_index": "bad"},
                {"date": "2026-10-09", "hooper_index": 12},
                # Legacy recap bins cover seven days, even in the last short bin.
                {"date": "2026-10-10", "hooper_index": 16}]
    before = copy.deepcopy((plan, rides, log_rows))
    result = summary.build_summary(
        plan, summary.rides_in_window(rides, "2026-10-01", "2026-10-09"),
        start_date="2026-10-01", end_date="2026-10-09",
        metric_values={"ftp": (240, 260), "vo2max": (50.1, 52.5)},
        ctl_start_val=40, ctl_end_val=45, log_rows=log_rows)

    assert result["rides"] == 2
    assert result["totals"] == {"km": 100, "hours": 3.0, "kj": 1500, "elev_m": 800}
    assert result["ftp_delta"] == {"start": 240, "end": 260, "pct": 8.3}
    assert result["eftp_delta"] == {"start": 285, "end": 304, "pct": 6.7}
    assert result["ctl_gain"] == {"start": 40, "end": 45, "delta": 5}
    assert result["intensity_dist"] == {"z1z2_min": 50, "z3_min": 10, "z4plus_min": 0}
    assert result["hooper_trend"] == [{"week": 1, "mean": 10}, {"week": 2, "mean": 14}]
    assert result["decoupling_trend"] == [{"week": 1, "mean_pct": 4}, {"week": 2, "mean_pct": 2}]
    assert result["compliance"] == [{"phase": "base", "planned_tss": 200, "actual_tss": 220, "pct": 110}]
    assert result["mean_max_curve"]["start"][3] == {"dur": 1200, "watts": 300}
    assert result["mean_max_curve"]["end"][3] == {"dur": 1200, "watts": 300}
    assert (plan, rides, log_rows) == before


@pytest.mark.parametrize("target,before,after", [
    ("2026-09-01", 0, 0), ("2026-10-01", 0, 0),
    ("2026-10-02", 0, 260), ("2026-11-01", 260, 260),
])
def test_metric_boundaries_keep_zero_and_nearest_edge_fallback(target, before, after):
    history = [{"date": "2026-10-01", "value": 0},
               {"date": "2026-10-15", "value": 260}]
    assert summary.metric_value_at(history, target) == before
    assert summary.metric_value_at(history, target, after=True) == after


def test_continuous_window_extends_to_28_days_and_clamps_to_today():
    plan = {"goal": {"goal_type": "continuous"},
            "weeks": [{"start": "2026-10-14", "end": "2026-11-10"}]}
    assert summary.summary_window(plan, date(2026, 10, 15)) == ("2026-09-17", "2026-10-15")
