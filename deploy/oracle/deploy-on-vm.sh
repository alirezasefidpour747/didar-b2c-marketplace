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
"${compose[@]}" pull postgres redis
# Native ARM source builds select ARM-specific optional binaries from the frozen lockfile.
# One source target at a time keeps builds within the 2 OCPU / 12 GB VM budget.
"${compose[@]}" build api
"${compose[@]}" build storefront
for image in didar-gold-api:staging didar-gold-storefront:staging; do
  test "$(docker image inspect --format '{{.Architecture}}' "$image")" = arm64
done
"${compose[@]}" up -d --no-build
python3 - <<'PY'
import json,time,urllib.request
for _ in range(60):
    try:
        with urllib.request.urlopen('http://localhost:3000/api/didar/catalog',timeout=5) as r:
            assert len(json.load(r)['products']) >= 4
        with urllib.request.urlopen('http://localhost:9000/health',timeout=5) as r:
            assert r.read()==b'OK'
        print('PASS: ARM64 staging API and storefront functional requests')
        break
    except Exception: time.sleep(2)
else: raise SystemExit('Staging readiness failed; inspect docker compose logs')
PY
printf '%s\n' 'Staging listens only on VM loopback. Use verified SSH tunneling for access; no public production endpoint was created.'
