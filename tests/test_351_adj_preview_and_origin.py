"""v3.5.1 — two fixes around the day-modal adjustment banner.

1. Origin gate: the CSRF Origin check must allow ANY localhost/127.0.0.1
   port. The old allow-list pinned :8080, so serving anywhere else (dev
   preview on :8090, a stray uvicorn on :8000) returned 403 for EVERY
   mutating POST — the UI's buttons looked dead ("Ride it anyway" did
   nothing; a later press in the packaged app then worked).

2. Preview-before-revert: the collapsed "Original plan" block in the
   adjusted day modal lazily renders the original file's real segment
   chart on expand, so the rider can see what "Ride the original anyway"
   restores before pressing it. Structural pins + node behaviour tests.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


# ── 1. Origin gate ───────────────────────────────────────────────────────────

def test_allowed_origins_are_port_agnostic_localhost():
    import app as appmod
    prefixes = appmod._ALLOWED_ORIGIN_PREFIXES
    # Port-agnostic: the prefix ends at the colon, so any port matches.
    assert "http://localhost:" in prefixes
    assert "http://127.0.0.1:" in prefixes
    # Regression shape: no prefix may pin a port (the :8080 bug).
    for p in prefixes:
        assert not re.search(r":\d", p), f"port-pinned origin prefix: {p!r}"


def test_origin_check_blocks_cross_site_allows_any_local_port():
    from fastapi.testclient import TestClient
    import app as appmod
    client = TestClient(appmod.app)
    # Cross-site origin still 403s (the actual CSRF the check exists for).
    r = client.post("/api/readiness/revert-cap", json={},
                    headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    # Any localhost port passes the gate (may hit the endpoint's own logic,
    # but must NOT be the middleware's 403 "origin not allowed").
    for origin in ("http://localhost:8090", "http://127.0.0.1:8000"):
        r = client.post("/api/readiness/revert-cap", json={},
                        headers={"Origin": origin})
        assert r.status_code != 403, origin


# ── 2. Preview-before-revert (structure) ─────────────────────────────────────


# ── 2b. Preview-before-revert (behaviour, node harness) ──────────────────────

def _extract_js_function(src: str, name: str) -> str:
    i = src.index(f"function {name}")
    j = src.index("\n}", i) + 2
    # include the `async ` prefix when present
    k = src.rfind("\n", 0, i) + 1
    return src[k:j]


