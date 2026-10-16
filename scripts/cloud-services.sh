#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Compatibility entry point; no Linux-only utilities or private bridge IPs.
exec node scripts/local.mjs services
