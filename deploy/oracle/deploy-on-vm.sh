#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# This script is run on an existing, eligible staging VM. It never provisions OCI resources.
python3 deploy/oracle/preflight.py
python3 deploy/oracle/check-dependencies.py
docker compose version >/dev/null
bash deploy/oracle/verify-images.sh
python3 deploy/oracle/init-env.py
compose=(docker compose -f compose.yaml -f deploy/oracle/compose.arm64.yaml)
"${compose[@]}" config --quiet
# Preserve pre-migration data and runnable images when updating an existing stack.
# A backup failure aborts the update before any migration is run.
if test -n "$("${compose[@]}" ps -q postgres)"; then
  bash deploy/oracle/backup.sh
fi
"${compose[@]}" pull postgres redis
# Native ARM source builds select ARM-specific optional binaries from the frozen lockfile.
# One source target at a time keeps builds within the 2 OCPU / 12 GB VM budget.
"${compose[@]}" build api
"${compose[@]}" build storefront
# Resolve tags through Compose so both shell and .env image overrides are inspected.
application_images=$("${compose[@]}" config --format json | python3 -c 'import json,sys; config=json.load(sys.stdin); print(config["services"]["api"]["image"]); print(config["services"]["storefront"]["image"])')
while IFS= read -r image; do
  test "$(docker image inspect --format '{{.Architecture}}' "$image")" = arm64
done <<< "$application_images"
"${compose[@]}" up -d --no-build
python3 - <<'PY'
import json,time,urllib.request
for _ in range(60):
    try:
        with urllib.request.urlopen('http://localhost:3000/api/didar/catalog',timeout=5) as r:
            data=json.load(r)
            assert isinstance(data.get('products'),list) and isinstance(data.get('rate'),dict)
        with urllib.request.urlopen('http://localhost:9000/health',timeout=5) as r:
            assert r.read()==b'OK'
        print('PASS: ARM64 staging API and storefront functional requests')
        break
    except Exception: time.sleep(2)
else: raise SystemExit('Staging readiness failed; inspect docker compose logs')
PY
printf '%s\n' 'Staging listens only on VM loopback. Use verified SSH tunneling for access; no public production endpoint was created.'
