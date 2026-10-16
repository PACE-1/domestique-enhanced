# API inventory for the Home and Plan workflows (roadmap #10, first criterion)

Measured at `clean-main` 2026-10-16 from `src/templates/dashboard.html` (every
`fetch(` with a literal URL, 161 calls) cross-referenced with the route table in
`src/app.py` (141 routes). The owner chose Home and Plan as the first workflows
to migrate to the TypeScript UI (#3, #25).

**Typing today:** of the 40 endpoints the legacy Home and Plan code reaches, 1
declares a response model (`GET /api/sync/progress`). Of all 141 routes, 12 do.
The new UI under `web/` has screens only for setup, profiles and DFA, so Home and
Plan have no TypeScript counterpart yet.

## Reads (17)

| Endpoint | Handler | Used for |
|---|---|---|
| `GET /api/plan` | `api_plan` | the stored plan, phases and weeks |
| `GET /api/plan/preview` | `api_plan_preview` | dry-run of a plan before saving |
| `GET /api/plan/daily-adapt` | `api_plan_daily_adapt` | today's suggested adaptation |
| `GET /api/plan/entry-scan` | `api_plan_entry_scan` | where a rider with history enters a plan |
| `GET /api/programme/summary` | `api_programme_summary` | programme summary card |
| `GET /api/rider-stats` | `api_rider_stats` | CTL, ATL, TSB, FTP header |
| `GET /api/metrics/history` | `api_metrics_history` | fitness history chart |
| `GET /api/wellness` | `api_wellness` | HRV, resting HR, sleep |
| `GET /api/daily-log` | `api_daily_log` | rider's daily notes |
| `GET /api/event/projection` | `api_event_projection` | projected form on event day |
| `GET /api/activities/blocks` | `api_activities_blocks` | ridden blocks |
| `GET /api/rides` | `api_rides` | ride list for the calendar |
| `GET /api/icu/races` | `api_icu_races` | races read from intervals.icu |
| `GET /api/sync/status`, `/api/sync/progress` | `api_sync_status`, `api_sync_progress` | sync state |
| `GET /api/version`, `/api/update/check` | `api_version`, `api_update_check` | version and update banner |

## Commands (23)

Plan writers, all behind the plan lock (`plan_write_lock_async`) except where
noted:

| Endpoint | Side effects |
|---|---|
| `POST /api/plan/generate` | builds and replaces the plan (worker thread, #48) |
| `POST /api/plan/regenerate` | rebuilds from today around owned sessions |
| `POST /api/plan/auto-recalc` | recalculate, may extend a continuous plan |
| `POST /api/plan/reforecast`, `/api/plan/auto-adjust` | adjust remaining weeks to load |
| `POST /api/plan/save-availability` | rewrites availability, then reforecasts |
| `POST /api/plan/update`, `/swap-type`, `/move-session`, `/dismiss-session`, `/mark-unavailable`, `/rematch` | single-session edits |
| `POST /api/plan/re-draw`, `/preview-redraw`, `/accept-redraw` | redraw a week (preview does not write) |
| `POST /api/plan/add-race`, `/ftp-test-type`, `/continuous/deload-revert` | goal and test edits |
| `POST /api/readiness/apply-tier-down`, `/revert-cap` | readiness cap on a session |
| `POST /api/today-session/persist` | pins today's session |
| `POST /api/daily-log` | writes the rider's note |
| `POST /api/profile/update-ftp` | writes FTP (single owner, gated) |

## Findings for the contract work

- **Every plan command is `async def`** and returns an ad-hoc dict; errors are a
  mix of `{"error": ...}`, `{"detail": ...}` and bare HTTP exceptions. The first
  contract decision is one error shape.
- **Reads are all plain `def`** (threadpool), so they are safe to type without
  changing concurrency.
- The plan JSON (`GET /api/plan`) is the shared object under almost every Home
  and Plan call. Typing it once (goal, phases, weeks, sessions) covers most of
  the 40 endpoints; the codec in `training_planner` (`goal_to_dict`,
  `session_to_dict`) is the existing source of truth and should generate the
  model, not be re-described by hand.

## Proposed first slice

Type the Home reads only (`/api/rider-stats`, `/api/programme/summary`,
`/api/plan`, `/api/wellness`, `/api/metrics/history`) with Pydantic models taken
from the existing codecs, regenerate `web/src/api/schema.d.ts`, and build the
React Home screen on them. No command is touched in the first slice; Plan edits
follow once the plan model exists.
