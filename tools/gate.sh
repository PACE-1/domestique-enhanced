#!/usr/bin/env bash
# Run the parallel suite and serial performance tail. Diagnostics never turn
# a failed run green: preserve collection, timeout and test failure statuses.
# Usage: gate.sh <worktree> <label> [baseline-label]
# GATE_PYTHON selects an installed test environment (default: .venv/bin/python).
set -uo pipefail
WT=${1:?worktree}; LABEL=${2:?label}; BASE=${3:-}
[[ "$LABEL" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
[[ -z "$BASE" || "$BASE" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 2
cd "$WT" || exit 2
PYTHON=${GATE_PYTHON:-$PWD/.venv/bin/python}
[[ -x "$PYTHON" ]] || { echo "Missing test interpreter: $PYTHON" >&2; exit 2; }
S=${GATE_OUT:-/tmp/domestique-gate}
mkdir -p "$S" || exit 2
OUT=$S/$LABEL
if [[ -n "$BASE" && ! -f "$S/$BASE.real.txt" ]]; then
    echo "Missing baseline: $BASE" >&2
    exit 2
fi
export PYTHONDONTWRITEBYTECODE=1 PYTHONHASHSEED=0
PYT=("$PYTHON" -m pytest -p no:cacheprovider)
date > "$OUT.full.txt"
timeout "${GATE_BULK_TIMEOUT:-3300}" "${PYT[@]}" tests/ -n "${GATE_WORKERS:-5}" \
    --dist loadfile -q -m "not hardware and not release_serial" \
    --timeout="${GATE_TEST_TIMEOUT:-900}" --tb=short -rfE >> "$OUT.full.txt" 2>&1
status=$?
bulk_status=$status
# An interrupted/invalid bulk run is already incomplete; do not spend another
# timeout window executing the tail or reruns. Ordinary failures still get it.
serial_status=not-run
if [[ "$bulk_status" -le 1 ]]; then
    timeout "${GATE_SERIAL_TIMEOUT:-3300}" "${PYT[@]}" tests/ -q \
        -m "not hardware and release_serial" --timeout="${GATE_TEST_TIMEOUT:-900}" \
        --tb=short -rfE >> "$OUT.full.txt" 2>&1
    serial_status=$?
    if [[ "$status" -eq 0 && "$serial_status" -ne 0 ]]; then
        status=$serial_status
    fi
fi
printf 'bulk=%s\nserial=%s\nexit=%s\n' "$bulk_status" "$serial_status" "$status" > "$OUT.status.txt"
grep -E '^(FAILED|ERROR) ' "$OUT.full.txt" | sed -E 's/^(FAILED|ERROR) //; s/ - .*//' \
    | sort -u > "$OUT.bad.txt"
# The historical list is diagnostic only, never an allow-list for success.
if [[ -f tests/known-failures-clean-main.txt ]]; then
    comm -23 "$OUT.bad.txt" <(sort tests/known-failures-clean-main.txt) > "$OUT.unknown.txt"
else
    cp "$OUT.bad.txt" "$OUT.unknown.txt"
fi
: > "$OUT.real.txt"; : > "$OUT.alone.txt"
if [[ "$bulk_status" -le 1 && "${GATE_RERUN_FAILURES:-1}" == 1 ]]; then
    while read -r test_id; do
        [[ -n "$test_id" ]] || continue
        rerun_id=$(printf '%s' "$test_id" | sha256sum | cut -c1-8)
        if timeout "${GATE_RERUN_TIMEOUT:-900}" "${PYT[@]}" -q --timeout=600 --tb=short "$test_id" \
            > "$OUT.rerun.$rerun_id.log" 2>&1; then
            echo "$test_id" >> "$OUT.alone.txt"
        else
            echo "$test_id" >> "$OUT.real.txt"
        fi
    done < "$OUT.unknown.txt"
fi
printf '== %s: bulk=%s serial=%s exit=%s\n' "$LABEL" "$bulk_status" "$serial_status" "$status"
tail -n 5 "$OUT.full.txt"
printf 'failed/error IDs: %s; not in historical list: %s\n' \
    "$(wc -l < "$OUT.bad.txt")" "$(wc -l < "$OUT.unknown.txt")"
if [[ -n "$BASE" ]]; then
    echo "-- new failures vs $BASE (diagnostic; does not change exit status):"
    comm -23 "$OUT.real.txt" <(sort "$S/$BASE.real.txt")
fi
exit "$status"
