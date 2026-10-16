# Planner audit (roadmap #11, mapping for #24)

Measured at `0e3a10c2` (fork clean-main) on 2026-10-15. This is evidence, not a verdict: it records
what the code and the existing instruments say now. **No planner behaviour was
changed**, and no dormant switch was turned on.

## Switch states (read from source)

| Switch | Value | Where |
|---|---|---|
| `_USE_WEEK_SOLVER` | `False` | `src/training_planner.py:6744` |
| `_REPAIR_MAX_MOVES` | `0` | `src/training_planner.py:6702` |
| `STRICT_SEAL` | `False` | `src/week_plan.py:177` |
| `_USE_TRAINING_WEEK` | `False` | `src/training_planner.py:6553` |
| `_GENERATE_WHEN_LIBRARY_MISSES` | `False` | `src/training_planner.py:6554` |

All five are off in production. A disabled switch is not by itself a defect; the
solver, the repair passes and the seal are dormant designs that need a measured
comparison before adoption, deferral or removal (#24).

## The expected failure is still valid

`tests/test_tid_plan_properties.py::test_no_week_breaches_the_intensity_ceiling`
is `expectedFailure`. Re-measured with the test's own construction (3 shapes x 3
models, fixed pinned "today" 2026-09-14, 8 seeds, full non-stepback weeks only,
ceiling 18% of week minutes above 106% FTP):

| Rider | Model | Full weeks | Breaching | Worst week |
|---|---|---:|---:|---:|
| 6 h | pyramidal | 64 | 1 | 18.8% |
| 6 h | polarized | 64 | 2 | 23.0% |
| 6 h | threshold | 64 | 1 | 21.6% |
| 12 h | all three | 192 | 0 | 15.4% |
| 18 h | all three | 192 | 0 | 14.4% |

4 of 576 weeks breach (0.7%), all for the 6 h rider (4 of 192 = 2.1%). The
2026-09-14 note in the test reported 18% for that rider, so the gap has narrowed
but not closed. The fixture covers specific volumes and seeds; it does not
measure every real rider.

**Blocker, recorded:** closing it means making the weekly intensity budget a
build-time constraint ("Step 6", `hard_share`, in `notes/overhaul-plan.md`). That is
an intentional algorithm change that moves what riders are told to ride. It needs
its own reviewed change with before and after output, not a cleanup. The test
stays `expectedFailure`, so the gap stays visible.

## Characterization (frozen clock, seeds, hermetic data)

`tests/characterize_planner.py` over the current tree:

- builders: 49 cases, all unchanged
- owner0: 80 cases, **1 changed**: `event/wkend3h/reforecast@21`, week 3
  `['2026-10-07', 'z2', 21, 16.0, ...]` became `[..., 'rest', 0, 0.0, ...]`
- owner1: 80 cases, all unchanged

The single owner0 difference is explained (2026-10-16, bisected): `66bc75db`
("A rest day is never restored as a few-minute ride", #35) made `reforecast`
leave a day as rest when the restored session would be under the 30-minute
session floor. The golden still held the old 21-minute restored ride. The change
was an intended fix; the golden was re-blessed and the diff is exactly that one
session (`z2, 21 min, 16 TSS` becomes `rest`). The characterization baseline is
now clean: 49 builders, 80 owner0 and 80 owner1 cases, all unchanged. Afterwards the
`event/wkend3h/reforecast@21` case was removed (79 owner0 and 79 owner1): with the #35
floor the 3 h rider's week has no room to restore a rest day, so the case edited
nothing and the harness self-test rejected it. `--self-test` passes again.

## Entry points apply different policy passes

Static call reachability (every policy pass a function can reach through
module-level helpers). Not runtime evidence: an entry point may skip a pass on
purpose, or reach it under another name.

| Policy pass | generate | regenerate | recalculate | extend | refit | reforecast |
|---|---|---|---|---|---|---|
| `_apply_goal_emphasis` | x | x | x | x | x |  |
| `_apply_long_ride_target` | x | x | x |  |  |  |
| `_apply_race_week_shape` | x | x | x |  |  |  |
| `_apply_reentry_shape` | x |  |  |  |  |  |
| `_apply_rotation_penalty` | x | x | x | x | x |  |
| `_apply_secondary_event_tapers` | x | x | x |  | x | x |
| `_budget_fit_score` | x | x | x | x | x |  |
| `_budget_fit_weight` | x | x | x | x | x |  |
| `_budgets_for_model` | x | x | x | x | x |  |
| `_demote_hit_window` | x | x | x |  | x | x |
| `_enforce_build2_peak_hard_floor` | x |  | x | x |  |  |
| `_enforce_easy_slot_content` | x |  |  |  |  |  |
| `_enforce_event_taper_eve` | x | x | x |  | x | x |
| `_enforce_ronnestad_floor` | x |  | x | x |  |  |
| `_enforce_slot_file_coherence` | x | x | x | x | x |  |
| `_enforce_stepback_is_lightest` | x |  |  |  |  |  |
| `_enforce_weekly_hit_cap` | x |  | x | x |  |  |
| `_enforce_weekly_volume_ceiling` | x | x | x |  |  |  |
| `_repair_week` | x | x | x | x | x |  |

Reading it:

- No policy pass is reached from all six entry points. `_repair_week` and
  `_enforce_slot_file_coherence` are reached from five.
- `_enforce_weekly_hit_cap` is reached from generate, recalculate and extend, not
  from regenerate, refit or reforecast. `_enforce_stepback_is_lightest` and
  `_enforce_easy_slot_content` are reached from generate only.
- `reforecast` reaches three passes; `generate_plan` reaches nineteen.

These are **questions**, not findings. For each gap the next step is a runtime
check on a fixed clock: does regenerate or refit ever produce a week the skipped
pass would have changed? Only a measured difference justifies sharing a pass.
`plan_invariants` already reports findings per characterization case, so the
harness can answer this without new tooling.

## Post-seal writes and strictness

`STRICT_SEAL = False` is unchanged. The structural guarantee that nothing writes a
session after the week is sealed is therefore not enforced, and this audit did not
establish the supported amendment paths. Do not enable strictness until they are
mapped.

## What stays open

- Runtime comparison of the per-entry-point policy gaps above.
- The intensity-ceiling fix, as a separate reviewed algorithm change.
- Measured comparison before adopting, deferring or removing the dormant week
  solver, repair passes and seal.
