"""Serve the compiled React app (web/dist) under /v2 beside the legacy dashboard."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


def mount_spa(app: FastAPI, dist: Path, prefix: str = "/v2") -> bool:
    # ponytail: html=True serves index.html only for directories; deep-link
    # SPA fallback arrives with the router wave.
    if not (dist / "index.html").is_file():
        return False
    app.mount(prefix, StaticFiles(directory=str(dist), html=True), name="spa")
    return True
