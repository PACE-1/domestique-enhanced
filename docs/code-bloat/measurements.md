# Measurements (roadmap #21)

Taken at `2ce26a4e` (fork `clean-main` after the cleanup, server, persistence and
UI PRs through #45) on 2026-10-15. Repeat with the commands below; these are
analysis metrics and candidate signals, never deletion quotas.

```sh
python3 tools/arch/astmap.py src > /tmp/src.json
python3 tools/arch/report.py /tmp/src.json src/templates/dashboard.html
python3 tools/arch/endpoints.py /tmp/src.json src/templates src/static
python3 tools/arch/endpoints_control.py /tmp/src.json     # negative control
python3 scripts/architecture_report.py --json
```

## Maintained code versus everything else

| Category | Files | Bytes | Text lines |
|---|---:|---:|---:|
| Runtime Python (`src/*.py`, no scripts) | 53 | 2,922,136 | 63,129 |
| Generation and dev scripts (`src/scripts`, `tools`, `scripts`) | 11 | 194,853 | 4,505 |
| Legacy templates (HTML/CSS/JS) | 5 | 1,263,290 | 23,366 |
| New web app source (`web/src`, minus generated and shadcn) | 21 | 112,013 | 2,901 |
| Web generated or vendored (shadcn `ui`, OpenAPI types) | 6 | 12,431 | 376 |
| Tests (Python) | 394 | 3,805,843 | 87,182 |
| Vendored frontend (`src/static/vendor`) | 1 | 208,522 | minified |
| Workout assets (`.zwo`) | 4,308 | 5,207,387 | data |
| Route assets (`.crs`, `.gpx`) | 1,255 | 35,305,008 | data |
| Packaging and CI | 15 | 157,630 | 2,766 |
| Docs and notes | 78 | 6,281,398 | 19,862 |

Product data (workouts, routes) is not a deletion target because it inflates a
file count. The legacy templates are the largest single maintained artefact and
the target of the UI migration (#25).

## Python structure (AST tool)

- 57 analysed modules, 66,641 source lines (the tool's convention counts a
  trailing line per module and includes generation scripts).
- Two modules hold 56%: `app.py` 20,810 lines (416 defs) and `training_planner.py`
  16,408 lines (246 defs).
- Longest functions: `sample_week_workouts` 1,080 lines (complexity 284),
  `reforecast` 712, `generate_plan` 704, `_match_zwo_unclamped` 523,
  `score_blocks` 515. Complexity here is a prioritisation signal, not a target.
- 9 structural clone groups, 209 candidate duplicated lines (semantic equivalence
  not established; the shared planned-power primitive was one, now consolidated).
- `architecture_report.py`: 141 routes, 2 dead, 6 duplication findings, 1 shared
  mutable state finding, 2 coupling findings.

## API reachability

- 146 endpoints in total, counting pages, the OAuth callback and the `/login`,
  `/logout`, `/healthz` routes added by the server work. The matcher's control
  recognises all 107 UI fetch paths with 0 misidentified.
- Unreached by any client: `GET /api/setup/status` and `POST /api/setup/test-icu`
  (the second is named by `packaging/tls_intercept_probe_win.py`). Both stay.
- Ambiguous, matched only through an interpolated segment: `/api/rides/legacy-envelope`,
  `/api/routes/surfaces`, `/api/workout/download/{filename}`. All stay.
- The matcher scans `src/templates` and `src/static`; routes used only by the new
  `web/src` app are listed as "referenced by neither" until it also scans `web/`.
  Do not delete from that list.

## Dependencies and artefacts

- Locked Linux profile: 50 pinned packages (`requirements-linux-py312.lock`).
- Server install (no Qt, no webview): 267,272,911 bytes of site-packages, measured
  by the first cleanup batch.
- Docker server image (`python:3.12-slim`, SciPy, Pillow, bundled assets, built UI):
  658 MB, measured in PR #35. Not optimised; no startup or peak-memory comparison
  has been taken, and no AppImage has been built or measured here.

## Candidates

The symbol ledger in `README.md` carries each candidate's disposition. Batch 1 and
batch 2 removals are recorded there; everything else is retained or deferred with a
reason (`#11` planner safety, `#23` consolidation).
