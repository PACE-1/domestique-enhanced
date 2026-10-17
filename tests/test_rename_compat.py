"""The Domestique -> Shepherd rename keeps existing installs working."""
import os
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"


def _py(code: str, home: Path, **env) -> str:
    e = {k: v for k, v in os.environ.items() if not k.startswith(("DOMESTIQUE_", "SHEPHERD_"))}
    e.update(HOME=str(home), **env)
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=e, cwd=str(SRC), timeout=60)
    assert out.returncode == 0, out.stderr[-600:]
    return out.stdout.strip()


_HOME = "import user_home; print(user_home.shepherd_home())"


def test_old_environment_names_still_work_and_new_ones_win(tmp_path):
    assert _py(_HOME, tmp_path, DOMESTIQUE_HOME="/old/place") == "/old/place"
    assert _py(_HOME, tmp_path, DOMESTIQUE_HOME="/old/place", SHEPHERD_HOME="/new/place") == "/new/place"


def test_old_data_folder_moves_once_and_leaves_a_link(tmp_path):
    old = tmp_path / ".domestique"
    (old / "profiles").mkdir(parents=True)
    (old / "profiles.json").write_text("{}")
    assert _py(_HOME, tmp_path) == str(tmp_path / ".shepherd")
    assert (tmp_path / ".shepherd" / "profiles.json").read_text() == "{}"
    assert old.is_symlink() and old.resolve() == (tmp_path / ".shepherd").resolve()
    assert _py(_HOME, tmp_path) == str(tmp_path / ".shepherd")  # second start changes nothing
    assert (tmp_path / ".shepherd" / "profiles.json").exists()


def test_an_existing_new_folder_is_never_overwritten(tmp_path):
    (tmp_path / ".domestique").mkdir()
    (tmp_path / ".domestique" / "old.txt").write_text("old")
    (tmp_path / ".shepherd").mkdir()
    (tmp_path / ".shepherd" / "new.txt").write_text("new")
    _py(_HOME, tmp_path)
    assert (tmp_path / ".shepherd" / "new.txt").exists() and not (tmp_path / ".shepherd" / "old.txt").exists()
    assert not (tmp_path / ".domestique").is_symlink() and (tmp_path / ".domestique" / "old.txt").exists()


def test_a_fresh_install_creates_nothing_at_the_old_name(tmp_path):
    _py(_HOME, tmp_path)
    assert not (tmp_path / ".domestique").exists()


def test_the_launcher_still_recognises_a_running_pre_rename_instance(monkeypatch):
    import io
    import json
    import urllib.request

    import launcher

    body = json.dumps({"app": "domestique"}).encode()
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **k: io.BytesIO(body))
    assert launcher.is_shepherd_at("http://localhost:8080") is True
