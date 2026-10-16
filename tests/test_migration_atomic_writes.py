"""Migration metadata uses the same failure-safe writer as normal user data."""
import json

import pytest

import atomic_io
import migrate_profiles


@pytest.mark.parametrize("writer", [
    migrate_profiles._write_registry_atomic,
    migrate_profiles._write_device_prefs_atomic,
])
def test_migration_write_failure_preserves_existing_data(tmp_path, monkeypatch, writer):
    path = tmp_path / "profile" / "metadata.json"
    writer(path, {"rider": "original"})

    def fail_replace(*args):
        raise OSError("simulated failed rename")

    monkeypatch.setattr(atomic_io.os, "replace", fail_replace)
    with pytest.raises(OSError, match="failed rename"):
        writer(path, {"rider": "replacement"})

    assert json.loads(path.read_text()) == {"rider": "original"}
    assert list(path.parent.iterdir()) == [path]


@pytest.mark.parametrize("writer", [
    migrate_profiles._write_registry_atomic,
    migrate_profiles._write_device_prefs_atomic,
])
def test_migration_write_does_not_reuse_a_stale_temp_file(tmp_path, writer):
    path = tmp_path / "metadata.json"
    stale = tmp_path / "metadata.json.tmp"
    stale.write_text("left by an interrupted old migration")

    writer(path, {"rider": "new"})

    assert json.loads(path.read_text()) == {"rider": "new"}
    assert stale.read_text() == "left by an interrupted old migration"
