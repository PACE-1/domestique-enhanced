# Planner slot-selection boundary

Based on merged `clean-main` at `0867dc0a` (includes #53). This change is
independent of the summary-delivery PR #55; both target `clean-main` directly.

## Change

`week_plan.sampler_slots` owns the sampler's seven-day slot layout, daily minute
caps, preferred Tue/Thu/Sat hard days and shuffled fallback selection. The
caller supplies its existing RNG. The helper reads the week context and budget,
without loading profile data or mutating either input. No new module,
dependency, global state or persistence format is introduced.

The sampler still owns workout pools, candidate weighting, random workout
picks, counters and week repair. Repair/solver callbacks now read the minute
caps already resolved in the seven slots, so those stages use the same caps
as initial selection. Every weekday occurs once in that layout, including a
mid-week start. Repair caps are now a per-week snapshot rather than being recalculated
from the possibly mutable daily-hours dictionary during repair.

The late-repair duration-cap connection is covered by the full-plan comparison.
AST comparisons also confirm that the blueprint builder and other planner
functions remain unchanged.

This is a structural step in the planner roadmap, not a policy change:

- Same requested hard-count bounds, availability/rest precedence and gap rule.
- Same per-day overrides and weekday/weekend defaults, including zero caps.
- Same `randint`/`shuffle` order and no RNG draw on a stepback week.
- No candidate-weight, safety-threshold, goal or workout-policy change.

## Measurements

Physical LOC includes blanks/comments. Complexity is the existing AST tool's
branch-node count, not standard cyclomatic complexity.

| Measure | Before | After |
|---|---:|---:|
| `sample_week_workouts` span | 1,080 | 1,035 |
| Sampler branch-node complexity | 284 | 265 |
| Slot-selection helper span / complexity | embedded | 61 / 22 |
| `training_planner.py` physical LOC | 16,415 | 16,370 |
| `week_plan.py` physical LOC | 816 | 879 |
| Net production LOC | — | **+18** |

Maintained source is **90,730** lines on this branch versus 90,712 in its
base. With the independent summary delivery also landed it would be 90,751.
This stage creates a behavior-checked boundary for further sampler work; it
does not claim that the full sampler or wider cleanup is complete.

## Verification

- **21,504 differential cases** compare the extracted code with the original
  block: all 128 availability masks × seven start weekdays × stepback on/off
  × four hard-count ranges × three seeds. Slot tuples, hard-slot indices and
  the complete final RNG state match. Payload SHA-256:
  `8967171c0463a6388de4a162d97ffedd2ce26dbd37ca3e728b1824cd829802ac`.
  Local probe: `/tmp/check_planner_slots.py` with the original block saved at
  `/tmp/planner-slots-original-block.py`.
- **209 characterization cases** (49 builders, 80 owner0, 80 owner1), run in
  separate hermetic Python processes before and after. Serialized outputs,
  served files and invariant findings match exactly; no case raised. SHA-256:
  `c1ed8e37a7e13882e7c6a37d5251c6d8fded977ff36378afbbcc4a9a23793ee9`.
  The tracked golden was not modified or blessed. Local snapshots:
  `/tmp/planner-slots-before.json` and `/tmp/planner-slots-after.json`.
- Focused slot, week-context and stepback tests: **32 passed**, five subtests
  passed. Tests cover RNG consumption, caps, rest precedence, input preservation
  and all availability masks for each starting weekday.
- Solver-enabled comparison of the original and refactored sampler: weekday,
  weekend-heavy and event plans match with `_USE_WEEK_SOLVER=True`.
- Full local Linux gate at code `fc7bc884`: **4,003 bulk passed**, 7 skipped,
  20 expected failures, 13 non-strict unexpected passes and 26 passed subtests;
  **3 serial passed**. Status: `bulk=0`, `serial=0`, `exit=0`.
  Bulk took 558.76 seconds; serial took 3.91 seconds. Logs:
  `/tmp/shepherd-gate/planner-slots-final.*`.
  Hosted PR CI is a separate result. Web source is unchanged by this layer.
