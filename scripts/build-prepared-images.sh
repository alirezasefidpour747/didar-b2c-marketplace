#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Reuse only verified same-platform compiled artifacts; never modify Next output.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo 'Commit tracked changes before packaging.' >&2
  exit 1
fi
source_sha=$(git rev-parse HEAD)
if [[ "${1:-}" == '--reuse-build' && "$#" == 1 ]]; then
  node --input-type=module -e "import {verifyBuild} from './scripts/local/build-receipt.mjs'; verifyBuild()"
elif [[ "$#" == 0 ]]; then
  bun run build:all
else
  echo 'Usage: scripts/build-prepared-images.sh [--reuse-build]' >&2
  exit 1
fi
mkdir -p .local
package_dir=$(mktemp -d "$PWD/.local/prepared-images.XXXXXX")
trap 'rm -rf "$package_dir"' EXIT
node scripts/deployment/package-storefront.mjs "$package_dir/storefront"
# Preserve original dependency links only INSIDE the image. No workspace bind mount.
# Credentials and machine state are excluded; root-only ./verification must
# not remove Medusa Auth providers/verification inside installed dependencies.
tar --exclude=.git --exclude=.env --exclude='.env.*' --exclude=.dockerignore \
  --exclude=.aws --exclude=.ssh --exclude=.oci --exclude='*.pem' --exclude='*.key' \
  --exclude='*.p12' --exclude='*.pfx' --exclude='*.dump' --exclude='*.bundle' --exclude=backups \
  --exclude=.local --exclude=coverage --exclude=test-results --exclude=playwright-report \
  --exclude=./verification --exclude=.turbo --exclude='*/.next/cache' --exclude='*/.next/standalone' \
  -czf "$package_dir/api-context.tar.gz" .
sha256sum "$package_dir/api-context.tar.gz" "$package_dir/storefront/PACKAGING.json"
docker build --build-arg "DIDAR_SOURCE_SHA=$source_sha" -f Dockerfile.prebuilt --target api -t "${DIDAR_API_IMAGE:-didar-gold-api:staging}" - < "$package_dir/api-context.tar.gz"
docker build --build-arg "DIDAR_SOURCE_SHA=$source_sha" -f "$PWD/Dockerfile.storefront" -t "${DIDAR_STOREFRONT_IMAGE:-didar-gold-storefront:staging}" "$package_dir/storefront"
