# Planner entry points: call map (roadmap #24)

Read-only map at `2986d492`-plus-#69/#70 (`d2017ccc`), 2026-10-16. Static AST
reachability over `src/training_planner.py` and `src/app.py`; no planner code
changed. It extends the pass-by-entry-point table in [planner-audit.md](planner-audit.md).

## Entry points

| Function | Lines | Span | Planner functions reached | Called from (HTTP route or app helper) |
|---|---|---:|---:|---|
| `generate_plan` | 8618-9321 | 704 | 130 | `POST /api/plan/generate` (inside `_generate_locked`) |
| `regenerate_from_today` | 13333-13843 | 511 | 114 | `_regenerate_plan_dict` |
| `recalculate_plan` | 13954-14440 | 487 | 126 | `POST /api/plan/auto-recalc` |
| `extend_continuous_plan` | 14447-14783 | 337 | 102 | only through `recalculate_plan` |
| `refit_remaining_week` | 14822-15230 | 409 | 82 | `_apply_refit_to_plan` |
| `reforecast` | 11828-12539 | 712 | 39 | through `reforecast_dict` (95 lines) |
| `sample_week_workouts` | 7415-8449 | 1,035 | 30 | the week builder under all of the above |

`reforecast_dict` is the busiest door: `POST /api/plan/reforecast`,
`/api/plan/auto-adjust`, `/api/plan/save-availability`,
`/api/readiness/apply-tier-down`, and the redraw-accept, plan-update and
session-type-swap helpers all go through it.

## What is already shared

26 functions are reached from every one of the seven doors (`reforecast_dict` and `extend_continuous_plan` counted separately, `sample_week_workouts` not), about 1,540 lines: library
loading and indexing (`_load_library_dir`, `_read_library_index`), workout
matching and scoring (`_match_zwo_unclamped` 523 lines, `score_workout`,
`file_admissible`), content classification and a few race/hit helpers. Dozens
more are reached from five or six: budgets (`scale_budget_to_week`,
`_budgets_for_model`, `budget_table`), `_repair_week`, `_enforce_slot_file_coherence`,
`_space_hard_days_across_plan`, `sample_week_workouts`.

So the duplication is not matching or budgets. It is the sequence of policy
passes each entry point runs after a week is sampled, and the ~330 to 700 lines
of orchestration around it. The pass gaps are in planner-audit.md.

## Reading

- `extend_continuous_plan` is a sub-step of `recalculate_plan`, not a separate door.
- `reforecast` is the odd one out: 39 reached functions against 82 to 130. It
  adjusts an existing plan and shares few build passes by design.
- Three builders (`generate_plan`, `regenerate_from_today`, `recalculate_plan`)
  reach 114 to 130 functions each and overlap heavily; they are the
  consolidation candidates. `refit_remaining_week` (one week) and `reforecast`
  are different operations and should stay separate.

## Proposed order, smallest risk first

1. **Explain the one changed characterization case**
   (`event/wkend3h/reforecast@21`, planner-audit.md). Nothing is consolidated
   while the baseline has an unexplained difference.
2. **Measure each pass gap at runtime** with the existing characterization
   harness: run the skipped pass on regenerate, refit and reforecast output and
   count the weeks it would change. A gap with zero changed weeks is documented
   as intentional; a gap with changes is a defect to fix in its own reviewed PR.
3. **Only then** extract a shared pass sequence for the three builders, keeping
   each one's inputs explicit, with planner fingerprints unchanged. No `--bless`.

Not in this map: the dormant solver, seal and repair switches (planner-audit.md),
and the intensity-ceiling fix, which is a separate reviewed algorithm change.
