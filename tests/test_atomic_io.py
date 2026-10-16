"""#7 — one atomic write path and coordinated read-modify-write."""
import json
import os
import threading

import pytest

import atomic_io


def test_write_replaces_content_and_leaves_no_temp_files(tmp_path):
    p = tmp_path / "data.json"
    atomic_io.write_json_atomic(p, {"a": 1})
    atomic_io.write_json_atomic(p, {"a": 2})
    assert json.loads(p.read_text()) == {"a": 2}
    assert [x.name for x in tmp_path.iterdir()] == ["data.json"]


def test_failure_before_the_rename_keeps_the_old_file_and_cleans_up(tmp_path, monkeypatch):
    p = tmp_path / "data.json"
    atomic_io.write_json_atomic(p, {"keep": True})

    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(os, "replace", boom)
    with pytest.raises(OSError):
        atomic_io.write_json_atomic(p, {"keep": False})
    monkeypatch.undo()
    assert json.loads(p.read_text()) == {"keep": True}
    assert [x.name for x in tmp_path.iterdir()] == ["data.json"]


def test_mode_is_applied_before_the_file_is_visible(tmp_path):
    p = tmp_path / ".env"
    atomic_io.write_text_atomic(p, "TOKEN=x\n", mode=0o600)
    assert oct(p.stat().st_mode & 0o777) == "0o600"


def test_concurrent_updates_do_not_lose_changes(tmp_path):
    p = tmp_path / "counter.json"
    atomic_io.write_json_atomic(p, {"n": 0})

    def bump():
        for _ in range(25):
            atomic_io.update_json(p, lambda d: d.__setitem__("n", d["n"] + 1))

    threads = [threading.Thread(target=bump) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert json.loads(p.read_text())["n"] == 8 * 25


def test_strict_update_never_overwrites_an_unreadable_file(tmp_path):
    p = tmp_path / "ride.json"
    p.write_text("{not json")
    with pytest.raises(ValueError):
        atomic_io.update_json(p, lambda d: d.__setitem__("rpe", 7), strict=True)
    assert p.read_text() == "{not json"


def test_non_strict_update_starts_from_default_for_a_missing_file(tmp_path):
    p = tmp_path / "new.json"
    atomic_io.update_json(p, lambda d: d.__setitem__("x", 1))
    assert json.loads(p.read_text()) == {"x": 1}


def test_returning_false_skips_the_write(tmp_path):
    p = tmp_path / "same.json"
    atomic_io.write_json_atomic(p, {"x": 1})
    before = p.stat().st_mtime_ns
    assert atomic_io.update_json(p, lambda d: False) == {"x": 1}
    assert p.stat().st_mtime_ns == before


def test_file_lock_is_reentrant_with_update_json(tmp_path):
    p = tmp_path / "r.json"
    atomic_io.write_json_atomic(p, {"x": 0})
    with atomic_io.file_lock(p):
        atomic_io.update_json(p, lambda d: d.__setitem__("x", 1))
    assert json.loads(p.read_text())["x"] == 1
