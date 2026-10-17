# Roadmap (working plan, 2026-10-17)

Source of truth for scope is the GitHub board and milestones; this file orders them and records dependencies.

## Rules for every item
- One branch and PR per issue (or per tight group). Local gate (`tools/gate.sh`) green before merge.
- Tests with the change: a failing test first for bugs, contract tests for new endpoints, vitest for new screens, one browser test per new screen.
- API changes: Pydantic response model, regenerate `tests/api_contract.json` and `web/src/api/schema.d.ts`.
- Running and swim numbers need a source: a named published method, reference values from it as tests, and a stated confidence. No invented coefficients.
- Planner output changes (#11, #24, #111, #113, #125) go up for review rather than straight to merge.

## Wave 0: reliability (milestone "Shepherd reliability")
| Issue | What | Notes |
|---|---|---|
| #140 | AI key carried to another provider | security, first |
| #141 | AI calls block the event loop | thread pool |
| #142 | Check-in edit deletes notes | server keeps stored notes |
| #143 | Missing ride returns 500 | return the 404 |
| #144 | Summary image downloads | open inline in a tab |
| #139 | Zwift upload errors | intervals.icu setting, not ours; hint added in Settings |
| #107 | CI mostly red | lint errors, Playwright smoke in CI |

## Wave 1: foundation and everyday experience
| Issue | What | Depends on |
|---|---|---|
| #109 | Multi-sport data model (sport on activities, per-sport thresholds, per-sport and combined load) | none; everything in waves 3 and 4 needs it |
| #145 | At-a-glance home for newer riders | none |
| #106 | Theme options | none |
| #105 | Guided onboarding | #145 helps |
| #130 | Mobile layout and installable web app | #145 |

## Wave 2: tools that work for every sport
| Issue | What | Depends on |
|---|---|---|
| #110 | Workout builder, push to Garmin through intervals.icu | #109 for run and swim targets; cycling part can ship first |
| #113 | Injury and illness, return ramp, ramp-rate warning | #109 |
| #111 | Race planner: A/B/C, taper, race-day plan | #109, #113 |
| #114 | Weight trend, W/kg history, power-duration model | none |
| #116 | Ride comparison | none |
| #129 | Data export and restore | none |
| #131 | Notifications | none |
| #127 | Strength and mobility sessions | planner |

## Wave 3: running and triathlon
Order: #118 zones, #119 load, #128 readiness across sports, #120 run workouts, #121 race predictor, #122 swim, #124 sport balance, #123 bricks, #125 race-distance plans, #126 open-water notes. All depend on #109.

## Wave 4: needs a decision or an outside system
- #112 fueling: pick a self-hosted tracker with a phone app and an API first; then integrate.
- #115 gear, #117 weather: integrations; weather needs a source and a location setting.
- #13 server exposure, #31 Garmin data via intervals.icu, #132 rest of the rebrand (detach fork, domain, trademark): external or owner decisions.
- #94, #9, #10, #11, #23, #24, #26, #16: maintenance and refactors from the earlier roadmap; planner ones need review.

## What "done" means for the large items
A vertical slice that works end to end and is tested, with the remaining scope written on the issue, beats a wide unfinished layer. Each issue is closed only when its own checklist is met.
