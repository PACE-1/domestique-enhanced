#!/usr/bin/env bash
# Build a Shepherd image from a git ref and (re)start it as a local test container.
# Usage: tools/test-container.sh [ref]     (default: enhanced/clean-main)
# Builds from `git archive`, so uncommitted work in this checkout never leaks in.
# Open http://127.0.0.1:22420 . Data lives in the shepherd-test-data volume and
# survives rebuilds; wipe it with: docker volume rm shepherd-test-data
set -euo pipefail
cd "$(dirname "$0")/.."
REF=${1:-enhanced/clean-main}
NAME=shepherd-test PORT=${SHEPHERD_TEST_PORT:-22420}
git fetch -q "${REF%%/*}" 2>/dev/null || true
SRC=$(mktemp -d); trap 'rm -rf "$SRC"' EXIT
git archive "$REF" | tar -x -C "$SRC"
docker build -q -t shepherd:test "$SRC" >/dev/null
docker rm -f "$NAME" >/dev/null 2>&1 || true
# Local test only: loopback publish, so server mode (token login) is off.
docker run -d --name "$NAME" --restart unless-stopped \
  -p "127.0.0.1:$PORT:22400" -v shepherd-test-data:/data \
  -e SHEPHERD_SERVER_MODE=0 shepherd:test >/dev/null
for _ in $(seq 1 40); do
  curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && { echo "up: http://127.0.0.1:$PORT ($(git rev-parse --short "$REF"))"; exit 0; }
  sleep 2
done
docker logs --tail 30 "$NAME"; exit 1
