"""The weekly fitness recalc runs server-side, once a day, off the sync loop."""
from unittest.mock import patch

import app as app_module


def _run(monkeypatch, result):
    calls = []
    monkeypatch.setattr(app_module, "_auto_recalc_last_day", None)
    monkeypatch.setattr(app_module, "api_plan_auto_recalc",
                        lambda: calls.append(1) or result)
    return calls


def test_sync_loop_runs_it_once_per_day(monkeypatch):
    calls = _run(monkeypatch, {"action": "fresh"})
    app_module._auto_recalc_from_sync()
    app_module._auto_recalc_from_sync()
    assert calls == [1]


def test_a_rebuild_clears_the_cache(monkeypatch):
    _run(monkeypatch, {"action": "recalculated"})
    with patch.object(app_module, "clear_cache") as cleared:
        app_module._auto_recalc_from_sync()
    assert cleared.call_count == 1


def test_failure_releases_the_latch_and_never_raises(monkeypatch):
    monkeypatch.setattr(app_module, "_auto_recalc_last_day", None)

    def boom():
        raise RuntimeError("icu down")

    monkeypatch.setattr(app_module, "api_plan_auto_recalc", boom)
    app_module._auto_recalc_from_sync()
    assert app_module._auto_recalc_last_day is None


def test_after_background_sync_calls_it(monkeypatch):
    fired = []
    with patch.object(app_module, "_icu_push_daily_from_sync"), \
         patch.object(app_module, "_auto_recalc_from_sync",
                      side_effect=lambda: fired.append(1)):
        app_module._after_background_sync()
    assert fired == [1]
