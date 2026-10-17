# Initial code-bloat inventory

For the current source count, complexity priorities and remaining completion
criteria, see [the closeout review](closeout.md). The next structural layer is
recorded in [the programme summary refactor](programme-summary.md).

Source baseline: `11cc77cb` (2026-10-15). Workstream: Forgejo #20; inventory: #21.

This is the first bounded cleanup inventory. Historical audits are evidence to recheck, not current deletion instructions. The ledger separates confirmed private dead code from tested capabilities and unresolved external consumers.

## Measurements

| Category | Tracked files | Bytes | Text lines |
|---|---:|---:|---:|
| development and generation tools | 19 | 232,442 | 5,373 |
| docs, project metadata and other assets | 79 | 6,683,512 | 18,217 |
| first-party static assets | 8 | 62,859 | 1,253 |
| packaging and CI | 13 | 156,738 | 2,733 |
| route assets | 1,884 | 49,468,638 | 126,037 |
| runtime Python | 50 | 2,918,630 | 63,064 |
| templates (HTML/CSS/JS) | 5 | 1,263,290 | 23,366 |
| tests and fixtures | 399 | 4,886,215 | 157,921 |
| vendored frontend | 2 | 407,211 | 34 |
| workout assets | 4,314 | 12,874,646 | 263,350 |

The AST tool reports 54 Python modules and 66,573 lines including generation tools. Its line convention counts an additional trailing line per module. Runtime source, tools, tests, vendored code and product data above are deliberately separate. Ten structural clone groups represent 228 candidate duplicated lines, not 228 guaranteed removable lines. The sampler is 1,079 lines with an estimated complexity of 283.

The import report finds eight reciprocal import pairs; the complete graph includes function-local imports. It also finds 41 explicit global rebindings, 11 with more than one writer. It does not count all dictionary/attribute mutations, so this is a lower-bound ownership inventory. Current principal owners to simplify are profile identity/paths (#5), cache dictionaries (#6), persisted records (#7), planner session writes (#11/#24), job lifecycle (#4/#17) and API/UI orchestration (#3/#10/#25).

## Consumer review

The improved route matcher reports 131 `/api` routes: 126 reached, three ambiguous and two unreached by repository UI. The control recognizes all 107 UI fetch paths. The older summary heuristic falsely flags live routes; do not delete using its output.

| Candidate | Decision | Evidence / next action |
|---|---|---|
| `/api/setup/test-icu` | retain | Used by `packaging/tls_intercept_probe_win.py`. |
| `/api/setup/status` | retain | Tested compatibility/setup surface; removal has negligible benefit and unknown external clients. |
| `/api/rides/legacy-envelope` | defer | Dynamic-route ambiguity; establish external consumer contract before retiring. |
| `/api/routes/surfaces` | retain | Ambiguous static matching is not evidence of an unused feature. |
| `/api/workout/download/{filename}` | retain | Download compatibility and dynamic URL consumers need preservation. |
| OAuth callback and desktop launcher | retain | Provider callback and executable entrypoint are live roots despite missing ordinary callers. |
| PNG exports, safety checks and migrations | retain/defer | Product/upgrade guarantees take precedence over tool reachability guesses. |

External cycling-stack clients mentioned in upstream notes are not in this checkout and were not inspected. Those interfaces stay retained/deferred. No public endpoint or capability is approved for removal in batch 1.

## Symbol candidate ledger

“Test files” counts name mentions, including comments; it is not a coverage measurement. Owner is the source module; the linked issue owns follow-up. Each proposed removal also received a whole-tree search outside source/tests for dynamic/packaging/documented consumers.

| Symbol | Lines | Test files | Disposition | Follow-up |
|---|---:|---:|---|---|
| `app.APP_VERSION` | 1 | 0 | remove batch 1 | #22 |
| `analytics.compute_dfa_threshold_analysis` | 96 | 1 | defer | #22 |
| `app.legacy_card_state` | 21 | 1 | defer | #22 |
| `clock.unfreeze` | 2 | 16 | retain | #22 |
| `db.query_metrics_latest` | 7 | 0 | removed batch 2 | #22 |
| `db.upsert_blood_marker` | 8 | 0 | removed batch 2 | #22 |
| `db.query_blood_markers` | 8 | 0 | removed batch 2 | #22 |
| `error_codes.all_codes` | 3 | 1 | retain | #22 |
| `fitness_estimation.compute_fitness_signature` | 44 | 1 | defer | #22 |
| `fitness_estimation.aerobic_decoupling` | 100 | 3 | defer | #22 |
| `hr_targets._lthr_frac_at` | 7 | 0 | remove batch 1 | #22 |
| `log_config.set_level` | 40 | 3 | retain | #22 |
| `log_config.get_levels` | 15 | 1 | retain | #22 |
| `log_config._SessionContextFilter` | 12 | 0 | retain | #22 |
| `log_config.start_session_log` | 7 | 1 | retain | #22 |
| `log_config.get_active_log_path` | 3 | 1 | retain | #22 |
| `log_config.stop_session_log` | 3 | 1 | retain | #22 |
| `log_config.stop_flusher` | 9 | 1 | retain | #22 |
| `plan_invariants.check_acwr` | 29 | 4 | defer | #11 |
| `plan_invariants.projected_ctl` | 19 | 2 | defer | #11 |
| `readiness_composite.compute_training_severity` | 81 | 4 | defer | #22 |
| `ride_report_png.render_ride_report_png` | 93 | 0 | removed batch 2 | #22 |
| `ride_storage.recent_mean_weekly_tss` | 52 | 4 | defer | #23 |
| `ride_storage.detect_wbal_overshoot` | 40 | 1 | defer | #22 |
| `routes_lib._route_key_for` | 11 | 0 | removed batch 2 | #22 |
| `scripts.title_from_zwo.title_from_zwo` | 49 | 1 | defer | #22 |
| `strain_score.compute_sr_avg` | 34 | 1 | defer | #22 |
| `tau_fitting.count_weighted_markers` | 21 | 1 | defer | #22 |
| `tls_trust.backend_of` | 3 | 2 | retain | #22 |
| `training.classify_acwr` | 12 | 0 | removed batch 2 | #22 |
| `training.classify_tsb` | 9 | 0 | removed batch 2 | #22 |
| `training.classify_ramp` | 9 | 0 | removed batch 2 | #22 |
| `training.classify_monotony` | 9 | 0 | removed batch 2 | #22 |
| `training_planner._taper_anchor` | 13 | 0 | remove batch 1 | #22 |
| `training_planner.required_weekly_tss` | 9 | 0 | removed batch 2 | #22 |
| `training_planner.schedule_double_threshold_pair` | 52 | 1 | defer | #22 |
| `week_plan._install_seal` | 24 | 2 | defer | #11 |
| `workout_facts.reset_cache` | 5 | 9 | retain | #22 |
| `workout_facts.audit_labels` | 21 | 1 | defer | #22 |
| `zones.power_zone_at` | 5 | 1 | defer | #22 |
| `zones.hr_zone_at` | 5 | 1 | defer | #22 |
| `zones.zone_distribution` | 18 | 2 | defer | #22 |

Reasons and source locations for every row are in [baseline.json](baseline.json). All non-selected candidates remain unchanged. Safety-related candidates require #11; tested alternate implementations require #23/#24. Unused names alone do not justify feature removal.

## Verification / reproduction

```sh
python3 tools/arch/astmap.py src > /tmp/shepherd-ast.json
python3 tools/arch/report.py /tmp/shepherd-ast.json src/templates/dashboard.html
python3 tools/arch/endpoints.py /tmp/shepherd-ast.json src/templates src/static
python3 tools/arch/endpoints_control.py /tmp/shepherd-ast.json
python3 scripts/architecture_report.py --json > /tmp/shepherd-architecture.json
```

These read-only tools do not import the app. Candidate review uses `rg` across source, tests, packaging, scripts, templates and historical notes, followed by AST call/import inspection. Keep before/after scope identical. Raw reports belong in review artifacts rather than new runtime subsystems.

Runtime verification follows [the test instructions](../../tests/README.md). The tracked planner golden must not be automatically blessed; compare unchanged-baseline behavior before accepting cleanup changes. Full-suite failures, expected failures and skips are recorded separately from focused passing checks.

## Dependency / delivery inventory

At the source baseline, `requirements.txt` combined the FastAPI/scientific backend, Pillow PNG support and desktop packages. Server candidates include FastAPI/Uvicorn, Jinja, httpx/truststore, fit-tool, Pydantic/Starlette/multipart, lxml, packaging, SciPy and Pillow. Desktop-only candidates include pystray, pywebview, Linux PySide6/qtpy and Windows pythonnet. SciPy and Pillow have live runtime callers; fitparse is an independent test decoder. Do not remove a dependency merely because it is large.

The inspected disposable development environment occupies about 303 MB in site-packages before locks/profile separation, includes testing and bridge dependencies, and excludes PySide6/qtpy. This is not an AppImage/container-size claim. The implementation now separates server, headless development and desktop profiles and includes a Linux/Python 3.12 constraint lock. A clean server install measured 267,272,911 bytes in site-packages and passed startup, HTTP health/setup and SIGTERM smoke checks without Qt/webview. Actual Docker/AppImage size, desktop startup and peak-memory measurements remain #12; no packaged artifact was built in this inventory. Existing Linux packaging and cache-generation scripts are retained and reused.

## First cleanup batch

Scope: stale `APP_VERSION`, unused private `_lthr_frac_at` and its private ramp-anchor table, and unused private `_taper_anchor`. Do not alter the active HR mapping or taper policy. Record deletions and verify current-baseline characterization/behavior before closing that batch. The broader dead-code task #22 remains open until its agreed scope is resolved.

## Implementation progress

See [the verification receipt](verification.md) for implemented changes, measured deletion, test evidence and remaining validation. Baseline dispositions above describe the initial inventory; they are not claims that all deferred candidates have been resolved.

## Second cleanup batch (#22)

Removed after a whole-tree search (source, tests, packaging, scripts, docs,
templates) found no caller, dynamic lookup or external consumer:

| Removed | Lines | Evidence |
|---|---:|---|
| `src/ride_report_png.py` (whole module) | 228 | No importer anywhere. Its endpoint left in an earlier wave; the programme summary PNG has its own renderer. |
| `src/static/vendor/html2canvas.min.js` | 198,689 bytes | Referenced only by the removed module's docstring, `NOTICE`, the static README and the changelog. No template or script loads it. `NOTICE` entry removed with it. |
| `db.query_metrics_latest`, `db.upsert_blood_marker`, `db.query_blood_markers` | 31 | No caller. The `blood_markers` table schema stays so existing databases keep opening. |
| `routes_lib._route_key_for` and its `app.py` re-export | 11 | The re-export carried `noqa: F401`; nothing used it. |
| `training.classify_acwr/tsb/ramp/monotony` | 47 | No caller, no string-built lookup. |
| `training_planner.required_weekly_tss` | 11 | No caller. |
| `config.ACWR_*`, `RAMP_RATE_*`, `MONOTONY_*`, `TSB_RED` | 10 | Their only consumers were the four `classify_*` functions. |

Retained candidates from the ledger stay deferred: they have tests or a
planned owner (#11, #23), so they are not dead code.


## Planner structure

The [slot-selection refactor receipt](planner-slots.md) records the first bounded
sampler extraction, its RNG comparison and full-plan characterization checks.

## Third pass (#22): the stop condition

Re-ran the reference count over every remaining ledger symbol (production
references outside the definition, comments excluded, plus test references). The
ones with **no production caller but a test** are the only plausible deletions,
and each stays:

| Symbol | Lines | Test refs | Decision | Why it stays |
|---|---:|---:|---|---|
| `plan_invariants.projected_ctl` | 19 | 2 | retain | Planner safety instrument (#11); used by the characterization harness. |
| `plan_invariants.check_acwr` | 29 | 11 | retain | Same: a safety check, not dead weight. |
| `week_plan._install_seal` | 24 | 2 | retain | The dormant week seal (`STRICT_SEAL`); decided under #11/#24, not here. |
| `training_planner.schedule_double_threshold_pair` | 52 | 2 | defer | Planner scheduling rule with its own tests; belongs to #24. |
| `ride_storage.detect_wbal_overshoot` | 40 | 10 | defer | W' analysis with 10 test references; removing it is a product decision. |
| `workout_facts.audit_labels` | 21 | 1 | defer | Library audit helper; needs the library tooling owner. |
| `scripts.title_from_zwo.title_from_zwo` | 49 | 10 | defer | Generation script helper under `src/scripts`. |

Everything else has a production caller. Deleting a tested-only function means
deleting its tests or declaring the capability gone, and neither is a cleanup
call. Static candidates are therefore exhausted for now: further reduction comes
from consolidation (#23/#24) and from the UI migration retiring the legacy
dashboard (#25), not from more dead-code batches.
