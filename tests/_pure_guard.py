"""pytest plugin for the pure suite (#8): fail the run if anything imported the app.

Loaded with ``-p _pure_guard`` by tools/run_pure_tests.sh. A test that reaches
``import app`` (directly or through a module it imports) does not belong in
tests/pure_files.txt: it needs the integration setup in tests/conftest.py.
"""
import sys


def pytest_sessionfinish(session, exitstatus):
    heavy = [m for m in ("app", "launcher", "fastapi") if m in sys.modules]
    if heavy:
        print(f"\npure suite imported {', '.join(heavy)}: move the offending file out of "
              "tests/pure_files.txt", file=sys.stderr)
        session.exitstatus = 1
