"""One atomic-write and coordinated read-modify-write path for user data (#7).

``write_text_atomic`` writes a temp file beside the target, fsyncs it, then
``os.replace``s it over the target, so a crash leaves the old content or the
new content, never a truncated file. ``update_json`` adds an in-process lock
around read -> mutate -> write so two threads (a sync thread and a request
handler) cannot lose each other's change to the same file.

The lock is a fixed pool striped by path, so memory stays bounded however many
ride files exist. The app runs one worker process (see the lifespan note), so
an in-process lock is the right scope. ``mutate`` must not call ``update_json``
on a different file: stripes are not ordered, so nesting could deadlock.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable, Optional

_STRIPES = tuple(threading.RLock() for _ in range(64))


def _lock_for(path: Path) -> threading.RLock:
    return _STRIPES[hash(os.path.abspath(path)) % len(_STRIPES)]


def file_lock(path: "Path | str") -> threading.RLock:
    """The lock ``update_json`` takes for ``path``; use ``with file_lock(p):``
    around a multi-step read -> compute -> write that ``update_json`` cannot express."""
    return _lock_for(Path(path))


def write_text_atomic(path: "Path | str", text: str, *, mode: Optional[int] = None,
                      encoding: str = "utf-8") -> None:
    """Atomically replace ``path`` with ``text``. Creates the parent directory.

    ``mode`` is applied to the temp file before the rename, so the final file is
    never visible with laxer permissions than requested.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(text)
            f.flush()
            try:
                os.fsync(f.fileno())
            except OSError:
                pass
        if mode is not None:
            try:
                os.chmod(tmp, mode)
            except OSError:
                pass
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_json_atomic(path: "Path | str", data: Any, *, indent: Optional[int] = 2,
                      default: Optional[Callable[[Any], Any]] = None) -> None:
    write_text_atomic(path, json.dumps(data, indent=indent, default=default))


def update_json(path: "Path | str", mutate: Callable[[Any], Any], *,
                default: Optional[Callable[[], Any]] = None, strict: bool = False) -> Any:
    """Read ``path`` as JSON, apply ``mutate``, write the result atomically.

    ``mutate`` receives the parsed value (or ``default()`` / ``{}`` when the
    file is missing or unreadable) and may change it in place and return
    ``None``, return a replacement, or return ``False`` to skip the write.
    ``strict=True`` lets a read error propagate instead of starting from the
    default, so a rider-data file that cannot be read is never overwritten.
    Returns the stored value. Runs under the path's lock.
    """
    path = Path(path)
    with _lock_for(path):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            if strict:
                raise
            data = default() if default is not None else {}
        result = mutate(data)
        if result is False:
            return data
        new = data if result is None else result
        write_json_atomic(path, new)
        return new
