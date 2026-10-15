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
ssh "${ssh_args[@]}" "ubuntu@$OCI_STAGING_HOST" 'test "$(cat /etc/didar-staging-only)" = didar-staging-only && mkdir -p ~/didar-staging'
# Source only. Never upload x64 node_modules, build outputs, local credentials or Git metadata.
git archive --format=tar.gz HEAD |
  ssh "${ssh_args[@]}" "ubuntu@$OCI_STAGING_HOST" 'tar -xzf - -C ~/didar-staging'
ssh "${ssh_args[@]}" "ubuntu@$OCI_STAGING_HOST" 'cd ~/didar-staging && DIDAR_DEPLOY_ENV=staging OCI_ALWAYS_FREE_CONFIRMED=yes bash deploy/oracle/deploy-on-vm.sh'
