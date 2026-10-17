"""v1.7.4 — visible Sync button on the Plan tab.

User: "i reopen the app and have done some workouts this weekend. but
in current training plan theyre not there!"

Diagnosis: the auto-sync at boot fires once via the lazy ICU hook, but
its 1h throttle then blocks any subsequent sync within the same
session. The home-page header has a "Sync now ⟳" button that POSTs
``/api/rides/sync?force=1`` (bypasses the throttle) — but the user
spends most of their time on the Plan tab where the button was
invisible.

v1.7.4 wires the same handler to a Plan-tab button (``syncNowBtnPlan``)
and extends ``syncNowAction(btnId)`` to accept a button id so the
caller can choose which button to drive. Post-sync the handler now
also refreshes ``loadPlan()`` + ``loadWeeklyCalendar()`` (was only
``loadCalendar()``) so the Plan grid reflects newly-pulled actuals.
"""
from __future__ import annotations

from pathlib import Path

import app as app_module


def test_rides_sync_force_endpoint_registered():
    """Smoke-pin: the underlying force-sync endpoint must exist."""
    routes = [getattr(r, "path", "") for r in app_module.app.routes]
    assert "/api/rides/sync" in routes
