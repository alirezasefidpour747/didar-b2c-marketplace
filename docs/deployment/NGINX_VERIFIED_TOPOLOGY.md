# Verified Nginx/Docker topology correction: packaging and recovery plan

Status: **IMPLEMENTATION CANDIDATE / TARGET BLOCKED**. This document is not an
authorization to install, merge, publish a replacement release or access the
owner's server. The source baseline is
`874447e6ec8fc58af3f09a87a4131b45c550a478`; new application images must contain the
reviewed correction and carry its final exact source revision. Existing release
images from that baseline do not implement this adapter.

## Responsibility and unresolved target facts

Development owns the implementation, isolated verification and compatible-bundle
plan. “03 — DIDAR Deployment & Runtime QA” obtains sanitized read-only discovery,
then guides any separately authorized owner installation. Keep the installed
native host Nginx and unrelated vhosts/services. Do not replace it with the
isolated test container or install a guessed module binary.

The partial discovery supplied by 03 does not establish the module ABI, effective
first-hop socket, relay peer, mappings or namespace contract. A reported Docker
bridge address is **not** permission to trust its entire subnet or its gateway.
Separate existing containers do not prove a shared network namespace. Until the
following facts are supplied, target-specific rendering and readiness remain
**BLOCKED**:

- Nginx version, configure arguments, HTTP JS module package/version/ABI, loaded
  modules and the sanitized relevant vhost, location and real_ip/PROXY settings.
- Any CDN, load balancer, NAT, PROXY protocol or real_ip rewrite before the signer.
  The signer requires the original first-hop socket; forwarding headers cannot
  convert an upstream proxy's socket into a customer's network.
- Host listener/firewall IPv4 and IPv6 exposure; Docker Engine/Compose version,
  relevant port mappings, network mode, actual namespace and observed socket
  addresses at Nginx, relay and API.
- Public origin, certificate SAN/chain, paths/permissions, relay TLS name and CA,
  same-origin native panel build configuration and actual active image revisions.
- Existing project, network, database/cache/media volumes and ownership, complete
  database/cache connection settings, available capacity, stable secret-version
  references, backup restoration and clock synchronization proof.

03 may guide these read-only commands and return sanitized results. Never return
raw environment arrays, private keys, credentials or secret-bearing URLs:

```sh
nginx -v
nginx -V
docker version --format '{{.Server.Version}}'
docker compose version
ss -lnt
timedatectl show --property=NTPSynchronized --property=TimeUSec
docker inspect --format '{{.Name}} image={{.Image}} network_mode={{.HostConfig.NetworkMode}} ports={{json .NetworkSettings.Ports}}' EXACT_REVIEWED_CONTAINER
docker inspect --format '{{.Name}} {{range $name,$net := .NetworkSettings.Networks}}network={{$name}} ip={{$net.IPAddress}} gateway={{$net.Gateway}} ipv6={{$net.GlobalIPv6Address}} {{end}}' EXACT_REVIEWED_CONTAINER
docker inspect --format '{{.Name}} {{range .Mounts}}type={{.Type}} destination={{.Destination}} rw={{.RW}} {{end}}' EXACT_REVIEWED_CONTAINER
docker image inspect --format '{{.Id}} revision={{index .Config.Labels "org.opencontainers.image.revision"}}' EXACT_REVIEWED_IMAGE
```

An authorized operator must review `nginx -T` locally and redact secrets and
unrelated vhosts before returning only the relevant directives. Do not pipe its
unreviewed output to chat or public logs. Observe peers using a bounded
designated non-auth probe or privileged local socket inspection: report only
canonical socket addresses, namespace identities and request correlation IDs.
Do not enable request-body/proof/cookie logging. Confirm the peer again after
namespace recreation; never automatically add an unfamiliar peer to the list.

## Explicit network and authentication contract

```
client original socket -> native host Nginx HTTPS + v1 signer
  -> loopback-published TLS relay (verified exact observed Nginx socket peer)
    -> private Next 127.0.0.1:3001 OR native API 127.0.0.1:9000
API + relay/Next share one Docker network namespace
PostgreSQL / Redis / media volumes remain existing private dependencies
```

Only relay port 3000 is mapped, on host IPv4 loopback at an explicitly inspected
free port. API 9000, Next 3001, PostgreSQL and Redis have no published host port.
API binds **127.0.0.1** explicitly through the version-matched Medusa CLI `start
--host 127.0.0.1 --port 9000`. `network_mode: service:api` is mandatory for the
storefront; a separately recreated API requires recreation of its dependent
storefront namespace. This is a single-API topology; no horizontal scaling claim
is made. Test IPv6 exposure actually enabled on the target; do not infer it from
an IPv4-only reference test.

The signer uses the existing v1 HMAC, raw method/URI/body, timestamp and nonce.
It accepts no attribution from caller forwarding headers and rejects rewritten
or unsupported sockets. Four POST paths are signed: `/api/didar/login`,
`/api/didar/register`, `/didar/login`, `/didar/register`. Auth input is limited to
1,200,000 raw bytes with unsupported compression and unsafe temp-file bodies
rejected. All edge traffic uses one fixed TLS relay with hostname and CA
verification; no client-supplied upstream host is accepted.

`DIDAR_AUTH_INGRESS_MODE=verified-relay` requires an exact observed canonical
`DIDAR_AUTH_INGRESS_PEERS` list and valid proof before protected authentication
can reach Next/API. No header fallback is permitted. The relay keeps the signed
assertion intact for the actual same native API path. For Next auth, Next keeps
the original peer/timestamp/nonce. Its accepted behavior verifies incoming raw
bytes first, then decodes UTF-8 and signs the actual outgoing API path/body;
invalid UTF-8 replacement after validation is not represented as byte identity
across Next. The edge and relay do not parse or re-encode the body before hashing.
API consumes nonce state independently of credential transactions.

**Policy-A extension is explicit application behavior, not a QA switch:**
`DIDAR_AUTH_PROXY_POLICY=require-proof` rejects unsigned authentication from the
identified proxy peers; this bundle fixes the API proxy peer to `127.0.0.1`.
Valid proof is checked against the actual sender, and a bad proof never falls
back unsigned. Legacy `direct` behavior remains a separate explicitly tested
application mode for intentionally direct clients. The protected candidate must
not silently revert to that mode when configuration is missing. The independent
security review must accept this extension before delivery acceptance. Do not
extend peer trust to Docker ranges, arbitrary interfaces or browser addresses.

Native `/dashboard`, `/seller`, `/auth`, `/admin`, `/vendor`, `/store`, `/hooks`, `/didar`,
`/static` and supported media paths remain same-origin through fixed relay
routing. Cookies, native dual-proof linking, selected Seller, DIDAR identity,
permissions, tenant isolation and existing media authorization remain unchanged.
No role header, duplicate identity or new financial authority is introduced.
The route tests, not a broad assumed URL list, establish the implemented route
inventory and any intentionally unsupported paths.

Version-matched route inventory includes Medusa `/hooks/payment/[provider]`;
it retains native provider verification behind the fixed API routing. No live
provider operation is part of this verification. Auth callbacks remain below
`/auth`; reset/invite/deep links below `/dashboard` and `/seller` keep their native
surfaces. The internal Medusa Cloud control routes are not enabled as a new
public staging capability. Unknown prefixes continue to Next's own routing;
they are not arbitrary API proxy destinations.

## Compatible bundle and configuration

`scripts/deployment/nginx/compose.topology.json` is a candidate composition to
review against discovery, not a command to run on the target now. It preserves
the accepted packaging model:

The adjacent `topology.env.template` enumerates every required input. Blank
values deliberately fail preflight. Copy it to a private mode0600 file and
preserve the existing authoritative values; do not source it or treat it as a
populated target configuration.

- Complete existing `DATABASE_URL` and `REDIS_URL` are authoritative, including
  custom user/database, encoded password and URL options. Never reconstruct them
  from raw password fragments. PG service role/name/password match the existing
  initialized volume; changing environment does not migrate an existing role.
- Existing external project/network and PostgreSQL, Redis and media volumes are
  mandatory. No implicit empty database volume, demo seed or infrastructure
  replacement is created. Reuse reviewed dependency versions, not moving tags.
- Stable JWT/cookie secrets and existing auth network key are preserved. Never
  rotate sessions or erase quota/nonces as a transport migration. Signer, relay,
  API key-version references must match without exposing secret values.
- `DIDAR_ENVIRONMENT=staging`, `DIDAR_PAYMENT_MODE=sandbox`,
  `DIDAR_SEED_DEMO=false` are forced. The idempotent foundation migration script
  retains the accepted no-demo behavior. This correction adds no business or
  database migration.
- Require immutable final reviewed API/storefront image references through
  `DIDAR_API_IMAGE` and `DIDAR_STOREFRONT_IMAGE`; dependency image references are
  explicit. Their source/config/package manifests must match the reviewed
  candidate. Do not reuse release874 storefront runtime files, hot-edit an image
  or bypass package-manifest validation.
- A private directory provides `cert.pem`, `key.pem` and public `ca.pem`, mounted
  read-only at `/run/didar-tls`. The relay advertises its verified certificate
  DNS name through `DIDAR_AUTH_TLS_SERVER_NAME`. `NODE_EXTRA_CA_CERTS` and Nginx
  upstream CA/SNI checks remain enabled. Native API HTTP exists only inside the
  shared loopback namespace. No `NODE_TLS_REJECT_UNAUTHORIZED=0` workaround.
- The exact public HTTPS origin is required and must match native panel build
  configuration, cookies, CORS and public media URLs. A configured
  `DIDAR_PUBLIC_ORIGIN_VERIFIED` flag does not constitute independent Internet
  verification; leave it false until the established verification policy passes.

The eventual transferable kit must include immutable images or Docker-save
archives, dependency pins, checksums, source revision, package/config hashes,
signer+module provenance/ABI, exact trust-mode and peer contract, secret-version
references only, Compose configuration, protected env template/wrapper, health
and readiness commands, backup/recovery guidance and actual verification exits.
No replacement release is authorized by this task.

After a separate acceptance/release authorization, build from its exact approved
source checkout using the locked Node/Bun toolchain and
`MERCUR_BACKEND_URL=same-origin`. The existing
`scripts/build-prepared-images.sh` builds all four production applications and
uses `package-storefront.mjs`; its clean-source and manifest checks must remain
enabled. Bind both immutable app image identities, dependency digests, signer
and module/config hashes and secret-version references into the same release
manifest. Verify the resulting exported/downloaded bundle without workspace
binds before publishing an installation kit. The isolated test's accepted API
base plus hashed candidate-file materialization is a test fixture, **not** an
immutable new API image or a supported owner installation procedure.

## Guided installation/update plan — blocked pending discovery and acceptance

These are English command templates for a future reviewed candidate. They do not
run automatically. Resolve all `EXACT_*` inputs with 03, in a protected operator
session, before execution. Preserve the accepted wrapper safeguards: local Docker
daemon, private env mode 0600, no shell sourcing, no stale shell overrides and no
destructive/build flags. The old release wrapper/manifest cannot automatically
authorize a new composition; ship the reviewed matching wrapper with the future
bundle.

1. Inventory current application/config/image identities and unrelated services.
   Lock the operation to prevent concurrent updates. Confirm resource capacity,
   module ABI, clock, DNS/TLS, peer attribution and complete routes. Keep the
   existing Nginx vhost intact while preparing a private candidate.
2. Preserve a protected copy of current environment/config, signer/module,
   certificate permissions and secret-version references. Back up PostgreSQL
   using its existing database role and a secure non-logged credential mechanism,
   media data and relevant configuration; preserve Redis persistence according
   to its accepted operating policy. Record checksums without logging secrets.
   Restore into isolated new volumes and prove identity/commerce/media parity
   before any risky operation. Never restore over the live database to test a
   backup.
3. Verify all delivered checksums and OCI/source/package/config manifest
   identities, then inspect and load/pull the exact artifacts with normal TLS.
   The candidate must pass real isolated HTTPS+bridge tests and independent
   review, including native linking, two distinct client sources, spoof/replay,
   raw bytes, private isolation, lifecycle and compatible-bundle recovery. A
   passing `nginx -t` alone is insufficient.
4. Prepare the private config from existing values. Render Nginx candidate config
   through `render.mjs`, with the exact observed relay peer and TLS settings.
   Review the resulting diff; run the version-matched `nginx -t` under the same
   runtime secret mechanism. No secret output or public unverified auth listener.
5. During the separately approved cutover window, quiesce auth/traffic at the
   relevant edge. Stop storefront first, then API, so no process retains the old
   namespace or serves a mixed trust bundle. Keep PG/Redis/data and unrelated
   services intact. Run the accepted idempotent migration operation once with
   demo disabled; verify its actual exit and no-demo state.
6. Recreate API and storefront together; do not use `compose start` to migrate a
   namespace. Start API first, wait for its loopback health, then recreate the
   storefront attached to that exact API namespace. Observe actual relay/API
   socket peers again. If peers differ from the reviewed list, stop auth and
   investigate; never broaden the allowlist automatically.

```sh
# Future matching kit wrapper; not the previously published kit's wrapper.
./stack.sh /absolute/private/staging.env config --quiet
./stack.sh /absolute/private/staging.env stop storefront api
./stack.sh /absolute/private/staging.env run --rm --no-deps migrate
./stack.sh /absolute/private/staging.env up --no-deps --force-recreate --wait api
./stack.sh /absolute/private/staging.env up --no-deps --force-recreate --wait storefront
```

7. Check relay TLS health with the real SAN+CA, private port denial and actual
   image/config/namespace identities before switching Nginx. Apply only the
   accepted relevant vhost change; validate and reload through the existing
   service manager. Capture process exits and sanitized correlated logs. Do not
   restart unrelated vhosts or replace the host Nginx binary implicitly.
8. 03 guides designated real customer and native Admin/Vendor login, canonical
   proof/link, Seller scoping, media/upload/range and same-origin deep-link checks.
   Confirm public HTTPS from an independent Internet network, ordinary cookies,
   private listeners denied, correct first-hop attribution and normal shutdown/
   restart. Do not saturate budgets, replay live users' credentials or perform
   live provider/financial operations on the target.

Transport/catalog health is necessary but does not prove auth readiness. A relay
returning catalog 200 while missing proof configuration must never be treated as
accepted authentication. Edge signer/module or relay failure must keep protected
auth unavailable; unexpected child exit stops the supervised bundle. Record edge
reload, relay crash, API/namespace recreation and host reboot separately; an
unexecuted target reboot is **NOT_VERIFIED**, not inherited PASS.

## Compatible-bundle recovery

Pre-retain both current and candidate immutable app/config/signer/module bundles,
their verified dependencies and stable secret-version references. Recover the
whole matched trust bundle, not a single image, key, policy or peer list.

If attribution collapses, unsigned auth is admitted, native linking/media break,
private listeners become reachable or readiness fails, keep affected auth at
maintenance/fail-closed. Stop storefront and API; restore the previously reviewed
matching config/image pair and namespace relationship, then validate Nginx,
actual peers, TLS, native/customer auth, media and private denial before reopening.
If the previous route never had verified attribution, restoring its service is
not security acceptance: keep authentication closed until a valid signed path
exists. Preserve unrelated services and sanitized failure evidence.

Do not delete volumes, run `down -v`, flush nonce/quota tables, seed demo data,
reset identities, rotate COOKIE_SECRET/JWT_SECRET or overwrite the database as
routine transport rollback. No schema change is introduced here; if a different
release requires data reconciliation after writes, stop for its separate reviewed
recovery decision. Prove backup restoration only on an isolated copy.

## Acceptance boundaries

Report implementation review, isolated topology verification, CI, packaged image
verification, target configuration, installation, Internet HTTPS verification
and production readiness separately. Source-mount isolated tests do not prove a
transferable new artifact. Existing release874 evidence may be reused only for
unchanged components and must be labeled inherited. Full new GitHub CI/no-demo
and production builds are required for this candidate. This task publishes an
implementation PR/evidence and plan; merge, a replacement release and owner-server
installation remain unauthorized.
