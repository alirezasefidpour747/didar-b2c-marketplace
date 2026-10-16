#!/usr/bin/env bash
set -euo pipefail
unset DIDAR_DB_PASSWORD JWT_SECRET COOKIE_SECRET DIDAR_API_IMAGE DIDAR_STOREFRONT_IMAGE
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
root=${DIDAR_STAGING_ROOT:-/srv/didar-staging}
release=$(readlink -f "$root/current")
test -f "$release/DEPLOYED_COMMIT"
exec docker compose --project-name didar-staging-phase2 \
  --project-directory "$release" --env-file "$root/shared/staging.env" \
  --env-file "$release/.staging/images.env" -f "$release/.staging/compose.yaml" "$@"
