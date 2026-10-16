"""The legacy-to-profiles migration survives being killed at each step.

Each test breaks the migration at one point, then boots again (as the app does
on the next start) and checks that no rider file was lost and the second run
finishes the job.
"""
import json
import shutil
import sqlite3

import pytest

import migrate_profiles


@pytest.fixture
def legacy_home(tmp_path, monkeypatch):
    """A pre-profiles data directory holding rider data worth losing."""
    monkeypatch.setenv("DOMESTIQUE_HOME", str(tmp_path))
    (tmp_path / ".env").write_text("INTERVALS_API_KEY=secret\n")
    (tmp_path / "user_prefs.json").write_text(json.dumps({"units": "metric"}))
    (tmp_path / ".setup_complete").write_text("1")
    sqlite3.connect(tmp_path / "health_tracker.db").close()
    (tmp_path / "plans").mkdir()
    (tmp_path / "plans" / "current.json").write_text(json.dumps({"weeks": [1, 2, 3]}))
    (tmp_path / "rides" / "icu").mkdir(parents=True)
    for i in range(4):
        (tmp_path / "rides" / "icu" / f"i{i}.json").write_text(json.dumps({"id": f"i{i}"}))
    (tmp_path / "wellness").mkdir()
    (tmp_path / "wellness" / "2026-10-01.json").write_text(json.dumps({"id": "2026-10-01"}))
    return tmp_path


PROFILE = "profiles/default"
USER_FILES = {".env": "INTERVALS_API_KEY=secret\n", "user_prefs.json": '{"units": "metric"}'}


def rider_data_present(base):
    """True when every legacy file exists somewhere under the data home."""
    for name, text in USER_FILES.items():
        found = [p for p in (base / name, base / PROFILE / name) if p.exists()]
        assert found and all(p.read_text() == text for p in found), name
    plans = [p for p in (base / "plans/current.json", base / PROFILE / "plans/current.json") if p.exists()]
    assert plans, "plan lost"
    for i in range(4):
        found = list(base.rglob(f"i{i}.json"))
        assert found, f"ride i{i} lost"
    assert list(base.rglob("2026-10-01.json")), "wellness lost"


def finished(base):
    assert (base / "profiles.json").exists()
    assert not (base / ".env").exists() and (base / PROFILE / ".env").exists()
    assert not (base / "rides" / "icu").exists()
    assert len(list((base / PROFILE / "rides" / "icu").glob("i*.json"))) == 4
    assert (base / PROFILE / "wellness" / "2026-10-01.json").exists()


def reboot_and_finish(base):
    migrate_profiles.migrate_to_profiles()
    rider_data_present(base)
    finished(base)


def test_killed_while_copying_leaves_originals_and_a_second_boot_finishes(legacy_home, monkeypatch):
    real_copy = shutil.copy2
    calls = []

    def dying_copy(src, dst, *a, **k):
        calls.append(src)
        if len(calls) == 3:
            raise OSError("killed during copy")
        return real_copy(src, dst, *a, **k)

    monkeypatch.setattr(migrate_profiles.shutil, "copy2", dying_copy)
    with pytest.raises(OSError, match="killed during copy"):
        migrate_profiles.migrate_to_profiles()

    assert not (legacy_home / "profiles.json").exists()
    assert (legacy_home / ".env").read_text() == USER_FILES[".env"]
    rider_data_present(legacy_home)

    monkeypatch.setattr(migrate_profiles.shutil, "copy2", real_copy)
    reboot_and_finish(legacy_home)


def test_killed_while_writing_the_registry_keeps_originals(legacy_home, monkeypatch):
    real = migrate_profiles._write_registry_atomic
    monkeypatch.setattr(migrate_profiles, "_write_registry_atomic",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("killed at commit")))
    with pytest.raises(OSError, match="killed at commit"):
        migrate_profiles.migrate_to_profiles()

    assert not (legacy_home / "profiles.json").exists()
    assert (legacy_home / ".env").exists() and (legacy_home / "health_tracker.db").exists()

    monkeypatch.setattr(migrate_profiles, "_write_registry_atomic", real)
    reboot_and_finish(legacy_home)


def test_killed_after_the_registry_but_before_cleanup_loses_nothing(legacy_home, monkeypatch):
    real_unlink = migrate_profiles.Path.unlink

    def dying_unlink(self, *a, **k):
        if self.name == "user_prefs.json" and self.parent == legacy_home:
            raise KeyboardInterrupt("killed during cleanup")
        return real_unlink(self, *a, **k)

    monkeypatch.setattr(migrate_profiles.Path, "unlink", dying_unlink)
    with pytest.raises(KeyboardInterrupt):
        migrate_profiles.migrate_to_profiles()
    monkeypatch.setattr(migrate_profiles.Path, "unlink", real_unlink)

    # Committed: the registry exists and the profile holds a full copy.
    assert (legacy_home / "profiles.json").exists()
    assert (legacy_home / PROFILE / ".env").read_text() == USER_FILES[".env"]
    assert (legacy_home / PROFILE / "user_prefs.json").read_text() == USER_FILES["user_prefs.json"]
    rider_data_present(legacy_home)

    # The next boot takes the "already migrated" path and still moves the archives.
    migrate_profiles.migrate_to_profiles()
    rider_data_present(legacy_home)
    assert len(list((legacy_home / PROFILE / "rides" / "icu").glob("i*.json"))) == 4


def test_killed_while_moving_archives_resumes_without_losing_a_ride(legacy_home, monkeypatch):
    real_move = migrate_profiles._move_file
    moved = []

    def dying_move(src, dest):
        moved.append(src.name)
        if len(moved) == 3:
            raise KeyboardInterrupt("killed mid-archive")
        return real_move(src, dest)

    monkeypatch.setattr(migrate_profiles, "_move_file", dying_move)
    with pytest.raises(KeyboardInterrupt):
        migrate_profiles.migrate_to_profiles()
    monkeypatch.setattr(migrate_profiles, "_move_file", real_move)

    rider_data_present(legacy_home)  # two moved, the rest still in the global tree

    migrate_profiles.migrate_to_profiles()
    rider_data_present(legacy_home)
    finished(legacy_home)


def test_a_truncated_copy_is_replaced_from_the_still_present_source(legacy_home):
    migrate_profiles.migrate_to_profiles()
    # Simulate a crash that left a half-written destination while the source survived.
    src = legacy_home / "rides" / "icu"
    src.mkdir(parents=True, exist_ok=True)
    (src / "i0.json").write_text(json.dumps({"id": "i0", "full": True}))
    dest = legacy_home / PROFILE / "rides" / "icu" / "i0.json"
    dest.write_text('{"id": "i0", "fu')

    migrate_profiles.migrate_to_profiles()

    assert json.loads(dest.read_text()) == {"id": "i0", "full": True}
    assert not src.exists()
