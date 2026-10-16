# Phase 2A / 2B / 2C release evidence

Baseline: `3bfb982fca143ea1695df059c952b45119fefbf7`. CODEX_LINUX_VERIFIED on Linux x64, Node 24.19.0, Bun 1.4.3, PostgreSQL 17, real Chromium `/usr/bin/chromium`.

Command: `CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test` (Bun prepended to PATH). Final reviewed run passed:

| Check | Actual result |
|---|---|
| Backend, HTTP-domain, migration, finance, privacy and security | 143 passed; 1,771 assertions; zero failed/skipped |
| Native Medusa HTTP | 1 passed |
| Production Playwright | 20 passed, 1.6 minutes |
| Official route generation + admin/vendor/API/Next production builds | All passed |
| Build source, output and platform receipt | Verified after final run |
| Populated historical upgrades | Two read-only volume clones; migrations replayed twice; all audited fingerprints unchanged |
| Screenshots | 8 actual production captures; 1440×1000 and 390×844 |

New acceptance covers central registration through Merchant A's storefront, a published ten-product page, actual effective RETAILER pricing with C on CASH, merchant-scoped PDP/cart/quote/checkout, attributed sandbox purchase and denial of B's private products. Tests also cover a shared public master with hidden/private merchant offers, anonymous and wrong-account invite denial, immediate grant revocation, scoped staff/default deny, stable handle, stale edits, simultaneous first-save, forged share IDs, dynamic stock eligibility, single-product pages, safe reordering/pause, immutable origin/attribution, exact UID reservation and financial regressions.

Production rate limits are unchanged. Independent browser tests start a fresh login-attempt window only in the uniquely labelled disposable `didar_qa` database; the preparation refuses configured/owner databases. All QA containers and anonymous volumes are removed on completion. Original stopped services, volumes and credentials were never reset or replaced.

Screenshots are unedited Playwright captures of the implemented software using clearly synthetic QA catalog/store records. No commercial image acquisition, real merchant price approval, physical phone/printer/RFID, native Mac or live financial-provider test is claimed. Owner Mac acceptance is deferred until every v3 feature phase is implemented.

Source review checked parameterized SQL, ownership at every public read/quote/checkout boundary, noncustomer price redaction, context-cookie forwarding, same-origin mutations, lock ordering, permanent UID behavior, append-only financial integration and additive schema/history preservation. Remaining phases 3–9 are not marked complete.
