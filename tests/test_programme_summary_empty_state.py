"""Programme summary must never open blank — the three no-data states.

Linux tester, fresh install: "programme summary is blank". Measured: with no
plan the modal wrote one line into #ps-window and returned, leaving four empty
metric grids and six empty chart frames; with a plan but no rides yet every
tile read "no data" over blank axes and the PNG printed "NoneW -> NoneW". Each
state now states what is missing and when it fills in.

Node-harness style follows tests/test_day_modal_file_tss.py: run the REAL
_psRender out of templates/dashboard.html against a stub DOM.
"""
import json
import subprocess
from pathlib import Path
from unittest.mock import patch

from PIL import ImageDraw

from programme_summary_png import render_programme_summary_png

ROOT = Path(__file__).resolve().parent.parent


def _extract_js_function(src: str, name: str) -> str:
    i = src.index(f"function {name}")
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
    raise AssertionError(f"unbalanced braces for {name}")


def _extract_js_line(src: str, needle: str) -> str:
    for line in src.splitlines():
        if needle in line:
            return line.strip()
    raise AssertionError(f"line not found: {needle}")


_DOM_STUB = """
const _els = {};
function _el(id) {
  if (!_els[id]) _els[id] = {
    id, textContent: '', innerHTML: '', style: {display: ''},
    parentElement: {}, replaceWith(){}, getContext(){ return {}; },
  };
  return _els[id];
}
const document = {
  getElementById: _el,
  createElement: () => ({style: {cssText: ''}, textContent: ''}),
};
const window = {};
"""


def _summary(rides: int) -> dict:
    return {
        "plan_id": "current", "start_date": "2026-05-18",
        "end_date": "2026-08-09", "weeks": 12, "rides": rides,
        "ftp_delta": {"start": None, "end": None, "pct": None},
        "eftp_delta": {"start": None, "end": None, "pct": None},
        "vo2max_delta": {"start": None, "end": None, "pct": None},
        "ctl_gain": {"start": None, "end": None, "delta": None},
        "intensity_dist": {"z1z2_min": 0, "z3_min": 0, "z4plus_min": 0},
        "pol_index": {"mean": None, "class": "—"},
        "monotony_max": None, "strain_max": None, "compliance": [],
        "mean_max_curve": {"start": [], "end": []}, "hooper_trend": [],
        "totals": {"km": 0, "hours": 0.0, "kj": 0, "elev_m": 0},
        "decoupling_trend": [], "citations": ["Foster 1998 (MSSE)"],
    }


def test_png_never_prints_none():
    """An unridden plan printed "NoneW -> NoneW": the delta dicts carry the
    keys with None values, so dict.get(k, '—') never fired."""
    drawn: list[str] = []
    orig = ImageDraw.ImageDraw.text

    def _spy(self, xy, text="", *a, **kw):
        drawn.append(str(text))
        return orig(self, xy, text, *a, **kw)

    with patch.object(ImageDraw.ImageDraw, "text", _spy):
        render_programme_summary_png(_summary(rides=0))
    assert not [t for t in drawn if "None" in t], \
        f"raw None leaked into the PNG: {[t for t in drawn if 'None' in t]}"
