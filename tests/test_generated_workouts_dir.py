"""#15 — generated workouts live in profile data; the bundled library stays immutable."""
import logging
import os
import stat
from pathlib import Path

import pytest

import app as app_module
import training_planner as tp
import workout_gen as wg


def _scan():
    return app_module._scan_zwo_for_library


def test_generated_file_goes_to_the_profile_dir_not_the_bundle(tmp_path, monkeypatch):
    bundle = tmp_path / "bundle"
    gen = tmp_path / "profile" / "generated_workouts"
    bundle.mkdir()
    row = wg.generate_row("vo2max", 60, 18, gen, _scan())
    assert row is not None
    assert (gen / row["File"]).is_file()
    assert list(bundle.iterdir()) == []


def test_generated_file_resolves_for_export_and_facts(tmp_path, monkeypatch):
    gen = tmp_path / "generated_workouts"
    row = wg.generate_row("vo2max", 60, 18, gen, _scan())
    monkeypatch.setattr(tp, "GENERATED_WORKOUT_DIR", gen)
    assert app_module._workout_file(row["File"]) == gen / row["File"]
    assert tp._facts_dir_for(row["File"]) == gen
    # A built-in name still resolves to the built-in folder.
    some = next(iter(sorted(tp._BUNDLED_WORKOUT_DIR.glob("*.zwo")))).name
    assert tp._facts_dir_for(some) == tp.WORKOUT_DIR


@pytest.mark.skipif(os.geteuid() == 0, reason="root ignores directory permissions")
def test_read_only_library_is_reported_not_silent(tmp_path, caplog):
    ro = tmp_path / "ro"
    ro.mkdir()
    ro.chmod(stat.S_IREAD | stat.S_IEXEC)
    try:
        with caplog.at_level(logging.WARNING, logger="shepherd.workout_gen"):
            assert wg.generate_row("vo2max", 60, 18, ro, _scan()) is None
    finally:
        ro.chmod(stat.S_IRWXU)
    assert any("E_GENERATED_WORKOUT_UNWRITABLE" in r.getMessage() for r in caplog.records)


def test_profile_switch_points_generation_at_the_profile(tmp_path):
    from profile_manager import ProfileManager
    pm = ProfileManager.get()
    if pm.active_id is None:
        pytest.skip("no active profile in this sandbox")
    pm.apply_training_dirs()
    assert tp.GENERATED_WORKOUT_DIR == pm.active_dir / "generated_workouts"
    assert tp.WORKOUT_DIR == tp._BUNDLED_WORKOUT_DIR
