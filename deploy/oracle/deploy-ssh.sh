#!/usr/bin/env bash
set -euo pipefail
: "${OCI_STAGING_HOST:?Set the existing staging VM IP or DNS name}"
: "${OCI_STAGING_SSH_KEY:?Set a secure local SSH key path, not key contents}"
: "${OCI_ALWAYS_FREE_CONFIRMED:?Confirm existing VM Always Free eligibility in Oracle Console}"
[[ "$OCI_STAGING_HOST" =~ ^[a-zA-Z0-9.-]+$ ]] || exit 1
test "$OCI_ALWAYS_FREE_CONFIRMED" = yes
cd "$(dirname "$0")/../.."
# Host key must already be verified and present in known_hosts. No permissive SSH flags.
key_path=$(realpath -- "$OCI_STAGING_SSH_KEY")
test -f "$key_path"
case "$key_path" in "$PWD"/*) printf '%s\n' 'Keep the SSH private key outside the source checkout' >&2; exit 1;; esac
ssh_args=(-i "$key_path" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=yes)
# Every release gets a fresh directory; removed source files cannot survive an update.
# A fixed Compose project name preserves the database and upload volumes across releases.
release=$(git rev-parse HEAD)
[[ "$release" =~ ^[0-9a-f]{40}$ ]]
if ! git diff --quiet HEAD --; then
  printf '%s\n' 'Commit tracked source changes before deploying; upload is exactly committed HEAD' >&2
  exit 1
fi
ssh "${ssh_args[@]}" "ubuntu@$OCI_STAGING_HOST" "test \"\$(cat /etc/didar-staging-only)\" = didar-staging-only && mkdir -p ~/didar-staging/releases ~/didar-staging/shared && test ! -e ~/didar-staging/releases/$release && mkdir ~/didar-staging/releases/$release"
# Source only: no .git, local credentials, dependencies, or machine-specific build outputs.
git archive --format=tar.gz HEAD |
  ssh "${ssh_args[@]}" "ubuntu@$OCI_STAGING_HOST" "tar -xzf - -C ~/didar-staging/releases/$release"
ssh "${ssh_args[@]}" "ubuntu@$OCI_STAGING_HOST" "cd ~/didar-staging/releases/$release && printf '%s\\n' '$release' > DEPLOYED_COMMIT && (cd ../../shared && python3 ../releases/$release/deploy/oracle/init-env.py) && ln -s ../../shared/.env .env && DIDAR_DEPLOY_ENV=staging OCI_ALWAYS_FREE_CONFIRMED=yes bash deploy/oracle/deploy-on-vm.sh && cd ../.. && ln -sfn releases/$release current"
