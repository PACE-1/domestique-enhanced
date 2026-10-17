import json
import shutil
import subprocess
from pathlib import Path

import pytest

needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")


def _node(js: str):
    res = subprocess.run(["node", "-e", js], capture_output=True, text=True, timeout=30)
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout)


def test_settings_never_shows_another_profiles_push_result(monkeypatch):
    """The last push result is global; after a profile switch Settings showed
    the previous rider's count (review of #34)."""
    import types
    import app as app_module
    import profile_manager
    monkeypatch.setattr(app_module, "_icu_push_last_result",
                        {"at": "x", "profile_id": "anna", "held": 2})
    for active, expect in (("anna", 2), ("ben", None)):
        monkeypatch.setattr(profile_manager.ProfileManager, "get",
                            classmethod(lambda cls, a=active: types.SimpleNamespace(active_id=a)))
        got = app_module._last_result_for_active_profile()
        assert (got or {}).get("held") == expect, (active, got)
