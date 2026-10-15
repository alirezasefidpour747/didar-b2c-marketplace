#!/usr/bin/env bash
# Read-only application/database backup; does not stop services or restore data.
set -euo pipefail
cd "$(dirname "$0")/../.."
umask 077
backup_root=${DIDAR_BACKUP_DIR:-"$HOME/didar-staging/backups"}
mkdir -p "$backup_root"
backup_root=$(realpath "$backup_root")
case "$backup_root" in "$PWD"|"$PWD"/*) printf '%s\n' 'Backups must be outside the source release checkout' >&2; exit 1;; esac
stamp=$(date -u +%Y%m%dT%H%M%SZ)-$$
backup_dir="$backup_root/$stamp"
mkdir -m 700 "$backup_dir"
compose=(docker compose -f compose.yaml -f deploy/oracle/compose.arm64.yaml)
# No credentials are printed or put in argv. PostgreSQL's local container socket is used.
"${compose[@]}" exec -T postgres pg_dump -U didar -d didar -Fc > "$backup_dir/database.dump.tmp"
"${compose[@]}" exec -T postgres pg_restore --list < "$backup_dir/database.dump.tmp" > /dev/null
mv "$backup_dir/database.dump.tmp" "$backup_dir/database.dump"
# Keep current image identities before mutable staging tags are rebuilt.
for component in api storefront; do
  container_id=$("${compose[@]}" ps -q "$component")
  test -n "$container_id" || continue
  image_id=$(docker inspect --format '{{.Image}}' "$container_id")
  saved_tag="didar-gold-$component:rollback-$stamp"
  docker image tag "$image_id" "$saved_tag"
  printf '%s=%s\n' "$component" "$saved_tag" >> "$backup_dir/images.txt"
done
# Custom gold image bytes live in PostgreSQL. Retain native Mercur file uploads separately.
container_id=$("${compose[@]}" ps -q api)
if test -n "$container_id"; then
  mkdir "$backup_dir/native-uploads"
  docker cp "$container_id:/app/packages/api/.medusa/server/static/." "$backup_dir/native-uploads/"
fi
previous_source="$HOME/didar-staging/current/DEPLOYED_COMMIT"
if test -f "$previous_source"; then cp "$previous_source" "$backup_dir/DEPLOYED_COMMIT"; fi
printf '%s\n' "Verified PostgreSQL archive and prior images saved under $backup_dir"
