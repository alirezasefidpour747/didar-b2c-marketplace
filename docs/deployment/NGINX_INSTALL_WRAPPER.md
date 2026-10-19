# Protected signed-topology operator wrapper (R6)

This is a bounded installation-kit component, not installation authorization.
`TARGET_CONFIG=BLOCKED` and `PUBLIC_HTTPS=NOT_VERIFIED` remain independent of
isolated wrapper/package verification. Nothing here accesses the owner's host,
replaces its Nginx, activates another vhost or establishes Internet acceptance.
The installed legacy application is **UNIDENTIFIED** until complete image/source
provenance is reconciled. Its API source marker is not a verified rollback image.

## Closed command contract

Run the delivered, checksum-verified `stack.mjs` with Node 24.19.0 on the operator
host; use absolute paths. The release manifest and its expected SHA-256 must come
from the independently verified delivery, not an automatically regenerated local
manifest. No arbitrary Compose arguments are accepted.

```sh
node /absolute/kit/stack.mjs /absolute/private/topology.env \
  /absolute/kit/manifest.json EXACT_MANIFEST_SHA256 \
  /absolute/private/operation.json preflight
```

The only verbs are `preflight`, `status`, `quiesce`, `migrate`, `recreate`, `health`
and `recover`. There is no `down`, `rm`, `build`, `pull`, `exec`, `--file`, profile,
project override or volume-deletion passthrough. `migrate` uses only the reviewed
one-shot migration service; it cannot replace PostgreSQL/Redis or seed demo data.
`recreate` uses `--no-deps` and recreates API before storefront, waiting for each.
It never starts/recreates authoritative dependencies or unrelated services.

The wrapper requires the canonical local Unix Docker socket, never TCP/SSH or an
alternate context. It supports Linux/amd64 Docker Engine 26.1.5 through major 28
and Compose v2 >= 2.26.1. This version range is a preflight policy; only the
versions in actual recorded test receipts count as executed compatibility tests.
It requires at least two Docker CPUs, 4 GiB Docker memory and 2 GiB free daemon
storage before an operation. Allow substantially more space for loading images,
retained recovery bundles and database/media backups; this minimum is not a
capacity estimate. It never prunes a daemon or manages its service/storage root.

## Private configuration and protected input

Copy `topology.env.template` to a file owned by the operator with mode `0600`.
The file is a **literal** `KEY=value` format. No `export`, quotes, duplicate or
unknown keys, CRLF or multiline values are accepted. `#` and `$` inside a value
are literal; a leading `#` starts a comment. Existing full `DATABASE_URL` and
`REDIS_URL`, including encoded credentials/options, are preserved verbatim. Never
source this file or pass it through shell expansion. Never print it or run a
non-quiet Compose config to diagnose secrets.

The wrapper renders the fixed JSON Compose template in memory, dollar-escapes
literal values once, and feeds it through stdin with `--env-file /dev/null`.
The original private environment file is not given to Compose's dotenv parser.
Stale deployment values in the invoking environment cause a named rejection;
secret values are never included in the error. COMPOSE overrides, remote Docker
options, `NODE_OPTIONS` and TLS-disable environment overrides are rejected.
Managed CA/proxy settings remain intact. The child Docker process receives no
stale deployment variables.

The secret authority remains the existing services. Preflight checks the actual
existing API's `JWT_SECRET`, `COOKIE_SECRET`, `DIDAR_AUTH_NETWORK_KEY`, complete
DB/cache URLs and storefront's network key against the private configuration.
It never generates/rotates keys. Missing or mismatched legacy key configuration
is a blocker requiring a separate reviewed reconciliation, not permission to
invent a key or erase sessions/nonces. Supply the same existing network key to
the host Nginx through the reviewed restricted service-manager secret-loading
plan. The wrapper never writes a secret into rendered Nginx configuration or
reloads the owner's Nginx.

The relay TLS directory must be private, with `key.pem` a regular operator-owned
`0600` file. It also contains `cert.pem` and `ca.pem`; the wrapper checks current
validity, DNS name, key match and the supplied issuing CA signature. This wrapper
currently accepts a directly issuing CA; a more complex intermediate chain must
be reconciled explicitly. Runtime health still performs real TLS verification.
This is relay TLS checking, not independent public HTTPS acceptance.

## Existing configuration and mounts are not silently dropped

Before any stop, migration or recreation, preflight compares every existing API
and storefront `Config.Env` value with the replacement image's actual immutable
`Config.Env` defaults merged with the literal reviewed per-service environment.
An existing setting is preserved when those effective values match, including
settings legitimately inherited from an image default. There is no wildcard
allowlist for `DIDAR_*`, `MERCUR_*`, provider, media, agency or other settings, and
no arbitrary environment passthrough. Existing settings that would disappear or
change cause a named rejection without printing either value. Even a differing
`NODE_VERSION`, custom image default or overridden `PATH` requires explicit
compatibility/configuration reconciliation; it is never silently exempted.

Only these reviewed transport transitions may differ, and only to the exact new
values below. Stable JWT/cookie/network keys and DB/cache URLs remain separately
required to match the existing authority.

| Service | Exact transition keys | Required replacement value |
| --- | --- | --- |
| API | `DIDAR_AUTH_PROXY_POLICY` | `require-proof` |
| API | `DIDAR_AUTH_PROXY_PEERS` | `127.0.0.1` |
| API | `ADMIN_CORS`, `AUTH_CORS`, `STORE_CORS`, `VENDOR_CORS` | The reviewed same-domain `DIDAR_PUBLIC_ORIGIN` |
| API | `FILE_BACKEND_URL` | That origin plus `/static` |
| Storefront | `DIDAR_AUTH_INGRESS_MODE` | `verified-relay` |
| Storefront | `DIDAR_AUTH_INGRESS_HOST`, `DIDAR_AUTH_INGRESS_PORT`, `DIDAR_PRIVATE_NEXT_PORT` | `0.0.0.0`, `3000`, `3001` respectively |
| Storefront | `MEDUSA_BACKEND_URL`, `DIDAR_AUTH_NATIVE_URL` | `http://127.0.0.1:9000` |
| Storefront | `DIDAR_AUTH_INGRESS_PEERS` | The exact observed, reviewed peer list from private configuration |
| Storefront | `DIDAR_AUTH_INGRESS_TLS_CERT_FILE`, `DIDAR_AUTH_INGRESS_TLS_KEY_FILE` | `/run/didar-tls/cert.pem`, `/run/didar-tls/key.pem` respectively |
| Storefront | `NODE_EXTRA_CA_CERTS` | `/run/didar-tls/ca.pem` |
| Storefront | `DIDAR_AUTH_HEALTH_SERVER_NAME` | The reviewed relay certificate DNS name |

API mounts must be exactly the identified existing writable uploads volume at
`/app/packages/api/.medusa/server/static`, including the inspected volume source.
Storefront may have no mount yet, or exactly the same private TLS directory
bound read-only at `/run/didar-tls`. Adding that reviewed read-only TLS bind is an
explicit transport transition. Any extra existing mount, app-source/config
overlay, different TLS source or writable TLS mount blocks before quiescence.
PostgreSQL/Redis and unrelated services remain untouched and their complete
curated mount/config identities are still compared after each operation.

On rejection, preserve the original configuration and volumes and keep target
installation blocked. Have the relevant configuration owner and Chief Architect
review the effective setting/mount diff privately. Add a separately reviewed
explicit compatible configuration only when justified; do not delete variables,
change guards, copy arbitrary old environment into the new image, discard a mount
or claim it was unused to make preflight pass. This task does not authorize that
future target-specific reconciliation or an unsigned fallback.

The disposable fixture uses separate purpose-specific API, storefront and
PostgreSQL environment files rather than injecting the whole operator file into
every service. Its real negative cases request quiescence with an unsupported
existing API setting and an extra storefront configuration mount, then assert
all original container IDs/running/start/image states are unchanged and no
migration container was created. They prove denial precedes lifecycle mutation.

## Matching kit manifest

The manifest is UTF-8 JSON with exactly these top-level fields:

```json
{
  "format": 1,
  "kind": "didar-nginx-verified-topology",
  "source_sha": "EXACT_40_HEX_SOURCE",
  "platform": "linux/amd64",
  "files": {
    "stack.mjs": "SHA256", "compose.topology.json": "SHA256",
    "auth.mjs": "SHA256", "sign.mjs": "SHA256", "render.mjs": "SHA256",
    "nginx.conf.template": "SHA256", "proxy-headers.conf": "SHA256",
    "topology.env.template": "SHA256"
  },
  "images": {
    "api": {"reference": "REGISTRY/API@sha256:DIGEST", "image_id": "sha256:LOCAL_CONFIG_DIGEST"},
    "storefront": {"reference": "REGISTRY/STOREFRONT@sha256:DIGEST", "image_id": "sha256:LOCAL_CONFIG_DIGEST"},
    "postgres": {"reference": "REGISTRY/POSTGRES@sha256:DIGEST", "image_id": "sha256:LOCAL_CONFIG_DIGEST"},
    "redis": {"reference": "REGISTRY/REDIS@sha256:DIGEST", "image_id": "sha256:LOCAL_CONFIG_DIGEST"}
  },
  "artifact_verification": {"path": "artifact-verification.json", "sha256": "SHA256"},
  "independent_review": {"path": "independent-review.json", "sha256": "SHA256"}
}
```

All named bundle files must be regular files under the manifest directory, with
matching hashes and no escaping symlinks/traversal. Additional hashed kit files
are permitted. The script verifies all of them. Image references must be digest
references (or loaded immutable `sha256:` IDs); actual locally loaded image IDs,
Linux/amd64 platform and both application OCI source labels must match. Local
image IDs support artifact checking after an independently verified download;
they are **not** downloadable delivery locations.

The artifact and independent-review receipts require respectively `status=PASS`
and `status=APPROVED`, matching `source_sha`, `topology=nginx-verified-relay-v1`,
`workspace_mounts=false`, `source_overlays=false`, `exit_code=0`, and an `images`
object binding `api` and `storefront` to exact image IDs. Evidence is supplied by
the actual R5 verifier and independent reviewer after checking their full raw
receipts, not generated to bypass a missing gate. This wrapper checks the
trusted receipt bytes/identities; it does not claim a hash alone re-executes the
application matrix or establishes human approval.

## Assemble the operator bundle after actual review

The candidate `install-kit/kit-manifest.json` is a source-bound review kit, not
the runnable operator manifest above. Never point the wrapper at that manifest
or rename it to pretend its review/image gates passed. After the real R5 gate
and independent artifact review succeed, use the deterministic assembler:

```sh
node scripts/ci/operator-bundle.mjs ARTIFACT_DIR REVIEW_JSON DEPENDENCIES_JSON NEW_OUTPUT_DIR
```

Supply the actual `APPROVED` independent review, actual R5 source/image identities
and explicitly inspected immutable PostgreSQL/Redis references and local config
IDs. The assembler copies the matching flat files and creates the operator
manifest; preserve its printed SHA-256 and verify it independently. It must fail
if evidence is missing, inherited, overlaid or source/image-mismatched. It does
not populate target peers, certify a module/TLS path or authorize installation;
the private operation remains `BLOCKED` until those facts are reviewed.

## Explicit existing resources and operation prerequisites

The private `operation.json` is also regular, operator-owned mode `0600`. Its
fields are shown below with intentionally non-runnable placeholders. Obtain
actual full container/network IDs with read-only discovery. PostgreSQL, Redis
and uploads volume names come from existing mounts, not guessed Compose names.
The existing network must be a bridge. PostgreSQL/Redis images and container IDs
are preserved and must match their reviewed dependency identities.

```json
{
  "format": 1,
  "target_config": "BLOCKED",
  "project": "EXACT_EXISTING_PROJECT",
  "network_id": "EXACT_64_HEX_NETWORK_ID",
  "containers": {
    "api": "EXACT_64_HEX_ID", "storefront": "EXACT_64_HEX_ID",
    "postgres": "EXACT_64_HEX_ID", "redis": "EXACT_64_HEX_ID"
  },
  "backup": {
    "status": "VERIFIED", "isolated_restore_status": "PASS",
    "evidence_file": "/absolute/private/actual-backup-and-restore-evidence.json",
    "evidence_sha256": "SHA256",
    "source_container_ids": {
      "api": "EXACT_64_HEX_ID", "storefront": "EXACT_64_HEX_ID",
      "postgres": "EXACT_64_HEX_ID", "redis": "EXACT_64_HEX_ID"
    }
  },
  "edge": {
    "maintenance": true,
    "observed_peers": "EXACT_CANONICAL_OBSERVED_SOCKET_PEERS",
    "tls_name": "OBSERVED_RELAY_CERTIFICATE_DNS_NAME",
    "secret_version": "EXISTING_NON_SECRET_KEY_VERSION_REFERENCE",
    "discovery_file": "/absolute/private/reviewed-discovery.json",
    "discovery_sha256": "SHA256",
    "matched_files": {
      "module": {"path": "/absolute/OBSERVED_MODULE_PATH", "sha256": "SHA256"},
      "nginx_config": {"path": "/absolute/reviewed-nginx-config", "sha256": "SHA256"},
      "signer_auth": {"path": "/absolute/reviewed-signer/auth.mjs", "sha256": "SHA256"},
      "signer_sign": {"path": "/absolute/reviewed-signer/sign.mjs", "sha256": "SHA256"}
    }
  },
  "recovery": null
}
```

`BLOCKED` permits read-only preflight only if complete configuration is available;
otherwise the explicit blank template fails before daemon access. Mutation
requires verified discovery and an independently reviewed actual target
configuration. A bridge/gateway/container IP is never evidence of a trusted
peer. `maintenance=true` is a protected operator attestation that the relevant
edge is already quiesced, not an automatic Nginx action or a permanent status
claim. The wrapper does not inspect/rewrite host vhosts or control edge traffic.
The operator must keep signed authentication closed throughout a mutation and
obtain new actual-peer verification before reopening it.

Before marking backup/restore verified, actually back up and independently
restore PostgreSQL, media, Redis persistence and relevant config/secret-version
references to isolated destinations. Preserve the immutable recovery artifacts.
Never test restoration over authoritative live volumes. Record IDs, checksums,
restore commands and actual exits, and identity/commerce/media/session-state
comparisons in the referenced private evidence. The wrapper verifies the exact
operator-declared evidence file/hash and its bound source IDs; all mutation receipts
also require `status=PASS`, a `restoration` object with `postgres`, `redis`,
`uploads`, `configuration` all `PASS`, and `isolated_volumes` with three distinct
PostgreSQL/Redis/uploads names different from all authoritative volume names.
This evidence check does not
perform or replace backup/restore or manufacture restoration evidence.

The host Nginx module/config/signer files are hashed before every mutation, and
the signer hashes must match the application kit. Provision only the independently
tested compatible Debian package/module pair through the companion compatibility
plan. Existing package/version/module-path and actual peer/TLS facts remain
separate target gates. Do not load a binary from the isolated reference Nginx
image into the owner's differently built Nginx, upgrade it implicitly, or change
unrelated vhosts to make the wrapper pass.

## Controlled migration, health and failure recovery

Only after separate target installation authorization and satisfied prerequisites:

1. Confirm the exact verified bundle, stable private environment, actual existing
   resource IDs and backups/restoration. Quiesce the relevant edge independently.
2. Run `preflight`, then `quiesce`. Storefront stops first, API second, using exact
   inspected IDs. PG/Redis/volumes/unrelated services stay in place.
3. Run `migrate`. Both applications must still be stopped; only the accepted
   no-demo migration/foundation service runs, with no dependency recreation.
4. Run `recreate`. API is force-recreated and health-checked, then storefront is
   force-recreated into that API's exact namespace. Never use `start` to change
   namespace ownership. Relay is the only published application port and binds
   host IPv4 loopback; Next/API private listeners are not published.
5. Run `health` as a **separate process**. The private state binds newly created
   API/front IDs, bundle/config/operation hashes. It validates images, namespace,
   strict proof policy, exact peer configuration, stable secrets, TLS relay health,
   API loopback health and unsigned private Next auth denial. It compares all
   pre-existing dependency/unrelated container identities/config/running state.
   Mount lists are sorted by destination because Docker iteration order is not
   semantic; mount type/name/source/destination/read-write values remain compared.
   An owned protocol-fixture mismatch records curated before/after metadata and
   changed fields in its private journal without including `Config.Env` or labels.
6. Verify actual peers, IPv4/IPv6 isolation, same-origin customer/Admin/Vendor,
   media and public HTTPS via 03's separately authorized runtime workflow before
   reopening traffic. Internal health does not establish those public outcomes.

An exclusive private lock serializes operations. An existing lock is a stop for
manual investigation, never permission to kill unknown processes or remove an
active lock. Private mode-0600 state and append-only per-operation journal files
are adjacent to the environment file. Production journals contain hashes and actual child
exit/signal/spawn/timeout fields, never environment values or raw Docker output.
Only a label-verified `DISPOSABLE_QA` protocol fixture may retain bounded redacted
failure diagnostics; its redactor explicitly receives the private configuration.
The operator CLI still prints only a bounded failure code. Fixture cleanup also
retains redacted owned API/storefront State/log evidence before removing them.
Keep failure journals and original delivery evidence; do not rewrite a FAIL as a
PASS. Malformed foreign parser errors are reduced to `WRAPPER_FAILED` to avoid
leaking input snippets.

If API replacement succeeds but storefront/health fails, the edge stays closed.
Do not guess old IDs, issue arbitrary Compose mutations or restore an unidentified
legacy application. Read-only inspect the current labelled API/front pair and
verify it belongs to the same project; take fresh backup/isolated-restore evidence
if its subject IDs/state changed. Prepare a fresh private operation record with
those actual IDs and run `quiesce` against the same verified failing candidate.
This creates a controlled stopped state even after an interrupted replacement.
The real Docker fixture tests this failed-half-transition and subsequent recovery.

Recovery uses a separately retained **verified matching bundle**, not a single
image, old source marker, guessed module or unsigned fallback. After controlled
quiescence, select that bundle's manifest/expected hash and its matching environment,
config/signer/module/TLS and stable secret version. The new operation record needs:

```json
{"recovery": {
  "status": "VERIFIED",
  "from_bundle_sha256": "EXACT_QUIESCED_BUNDLE_HASH",
  "to_bundle_sha256": "EXACT_VERIFIED_RECOVERY_BUNDLE_HASH",
  "evidence_file": "/absolute/private/matched-recovery-evidence.json",
  "evidence_sha256": "SHA256"
}}
```

Other operation fields remain mandatory and reflect current stopped container IDs
and actual backup/edge facts. The recovery evidence must establish data/schema
compatibility, both immutable application images, config/signer/module identities,
secret versions and previously executed compatible-bundle recovery. The wrapper
checks exact evidence bytes and parsed `status=PASS`, `from_bundle_sha256`,
`to_bundle_sha256`, `source_sha`, `database_compatible=true`, `secret_version`,
`images` (both target image IDs) and `edge_hashes` (`module`, `nginx_config`,
`signer_auth`, `signer_sign`) against the selected bundle/operation. Independent review
must assess their substantive recovery proof. Run `recover`, then separate
`health`, actual-peer and authorized journeys before reopening. On failure leave
auth closed and preserve the observed exits. Never flush budgets/nonces, rotate
JWT/cookie/network keys, reset DB, delete volumes or fall back to unsigned auth.

## Verification boundaries

`node --test tests/nginx-stack.test.mjs` checks parser/authority/manifest/closed-CLI
negatives. `node tests/nginx-stack-docker.mjs NEW_OUTPUT_DIRECTORY` creates only
label-owned disposable services and performs actual Compose transitions, PostgreSQL/Redis/uploads/configuration
backup and isolated restoration, persistence checks, separate-process health, partial-start
failure and matching-bundle recovery. It records actual Docker/Compose versions.
Its mini application/module/config files are explicitly **operator-protocol
fixtures**, not an application artifact, a working Nginx module or target acceptance.
The fixture manifest kind and `FIXTURE_ONLY` receipts are accepted only in
`DISPOSABLE_QA` mode; actual network, all volumes and all four existing containers
must carry `didar.disposable-qa=true`. It cannot authorize a target operation.
Application R5 verification independently uses the real built/exported/reloaded
API/storefront and real compatible Nginx HTTPS/PostgreSQL bridge matrix.
