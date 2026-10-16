#!/usr/bin/env bash
# Explicit commit only. No checkout/reset/pull of main, volume removal, or automatic restore.
set -Eeuo pipefail
umask 077
# Configuration comes from private files, and deployment always uses the local daemon.
unset DIDAR_DB_PASSWORD JWT_SECRET COOKIE_SECRET DIDAR_API_IMAGE DIDAR_STOREFRONT_IMAGE
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
root=${DIDAR_STAGING_ROOT:-/srv/didar-staging}
tools=$(cd -- "$(dirname -- "$0")" && pwd)
sha=${1:-}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: update.sh FULL_TESTED_COMMIT_SHA' >&2; exit 2; }
[[ $(uname -m) == x86_64 ]] || { echo 'Requires x86_64' >&2; exit 1; }
test -d "$root/repository/.git" || { echo 'Clone repository first; see README' >&2; exit 1; }
mkdir -p "$root/releases" "$root/backups" "$root/shared"
exec 9>"$root/.update.lock"
flock -n 9 || { echo 'Another staging update is running' >&2; exit 1; }
node "$tools/init-env.mjs"
docker compose version
# Reserve space for source builds plus a backup. Nothing is pruned automatically.
available=$(df -Pk "$root" | awk 'NR==2 {print $4}')
(( available >= 20 * 1024 * 1024 )) || { echo 'Need at least 20 GiB free; review disk usage manually' >&2; exit 1; }
git -C "$root/repository" fetch origin "$sha"
[[ $(git -C "$root/repository" rev-parse --verify "$sha^{commit}") == "$sha" ]]
stamp=$(date -u +%Y%m%dT%H%M%SZ)-$$
release="$root/releases/$stamp-$sha"
mkdir -m 700 "$release"
git -C "$root/repository" archive "$sha" | tar -x -C "$release"
mkdir -p "$release/.staging"
cp "$tools/Dockerfile" "$tools/compose.yaml" "$release/.staging/"
printf '%s\n' "$sha" > "$release/DEPLOYED_COMMIT"
printf 'DIDAR_API_IMAGE=didar-staging-api:%s\nDIDAR_STOREFRONT_IMAGE=didar-staging-storefront:%s\n' "$stamp-$sha" "$stamp-$sha" > "$release/.staging/images.env"
compose() {
  docker compose --project-name didar-staging-phase2 --project-directory "$release" \
    --env-file "$root/shared/staging.env" --env-file "$release/.staging/images.env" \
    -f "$release/.staging/compose.yaml" "$@"
}
compose config --quiet
# Separate calls serialize builds. Runtime credentials are not passed to builds.
compose build api
compose build storefront
compose up -d --wait --wait-timeout 180 postgres redis
stopped=false
on_error() {
  code=$?
  if [[ "$stopped" == true ]]; then
    echo "Update failed after stopping staging. Backups: $root/backups/$stamp" >&2
    echo 'Staging apps remain stopped. Review migration logs and rollback instructions; no database was restored automatically.' >&2
    compose stop api storefront || true
  else
    echo 'Update failed before application downtime; existing application containers were left alone.' >&2
  fi
  exit "$code"
}
trap on_error ERR
stopped=true
compose stop api storefront
backup="$root/backups/$stamp"
mkdir -m 700 "$backup"
cp "$root/shared/staging.env" "$backup/staging.env"
if test -L "$root/current"; then readlink -f "$root/current" > "$backup/previous-release"; fi
compose exec -T postgres pg_dump -U didar -d didar -Fc > "$backup/database.dump.tmp"
compose exec -T postgres pg_restore --list < "$backup/database.dump.tmp" > /dev/null
mv "$backup/database.dump.tmp" "$backup/database.dump"
compose run --rm --no-deps -T --entrypoint tar api -czf - -C /app/packages/api/.medusa/server/static . > "$backup/uploads.tar.gz.tmp"
tar -tzf "$backup/uploads.tar.gz.tmp" > /dev/null
mv "$backup/uploads.tar.gz.tmp" "$backup/uploads.tar.gz"
compose run --rm --no-deps -T migrate
compose up -d --wait --wait-timeout 300 api storefront
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:19000/health | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.exit(s.trim()==='OK'?0:1))"
for endpoint in http://127.0.0.1:19000/didar/catalog http://127.0.0.1:13000/api/didar/catalog; do
  curl --fail --silent --show-error --max-time 15 "$endpoint" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);process.exit(Array.isArray(d.products)&&d.rate?0:1)})"
done
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:13000/ -o /dev/null
ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
stopped=false
trap - ERR
printf 'Healthy staging application commit: %s\nBackup: %s\n' "$sha" "$backup"
