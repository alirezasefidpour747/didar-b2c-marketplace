#!/bin/bash
# Reviewed candidate: private, write-once operator runtime. Never changes system Node.
set -euo pipefail
umask 077
if [ "$#" -ne 1 ]; then
  echo 'Use: bash provision-node.sh /absolute/new-private-runtime-directory' >&2
  exit 2
fi
destination=$1
case "$destination" in /*) ;; *) echo 'ABSOLUTE_NEW_RUNTIME_DIRECTORY_REQUIRED' >&2; exit 2 ;; esac
[ "$(uname -s)" = Linux ] && [ "$(uname -m)" = x86_64 ] || { echo 'LINUX_AMD64_REQUIRED' >&2; exit 2; }
parent=$(dirname -- "$destination")
[ -d "$parent" ] && [ "$(realpath -e -- "$parent")" = "$parent" ] && [ "$(stat -c %u -- "$parent")" = "$(id -u)" ] && [ "$(stat -c %a -- "$parent")" = 700 ] || { echo 'CANONICAL_PRIVATE_0700_PARENT_REQUIRED' >&2; exit 2; }
[ "$(realpath -m -- "$destination")" = "$destination" ] || { echo 'CANONICAL_NEW_PATH_REQUIRED' >&2; exit 2; }
# mkdir is exclusive: refuse existing directories, files and symlinks. On failure
# keep only this invocation's new files for investigation; never delete/reuse paths.
mkdir -m 0700 -- "$destination"
archive=node-v24.19.0-linux-x64.tar.xz
expected=14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647
curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error \
  --connect-timeout 20 --max-time 180 \
  "https://nodejs.org/dist/v24.19.0/$archive" -o "$destination/$archive"
printf '%s  %s\n' "$expected" "$archive" > "$destination/NODE_SHA256SUMS"
(cd -- "$destination" && sha256sum -c NODE_SHA256SUMS)
mkdir -m 0700 -- "$destination/runtime"
tar --extract --xz --file "$destination/$archive" --directory "$destination/runtime" \
  --strip-components=1 --no-same-owner
[ "$("$destination/runtime/bin/node" --version)" = v24.19.0 ] || { echo 'NODE_RUNTIME_IDENTITY_MISMATCH' >&2; exit 2; }
printf '%s\n' '{"status":"PRIVATE_OPERATOR_RUNTIME_READY","version":"v24.19.0","platform":"linux/amd64","archive_sha256":"14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647","system_runtime_changed":false}'
