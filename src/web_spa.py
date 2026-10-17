"""Serve the compiled React app (web/dist) under /v2."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


def spa_dist(src_dir: Path) -> Path:
    """web/dist beside src/ in a checkout, or inside the bundle root in a frozen build."""
    bundled = src_dir / "web" / "dist"
    return bundled if bundled.is_dir() else src_dir.parent / "web" / "dist"


def mount_spa(app: FastAPI, dist: Path, prefix: str = "/v2") -> bool:
    # ponytail: html=True serves index.html only for directories; the app uses hash routes, so no deep-link fallback is needed.
    if not (dist / "index.html").is_file():
        return False
    app.mount(prefix, StaticFiles(directory=str(dist), html=True), name="spa")
    return True
