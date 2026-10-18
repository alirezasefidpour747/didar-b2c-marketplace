# Customer authentication: network trust and bounded abuse controls

Scope: SEC-01/SEC-02 only, extending PR 24 from exact `2c634ffdb77d4683271b5b218ca0a606af74004a`. Native Medusa/Mercur `/auth/*`, permissions/tenant selection, canonical DIDAR users/sessions and all Product/UID/commerce/financial authorities remain original. This is not a global authentication/security or production certification.

## Supported transport and explicit policy A

```text
Customer → first-hop auth-ingress (actual socket, TLS when public)
         → private Next.js → API /didar/login or /didar/register
Direct API client ─────────→ API (actual socket)
Native Admin/Vendor ───────→ original native /auth/{user|member}/emailpass
```

`apps/storefront/auth-ingress.mjs` is a small first-hop transport adapter. It replaces all incoming `x-didar-auth-*` and forwarding headers, reads its actual socket address, buffers only bounded authentication JSON and signs that request. It streams unrelated requests to a fixed configured Next origin; caller URLs cannot choose another upstream. Do not put an unconfigured CDN, TLS terminator or reverse proxy before it and claim that proxy's peer is the original customer. Its public bind requires TLS certificate/key. Loopback HTTP is supported for disposable/local verification. Target TLS, routing, firewall and proxy topology are NOT_VERIFIED here.

Next's App Router does not expose a trustworthy raw socket peer. Its `/api/didar/{login|register}` route therefore requires the first-hop assertion and signing key. Missing/bad proof fails before an upstream authentication attempt; it never self-signs arbitrary X-Forwarded-For. Run Next on a private listener; direct public `next start` or the old standalone `server.js` alone is **not** the supported authenticated storefront entrypoint after this correction. Other non-authentication surfaces keep their original contracts.

The API uses **policy A**:

- No assertion: direct mode uses `req.socket.remoteAddress` after IP canonicalization, even if that address is also in the proxy allowlist. No original-client identity is inferred, and all arbitrary X-Forwarded-For, Forwarded, X-Real-IP, CF-Connecting-IP, True-Client-IP and cookies are irrelevant to network attribution. Express `req.ip` and its framework trust-proxy setting are not used.
- Present assertion: verify a server-only key, actual API socket peer against the exact configured proxy-address allowlist, canonical claimed address, timestamp, nonce and raw-byte/method/path binding. Invalid present proof is rejected; it cannot fall back to direct mode. The allowlist grants permission to assert metadata, not customer/authentication/tenant authority.
- A valid assertion does not authenticate the customer or grant a role. Original password/session/native authorization remains authoritative.

Only `x-didar-auth-network` is the defined assertion. The shared server-only `@didar/auth-network` package implements v1 HMAC-SHA256 over encoded `{v,peer,ts,nonce}`, method, exact path/query and SHA-256 of actual request bytes. It rejects malformed/duplicate-comma headers and noncanonical payload/IP forms; IPv4-mapped IPv6 and equivalent IPv6 forms are normalized. Assertions admit at most 30 seconds past and 5 seconds future. Next validates incoming bytes before decoding and re-signs actual upstream bytes for `/didar/{action}`, preserving timestamp/nonce. The API atomically consumes that nonce in PostgreSQL **outside** credential/session transactions; replay after either 401 or 429 cannot create another verification attempt. Nonce TTL is 60 seconds, beyond the full validity interval. Compressed authentication bodies are unsupported at the first hop.

Keep the signing key and both trusted services private. Another service possessing it is a trusted metadata signer. Body binding does not encrypt credentials; TLS/private transport and deployment network controls remain release prerequisites. Key management/rotation and actual network policy on an owner's host have not been verified or changed.

## Required configuration

| Variable / process | Contract |
| --- | --- |
| `DIDAR_AUTH_NETWORK_KEY` / ingress, Next and API | Same server-only high-entropy secret, at least 32 bytes. No `NEXT_PUBLIC_` exposure or default shared secret. Missing/invalid Next key returns 503; invalid/missing proof returns 403. API direct mode does not need this key; asserting a network does. |
| `DIDAR_AUTH_PROXY_PEERS` / API | Comma-separated exact canonical actual addresses of Next's connection to API (e.g. `127.0.0.1,::1` for the documented loopback topology). No wildcard, CIDR, DNS-derived trust or hop-count inference. Missing allowlist accepts no assertion. |
| `COOKIE_SECRET` / API | Original stable configured session secret, also keying operational auth bucket hashes. Keep stable across API restarts/instances if bucket continuity is required; rotating it changes bucket namespaces. Original production minimum length checks remain. |
| `MEDUSA_BACKEND_URL` / Next | Existing fixed API origin, e.g. `http://127.0.0.1:9000`. |
| `DIDAR_AUTH_STOREFRONT_URL` / ingress | Fixed private Next origin, e.g. `http://127.0.0.1:3001`; no credentials, path/query/fragment. Default is that loopback origin. |
| `DIDAR_AUTH_INGRESS_HOST`, `DIDAR_AUTH_INGRESS_PORT` / ingress | Default `127.0.0.1:3000`, the public local storefront origin. Private Next and public ingress ports must differ. |
| `DIDAR_AUTH_INGRESS_TLS_CERT_FILE`, `DIDAR_AUTH_INGRESS_TLS_KEY_FILE` / ingress | Both configured for a non-loopback public bind. Read only by the server, never printed or written to receipts. No target TLS certificate was supplied/tested in this package. |

Set existing CORS/public origins to the **public ingress**, never the private Next port. The trusted API peer is Next's actual egress address, not the browser's claimed address. If a different proxy replaces this adapter, it needs separately reviewed equivalent socket-to-assertion behavior and actual integration evidence; merely overwriting an unsigned client-IP header is not this protocol.

For local development `bun run local:dev` now starts private Next plus the signed first hop on the original port 3000. It supplies a shared ephemeral signing key to its own children when none is configured, without rewriting stored owner environment files. Existing `COOKIE_SECRET` is unchanged. `bun run local:test` wires the same topology for disposable services. Operator-facing public addresses remain 3000/9000. These source changes do not claim an owner's Mac or existing persistent environment was exercised.

Manual isolated production-build invocation, after exporting configuration securely to each process (secret values intentionally omitted):

1. Start the original API on `127.0.0.1:9000` with its database/Redis/native configuration plus key/peer allowlist.
2. Start `bun run --cwd apps/storefront start --hostname 127.0.0.1 --port 3001` with key and backend origin.
3. Start `bun run --cwd apps/storefront auth:ingress` with the same key and private Next origin; browse `http://127.0.0.1:3000`.

This is a reproducible local procedure, not authorization to deploy. Bare historical standalone/container entrypoints need this ingress process (and its workspace dependency) provisioned ahead of private Next; their actual target packaging/orchestration remains a separate release gate. No owner server/configuration was changed.

## Abuse policy: no global victim-account ban

For `/didar/login` and `/didar/register`, the original `didar_login_attempt` PostgreSQL table is reused with keyed v2 namespaces. Old shared-proxy/IP counters do not become new-client debt. No identity/session table or password format is replaced.

| Dimension | Enforced behavior |
| --- | --- |
| Verified network | Atomic 200 admissions / 15-minute fixed window, bounds many-target spray from that network. |
| Verified network × normalized account | Atomic 20 admissions / 15 minutes, regardless of spoofed forwarding headers or browser cookie changes. This is not an account-wide ban across networks. |
| Account-wide failed-verification pressure | Failed attempts create bounded pacing of 100 ms per failure, capped at 500 ms. **Delay only**, never deny/disable an account. A correct login from another independently verified network remains usable. Pacing is not claimed to stop a distributed botnet. |
| Shared verification work | Four PostgreSQL session-advisory slots and one active slot per network. Slots hold the exact dedicated connection until asynchronous scrypt/session work settles; crash/disconnect drops locks. No timed lease can expire while work still runs. Busy work returns 429; retry is required. Native provider work is outside these slots. |
| Counter/nonce retention | Indexed bounded cleanup of at most 100 expired operational auth rows per request, with `SKIP LOCKED`; no business identity, inventory, order, ledger or session cleanup is added. Read-time expiry remains authoritative. |

Admission counters commit independently before work; exceeding a limit cannot roll back that request's counter. Nonce consumption also survives credential/session failure. The additive SQL change is only `didar_login_attempt_expiry_idx`, replayable through the existing DIDAR schema installer; no history backfill or deletion of active rows. Normal credential verification still uses the original salted scrypt parameters/timing-safe comparison and original canonical sessions, now asynchronous within work admission. Unknown accounts use dummy admitted KDF work. Existing password trimming (SEC-04) and native provider throttling (SEC-03) are deliberately unchanged.

No account disable, account-only hard limit, new challenge/MFA/recovery or alternative credential verifier is introduced. A genuinely shared NAT/network can still share a network quota or receive a transient 429; someone on the same actual network may interfere with its budget. Distinct genuine networks, distributed IPv4/IPv6 source pools and sustained system-wide resource exhaustion need separate capacity/abuse policy. Four slots and the pacing values are bounded technical defaults, **not** accepted production SLOs or capacity claims. This package closes the original shared-Next collapse and caller-controlled-header bypass under the supported topology; it does not promise zero DoS or distributed-guess prevention.

## Verification and evidence boundary

New actual evidence and independent reviewers are linked in `docs/audits/auth-hardening/FINAL_HANDOFF_FA.md` when complete. Persistent affected regressions are `tests/auth-hardening.test.ts`; unchanged PR 24 guards use `tests/native-product-targets.test.ts` plus independent cases. The multi-source loopback probes require Linux-style loopback source binding in the owned QA environment; Mac/network aliases and public TLS are NOT_VERIFIED. Every stage's real close code/signal is recorded; failed attempts remain visible. Previous #18/#24 full suites and populated preservation are inherited only where unchanged, not reported as newly run.
