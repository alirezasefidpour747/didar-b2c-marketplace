#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Reuse verified installed dependencies. No dependency installation or network bypass.
bun run build:all
context=$(mktemp /tmp/didar-prepared-context.XXXXXX.tar.gz)
trap 'rm -f "$context"' EXIT
# Deliberately include prepared dependencies/build outputs, exclude credentials and Git.
# Exclude .dockerignore so the normal source-build filter does not drop those outputs.
tar --exclude=.git --exclude=.env --exclude='.env.*' --exclude=.dockerignore \
  --exclude=coverage --exclude=test-results --exclude=playwright-report \
  --exclude=.turbo --exclude='*/.next/cache' -czf "$context" .
docker build -f Dockerfile.prebuilt --target api -t didar-gold-api:staging - < "$context"
cp -r apps/storefront/.next/static apps/storefront/.next/standalone/apps/storefront/.next/static
cp -r apps/storefront/public apps/storefront/.next/standalone/apps/storefront/public
docker build -f "$(pwd)/Dockerfile.storefront" -t didar-gold-storefront:staging apps/storefront/.next/standalone
