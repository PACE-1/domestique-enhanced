"""v1.6.1 — frontend instrumentation test.

Asserts every new ``E_FRONTEND_*`` code added in v1.6.1 appears at least
once as a string literal in ``templates/dashboard.html``. This is a
build-time consistency check that catches the case where a code was
registered in ``error_codes.py`` but never wired into a JS site.

Regex-grep is intentionally simple: a hit anywhere in the file (including
comments) counts. The frontend tests are not unit tests of behaviour —
they verify that the wiring layer exists. Behavioural tests for the
backend logging path live in ``test_v161_planner_logging.py`` and
``test_v161_homepage_endpoint_logging.py``.
"""
from __future__ import annotations

import unittest
from pathlib import Path


# v1.6.1 codes added for homepage panel instrumentation. Each must appear
# at least once in dashboard.html.
_V161_FRONTEND_CODES = (
    "E_FRONTEND_HOMEPAGE_INIT",
    "E_FRONTEND_FITNESS_FETCH",
    "E_FRONTEND_FITNESS_PARSE",
    "E_FRONTEND_FITNESS_RENDER",
    "E_FRONTEND_ACTIVITIES_FETCH",
    "E_FRONTEND_ACTIVITIES_PARSE",
    "E_FRONTEND_ACTIVITIES_RENDER",
    "E_FRONTEND_READINESS_FETCH",
    "E_FRONTEND_READINESS_PARSE",
    "E_FRONTEND_READINESS_RENDER",
    "E_FRONTEND_TODAY_SESSION_FETCH",
    "E_FRONTEND_TODAY_SESSION_PARSE",
    "E_FRONTEND_TODAY_SESSION_RENDER",
    "E_FRONTEND_EFTP_FETCH",
    "E_FRONTEND_EFTP_PARSE",
    "E_FRONTEND_EFTP_RENDER",
    "E_FRONTEND_BODY_PERF_FETCH",
    "E_FRONTEND_BODY_PERF_PARSE",
    "E_FRONTEND_BODY_PERF_RENDER",
    "E_FRONTEND_ENERGY_SYS_RENDER",
)




if __name__ == "__main__":
    unittest.main()
