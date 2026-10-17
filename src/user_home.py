"""Single resolver for the Shepherd user-data home (~/.shepherd).

`SHEPHERD_HOME`, when set, points ALL user-data resolution at that directory
instead (the dev preview and the tests use it). The packaged app never sets it,
so the home is Path.home()/".shepherd".

Before the rename the home was ~/.domestique. The first time the home is
resolved with no override and no ~/.shepherd, an existing ~/.domestique is moved
to ~/.shepherd and a symlink is left at the old name, so a copy of the old app
that is still installed keeps finding its data.

Import-order contract: this module has NO project imports (stdlib only) so
every module constant (db._USER_DATA, tp.PLAN_DIR, ...) can resolve through
it at import time, and the move happens before any of them creates a file.
"""
from __future__ import annotations

import envcompat  # noqa: F401  (old DOMESTIQUE_* names -> SHEPHERD_*, before anything reads them)
import os
from pathlib import Path

_migrated = False


def _adopt_old_home(new: Path) -> None:
    old = new.parent / ".domestique"
    if new.exists() or not old.is_dir() or old.is_symlink():
        return
    try:
        old.rename(new)
    except OSError:
        return  # e.g. a different filesystem: keep working from the old directory's data via the app's own migration
    try:
        old.symlink_to(new, target_is_directory=True)
    except OSError:
        pass


def shepherd_home() -> Path:
    """The user-data root: $SHEPHERD_HOME if set, else ~/.shepherd."""
    global _migrated
    env = os.environ.get("SHEPHERD_HOME", "").strip()
    if env:
        return Path(env).expanduser()
    new = Path.home() / ".shepherd"
    if not _migrated:
        _migrated = True
        _adopt_old_home(new)
    return new
