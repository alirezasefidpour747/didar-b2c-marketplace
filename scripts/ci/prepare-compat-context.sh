#!/usr/bin/env bash
# Build tooling only; never mount a workspace or host Docker socket in applications.
set -euo pipefail
mode=${1:?edge or daemon}; destination=${2:?new context directory}
case "$mode" in edge) flag=--runtime-context;; daemon) flag=--daemon-context;; *) exit 2;; esac
test ! -e "$destination"
name="didar-compat-tool-$(date +%s)-$RANDOM"
base=debian:trixie-slim@sha256:918311b7b6c4c6f68b232ba516584925f6c78ad82b6fd534b98979df6438e483
id=$(docker create --name "$name" --label "didar.compat.tool=$name" --entrypoint /bin/sh "$base" -c 'trap "exit 0" TERM INT; while :; do sleep 1 & wait $!; done')
cleanup() {
  test "$(docker inspect --format '{{index .Config.Labels "didar.compat.tool"}}' "$id")" = "$name"
  if test "${compat_status:-0}" != 0; then docker exec "$id" cat /tmp/compat-context/process-exits.json >&2 || true; fi
  docker rm -f "$id" >/dev/null
}
trap 'compat_status=$?; cleanup' EXIT
docker cp scripts/deployment/nginx "$id:/tmp/nginx"
docker start "$id" >/dev/null
docker exec "$id" sh -c 'apt-get update && apt-get install -y --no-install-recommends python3 curl ca-certificates sqv debian-archive-keyring xz-utils'
docker exec "$id" python3 /tmp/nginx/compat/fetch-debian.py /tmp/compat-context "$flag"
docker cp "$id:/tmp/compat-context" "$destination"
