# First cleanup batch: verification receipt

This receipt covers work on `refactor/v1-bloat-baseline` under Forgejo roadmap
#20. It does not certify the entire roadmap, Docker/AppImage releases or remote
CI. No Rust is introduced.

## Implemented scope

- Test bootstrap clears inherited `DOMESTIQUE_HOME`, redirects the existing
  home sandbox, blanks ICU credentials before imports and keeps virtualenv
  dependencies isolated. Regression subprocesses cover collection, application
  startup/writes, two separate xdist workers and cleanup of temporary data.
- The gate uses an installed interpreter, separates parallel bulk from the
  serial performance tail, preserves nonzero statuses and parses pytest summary
  IDs rather than captured application error logs. Historical failures and
  passing reruns cannot turn a failed run green.
- Server, headless development and desktop dependency profiles share a
  Linux/Python 3.12 constraint lock. The Forgejo workflow uses that gate.
- The dead-code-only commit `ac8a154a` removes 30 production lines: an unused
  version alias, private HR ramp interpolation/table and private taper anchor.
  No public endpoint, workout, route, migration or test capability was removed.
- Separate commits fix the local-date calendar fixture (#29) and normalize
  the rolling intensity window to UTC instants (#30). Offset-aware timestamps
  keep their offsets; naive/date-only input means local time. The window is
  inclusive from 48 hours ago through now; invalid/future entries are ignored.
  Intensity thresholds and zone units are unchanged.

## Evidence

The initial deletion batch produced identical isolated planner fingerprints
for 49 builder + 80 owner0 + 80 owner1 cases (209 total), before the separate
intensity-window behavior fix. Both serialized results had SHA-256:

`352a8b461bcff8fc1b6bec902e6eeef89b98e49483686f2150a3a8aebbbfb4fe`.

Runs used separate copies of tracked workout files so suite-generated
workouts could not contaminate the comparison. The tracked characterization
golden already differs in one owner0 case on pre-cleanup code. It was not
edited or blessed. A further isolated comparison across the timezone behavior
fix is being recorded separately; it must not be represented as part of a
behavior-neutral deletion.

Current focused verification:

```sh
.venv/bin/python -m pytest tests/test_intensity_window_timezones.py \
  tests/test_gate_script.py tests/test_planner_injury_gates.py \
  tests/test_injury_gates_integration.py tests/test_calendar_endpoint.py \
  tests/test_hermetic_home.py -q -p no:cacheprovider --timeout=120
```

Result: **109 passed**. The new timestamp matrix failed in 29 cases before the
fix. The gate tests also pass when the outer environment disables diagnostic
reruns. Calendar cases cover UTC and Pacific/Honolulu across a date/ISO-week
boundary. Timestamp cases additionally cover Europe/Berlin and exact window
boundaries.

A fresh locked headless development environment passed its earlier 33-check
profile verification. A clean server profile started Uvicorn, served health
and setup requests and exited on SIGTERM without Qt or pywebview installed.
The measured server site-packages footprint was 267,272,911 bytes at that smoke
run, not a container/AppImage-size measurement.

Read-only endpoint analysis still recognizes all 107 UI fetch paths, with
zero control misidentifications. The `/api` inventory remains 131 routes:
126 reached, three ambiguous and two not reached by repository UI. Those
unreached/ambiguous routes remain retained or deferred, not automatically
removed. Current AST source size is 66,542 lines across 54 modules versus
66,573 at baseline; the dead-code commit accounts for 30 of the net 31-line
reduction, with the separate timezone fix accounting for the other line.

## Full gate and remaining work

The final full gate is in progress. Its logs/status are stored under
`.git/verification/bloat-phase0.*` in this checkout so interruption does not
lose the evidence:

```sh
GATE_OUT="$PWD/.git/verification" GATE_WORKERS=4 GATE_RERUN_FAILURES=0 \
  bash tools/gate.sh "$PWD" bloat-phase0
```

Do not infer a passing full suite from focused results. The earlier run exposed
an incorrect permanent override in the first sandbox implementation; that was
corrected, and all 155 affected profile/account checks then passed. Subsequent
calendar/negative-offset failures reproduced on untouched `11cc77cb` and are
addressed by the separately reviewed #29/#30 changes.

No Forgejo runners were visible to the repository account during setup; the
remote workflow is not certified. Desktop/container artifacts, installed
native dependencies, startup/peak-memory comparisons, external consumers and
the broader planner/UI consolidation remain open. The overall repository has
additional safety tests, lock/configuration and audit documentation; the
runtime deletion metric is not a claim that total repository lines decreased.
