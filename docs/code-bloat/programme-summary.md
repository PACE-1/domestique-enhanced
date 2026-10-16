# Programme summary separation

Follow-up to the closeout review, based on `a6b07cdd` (PR #53). That PR's
migration cleanup and test-isolation fix are prerequisites; this layer does
not merge or duplicate them.

## Change

`app._build_programme_summary` now owns only profile reads and error fallbacks.
`programme_summary.py` takes supplied data and owns window selection, metric
boundary selection, normalization, and the calculations for the response.
The existing application entry point and ride-date helper remain available.
The JSON and PNG endpoints continue to call the same application entry point.

The new calculation module imports neither the application, database nor
profile manager. It introduces no registry, cache, global provider, dependency,
or persisted schema. FIT/ICU normalization uses shallow copies so rendering a
summary no longer adds `summary` or `zones` keys to loader-owned ride records.
Nested data is only read. Tests verify both input preservation and calculation
from supplied snapshots with profile-read functions made unavailable.

Existing response rules remain, including:

- Empty-plan shape and continuous plans' trailing 28-day window.
- Metric selection before/after a boundary with nearest-edge fallbacks.
- FIT summaries, flat ICU records and exclusion of the sweet-spot overlay.
- Existing eFTP versus mean-max power field aliases, zone bands, rounding and
  empty values. Their differing conventions are preserved, not reconciled here.
- Seven-day trend bins anchored to the recap start, including daily-log values
  beyond the end of a short final bin, as before.

Database reads now happen in the adapter before the supplied-data calculations.
A malformed record can therefore fail after the daily-log read rather than
before it. Database read errors retain their existing empty-data fallbacks;
there are no new writes. The window receives an explicit date snapshot.

## Measurements

Physical lines include blanks and comments, consistent with the closeout table.
Complexity is the existing AST tool's branch-node count, not standard cyclomatic
complexity. Splitting a function does not remove every branch from the feature.

| Measure | Before | After |
|---|---:|---:|
| Application builder span | 449 | 48 |
| Application builder branch-node complexity | 189 | 16 |
| Largest calculation function span | within the 449-line builder | 65 |
| Highest calculation function branch-node complexity | within the builder | 20 |
| `app.py` physical lines | 20,845 | 20,439 |
| New calculation module physical lines | 0 | 427 |
| Net production LOC | — | **+21** |

This is a structural refactor, not a net LOC reduction. Maintained application
source on this stack becomes **90,733** lines, from **90,712** after #53.
The remaining planner and legacy UI workstreams stay open. The full planner
sampler should first get behavior comparisons that preserve RNG draws and
state mutation order; it is not changed by this layer.

## Verification

- Existing endpoint, mixed-ride, continuous-window, empty-state and PNG tests,
  plus supplied-data/input-preservation and metric-boundary checks:
  **22 passed**.
- One-off differential probe against the actual function at `a6b07cdd`:
  **500 cases matched**, comparing serialized JSON (including numeric types) or exception type and
  message. Deterministic seed 91827; fixed date 2026-10-15; event/general/
  continuous windows, empty plans, mixed FIT/ICU rides, phase compliance,
  effort aliases, zone errors, missing histories and failing data readers.
  Serialized outcomes SHA-256:
  `3e336668b5c0358aff9ac540962272d70e6cdb40e9f7a6d5027043e38b6a7bfd`.
  Local probe: `/tmp/check_programme_summary.py`; it loads the test bootstrap
  before the app and supplies mocked reads, never real rider data.
- Full local Linux gate at code `b1f6753d`: **3,999 bulk passed**, 7 skipped,
  20 expected failures, 13 non-strict unexpected passes and 26 passed subtests;
  **3 serial passed**. Status: `bulk=0`, `serial=0`, `exit=0`.
  Bulk took 556.71 seconds; serial took 3.87 seconds. Logs are
  `/tmp/domestique-gate/programme-summary-final.*`.
- Web code is unchanged by this layer. Hosted CI is separate: the current
  workflow filters PRs to `clean-main`, so a PR targeting #53's branch needs
  retargeting after that prerequisite lands before its hosted gate runs.
