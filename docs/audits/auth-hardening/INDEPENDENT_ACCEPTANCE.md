# Independent SEC01/SEC02 acceptance

**PASS for the bounded correction under the documented topology.** Nonimplementing reviewer wrote no application code. Final read-only source/configuration review found no must-fix defect within this scope. This is not production, S1, native-auth, distributed-abuse or rollout certification.

Authorized base: `2c634ffdb77d4683271b5b218ca0a606af74004a`. Tested application commit: `fb9daec7a947f234e7931c63f62d70e92e273c76`.

| Frozen provenance | SHA256 |
| --- | --- |
| Application source | `ea2239fcacbbbc80b2495388267d82d90f8edc33e2424b68fb692eef5186de05` |
| Production outputs | `ea1943ce90637868e9fceffd03477f5e4840834cf63beb747520659602547d37` |
| All 52 tracked test files | `8a4511339cb3102058e34a26a0fdc1f43d981c78d4ec96a0e63537dffd40f71d` |
| Seven executed reviewer scripts | `af6c8cb3869d59a882bc8cd0cc7f6749340980b883f618bdf35d6f6e0abf7fe5` |
| Shared auth-network helper, root and copy | `bf566fa44d8e9e8f421d7031f9e8a3a0cb67b7f885098c67a25811fff678db18` |

All initial 1,791 compiled files survived byte-for-byte; zero runtime additions. Original source/output receipt and all test/reviewer/dependency hashes remained unchanged. Runtime dependencies are symlinked from the frozen workspace; root and copied shared-module hashes were both verified. This evidence establishes a full-workspace runtime, not a self-contained deployment package.

## Actual execution

One controlled attempt, run `auth-20261018055943718-62ed321f`; no diagnostic application/browser failures. [Final independent check](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/INDEPENDENT_FINAL_CHECK.json), [durable completion](../../../verification/auth-hardening/reviewer/runs/auth-20261018055943718-62ed321f/COMPLETE.json), and [run index](../../../verification/auth-hardening/reviewer/README.md).

| Executed stage | Actual result |
| --- | --- |
| Original schema/demo setup and native QA seed | Both child close codes 0 |
| Persistent affected regressions | 16 PASS, 0 fail, 299 assertions: ten new auth cases plus six unchanged PR24 cases; actual child close 0 |
| Independent pre-restart HTTP/PostgreSQL | 19 cases, actual child close 0 |
| Intentional real API stop/restart | Original API graceful close 0; same database, keys and unchanged artifacts restarted |
| Independent post-restart HTTP/PostgreSQL | Four cases, actual child close 0 |
| Real authenticated browsers | Native Admin, native Vendor and B2C Customer; six 1440/390 screenshots; zero page errors; actual browser child close 0 |
| Wrapper and supervisor | Each actual close 0, separately observed by its parent; final durable completion after parity and cleanup |

No signals or spawn errors occurred for verification stages. Service shutdown close receipts are also retained: both API instances and private Next closed 0; the ingress was intentionally stopped by SIGTERM (code null), not misreported as exit0 or a test failure. The monitor's own exit is not independently observed or claimed. Raw per-case records that include `safe(response)` sometimes carry numeric HTTP `status` instead of the case label; these are response codes. Successful assertions, top-level phase PASS and independently observed phase exits establish the 23 completed checks. Raw evidence remains unchanged.

## Independent findings and closure

Actual TCP clients bound separate loopback source addresses; no simulated IP header substituted for network identity. One real source exhausted 201 network admissions through the shared ingress/Next connection; another genuine source still logged in and registered. Direct and proxy attacker forwarding headers, forged protocol headers and cookie resets could not create a fresh budget. Forty wrong-password attempts against the existing customer did not globally ban that account: correct credentials from a distinct true network succeeded.

Policy A was verified: unsigned direct API requests use only their actual socket peer, including an allowlisted peer. Allowlisting permits signed metadata assertions, not account authority. An invalid present assertion never falls back; a QA-valid signature from an untrusted actual peer was denied. Private Next missing/malformed proof failed before consuming backend quota. Stale, future, method, path and body tampering were rejected. Nonces survived a failed credential attempt; replay at either API or private Next could not obtain new effective admissions. After real API restart, the already-consumed proof was rejected while still only 5,315 ms old, proving replay rejection rather than stale-proof rejection. Exhausted network/account quotas also survived restart.

Thirty-two concurrent requests produced atomic persistent counters. Real PostgreSQL lock saturation returned 429 and released cleanly; distinct-network concurrent KDF work observed at most four global slots (219 samples, maximum four). This is a bounded functional check, not throughput or capacity certification. Customer registration and subsequent login kept one canonical identity. Supplier registration created an inactive pending business, retained supplier role and could not access the privileged acceptance route. Existing demo user IDs, roles, supplier bindings and password hashes remained identical in memory. Product, Offer, inventory/UID, order and financial-event/posting fingerprints remained unchanged. Product/Offer were populated in fresh QA; UID/order/financial history was empty. These negative-change checks do not replace inherited populated-history/restore acceptance.

Native Admin/Vendor used the original real authentication routes. Own-seller linking worked and foreign-seller selection was denied. PR24 forged URL parent, redirected body ID and mixed batch mutation attempts remained 409; the protected variant was unchanged while unrelated native CRUD remained usable. Actual native Admin/Vendor shell navigation and the customer login/account/canonical PDP were rendered in the browser. Three screenshots were visually inspected: Admin desktop, Vendor mobile and customer mobile; all six are retained.

## Final source/configuration review

Read-only review covered shared HMAC canonicalization/binding, socket-reading ingress, Next validation/re-signing, API peer policy/nonce transactions, atomic counters, bounded cleanup, held PostgreSQL work locks, asynchronous original scrypt/session flow, replayable index and local transport wiring. [Configuration contract](../../AUTH_NETWORK_TRUST_AND_THROTTLING.md) matches the tested Policy A model. No arbitrary incoming forwarded header becomes trusted original-client identity. Counter and nonce commits survive credential/session rollback; target-wide pressure is capped delay only. No alternative credential, role, tenant or financial authority was added.

The actual supported path is public first-hop ingress → private Next → API with a server-only shared key, exact API proxy-peer allowlist and TLS/private transport. Next without first-hop proof rejects before upstream. Missing-key startup/runtime behavior, public TLS certificates, IPv6 operational topology, external proxy replacement and an owner's Mac/host were source-reviewed or documented where applicable, not newly executed here. Existing bare standalone deployment entrypoints need the ingress provisioned; no target deployment was changed.

A genuine shared NAT still shares network/pair quotas and may receive temporary 429s; this correction does not eliminate same-network interference. Genuine distributed sources and volumetric DoS need separate controls. Stable `COOKIE_SECRET` is required for budget continuity; changing it changes bucket namespaces. Native Medusa `/auth/*` throttling (SEC03), password trimming (SEC04), key rotation, production capacity, TLS/network restrictions and broader security/S1 acceptance remain explicit residuals. None is represented as closed by this bounded run.

## Resource and inheritance boundary

Only two new exact-ID/labeled loopback PostgreSQL17/Redis7 containers were used. Both containers and both anonymous volumes are absent, all owned process groups have zero live members, and the ten protected preexisting containers/volumes/states remain unchanged. No owner configuration, external deployment, live provider/financial transaction, merge, main update, CRM or Phase5 work occurred.

Prior Issue18/PR24 full suites and populated preservation remain inherited evidence; they were not rerun or recounted. Fresh evidence consists only of the affected 16 tests, 23 independent HTTP/PG cases, three browser journeys, source review and explicit execution/parity/resource receipts. Ready for Chief Architect review within this scope.

The final Persian handoff `FINAL_HANDOFF_FA.md` was read for factual consistency: candidate/receipts, 16/299 +23 +3 counts, controlled ingress SIGTERM, numeric-status encoding, native preservation, inherited-versus-fresh evidence and unverified target configuration match this review. Core design/source checkpoint is separate; its platform-interrupted final follow-up is not represented as runtime approval.
