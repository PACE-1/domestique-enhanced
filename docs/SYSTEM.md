# Domestique — System Documentation

*Evidence-based indoor cycling training platform — your training domestique*

---

## Project Overview

Domestique (formerly ChickenCycling) is an indoor cycling training platform with smart trainer control, structured workouts, virtual routes, and evidence-based training planning. It combines a local Python backend with a vanilla JavaScript frontend (no npm, no build step) and a rich library of workouts, route profiles, and nutrition data.

Key capabilities:

- Smart trainer control over ANT+ FE-C (ERG and simulation modes)
- Structured workout execution with live power, HR, and cadence telemetry
- Virtual cycling routes with interactive elevation profiles and gradient simulation
- Real-world climb profiles converted to GoldenCheetah-compatible CRS files
- Evidence-based training plan generator (FTP / VO2max / Hybrid / Event goals)
- Weekly mesocycle planner with HRV-guided daily adjustment (Plews protocol)
- Rolling adaptive plan with automatic recalculation based on actual training load
- Intervals.icu integration for CTL, ATL, TSB, HRV, and activity import
- Nutrition tracking with evidence-based targets (IOC/Burke carbohydrate periodization, ISSN protein)
- ZWO and FIT workout export for third-party devices (Karoo, Garmin, Wahoo)

---

## Architecture

```
Backend (pure Python, no build step)
├── app.py                      → Flask app, HTTP routes, WebSocket telemetry
├── training_planner.py         → Periodised plan generator (base → build → peak → taper)
├── training_live.py            → Live workout execution engine
├── workout_picker.py           → Readiness-aware workout selector
├── power_control.py            → ERG / simulation mode control loop
├── trainer_connection.py       → ANT+ FE-C smart trainer interface
├── readiness.py                → Composite readiness score (HRV, TSB, sleep, RHR, subjective)
├── training.py                 → Intervals.icu API client (CTL/ATL/TSB/ACWR/monotony/strain)
├── sleep.py                    → Sleep and HRV analysis (LnRMSSD 7d vs SWC)
├── targets.py                  → Dynamic daily nutrition targets by training type
├── nutrition_planner.py        → Carbohydrate and protein periodization
├── nutrition_db.py             → Open Food Facts cache + local fallback DB
├── profile_manager.py          → Multi-athlete profile storage
├── ride_storage.py             → Local ride history persistence
├── fitness_estimation.py       → FTP / CP / VO2max estimators
├── simulate_ride.py            → Offline ride simulation for testing
├── running_zones.py            → Running pace/HR zone model
├── generate_procedural_routes.py → Procedural virtual route generator
├── rebuild_routes_json.py      → Rebuild route index from course files
└── gpx_to_gc.py                → GPX → GoldenCheetah CRS converter (elevation smoothing)

Frontend (TypeScript)
├── ../web/                     → React 19 + Tailwind + shadcn app, built to web/dist and served under /v2
└── assets/                     → Icons and static images
```

The server redirects `/` to the web app. `pnpm build` in `web/` must run before the server or a packaged build starts.

---

## Data Directories

| Path | Contents | Notes |
|---|---|---|
| `workouts/` | Scientific interval template library (~1,750 workouts across endurance, sweet spot, threshold, VO2max, anaerobic, sprint, over-unders, tempo, recovery, mixed) | Classified by training stimulus, not dominant zone |
| `sports_nutrition_db.json` | 284-product sports nutrition database | Data derived from Open Food Facts — ODbL attribution (see NOTICE) |

---

## User Data (never committed)

All per-user state lives under `~/.domestique/`:

```
~/.domestique/
├── profiles/        → Athlete profiles (FTP, LTHR, max HR, weight, preferences)
├── rides/           → Local ride history (telemetry recordings, summaries)
├── plans/           → Active and archived training plans
├── nutrition/       → Daily food logs and target overrides
└── config.json      → API keys (Intervals.icu), data path overrides
```

The repository itself ships no personal data. First launch runs a 5-step setup wizard (Intervals.icu connection, athlete profile, data paths, training preferences).

---

## Key User-Facing Features

- **First-launch setup wizard** — Intervals.icu connect, profile creation, data path selection, training preferences
- **Desktop app packaging** — macOS `.app` and Windows `.exe` via PyInstaller, system-tray launcher
- **Live training** — ERG mode for structured workouts, simulation mode for virtual/real routes, live power/HR/cadence/gradient
- **Workout library** — ~1,750 scientific interval templates, filterable by stimulus, duration, TSS, and zone
- **Training plan generator** — Backwards periodization from event date, phase schedule, weekly TSS targets
- **Weekly planner** — Fills 7-day schedules with concrete workouts, respects HIT spacing, zone balance, and time budget
- **Daily adapter** — Rebalances the week based on morning readiness, HRV, and actual completed load
- **Rolling plan recalculation** — Adjusts remaining weeks after deviations (missed sessions, unexpected illness, travel)
- **Morning check-in** — Subjective readiness, soreness, sleep, RHR, HRV — folded into a composite score
- **Nutrition targets** — Periodised kcal, carbs, protein, fat by day type; tracks energy availability vs LEA/RED-S thresholds
- **Workout export** — ZWO (smart-trainer apps) and FIT (Karoo, Garmin, Wahoo)
- **Light/dark mode** — Follows system preference, manual override available

---

## Training Logic Summary

The training engine implements standard endurance-science models — details and peer-reviewed references live in `SCIENCE_REVIEW.md` and `RESEARCH_TRAINING_PLANNER.md`.

- **Load model:** Banister/Coggan CTL (42-day EWMA), ATL (7-day EWMA), TSB = CTL − ATL
- **Injury risk:** ACWR via EWMA (Williams 2017), sweet spot 0.85–1.15 (Cao 2025 meta-analysis)
- **Overtraining:** Foster monotony/strain, Plews/Buchheit HRV SWC ±0.5 SD
- **Intensity distribution:** Seiler 80/20 polarized target with Stöggl 2014 "black hole" avoidance
- **HIT protocols:** Helgerud 4×4, Seiler 4×8, Rønnestad 30/15 micro-intervals, Bossi alternating, over-unders
- **Periodization:** Linear base → build → peak → taper with Rønnestad block options, 4th-week step-back
- **Taper:** Mujika/Padilla 8–14 days, exponential volume decay, intensity maintained
- **Readiness formula:** 0.30 HRV + 0.20 TSB + 0.20 subjective + 0.15 sleep + 0.15 RHR

---

## Running It

```bash
# Install Python dependencies
pip install -r requirements.txt

# Launch the app
python3 app.py
# → first launch triggers the setup wizard

# Run the test suite
python3 -m pytest test_*.py
```

---

## Licensing

- Source code: see `LICENSE`
- Procedural routes in `courses/virtual/`: Apache-2.0
- Sports nutrition data in `sports_nutrition_db.json`: derived from Open Food Facts, ODbL — full attribution in `NOTICE`
- User-supplied GPX files and derived CRS profiles retain their original upstream licensing; users are responsible for respecting the terms of any data they import.
