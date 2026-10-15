#!/usr/bin/env bash
set -euo pipefail
manifest=$(mktemp)
trap 'rm -f "$manifest"' EXIT
failed=0
for image in node:24-bookworm-slim oven/bun:1.4.3 postgres:17-alpine redis:7-alpine; do
  if ! docker manifest inspect "$image" > "$manifest"; then
    printf '%s\n' "BLOCKED: cannot verify ARM64 manifest for $image" >&2
    failed=1
    continue
  fi
  python3 - "$image" "$manifest" <<'PY' || failed=1
import json,sys
x=json.load(open(sys.argv[2]))
assert any(m.get('platform',{}).get('os')=='linux' and m.get('platform',{}).get('architecture')=='arm64' for m in x.get('manifests',[])), 'ARM64 image variant not verified: '+sys.argv[1]
print('PASS linux/arm64 image manifest:',sys.argv[1])
PY
done
exit "$failed"
