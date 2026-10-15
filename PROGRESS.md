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

## Routed interface and staging safeguards milestone

- Added independent Persian RTL commerce routes and reusable storefront/context/components for catalog/detail/category/collection, cart/checkout, auth/profile/orders, and admin/supplier operations. Real image upload/gallery/alt/order/removal works with authenticated draft previews; missing images are honestly labeled. Checkout intent survives retry/reload.
- Production frontend build/typecheck passed for 17 routes. Browser run passed the complete admin→approved supplier→two-weight inventory→single paid order→stock/allocation→delivered tracking journey, the three original flows and the bounded chunked-upload rejection. Expiry/profile path separately passed after a message selector correction. Real 390px mobile filter overflow was identified and fixed at the CSS intrinsic-width cause; rebuilt browser regression is pending.
- Native codegen, admin, vendor and API builds passed; real Medusa HTTP health test passed. Clean source Docker verification found the native panel config loader needs build-only authentication values to resolve subpath assets. Added a child-process build helper generating ephemeral random values, without persisting secrets or weakening runtime validation. Clean image rebuild is in progress.
- Four current official image manifests advertise linux/arm64; static locked native-artifact audit, merged ARM Compose validation and 23 environment/Oracle/SSH/backup guard tests passed. Added secure destination configuration, source-only fresh release directories, backups and rollback instructions. No Oracle or production deployment attempted.
- Compared six ignored local secret values against 212 current candidate source files and 519 historical blobs: zero matches. Historical pattern review found templates/development fixtures only, no real credentials or private keys. No OCI/SSH staging binding names are present.

## Full local acceptance verified

- Final consolidated host run: **36 tests passed, 0 failed, 210 assertions**. Expanded coverage includes positive and repeated product-request approval, category cycle rejection, category/collection edits, supplier deactivation with existing sessions, invalid callback binding and unpaid fulfillment.
- Final Playwright production-build run: **7 passed, 0 failed** (six browser workflows plus an HTTP chunked-body proxy test). It verifies parent/subcategory and collection pages, two uploaded images/gallery, supplier approval and two exact weights, exactly one paid order/payment/stock deduction, isolated supplier allocation, full preparation/dispatch/delivery and customer tracking; failure and expiry release, saved profile and 390px responsive layout also pass.
- Visually reviewed desktop and mobile screenshots under /tmp/didar-evidence. Samples use explicit missing-photo placeholders; test uploads are clearly synthetic image fixtures, not invented product photographs.
- Build-only panel-secret helper passed under NODE_ENV=production with `/dashboard/assets` and `/seller/assets` paths and no configuration fallback warnings. Runtime secret enforcement is unchanged. Clean source Docker build has installed frozen dependencies and built both panels/backend; final Next/container acceptance is continuing.
- Updated reusable environment start_skill saved to a nonblocking review draft; existing install script and network/secret settings retained. Draft save does not publish a new environment snapshot.

## Clean containers and source preservation

- Fresh source Docker install/build passed with frozen dependencies and verified TLS. Both native panel asset bases, Medusa and Next built inside the image. Packaged standalone storefront directly from that source-built output (no host dependency fallback), avoiding a redundant rebuild after documentation changed.
- Default Compose: repeatable native/Didar migrations and seed exit0, four services healthy, matching catalog requests and demo login401 under staging. Image ENV contains no runtime database/auth secrets.
- VFS duplicates a roughly5GB API filesystem during recreation and exhausted the32GB overlay; sandbox shell startup briefly failed with ENOSPC. Cleared obsolete task diagnostic logs and removed only the completed one-shot migration container, preserving final test evidence/source/bundles/all database volumes. Default app remained healthy. Switching to explicit local testing is being retried after stopping/removing its API container first to avoid duplicate-copy disk usage.
- Added a Compose-aware test helper that refuses staging/public app ports and privately targets the API's actual database; it correctly rejected the default staging runtime. Full local Compose tests are the remaining acceptance step.

## Final container acceptance

- Compose-aware regression passed: **36 tests /210 assertions /0fail**, followed by **7 Playwright checks /0fail**, against the actual source-built API, production standalone storefront and private Compose database. The test helper's Linux bridge path and default-staging refusal were both exercised.
- Stdin-only secure administrator provisioning/login/fixture removal passed. Both native Mercur panels and their correctly prefixed JavaScript assets returned200. Sixty-eight application/build source files in the API image exactly match committed inputs.
- Restarted API/storefront; all four services healthy, matching persisted catalog. Native offers/stock levels/orders remain0 after gold workflows, confirming no competing generic commerce ledger. Runtime is explicitly local sandbox and loopback-bound, not external staging.
- Final DELIVERY, full requirements matrix and durable logs/screenshots/JSON evidence prepared. Software MVP locally complete. Only native ARM execution/authorized Oracle access and production provider/legal/commercial/operational prerequisites remain external; no deployment/provisioning attempted.

## Phase 1 UID/RFID implementation — in progress (2026-10-16)
- Continued existing branch `didar/phase1-intake-uid-rfid` at `3bddce5`, preserving verified MVP and historical stock.
- Restored persisted local services without reinstalling; baseline: **36 tests, 210 assertions passed** (fresh execution).
- Implementing additive item registry/intake/RFID and versioned Gold-First policies. This entry is **not Phase 1 acceptance**; fresh integration/browser verification follows.
- Git transport is available. GitHub GraphQL/REST access is currently proxy-forbidden; branch pushes can still update PR #1 and its head can be verified through Git refs. No merge or Oracle deployment attempted.

### Phase 1 backend verification milestone
- **50 backend/integration/migration tests passed, 480 assertions** on the restored local PostgreSQL/Mercur runtime. Includes all original 36 regressions with intentional additive Gold-First expectations and explicitly granted supplier write fixtures.
- Verified 19 separately weighed units (5/135 g, 2/127 g, 12/117 g), global UID/EPC constraints across suppliers, audited retagging, scoped counting, immediate permission revocation, exact-item concurrent checkout with two customer identities, once-only payment/release/expiry, physical return/quarantine/restock, equal-weight item grouping and immutable intake/pricing history.
- Verified versioned tolerance exceptions remain valid for posting after a newer policy version, without changing the recorded verification; ordinary weight/count mismatch still blocks verification. Default tolerance restored to zero after QA.
- Stock invariant inspection: **zero derived-quantity mismatches** across all itemized offers at this milestone. Clean/repeat additive migrations preserve a legacy quantity and historical paid price JSON without creating units.
- Existing 23 local deployment guards passed; no cloud operation occurred. Secret pattern/history review found zero token/private-key/credential-URL findings across 246 candidate source files and 605 reachable Git blobs before this commit.
- Browser acceptance and fresh production builds remain in progress. Earlier UI scan-queue and permission-checkbox defects were identified through real Playwright runs and repaired; this milestone does not claim full browser acceptance.

### Publication checkpoint
- Normally pushed verified backend milestone `fb99850dee98d60560e18b38733c7ac2e00f4a11` to the requested feature branch; remote branch SHA confirmed. No force push, main update, PR merge or Oracle action.
- GitHub API/CLI remains `Forbidden`; Git transport's `refs/pull/1/head` still advertises the prior specification commit despite the feature branch advancing. PR head/status/description cannot yet be independently reconciled through the permitted API. Final source publication will be verified through the remote branch/tree; this is a separate PR metadata verification limitation, not a reason to discard work.
- Main also received an independently committed copy of the same authoritative specification (`7868b54`); its document content is byte-identical. No application changes from main were missed or overwritten.

### Compiled application acceptance
- Fresh official route codegen, native admin/vendor panel builds, API compilation and Next production build passed (18 storefront routes including `/manage/operations`). Rebuilt the API after the final void-tag correction and verified the compiled handler contains it.
- Ran **51 backend/integration/migration tests, 492 assertions, all passed** against the actual compiled API. Added a permanent-void-UID case: pairing a void unit is denied, authorized unpair can release its tag, and its UID cannot be reused.
- Ran the **entire Playwright suite in one successful production-runtime run: 8 passed** against compiled Mercur API and Next standalone server. Existing catalog, mobile RTL, image, approval, checkout, expiry, fulfillment and bounded-upload checks pass alongside the complete Phase 1 browser intake/sale/count journey.
- Native Medusa HTTP health: **1 passed** against compiled runtime. Deployment guard suite: **23 passed**, local/mocked only. ARM64 lock/native-artifact static audit passes; no new dependencies were added and no physical ARM64 execution is claimed.
- Four actual runtime secret values were compared against source and built application files with **zero matches**. Public local-only demo credentials and unauthenticated/documented local service URLs are deliberately distinguished from runtime deployment secrets.
- Scanner reads are queued and repeat reads deduplicate; the permission screen updates its pending checkbox state and rolls back on save errors. Previewed the resulting Persian counting screenshot. No hardware RF integration or real scale measurement is claimed.

### Final isolation/packaging review
- Found and fixed an additional tenant boundary in count reports: a supplier-scoped count can contain an administrator's out-of-scope scan. Supplier responses now redact competitor UID, item ID, EPC/raw value; the administrator retains the original audited observation. The focused real-API regression passed (**1 test / 15 assertions**); it is included in the full suite for the final container run.
- Next standalone tracing included a local `.env` configuration file. Prepared-image packaging now writes a sensitive-file `.dockerignore` before transferring the standalone context. Runtime credentials remain injected by Compose and are excluded from image build contexts.
- Reused the fresh verified production artifacts for local image packaging; no dependency reinstall, application bootstrap, Oracle operation or database reset. The managed Docker client cache was redirected into a writable workspace directory after its default home-directory write failed.
