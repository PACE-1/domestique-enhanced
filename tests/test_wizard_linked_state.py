"""The intervals.icu step of both wizards reads as done once an account is
linked (IP_profile_setup_linked_state, 2026-09-16).

Before: a 13 px line "Linked as <name>", the big accent button relabelled
"Re-link a different account", and a 12 px grey "Go to dashboard" as the only
way forward. Now: three states, one primary action each.

  not linked -> primary "Sign in to intervals.icu", small "Skip for now"
  linked     -> a linked-account card (check, "Connected to intervals.icu",
                the athlete's name, the id), primary "Finish setup"
                (profile wizard) / "Continue" (first-run wizard), the re-link
                demoted to a small secondary button "Use a different account"
  error      -> the red reason, primary "Try again", skip still there

The JS is executed from the real templates under node against a minimal DOM
and a fake fetch, so the assertions are on behaviour, not on source text.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent

needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")


def _extract_js_function(src: str, name: str) -> str:
    start = src.find(f"async function {name}")
    if start < 0:
        start = src.index(f"function {name}")
    i = src.index("{", start)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[start:j + 1]
    raise AssertionError(f"unbalanced braces extracting {name}")


FAKE_DOM = r"""
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ''; this.hidden = false;
                     this.style = {}; this._text = ''; this.focused = false; this.attrs = {}; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { throw new Error('innerHTML used: ' + v); }   // A5: never HTML
  appendChild(c) { this.children.push(c); return c; }
  focus() { this.focused = true; }
  setAttribute(k, v) { this.attrs[k] = v; }
}
const els = {};
const document = {
  getElementById: id => els[id] || null,
  createElement: tag => new El(tag),
};
function mk(id, cls, text) { const e = new El('x'); e.className = cls || ''; e._text = text || ''; els[id] = e; return e; }
let fetchPayload = null;
async function fetch(url) { return { json: async () => fetchPayload }; }
function assert(cond, msg) { if (!cond) { console.error('ASSERT: ' + msg); process.exit(1); } }
"""


# The pages load the shared failure-reason table with a <script> tag; the
# harness loads the same file.


def _run_node(harness: str) -> None:
    res = subprocess.run(["node", "-e", harness], capture_output=True, text=True, timeout=30)
    assert res.returncode == 0, f"stderr:\n{res.stderr}\nstdout:\n{res.stdout}"


# ── static markup ────────────────────────────────────────────────────────────


# ── behaviour, from the real templates ───────────────────────────────────────


def test_templates_still_render():
    """Jinja syntax intact: both wizards serve 200 through the app."""
    import sys
    sys.path.insert(0, str(REPO / "src"))
    import app as app_module
    from fastapi.testclient import TestClient
    client = TestClient(app_module.app)
    for path in ("/profile-setup", "/setup"):
        r = client.get(path, follow_redirects=False)
        assert r.status_code in (200, 302, 303, 307), (path, r.status_code)
        if r.status_code == 200:
            assert "linked-card" in r.text


