#!/usr/bin/env bash
# Fast, hermetic run of the tests that never import the app (#8).
#   tools/run_pure_tests.sh [pytest args]
# Skips tests/conftest.py (which imports the whole application) and applies only
# the sandbox in tests/_sandbox.py. The run fails if anything imports app.py.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PURE_PYTHON:-${GATE_PYTHON:-python}}
FILES=$(sed 's#^#tests/#' tests/pure_files.txt | tr '\n' ' ')
PYTHONPATH=tests PYTHONHASHSEED=0 PYTHONDONTWRITEBYTECODE=1 exec "$PY" -m pytest $FILES \
  -p _sandbox -p _pure_guard --confcutdir=tests/pure -q -p no:cacheprovider \
  -m "not hardware and not release_serial" --timeout="${PURE_TIMEOUT:-300}" \
  ${PURE_WORKERS:+-n "$PURE_WORKERS" --dist loadfile} "$@"
