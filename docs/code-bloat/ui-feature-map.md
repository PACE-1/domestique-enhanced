# Workflow map: legacy dashboard to the TypeScript UI (roadmap #3, #25)

One row per workflow. "New UI" is under `web/src`; "Legacy" is
`src/templates/dashboard.html`. Both are served today; this table is the
consumer map that decides what can be deleted.

## Seams the new UI shares

| Concern | Owner | Notes |
|---|---|---|
| Routing | `App.tsx`, hash routes (`#/home`, `#/plan`, …) | One tab per route; `AppShell` renders the section nav and the active profile id. |
| HTTP and errors | `lib/api.ts` (`api`, `apiFull`) | JSON in and out; any non-2xx throws `ApiError` carrying the server's `error` or `detail` text. `apiFull` also returns headers. |
| Loading, empty, failure | `screens/panel.tsx` (`useLoad`, `Panel`) and per-screen state | Every read shows Loading, then data, an empty sentence, or an alert with Retry. A failing card never blanks its neighbours. |
| Response types | `api/schema.d.ts`, generated from `tests/api_contract.json` | `tools/gen-api-types.sh`. `tests/test_api_contract.py` fails when a model drifts. See `docs/API.md`. |
| State | React state per screen; per-profile `localStorage` keys through `useShell().lsKey` | No module-level globals, no document-wide IDs, no polling timers. |
| Maintenance that ran on tab open | the server (`_after_background_sync`, `_maybe_auto_reforecast`) | The weekly recalc runs once a day from the sync loop; reforecast runs after ride sync. |

## Workflows

| Workflow | New UI | Main endpoints | Tests | Legacy behaviour not yet in the new UI (from the route list, not an exhaustive audit) |
|---|---|---|---|---|
| First-run setup | `Setup.tsx` | `/api/setup/*`, `/api/icu/connection` | vitest, e2e | none known |
| Profiles | `ProfilePicker.tsx`, `ProfileSetup.tsx` | `/api/profiles*` | vitest, e2e | none known |
| Home | `Home.tsx`, `Readiness.tsx`, `DailyCheckIn.tsx` | `/api/plan`, `/api/rider-stats`, `/api/programme/summary`, `/api/readiness`, `/api/today-session*`, `/api/daily-log` | vitest, e2e | HRV upload, morning log extras, retest nudges, blood markers and body metrics, event projection, fitness sparkline |
| Plan | `Plan.tsx`, `PlanGenerate`, `PlanTimeOff`, `PlanRace`, `PlanAvailability`, `PlanRematch`, `PlanRedraw` | `/api/plan*` | vitest, e2e | month calendar and drag to move, per-day availability grid, plan blueprint and custom bands, several events, start-date entry modes, calendar push to intervals.icu, plan preview |
| Workout Library | `Library.tsx`, `WorkoutCard.tsx` | `/api/workouts`, `/api/workout/*` | vitest, e2e | tag and content-class filters, bulk segment view, FIT export of a workout |
| Workout Shuffle | `Shuffle.tsx` | `/api/picker` | vitest, e2e | none known |
| Routes & Climbs | `Routes.tsx` | `/api/routes*`, `/api/course/*` | vitest, e2e | route suggestion, GPX upload, world cards, surface filter |
| Analysis | `Analysis.tsx`, `Chart.tsx` | `/api/wellness`, `/api/profile/power-curve`, `/api/rides` | vitest, e2e | ride detail, FIT import, ride notes and PRs, FTP-test review, fatigue resistance, energy-system chart |
| Settings | `Settings.tsx` | `/api/settings`, `/api/icu/connection`, `/api/sync*`, `/api/version`, `/api/update/check` | vitest, e2e | connect and disconnect intervals.icu, extra workout folders, custom zones, logs viewer, data export |
| DFA α1 | `Dfa.tsx` | `/api/profile/dfa-*` | vitest, e2e | none known |

## Retirement rule

A legacy block is deleted only when its row has an empty last column or each
item in it has a recorded reason to stay, and the rider has accepted the new
screen. Until then the legacy tab stays reachable and is the only home of the
behaviour listed above. Nothing in the legacy dashboard has been removed yet.
