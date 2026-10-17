#!/usr/bin/env bash
# Prove the bundled assets can stay read-only (#15): run the image with a
# read-only root filesystem, generate a plan, read it back and export a FIT.
# Only /data (the volume) and /tmp are writable.
# Usage: tools/verify_docker_readonly.sh [image]   (builds domestique-enhanced:readonly-check if omitted)
set -euo pipefail
cd "$(dirname "$0")/.."
IMG=${1:-}
if [ -z "$IMG" ]; then IMG=domestique-enhanced:readonly-check; docker build -q -t "$IMG" . >/dev/null; fi
TOKEN=readonly-check-token; VOL=de-readonly-$$; NAME=$VOL-srv; PORT=22493
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker volume rm "$VOL" >/dev/null 2>&1 || true; }
trap cleanup EXIT
api() { curl -s -m 120 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -X "$1" ${3:+-d "$3"} "http://127.0.0.1:$PORT$2"; }
docker volume create "$VOL" >/dev/null
docker run -d --name "$NAME" --read-only --tmpfs /tmp -p 127.0.0.1:$PORT:22400 -v "$VOL":/data \
  -e SHEPHERD_ACCESS_TOKEN=$TOKEN "$IMG" >/dev/null
for _ in $(seq 1 60); do curl -sf -m 2 "http://127.0.0.1:$PORT/healthz" >/dev/null && break; sleep 1; done
curl -sf -m 2 "http://127.0.0.1:$PORT/healthz" >/dev/null || { docker logs "$NAME" >&2; echo "server did not start read-only" >&2; exit 1; }
# Control: prove the root filesystem really is read-only, so a pass means something.
if docker exec "$NAME" sh -c 'touch /app/src/.write-probe' 2>/dev/null; then
  echo "control failed: /app is writable" >&2; exit 1
fi
api POST /api/profiles/create '{"name":"Readonly Rider","color":"#22c55e"}' >/dev/null
ID=$(api GET /api/profiles | python3 -c "import json,sys; print([p['id'] for p in json.load(sys.stdin)['profiles'] if p['name']=='Readonly Rider'][0])")
api POST /api/profiles/switch "{\"id\":\"$ID\"}" >/dev/null
api POST /api/setup/save '{"ftp":250,"weight":70}' >/dev/null
GEN=$(api POST /api/plan/generate '{"goal":"general","weeks":8,"rest_days":[0]}')
echo "generate: $(echo "$GEN" | head -c 160)"
SESSIONS=$(api GET /api/plan | python3 -c "
import json,sys
d=json.load(sys.stdin)
n=0
def walk(x):
    global n
    if isinstance(x,dict):
        if x.get('zwo_file') or x.get('workout_file'): n+=1
        for v in x.values(): walk(v)
    elif isinstance(x,list):
        for v in x: walk(v)
walk(d); print(n)")
echo "plan sessions with a workout file: $SESSIONS"
FIT=$(curl -s -m 60 -o /tmp/ro-probe.fit -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:$PORT/api/export/fit-workout?session_type=z2&duration_min=60&name=probe&zwo_file=endurance_steady_55pct_60min.zwo")
echo "fit export status: $FIT, $(wc -c < /tmp/ro-probe.fit) bytes"
ERR=$(docker logs "$NAME" 2>&1 | grep -c -i -E "read-only file system|EROFS|E_GENERATED_WORKOUT_UNWRITABLE" || true)
echo "read-only write errors in log: $ERR"
[ "$SESSIONS" -gt 0 ] && [ "$FIT" = "200" ] && [ "$ERR" = "0" ] \
  && echo "READONLY OK: plan generated and FIT exported with a read-only root filesystem" \
  || { echo "READONLY CHECK FAILED" >&2; exit 1; }
