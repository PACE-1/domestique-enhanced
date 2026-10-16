#!/usr/bin/env bash
# Regenerate web/src/api/schema.d.ts from the typed-contract snapshot (#10).
# The snapshot itself comes from: python tools/dump_openapi.py > tests/api_contract.json
set -euo pipefail
cd "$(dirname "$0")/../web"
mkdir -p src/api
pnpm exec openapi-typescript ../tests/api_contract.json -o src/api/schema.d.ts
