# Shared planned-power metric

Bounded task #32 under consolidation workstream #23. Both library scanners
now import `workout_facts.planned_power_np_fraction`; their previous private
callable names remain available as aliases. There is one implementation body,
no new module/dependency/flag, and no captured profile state.

The classifier's `compute_np` remains separate because it filters negative
FreeRide sentinels. Combining that input policy with the scanner primitive
would change behavior rather than simply remove duplication. Cache schemas,
windowing, thresholds and rounding are unchanged.

Measured change relative to the first-batch branch:

- 23 net production lines removed across three files.
- Structural clone groups: 10 → 9; candidate duplicated lines: 228 → 209.
- 1,006 deterministic differential cases agree exactly with **both** original
  functions, including short/complete windows, constant/duty-cycle series and
  seeded varying inputs. Seed: 20261015. No tolerance was needed.
- All 209 isolated planner fingerprints match the first-batch results exactly.
  SHA-256: `352a8b461bcff8fc1b6bec902e6eeef89b98e49483686f2150a3a8aebbbfb4fe`.
- Existing focused checks: **38 passed, 7 expected failures**, with no test
  deletion, schema bump or golden blessing.

Reproduce the focused behavior checks using the locked development environment:

```sh
python -m pytest tests/test_np_library_metric.py tests/test_score_sync.py \
  tests/test_workout_facts.py tests/test_library_consistency.py \
  -q -p no:cacheprovider --timeout=120
```

This changes only the primitive shared by the two scanners. It does not
consolidate the full XML parsers, all other numerical variants or all families
in #23. The original [inventory](README.md) and broader workstream remain open.
The full first-batch gate is recorded in [its receipt](verification.md); this
small consolidation is additionally checked by the differential comparison,
focused pipeline tests and isolated planner characterization.
