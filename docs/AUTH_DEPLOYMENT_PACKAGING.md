# Bounded authentication deployment packaging

This correction starts from exact `d9b55b3856d6e52ba86db517430572c2d46761e0` (PR #25 over PR #24). It packages their accepted authentication trust policy, not a new identity, throttle, Product, inventory or financial authority. It authorizes no rollout. Target host, certificates, CDN, DNS, firewall, Mac and ARM64 remain NOT_VERIFIED unless separately evidenced.

## Existing entrypoints and correction

| Existing path | Packaged contract |
| --- | --- |
| `Dockerfile` targets `api` / `storefront`, selected by `compose.yaml` | Original full source build; new storefront stage uses the same fresh package builder and supervised entrypoint as prepared packaging. Exact `DIDAR_SOURCE_SHA` build argument is required. |
| `Dockerfile.prebuilt` + `scripts/build-prepared-images.sh` | Existing same-platform prepared API image, with contained workspace dependencies and original migration tools. API shell now `exec`s Node so stop signals reach the real service. |
| `Dockerfile.storefront` | Consumes **only a fresh package-builder output**, verifies its file manifest, and runs `runtime/storefront.mjs`. Bare traced standalone context is rejected. |
| `apps/storefront/.next/standalone/apps/storefront/server.js` | Private child of the packaged entrypoint, not a supported public customer-auth entrypoint alone. |
| `local:dev` / `local:test` | Original PR #25 local signed ingress topology stays unchanged; their source-workspace runtime is not packaged-artifact acceptance evidence. |
| Archived `deploy/oracle/*` | Historical wrappers, not executed/authorized here. They inherit Compose prerequisites; no remote deployment or ARM claim. |

`package-storefront.mjs` copies standalone/static/public into a fresh directory without modifying the build outputs. It preserves traced **relative internal** Bun dependency links, excludes environment/credential files, installs the exact physical `@didar/auth-network` package used by the standalone supervisor/ingress, and includes an immutable file/link manifest. Every link must resolve inside that package; absolute, dangling or workspace-external links are rejected. Flattening Bun links would move Next away from required transitive dependencies such as `styled-jsx`. The Next route's original bundled implementation remains unchanged.

`PACKAGING.json` records source SHA, source-provenance type, platform/architecture, module digest, every packaged file and aggregate SHA256. A local Git checkout must have clean tracked sources. Inside a source Docker build `.git` is deliberately absent, so provenance is explicitly `BUILD_CALLER_SOURCE_SHA`, not a fabricated independent Git check. Supply the correct reviewed commit and clean build context. OCI revision labels are annotations, not signatures; image IDs and the actual execution receipts identify the tested artifacts. Packaging scripts are hashed separately in the acceptance provenance because the inherited application build receipt does not cover `scripts/deployment`.

The verifier requires matching runtime OS/CPU. The prepared path is for Linux dependencies on the matching Linux-image architecture; copying a Darwin checkout into a Linux image is rejected. Use the full source-container build to construct Linux dependencies on a different host; actual Docker Desktop/ARM64 execution is not certified here.

## Supported reference Compose topology

The existing single-host, single-API Compose kit now uses one shared network namespace for API and storefront. This is an explicit packaging contract, not discovery or certification of an owner's production topology.

- API serves original `/dashboard`, `/seller`, native `/auth/*` and `/didar/*` on container port `9000`, published only on host `127.0.0.1:9000`.
- `storefront` joins `network_mode: service:api`. API owns both host bindings; ingress `3000` is published only on `127.0.0.1:3000`. The storefront container publishes no independent port.
- The packaged supervisor always starts Next on **`127.0.0.1:3001`**, never `0.0.0.0`; `3001` is not published. `DIDAR_PRIVATE_NEXT_PORT` can change the private port; it must differ from the ingress port. Arbitrary nonloopback private upstream configuration is rejected.
- The unchanged PR #25 ingress binds `0.0.0.0:3000` **with TLS** inside this namespace. It reads the actual socket, strips untrusted forwarding assertions and signs auth requests. A public/nonloopback bind without cert/key fails closed. Docker host loopback publishing is not a reason to weaken the ingress TLS requirement.
- Next calls API at `http://127.0.0.1:9000`. Its actual egress peer is therefore exactly `127.0.0.1`; API `DIDAR_AUTH_PROXY_PEERS=127.0.0.1`. Native direct calls still follow PR #25 Policy A. Allowlisting is metadata-signing permission, never user authentication.
- PostgreSQL and Redis stay private/unpublished; original named data/uploads volumes and migration authority remain unchanged. Do not scale this namespace to multiple API replicas or infer distributed providers/capacity certification.

Do not insert an unreviewed reverse proxy/CDN before ingress and treat its socket as the original customer. Docker NAT can also collapse external clients into one actual peer. Acceptance binds genuine distinct loopback sources **inside this namespace**; it does not prove original-client preservation across an unspecified external Docker/network path. A different external boundary requires separately reviewed routing/attribution and target evidence. This artifact fixes missing packaging; it does not certify public internet rollout.

## Required configuration, supplied securely

- Existing `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, stable `COOKIE_SECRET`, original CORS/file origin settings and sandbox provider controls retain their contracts.
- Same high-entropy `DIDAR_AUTH_NETWORK_KEY` (at least 32 bytes) in ingress/Next and API. It is never a build argument, image layer, public variable, manifest or log value. Changing it requires coordinated trusted-service configuration; no fallback signer secret.
- `DIDAR_SOURCE_SHA`: exact reviewed source commit, supplied to Compose builds. Prepared-image script derives it from Git. It must not be a floating branch or fabricated target SHA.
- `DIDAR_AUTH_TLS_DIR`: an existing operator-controlled directory mounted read-only at `/run/didar-tls`; contains `cert.pem` and `key.pem`. No automatic certificates, directory creation or host key writes occur during startup. `DIDAR_AUTH_TLS_SERVER_NAME` must match a DNS SAN on that certificate.
- `STOREFRONT_URL`: public ingress origin, normally HTTPS; use its actual reviewed name/port for CORS. `MERCUR_BACKEND_URL` is the existing actual backend public/build origin, not a secret. Reusing compiled panels requires their embedded origin to match the intended environment (`same-origin` portable panels are used by controlled acceptance).
- For a private QA/company CA, additionally supply its public CA bundle in that mounted directory and set `DIDAR_AUTH_TLS_CA_PATH=/run/didar-tls/ca.pem`; this becomes `NODE_EXTRA_CA_CERTS` for the health process. Public roots otherwise remain Node's defaults. Certificate/hostname verification is never disabled by the application health check.

`node scripts/configure.mjs` only creates a missing environment file and generates a key for a new configuration; it preserves existing files. Older files need the above reviewed values supplied explicitly. It does not discover owner secrets or generate target TLS. Bare `.medusa/server` uploads must also provision their actual package dependencies; this package does not claim an independently pruned API deployment is verified.

Build procedures (not instructions to roll out):

1. Commit/review sources and configure non-secret provenance plus secure runtime configuration. `DIDAR_SOURCE_SHA` must equal `git rev-parse HEAD` for the checkout being packaged.
2. Full source path: `docker compose build api storefront` (managed environments must pass the supported CA build secret/proxy for networked steps). This compiles all original applications.
3. Prepared path: `scripts/build-prepared-images.sh` builds original applications, then packages both images. `--reuse-build` is permitted only when the existing source/output/platform receipt verifies exactly. Use unique `DIDAR_API_IMAGE` / `DIDAR_STOREFRONT_IMAGE` tags for review; do not overwrite an owner's running tags. JS install is not repeated by the prepared path; Debian access remains necessary for the existing FFmpeg layer.
4. The original one-shot `migrate` service applies native migrations and replayable DIDAR schema before API startup. Keep demo seeding disabled outside a disposable explicitly local QA environment. Startup of the app entrypoints does not reset or migrate databases itself.

## Health and lifecycle

API retains `/health` and the original `/didar/catalog` readiness check. Storefront health runs `node runtime/health.mjs`: private Next catalog and signed-ingress catalog transport must both work. TLS uses the configured server name and normal CA validation. This readiness check does not submit a password, mutate auth counters or certify functional login; actual authenticated acceptance is separate.

The supervisor verifies its packaged file manifest, checks key/ports/private-upstream/TLS-file prerequisites, starts private Next and waits for readiness, then starts ingress. Missing key/TLS, invalid private routing, spawn failure, readiness timeout or unexpected child termination fail the package with a nonzero exit and stop the sibling. Child close codes/signals are logged without configuration/credential values. It handles SIGINT/SIGTERM by stopping ingress before Next, waits up to ten seconds per child, force-kills only an unresponsive owned child and returns nonzero on escalation. Compose allows 25 seconds. Normal controlled stop returns supervisor0 while ingress may legitimately report `code=null, signal=SIGTERM`; this is not a fabricated child exit0.

Because storefront shares API's network namespace, stop/recreate storefront along with an API container replacement; do not leave it attached to an old namespace. Do not delete PostgreSQL/uploads volumes or use `down -v`. The preexisting optional `test-compose.mjs check` relay follows API-owned host bindings; its historical full business/browser harness is not the isolated packaged-auth matrix and must not be pointed at owner/staging data.

## Evidence boundary

Acceptance will reference exact source/OCI image IDs, fresh package content hash, clean runtime mounts, resolved dependency paths, application/native artifact parity, real PostgreSQL-backed HTTP and native/customer browser sessions, stage close codes and owned cleanup. Only affected packaging/auth/PR #24 checks are rerun; accepted unchanged PR #25 application build/full program evidence remains explicitly inherited. See `docs/audits/auth-packaging/FINAL_HANDOFF_FA.md` after completion. Local ephemeral QA TLS validates that local test setup only; it is not target certificate, TLS termination or production ingress verification.
