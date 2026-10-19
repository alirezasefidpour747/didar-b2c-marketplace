# Nginx/bridge topology adapter — implementation and acceptance contract

Pinned audit source: `874447e6ec8fc58af3f09a87a4131b45c550a478`.
Status: DEVELOPMENT REQUIRED. No install-ready config, new image or target acceptance is supplied by this document.

## Scope and responsibility

Keep the owner's existing Nginx public HTTPS termination, Docker bridge/private listeners, native Medusa/Mercur panels and business authorities. Development owns the reviewed topology adapter, images, configuration and package verification. Runtime QA guides owner-run installation. Neither may infer client authority from an arbitrary forwarding header. No owner-server access is authorized here.

## Read-only preflight before choosing implementation

Runtime QA must provide sanitized discovery, withholding secret values:

- Actual Nginx version/build flags/modules, effective vhost/locations, real_ip/stream/PROXY settings, TLS termination, any upstream CDN/load balancer and address rewriting.
- Host listeners, firewall and IPv4/IPv6 exposure; Docker Engine/Compose versions; published loopback mappings, bridge networks, shared namespaces, IP/gateway assignments and egress peers actually observed by ingress/API.
- Exact active image IDs/digests/revisions, container commands, existing config paths and volume ownership. Do not publish raw `docker inspect` environment or secret-bearing config.
- Public hostname/certificate SAN and chain, ingress upstream certificate trust/server-name requirements, CORS/cookie origins and panel build-time backend URL.
- DB/media locations, backup/recovery proof, available disk/RAM, clock synchronization and other services sharing the server.

Do not guess ports, interface addresses, bridge gateways, architecture or certificate paths from historical examples. A CDN before Nginx is another unresolved first-hop boundary, not automatic header trust.

## Required bounded development

1. Keep the existing v1 payload shape, canonical peer validation, HMAC algorithm, exact raw byte/path/method binding, clock window, nonce format and PostgreSQL consumption semantics. Add no identity provider, JWT/session authority, role or financial rule.
2. Implement a reviewed Nginx-side first-hop signer compatible with the actual module/runtime. Capture the original socket before any real_ip rewriting; never use browser headers or `$remote_addr` without establishing its semantics. Derive canonical IPv4/IPv6 exactly as the shared implementation; use cross-implementation test vectors against `@didar/auth-network`.
3. Overwrite incoming assertion and untrusted attribution headers. Bound auth input at 1,200,000 bytes, preserve raw UTF-8/invalid-byte behavior without parsing/re-encoding before hashing, reject unsupported compression, and fail closed for missing signing configuration, oversized/temp-file bodies that cannot be safely handled, clock/entropy/module failures. A buffer/text/subrequest conversion must not silently change bytes or URI/query encoding.
4. Use an explicit verified relay mode: exact actual Nginx peer allowlist plus v1 verification before forwarding proof to private Next. Reject missing/bad proof in this mode; no unsigned or XFF fallback. Preserve original socket mode as a distinct explicit supported configuration. Do not weaken packaged private-Next or manifest checks.
5. Keep Next's existing re-signing of the actual API path/body with the original peer/ts/nonce. API admission still checks its actual trusted sender and consumes the nonce outside credential transactions. Trusted addresses must be exact observed canonical addresses, not ranges or browser addresses. Namespace recreation must refresh/verify the intended peer contract before serving auth.
6. Handle native canonical-proof `POST /didar/login` (and any exposed registration equivalent) at the signed edge without breaking `/admin/didar/connect` and `/vendor/didar/connect`. For direct edge-to-API auth use the actual direct API path/body, not a Next path. An unsigned request from a publicly proxied peer must not silently obtain direct-mode admission; enforce this at the reviewed edge/API boundary while preserving intentionally supported truly direct clients. Current policy A accepts unsigned requests even from an allowlisted peer. If a deployment-specific API mode must require proof for identified proxy peers, document and independently review that policy extension explicitly; it is not an existing setting or permission for QA to change policy A. Keep legacy direct behavior explicit and test its intended use separately.
7. Inventory same-origin Next/native/API/media paths, deep links, assets, reset/invite/callback routes, exact Host/URI handling, cookie/redirect behavior, upload and range limits. Keep fixed upstreams; no client-selected proxy destinations. Preserve private-media authorization, tenant context and privacy-related cache controls. Do not globally cache authenticated responses.
8. Keep Nginx upstream certificate/hostname verification enabled where TLS is used. Do not expose Next/private listeners or remove ingress TLS requirements. Secret values remain runtime-only and unreadable in public files, logs, screenshots, manifests and images. Preserve stable COOKIE_SECRET and existing identity/session data; coordinate any signer-key transition as a compatible bundle.
9. Package signer/module prerequisites, configuration templates, supervised relay lifecycle, health checks and Compose overlay as a versioned unit with images. Do not hot-edit release874 files or bypass its content manifest. No database/business migration should be introduced for this transport-only correction without a separately reviewed requirement.

## Acceptance matrix — isolated first, then target

| Gate | Required evidence |
|---|---|
| Baseline red | Preserve the existing socket-collapse and Next-only routing evidence; do not label it a passing deployment |
| Real topology | Actual Nginx TLS plus Docker bridge and the intended namespace/port mappings, pinned versions/config hashes; Node HTTP alone is insufficient |
| Attribution | Two distinct real client source addresses through the same edge stay distinct in verified peer/quota data; draining A does not spend B's network budget; true shared NAT is not claimed to become distinct networks |
| Spoofing | XFF, Forwarded, X-Real-IP, True-Client-IP, CF headers and supplied/duplicate x-didar-auth-network cannot select another client's quota |
| Proof integrity | Invalid/absent/expired/future proof, method/path/raw-query/body mutations, wrong key/peer, encoding changes and oversized/compressed bodies rejected with expected statuses; positive unmodified request succeeds |
| Replay | Replay rejected, including after 401/429 and across relevant restart boundaries; original nonce consumption persists |
| Native authority | Real Admin/Vendor emailpass, selected seller, canonical DIDAR proof and connect, permissions and tenant isolation; no forged role header |
| Media/UI | `/dashboard`, `/seller`, B2C/account/CMS, assets/deep links, API/media, private denial, upload/range behavior and same-origin redirects/cookies; screenshots from all three workspaces |
| Isolation | No external route or published port bypasses proof enforcement, private Next or DB/cache boundaries; test IPv4 and IPv6 actually enabled |
| Lifecycle | Edge reload, signer/relay crash, API/namespace recreate and host reboot tested; supervised failure and readiness fail closed; no silent fallback |
| CI | Final revision: lint/types, four production builds, regressions, native HTTP, all32 existing browser cases and actual CI no-demo; actual codes/signals and independently reviewed evidence |
| Artifact | Download published artifacts afresh, verify hashes/revision/dependencies, then execute final images without source bind in real isolated topology; distinguish reused builds from fresh runtime evidence |
| Owner target | QA-guided HTTPS from independent Internet networks, observed first-hop/API peers, all accepted routes, private denial and running source/image/config identities |

Do pressure/replay tests only against disposable accounts and databases. On the owner's server use non-destructive designated acceptance; do not saturate auth budgets, mutate live finances or restore over data to obtain evidence. An unexecuted stage is NOT_VERIFIED, not PASS.

## Recovery and cutover

1. Inventory the active compatible routing/application bundle and preserve its exact config/image/secret-version references. Back up DB, media, configuration and relevant certificate/key permissions securely. Verify restoration on an isolated copy, never by overwriting the live DB.
2. Validate Nginx configuration/module compatibility and the final images/config together before cutover. Use an isolated host-only vhost/listener first; do not expose a candidate login boundary before its gates pass. Runtime QA supplies commands from the accepted package for the discovered host, not guessed production edits from this document.
3. Quiesce new auth/traffic as required and cut over the compatible edge signer, relay, API trust configuration and images together. Preserve other vhosts/services and volumes. Record actual commands, outcomes and running identities.
4. Roll back if attribution collapses, proof checking fails, private endpoints are reachable, native linking/media break, health does not recover or new fatal browser errors appear. Roll back the compatible bundle, not the signer or trust configuration alone. Re-test native/customer auth, attribution, media and private denial before restoring acceptance status.
5. Do not rotate COOKIE_SECRET, flush nonce/quota tables, reset a DB, run demo seed, use `down -v` or restore an old database as routine transport rollback. After new writes, database recovery requires explicit data reconciliation and separate authorization.
6. If the previous route never had verified attribution, returning to it is service restoration only, not security acceptance. Keep affected authentication fail-closed/maintenance until a valid path is established. Preserve unrelated working services and sanitized logs for diagnosis.

## Required delivery

Deliver the bounded implementation PR, independent review, exact final accepted source and image/config digests, actual full CI and topology run URLs, downloadable package, English executable runbook and Persian handoff. Merge/publication/cutover require their task-specific authorization. This audit does not grant them, does not start another feature phase and does not claim current release874 already implements this method.
