# PR31 release preparation and post-acceptance procedure

Status: `MERGE_REQUIRES_CHIEF_ARCHITECT_APPROVAL`; `TARGET_CONFIG=BLOCKED`;
`PUBLIC_HTTPS=NOT_VERIFIED`. This document authorizes no operation. Do not merge,
dispatch a release, publish replacement images, install on the owner's server,
or infer a target peer/module ABI/TLS setting from the disposable fixture.

## Candidate and preserved evidence

The starting reviewed PR head is `0da25ade6e84956a23ab702de12be4f9e6de7aef`.
This follow-up changes only verification fixtures and release preparation, not
application authorization. `native-product-targets.test.ts` deliberately removes
its disposable Admin link. The manual image verifier must then prove unlinked
context403, native authentication, canonical DIDAR Admin proof, authorized
`/admin/didar/connect`, and context200 for `demo-admin`. It establishes this link
before its restart snapshot. The existing after-restart context assertion now
also proves linkage survives restart. No SQL grant, bypass, quota reset between
persistence phases, or private-context relaxation is permitted.

The original failed-run evidence remains in the immutable prior review kit:
https://drive.google.com/file/d/1jORqrUPITKEq6Vk0FfQvU9yiAKcPmkI0/view
SHA256 `14cea4c1c4b00029c4ab532a47eaf438de22c85d128492e03bde6e3f280edea8`.
Never replace a failed receipt with a successful retry. New evidence must name
source SHA, artifact SHA/image IDs, runner, actual close code/signal/spawn error,
and fresh versus inherited scope. GitHub conclusion is not a numeric OS exit.

## Exact-main selection AFTER approval and merge

The merge result is not known during preparation. Do not use the PR head or
synthetic merge as the release source. In a fresh builder checkout:

```sh
set -eu
git fetch origin main
release_sha=$(git rev-parse refs/remotes/origin/main)
git checkout --detach "$release_sha"
test "$(git rev-parse HEAD)" = "$release_sha"
test -z "$(git status --porcelain --untracked-files=no)"
printf '%s\n' "$release_sha"
```

Record the approved merge result and require it equals this exact SHA; stop if
main advanced. Require the successful **push/main** `didar-ci.yml` run for that
SHA, not PR-only CI or a prior main. It must include original lint/types, all
four production builds, backend/native HTTP, all32 browser cases and fresh plus
repeat no-demo. Freeze the evidence URL and observed exit receipts. The existing
release workflow also requires its protected environment, `DIDAR_RELEASE_ENABLED`
and exact `RELEASE <SHA>` input; do not remove those protections.

## Build and identify the complete compatible bundle

Use Node24.19.0, Bun1.4.3, frozen `bun.lock`, ffmpeg and Chromium prerequisites
from `didar-release.yml`. Build same-origin native panels with
`MERCUR_BACKEND_URL=same-origin`:

```sh
bun install --frozen-lockfile
bunx playwright install --with-deps chromium
export DIDAR_RELEASE_SOURCE="$release_sha"
export MERCUR_BACKEND_URL=same-origin
node scripts/ci/validate.mjs
node scripts/ci/release.mjs build .local/ci-release
```

`release.mjs` requires clean exact source and matching successful validation;
`build-prepared-images.sh --reuse-build` verifies the production-build receipt,
packages the complete physical Next dependency closure and runtime manifest,
and produces both API/native-panel and storefront/relay images. Do not edit an
image, overlay compiled files, bind workspace code/dependencies, or reuse the
old874 API as the new immutable release. API must contain the reviewed
`require-proof` policy; storefront must contain verified-relay runtime. Record
actual Docker save/compression exits, SHA256, OCI revision, config IDs, platform,
package manifest and dependency locks. Image IDs are not registry digests.

Record the resolved Node/Bun base image repo digests, actual runtime versions,
FFmpeg/OS package versions and Nginx/njs image/module identity. Floating base tags
and apt repositories mean the present builder is repeatable as a procedure, not
a claim of bit-for-bit reproducible future images. Distribute the exact frozen
built bytes. No dependency or target infrastructure upgrade is implied.

The build exports `images.tar.gz`, `release-manifest.json`, `SHA256SUMS`, `INSTALL.md`
and `install-kit/` with a source-bound per-file manifest. The kit contains the
matching signer, renderer/templates, candidate composition, relay/runtime
contracts and packaging/install/recovery guides. It contains no secrets or
rendered target config. The composition is a reviewed candidate, not a turnkey
target installation; the protected target-specific wrapper and config must be
reviewed with03 before installation. Do not reuse the old legacy stack wrapper
for this different composition.

## Downloaded artifact verification and publication gates

Keep two explicit acceptance records:

1. `LEGACY_PACKAGE_VERIFIER`: `node scripts/ci/verify-images.mjs <downloaded-dir>`
   loads the delivered archive and runs actual PostgreSQL HTTP, private Next403,
   auth/product regressions, restart and three browser journeys. It uses the
   supported legacy socket signer/direct policy. Passing it does **not** prove
   Nginx/verified-relay/require-proof topology. A current execution against an old
   release proves the fixture repair only, not the new release package.
2. `NGINX_PACKAGE_ACCEPTANCE`: required before accepting a new topology release.
   On a separate disposable Docker runner, download the candidate archive and
   matching kit from their published candidate location, check every checksum,
   load images, and verify both exact IDs/revision labels. Use the kit's signer
   and reviewed isolated Nginx/njs module, explicit QA certificates/CA/SNI and
   observed isolated peers. Use the new API/storefront images without source
   overlays or app/dependency workspace mounts. Secret/certificate/config-only
   mounts and fresh owned data volumes are allowed; inspect every mount.

The existing `didar-release.yml` verify job covers only record1. Its `PASS`
field must not be treated as record2 or final topology release acceptance. The
prior `full-ninth` Nginx proof used six API overlays; inherit its source design
and unchanged behavior evidence explicitly, but do not substitute it for the
new image check. A separate reviewed no-overlay artifact execution is a required
release gate; preparation does not claim it has already happened.

Record2 must exercise: same-domain B2C/Admin/Vendor/native API/media, signed
Next/direct login and registration, distinct-source quota isolation, forwarding
spoof/rotation, replay/raw-byte/wrong-method/path/peer negatives, concurrency,
native dual-proof and foreign-tenant denial, public media/range and private
media denial, unpublished API/Next, relay crash fail-closed and recovery,
API restart and paired namespace recreation, stable secrets/auth state/media,
and compatible-bundle restoration. Record actual runner/browser/process exits
and clean up only exact owned resources while preserving existing containers.
Test populated business history separately; empty fixture hashes are not a
populated database restore test. No target TLS claim follows from QA HTTPS.

Only after both package records PASS and independent review, publish immutable
`ghcr.io/<repo>/<role>@sha256:<digest>` refs with tested owner pull access, or
publish downloadable `docker save` archives with byte counts/SHA256. A local
image ID is not a download. Use a separate download/reload verification of the
published bytes; no builder/source overlay or application dependency mounts.
Record provenance and actual exits, manifest + kit hashes, install/recovery
instructions, download URLs, access requirements and retention. GitHub artifact
URLs expire; preserve an owner-accessible durable copy and verify readback.
If GHCR is unavailable use verified downloadable archives without hiding the
failed registry attempt. Do not publish a replacement release in this task.

## Installation, lifecycle and recovery handoff to03

`NGINX_VERIFIED_TOPOLOGY.md` is the detailed guided procedure. Obtain complete
sanitized03 discovery first: running release, Nginx build and matching njs ABI,
actual original socket/no rewriting, each actual hop peer, Docker mappings and
namespace, domain/TLS SAN/chain/CA/SNI, stable secret versions, clock and existing
network/data volumes. Container IPs/gateway are not observed peers. Do not fill
unknowns with this fixture's addresses.

Keep PostgreSQL/Redis internal and preserve their existing complete URLs/data;
API and Next are private loopback in one namespace, only the TLS relay is
published on host loopback. The original first-hop host Nginx handles public
HTTPS and signs to that relay. Route all required native API/media and auth
paths on the same public origin. Stable JWT/COOKIE/shared network keys are
secure runtime inputs, never bundle content. Exact peer allowlisting and strict
TLS/package-manifest checks remain enforced. Target config stays BLOCKED.

Before any approved update: acquire operator lock, capture current config/image
identities, verify backups of PostgreSQL/media/config and protected secret
references, rehearse isolated restoration, review migration/backward-schema
compatibility and preserve old compatible bundles. No database reset/demo seed,
volume removal, blanket prune or rebuild on the owner host. Quiesce traffic;
stop storefront before API; run the existing replayable migration authority
with demo disabled and fail on any error. Start API then storefront attached
to its NEW namespace. Confirm health, source/digest/package identities, private
isolation and observed peers; validate Nginx syntax and full routing before
approved cutover. Stop on mixed keys, missing proof, bad TLS or unhealthy child.

Recovery must restore the complete compatible API/frontend/signer/config/secret
version bundle and recreate the namespace pair. Do not downgrade to socket
mode, trust forwarding headers, expose private Next, or disable TLS to recover.
If writes or migrations make old schema incompatible, stop traffic and use the
reviewed database/media restore or reconciliation plan; image-only rollback is
not data recovery. Preserve logs and exact exits. See the detailed topology
guide for controlled restart/crash checks and backup commands.

Only03 guides installation on the owner's host. Record `PACKAGE_VERIFIED`,
`TARGET_CONFIG`, `STAGING_DEPLOYED`, `PUBLIC_HTTPS`, and `PRODUCTION_READY`
separately. Public HTTPS requires independent Internet customer/Admin/Vendor
journeys on the actual hostname with valid TLS, APIs/media and private-listener
checks. None is inferred from local package or CI success.
