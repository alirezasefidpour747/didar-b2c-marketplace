#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Reuse verified installed JS dependencies; API runtime installs Debian FFmpeg.
# OS repository access is required; no JS package installation or network bypass.
bun run build:all
context=$(mktemp /tmp/didar-prepared-context.XXXXXX.tar.gz)
trap 'rm -f "$context"' EXIT
# Deliberately include prepared dependencies/build outputs, exclude credentials and Git.
# Exclude .dockerignore so the normal source-build filter does not drop those outputs.
tar --exclude=.git --exclude=.env --exclude='.env.*' --exclude=.dockerignore \
  --exclude=.aws --exclude=.ssh --exclude=.oci --exclude='*.pem' --exclude='*.key' \
  --exclude='*.p12' --exclude='*.pfx' --exclude='*.dump' --exclude='*.bundle' --exclude=backups \
  --exclude=.local --exclude=coverage --exclude=test-results --exclude=playwright-report \
  --exclude=.turbo --exclude='*/.next/cache' -czf "$context" .
docker build -f Dockerfile.prebuilt --target api -t didar-gold-api:staging - < "$context"
cp -r apps/storefront/.next/static apps/storefront/.next/standalone/apps/storefront/.next/static
cp -r apps/storefront/public apps/storefront/.next/standalone/apps/storefront/public
# Next standalone tracing can copy the local .env; exclude it before context transfer.
cat > apps/storefront/.next/standalone/.dockerignore <<'IGNORE'
.env
.env.*
**/.env
**/.env.*
.git
**/*.pem
**/*.key
IGNORE
docker build -f "$(pwd)/Dockerfile.storefront" -t didar-gold-storefront:staging apps/storefront/.next/standalone
