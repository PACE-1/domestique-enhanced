# docs/

Documentation that doesn't fit at repo root: architecture notes,
science deep-dives, build guides, library provenance, and historical
planning artefacts.

| File | Category | Status | One-liner |
|---|---|---|---|
| `DEVELOPMENT.md` | Fork development | current | Linux dependency profiles, constraint lock and verification gate. |
| `SERVER.md` | Fork deployment | current | Server access policy, trusted origins, TLS and proxies, immutable assets. |
| `code-bloat/README.md` | Fork maintenance | current | Cleanup inventory and candidate ledger (updated per batch). |
| `code-bloat/verification.md` | Fork maintenance | measured at a commit | Verification receipt for the first cleanup batch. |
| `code-bloat/release-identity.md` | Fork maintenance | current | Which upstream identifiers the fork changed or kept, and why. |
| `SYSTEM.md` | Architecture & system | current | High-level system architecture (modules, data flow, persistence). |
| `DEBUGGING.md` | Architecture & system | current | Common diagnostic commands + log layout. |
| `SCIENCE.md`, `SCIENCE_REVIEW.md` | Science & research | current | Citation-by-citation review of the injury guardrails and the periodisation model. |
| `RESEARCH_TRAINING_PLANNER.md` | Science & research | reference | Source notes for the planner: Seiler / Mujika / Stoggl / Coggan / Friel / Allen. |
| `upgrading.md` | User guide | current | How to update an installed app. |
| `workout_sources.md`, `cycling_apps.md` | Library provenance | reference | Where the workout library comes from; free cycling apps that accept ZWO/FIT. |
| `workout_analysis.md` | Planning artefacts | historical | Original library audit before procedural generation filled the gaps. |
| `TRAINING_SCREEN_PLAN.md` | Planning artefacts | **obsolete** | A live trainer screen with Bluetooth control. The trainer subsystem was removed in v4.0.0-alpha. |

## Notes and reviews (`../notes/`, `../REFACTOR-PLAN.md`)

Everything there is **historical**: each file now opens with a banner giving the
date it was last changed. They record audits and plans, such as the 2026-09-14
review and `notes/slimdown-audit.md`, which was measured at `e6d52b7d` on
2026-09-16. Findings in them are evidence to re-check against the current code,
not a list of open defects. The current work list is the fork roadmap on GitHub
(issue #20 and the issues it links).

These files have no inbound links from `app.py` / `launcher.py` / any
build script. They are read by humans, not the app. A file's status is
judged against the current code, not its age.

The canonical user-facing top-level docs (`README.md`, `CHANGELOG.md`,
`LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `COURSES_LICENSE.md`,
`TRADEMARKS.md`, `CLAUDE.md`) stay at repo root by open-source
convention.
