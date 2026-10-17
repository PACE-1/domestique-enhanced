"""Per-process hermetic sandbox, shared by tests/conftest.py and tests/pure/conftest.py.

Importing this module (before any project import) puts ``src/`` on sys.path,
points HOME at a fresh temporary directory, clears any inherited data root and
credentials, and blocks the network flag. It has no project imports, so a test
that never imports ``app`` stays light (#8).
"""
from __future__ import annotations

import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path as _Path

# Part-B src/ layout: the app modules live in <repo>/src after the root
# consolidation. pytest imports conftest before any test module, so this one
# insert serves every test's `import app` / `import training_planner` without
# touching the ~200 files that do their own sys.path.insert(ROOT) for
# repo-root artifacts. Harmless pre-move (missing path entries are skipped).
_SRC = _Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

# ── 3.4.3 HERMETIC-FS GATE (root fix for the owner-plan clobber) ─────────────
# The suite sandboxed NETWORK (fixtures below) but never the FILESYSTEM: every
# data path in the app resolves through Path.home()/.shepherd at import time
# (app._user_data_dir, training_planner.PLAN_DIR — which profile_manager
# rebinds to the ACTIVE PROFILE's plan dir — db, logs). Any test that hit
# /api/plan/generate via TestClient or a planner save path therefore wrote the
# USER'S REAL plan store: a gate run replaced the owner's live
# profiles/<name>/plans/current_plan.json with a fixture plan (observed:
# goal.event_name == "v134-test" from test_v134_generate_plan_no_yellow).
#
# Point HOME at a per-process sandbox BEFORE any project import, so every
# Path.home()/expanduser resolution lands in the sandbox — one choke point, no
# per-module patch list to drift. Each xdist worker imports its own conftest →
# its own sandbox; subprocesses spawned by tests inherit the env. The real
# home is kept in SHEPHERD_REAL_HOME for tests that need to LOOK at it.
_SANDBOX_HOME = tempfile.mkdtemp(prefix="domestique-test-home-")
atexit.register(shutil.rmtree, _SANDBOX_HOME, ignore_errors=True)
# The explicit override wins over HOME in user_home.shepherd_home(). Never
# inherit a developer/server data root, even during collection or in a worker.
os.environ.pop("SHEPHERD_HOME", None)
os.environ["SHEPHERD_NO_NET"] = "1"
# App/config .env loaders use setdefault. Blank credentials before importing
# them so a repository .env or inherited shell credentials cannot enter tests.
for _credential in ("ICU_ATHLETE_ID", "ICU_API_KEY", "ICU_ACCESS_TOKEN",
                    "ICU_REFRESH_TOKEN", "ICU_OAUTH_CLIENT_SECRET"):
    os.environ[_credential] = ""
# Idempotent across nested interpreters: xdist WORKERS inherit the
# controller's env with HOME already swapped — only the first process in
# the chain records the true real home; every process still gets its OWN
# fresh sandbox below (per-worker isolation).
_REAL_HOME = os.environ.get("SHEPHERD_REAL_HOME") or os.environ.get("HOME", "")
os.environ["SHEPHERD_REAL_HOME"] = _REAL_HOME
# Child interpreters (xdist workers, test-spawned subprocesses) recompute the
# per-user site-packages from HOME at startup (macOS: ~/Library/Python/…).
# When pytest/xdist are pip-installed --user, the sandbox HOME would hide
# them ("No module named '_pytest'" worker deaths) — capture the REAL
# user-site now and keep it importable via PYTHONPATH.
import site  # noqa: E402

_REAL_USER_SITE = site.getusersitepackages()
if site.ENABLE_USER_SITE and _REAL_USER_SITE and os.path.isdir(_REAL_USER_SITE):
    os.environ["PYTHONPATH"] = _REAL_USER_SITE + (
        os.pathsep + os.environ["PYTHONPATH"]
        if os.environ.get("PYTHONPATH") else "")
os.environ["HOME"] = _SANDBOX_HOME

SANDBOX_HOME = _SANDBOX_HOME
REAL_HOME = _REAL_HOME
