# Didar Gold progress

- Starting commit: fbb4e099a3ed56505f8267d58cb2f20c9967644a (initial README, main).
- Generated using official create-mercur-app 2.3.7, basic template plus official Next.js storefront; not a framework clone.
- CLI network fetch required NODE_USE_ENV_PROXY=1; TLS verification retained.
- Scope: shared catalog, supplier offers, milligram weights, integer IRR pricing, transactional sandbox checkout, Persian RTL and role interfaces, tests and Docker.

- Implemented Persian RTL storefront and customer/supplier/admin gold interfaces, native shared product creation, supplier-scoped exact-weight offers, pricing components, SQL-backed auth, cart/checkout and payment sandbox.
- 12 pricing/commerce tests passed, including contention, multi-supplier order isolation, idempotency and reservation release; 3 Chromium browser tests passed.
- Native admin, vendor, API and Next production builds passed. Fixed missing starter i18next resolution and pinned SWC 1.11.31 for the managed runtime.
- Native Jest in-process Medusa runner was incompatible with Mercur's patch loader (it attempted to execute a .d.ts file). Preserved the health assertions against a real server process; the health test passes.
- First Docker API build passed with official Bun binary and injected proxy CA; TLS verification preserved. Final image and stack verification in progress.

- Final code committed as 7b8ee0f; setup/start configuration saved to environment draft. External staging target/access requested asynchronously. Final Docker build is running after removing only task-created caches and the outdated task-created image to recover disk space.

- External GitHub/npm/Docker endpoints began returning HTTP 503. Vendored the official CLI route metadata already fetched over verified HTTPS and seeded its supported fallback cache; codegen succeeds offline.
- Added prepared-artifact Docker packaging to reuse installed, verified dependencies during the outage. Clean source-image rebuild currently requires external registry recovery. Native panels/backend/storefront are rebuilding locally before packaging and Compose smoke tests.

- Final prepared API image and slim standalone storefront built. Fixed private Docker PostgreSQL TLS selection; Compose migrations and repeated seed succeeded. All four services became healthy and restart checks preserved the expected catalog.
- Re-ran against final containers: 12 pricing/commerce tests (40 assertions), 3 Chromium E2E tests and 1 Medusa health test passed.
- Applied requested Oracle Always Free target: Ubuntu ARM64 A1, maximum 2 OCPUs / 12 GB, staging-only host marker, source-only SSH deployment, no provisioning or paid fallback. Static native dependency/integrity audit and 8 mocked deployment-guard tests passed; ARM Compose config and scripts validated.
- All four image manifest queries returned HTTP 503. Native ARM builds/runtime and Oracle deployment remain unverified, with no VM/SSH target or capacity supplied. Local MVP is not blocked by those external steps. No production deployment or OCI resource provisioning occurred.
- Saved updated install/start environment draft and prepared DELIVERY.md with exact results, architecture boundaries and remaining blockers. Source commits remain local; portable Git bundle will include final delivery history.

## 2026-10-15 — Full mission audit resumed

- Original checkout/bundle preserved; clean main at c71e313. Remote main and fetched HEAD verified at the same full SHA (publication succeeded in recovery; prior delivery text saying local-only is historical and superseded).
- Read the complete pasted 14-section mission, repository instructions/docs, business ledger, storefront, tests and deployment. Created REQUIREMENTS_MATRIX.md before application edits and DECISIONS.md with bounded implementation decisions.
- Audit confirms missing catalog hierarchy/assets/detail pages, supplier approval/product requests, provider init/callback/cancel and fulfillment/tracking. Historical tests are not current-run evidence. Continuing implementation without deployment attempts.

## Backend completion milestone

- Added repeatable additive catalog/commerce migrations preserving the original ledger, hierarchical categories/collections, shared product metadata/editing/publication, PostgreSQL-backed validated multi-image management, supplier pending registration/approval/deactivation, product requests/review and exact-weight active offers with fixed/percent labor and supply terms.
- Added configurable per-piece fees/upward rounding/default margin, manual rate-source interface, coherent repeatable-read catalog quotes and immutable commercial-input snapshots. Purity changes invalidate offer versions. Existing stock locking/retry/expiry semantics retained.
- Added persisted idempotent sandbox payment initialization/confirmation/callback/cancellation, a disabled Iranian-rial provider boundary, scoped paid-order fulfillment/tracking and customer profile persistence. Demo authentication now requires explicit local runtime; login/session/HTTP boundaries hardened.
- Current-run verification: API TypeScript passed; **34 unit/integration tests passed, 0 failed, 183 assertions** against the actual development API/PostgreSQL. Includes all eight prior commerce tests, new approval/catalog/image/payment/fulfillment/profile paths and stale quote/snapshot regression. Evidence: /tmp/didar-evidence/commerce-verified.log. Early runs interrupted by dev reloads and one test helper status collision were diagnosed and corrected; no assertions were removed.
- Original delivery bundle SHA-256 still b4a438fc7735cb4e41592278d079c1d8903c439abbbea4dd7b77fd341bd47d28; git bundle verify passes. Browser/build verification continues before software completion claim.
