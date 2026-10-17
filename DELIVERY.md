## Mercur-native recovery — Chief Architect review checkpoint (2026-10-17)

The original **Admin `/dashboard/didar`** and **Vendor `/seller/didar`** contain real SDK routes, navigation, Product widgets/custom-field display and existing Didar PostgreSQL services. Restricted merchant staff/global content operators use native permissions without role promotion; pending status, audited access controls, seller lifecycle eligibility and protected legacy deep-link handoff are implemented. Customer navigation has no internal management tabs. Linked operator orders/wallet use native panels; customer history/wallet remain in B2C. Missing native connection/public origin retains the guarded transition page.

**Final verification: 174 backend tests / 2,238 assertions, 1 native HTTP test, 27 production browser tests; zero failures. Production builds and the complete current source/output/platform receipt passed.** See [the evidence receipt](verification/mercur-native/RESULTS.md) for the final completed run and actual screenshots. Both historical read-only volume clones preserve audited commerce/image fingerprints after repeated native identity/ACL/lifecycle migrations. No original records/configuration are reset and no live finance or outbound messaging is enabled.

**STOP after publishing verified recovery. CRM and Phases 5–9 are NOT STARTED and require Chief Architect review and authorization to continue.** This later owner instruction supersedes earlier automatic continuation text. [Review checkpoint and remaining architecture decisions](docs/MERCUR_NATIVE_RECOVERY_REVIEW_CHECKPOINT.md) · [implementation/connection](docs/MERCUR_NATIVE_RECOVERY_IMPLEMENTATION.md) · [feature mapping](docs/MERCUR_NATIVE_RECOVERY_MAPPING.md). CORE-01 remains proposed; panel integration does not claim native/gold commerce authority convergence or crash-atomic Product projections.

## Merchant growth Phase 4 — DONE & TESTED (2026-10-16)

Delivered the PostgreSQL luxury Visual CMS on Phase 3 main `95836630ce29cef3a23a251a6f0991116cae8f76`. Persian `/manage/pages` composes all eleven typed blocks with protected real image/video processing, desktop/mobile media, structural presets, drag/up/down reorder, authenticated noindex preview, immutable blocks/titles, optimistic drafts, review, schedule/publish/pause/rollback and actual actor audit. The same renderer serves Didar/merchant home, category/collection and existing curated share pages. Existing ProductCard/OfferCard, profiles, stock, UID, cart and accounting remain authoritative; no copied prices, new catalog or sharing engine.

**Final verification: 161 backend tests / 2,047 assertions, 1 native HTTP, 22 production Playwright tests; zero failures.** All production outputs and current source/output/platform receipt passed. The real Persian browser publishes all 11 block types, approved populated collection and live Product/Offer prices, checks 1440px/390px geometry and no page overflow, keyboard slider/mobile product rail, video pause and reduced-motion fallback. Safe media/tenant isolation, schedule/rollback/concurrent drafts, unchanged share attribution, real PostgreSQL restart plus a fresh compiled API and clean/populated migration replay passed. Both historical volume clones retain all audited commerce/image fingerprints. Four genuine screenshots, a real software recording and honest lab metrics are included.

Evidence: [handoff/API/runtime](docs/PHASE4_VISUAL_CMS_IMPLEMENTATION.md), [results](verification/merchant-phase4/RESULTS.md), [changed files](verification/merchant-phase4/CHANGED_FILES.txt), [desktop](verification/merchant-phase4/cms-desktop.png), [390px](verification/merchant-phase4/cms-mobile-390.png), [recording](verification/merchant-phase4/cms-responsive-walkthrough.webm).

**NEXT / PENDING:** Phase 5 CRM Lite, then Phases 6–9 campaigns, agents, customer referrals and Growth Center. The complete roadmap remains unfinished. **BLOCKED:** no Phase 4 software blocker. Commercial media, owner Mac/physical-device testing, external social previews and live provider/legal/accounting acceptance are not claimed. API hosts require FFmpeg/FFprobe; prepared API image builds need Debian repository access for that runtime package. No Oracle/live finance/outbound messaging/original data reset. Continue without a Mac test or interview gate.

## Merchant growth Phase 3 — DONE & TESTED (2026-10-16)

Delivered assisted onboarding and safe decoded photo processing on Phase 2 main `00447d39ffa64881c35813b5242b95fd356c84bb`. Persian `/manage/onboarding` reuses the existing master/request/approval, taxonomy/facet, profile, storefront, intake/UID and sharing workflows. Joining an existing master never duplicates it. Actual creator/uploader/assistant/reviewer events are persisted; scoped staff capabilities do not broaden global roles or finance access.

Photos validate signatures/decoding, size/pixels/frame count, EXIF orientation, sRGB, metadata stripping, transparency and proportional WebP variants. Private review, default merchant-only media, explicit consent for shared-master reuse, revisioned dimensions/quality/byte budgets, upload idempotency, quotas/replacement, guarded image/OG URLs and actual responsive browser rendering are connected to PostgreSQL. Existing image IDs and original Product/Offer/UID/accounting records remain intact. Private merchant new-master publication cannot create a global discovery window before a public eligible Offer. Customer UID QR mode remains global-only; warehouse barcodes and permanent UID resolver behavior remain unchanged.

**Final reviewed results: 152 backend tests / 1,922 assertions, 1 native HTTP test, 21 production Playwright tests; zero failures.** All four production builds/code generation and source/output/platform receipt passed. Real large-JPEG → private receipt → DIDAR product/media approvals → exact measured UID intake → assigned RETAILER profile → scoped WebP PDP/OG journey passed. Twenty image operations, replacement quota, migration replay and actual disposable PostgreSQL restart passed. Two historical database clones preserve original image bytes and audited commerce fingerprints.

Evidence: [handoff](docs/PHASE3_ONBOARDING_MEDIA.md), [results](verification/merchant-phase3/RESULTS.md), [actual files](verification/merchant-phase3/CHANGED_FILES.txt), [mobile PDP](verification/merchant-phase3/onboarding-pdp-390.png), [merchant wizard](verification/merchant-phase3/onboarding-merchant.png).

**PENDING:** v3 Phase 4 complete Visual CMS, then CRM/campaign/affiliate/referral/Growth Center Phases 5–9. The full roadmap remains incomplete. **BLOCKED:** no Phase 3 software blocker. Actual commercial photography, external social-host reachability, physical hardware, native Mac and live providers are not claimed. Mac acceptance is separate after all features; no owner-run test or interview is required to continue development.

## Merchant growth Phase 2A + 2B + 2C — DONE & TESTED (2026-10-16)

Implemented tenant-scoped merchant storefronts, the navy/white luxury foundation and persistent curated/single-product sharing over main `3bfb982fca143ea1695df059c952b45119fefbf7`. Real server authorization, expiring invite access, limited memberships, scoped price/quote/cart/checkout, immutable order origin and share attribution reuse the existing shared Product Master, Offer, UID and ledger. Persian `/manage/storefront`, `/manage/sharing` and `/m/{handle}` are connected to PostgreSQL and real APIs.

Final reviewed verification: **143 backend tests / 1,771 assertions, 1 native HTTP test, 20 Playwright tests; zero failures**. All four production builds and official route generation passed. A further source/output/platform build receipt check passed. Migration replay on fresh/populated QA plus read-only clones of both historical databases preserved all audited business fingerprints. Original PostgreSQL volumes and configuration were not changed. Eight genuine screenshots cover home, merchant, catalog and PDP at 1440px and 390px.

The acceptance journey publishes ten approved own products, applies an approved RETAILER profile (including C on CASH), preserves merchant context through central registration, and completes an attributed sandbox purchase while denying Merchant B. Cross-tenant direct IDs, shared public masters with private offers, invite revocation, stale revisions, concurrent first-save, UID history and finance regressions are tested.

Evidence and actual file list: [Phase 2 handoff](docs/PHASE2_MERCHANT_STOREFRONT_SHARING.md), [results](verification/merchant-phase2/RESULTS.md), [screenshots](verification/merchant-phase2/screenshots), [changed files](verification/merchant-phase2/CHANGED_FILES.txt).

**PENDING:** Phase 3 assisted onboarding/media and subsequent v3 Phases 4–9. This delivery does not claim the full roadmap complete. Owner Mac acceptance occurs separately after all features, never as a per-phase gate. Actual commercial photography, physical devices and live-provider/legal configuration are not claimed by Linux QA. **BLOCKED:** no Phase 2 software blocker. Payments and Tahesab remain sandbox/mock only; no Oracle, duplicate Product/UID or new ledger.

## Gate 5 Linux release verification and Mac preparation — 2026-10-16

**Published financial sandbox scope:** Gates 1–3 implemented; Gate 4 provider-independent mock/dry-run implemented, **concrete Tahesab mapping BLOCKED_BY_SPEC**; Gate 5 integrated Linux verification and Persian Mac preparation implemented. **MAC_UAT_PENDING / REAL_RFID_PENDING / accounting sign-off pending. The entire roadmap is not declared complete while these acceptance dependencies remain.** Gate 0 was already complete and was not reimplemented.

New Gate 5 slice: additive `finance-uat-schema.sql`, DB-derived reconciliation/checkpoint service and `/didar/acceptance`, Persian `/manage/acceptance`; `uat:prepare` creates/reuses an isolated synthetic 20-UID dataset through real APIs; `docs/MAC_UAT_CHECKLIST.md` provides one complete Persian walkthrough. Existing financial modules were formatted for review. Persian integer rendering now preserves IRR beyond Number.MAX_SAFE_INTEGER. Pool idle errors reconnect after PostgreSQL restart. Disposable QA containers reserve explicit random loopback ports so Docker restart cannot silently change their API database endpoint; no persistent owner configuration changed.

| Final verification | Actual result |
|---|---|
| Backend/workflow/security/migration/mock/integrated suites | **93 passed, 1055 assertions, zero failures/skips** |
| Native Medusa HTTP test | **1 passed** |
| Complete production Playwright suite | **13 passed** |
| Official route generation, native panels, API and Next production builds | Passed; final source/output/platform receipt still matches |
| Full financial journey | Exact 5/135g +2/127g +12/117g +100g UID/EPC intake, payment replay, 112g entitlement, mixed procurement/partial settlement, same-liability wallet, aggregate mock close, physical return/refund/restock passed |
| Persistence and recovery | Actual disposable PostgreSQL restart; complete rows/fingerprints unchanged across **14 physical/commerce/financial history tables**; API reconnect and subsequent UAT preparation passed |
| Repeatable owner dataset | 20 unique UID/EPC, separate100g master, synthetic own supplier/customer, unpublished products, mixed contract/mapping; repeat success preserves business rows; no automatic trade/payment |
| Local container runtime/security smoke | Fresh private PostgreSQL/Redis; compiled API + Next proxy + six finance APIs healthy; application filesystem/source read-only; app ports loopback-only; data ports unpublished |
| Source review | Per-instrument balances, cost/source provenance, idempotency, tenant/cost redaction, additive migrations and live-operation guards reviewed; credential-pattern scan zero findings; whitespace check passed |

Container smoke mounts the same verified prepared artifacts read-only using cached Node24 containers. It is **not** a new production-image build, external deployment or native ARM/Mac claim. The private plain-PostgreSQL URL uses the existing Compose-local sslmode=disable convention; external HTTPS/TLS settings were not weakened. Standalone and integrated accounting mocks never call a real Tahesab service. Production accounting/chart/tax/legal/wallet assumptions remain provisional. Baseline repository history, prices, original stock and configuration were preserved; no Oracle, live financial transaction, volume reset or force push occurred.

Evidence: `verification/phase2/gate5.txt`, `verification/phase2/gate5-container-smoke.txt`, `verification/phase2/build-receipt.json`. Prior gate evidence follows in this file and `verification/phase2/gate1.txt`–`gate4.txt`.

## Gate 4 offline adapter — CODEX_LINUX_VERIFIED; concrete API BLOCKED_BY_SPEC (2026-10-16)

Implemented `tahesab-schema.sql`, strict `didar-aggregate-v1` validation, deterministic merchant/account/invoice mappings and source-claimed closes, persistent local mock documents, append-only attempts, retries and edited/deleted-document reconciliation. New explicit quantity memo projections distinguish assigned documented procurement, handover and owned receipts without adding a second physical inventory source. Real `/didar/tahesab` + Persian `/manage/tahesab`; optional standalone `tahesab:mock` and local-only nightly dry-run close. Export debit/credit totals match journals and exclude buyer/UID/EPC/order data. Full internal exports are admin-only.

Final fresh QA against the passed unchanged production build: **89 backend/workflow/security/migration/mock tests / 918 assertions**, **1 native Medusa HTTP test**, **12 Playwright tests**, zero failures. Standalone mock auth/transient/idempotency/restart persistence is included. Concrete vendor serialization/endpoints/import behavior remain **BLOCKED_BY_SPEC**: api-1.json is absent. No proprietary spec, credentials, invented Tahesab endpoint or live call was published. Self-review checked export privacy, immutable source claims, independent balance, completed cutoffs and retry identity. MAC_UAT_PENDING / REAL_RFID_PENDING. This is not a claim of complete vendor integration or entire-roadmap completion. Continuing Gate 5.

## Gate 3 — CODEX_LINUX_VERIFIED (2026-10-16)

Delivered additive journal/posting migration with commit-time per-instrument balance and wallet overdraft constraints, immutable projections of financial events, separate consignment custody memo, documented owned-jewelry cost/COGS/refunds, treasury allocation/title cost movements and exact residual gold-liability valuation. Wallet pending/available/reserved/pledged and internal transfers derive from postings; payable-to-wallet reclassifies the same liability. Real `/didar/ledger`, `/didar/wallet`, Persian `/manage/ledger` and `/account/wallet` are connected to PostgreSQL. Treasury cost fields are redacted from supplier responses.

Full fresh production build + QA passed: **86 backend/workflow/security/migration tests / 849 assertions**, **1 native Medusa HTTP test**, **11 Playwright tests**. Database tests reject unbalanced journals, posting edits and wallet overdrafts; concurrency/idempotency and liability reclassification tests pass. SQL trigger field selection and shared test-pool lifetime issues were fixed before acceptance. Self-review checked independent instrument balances, final-partial rounding, cost provenance, source correlations and supplier privacy; whitespace check passed. Statutory chart, legal recognition and real wallets remain provisional/disabled. MAC_UAT_PENDING / REAL_RFID_PENDING. Gate 4 concrete vendor mapping remains BLOCKED_BY_SPEC; Gate 4 offline work and Gate 5 continue.

## Gate 2 — CODEX_LINUX_VERIFIED (2026-10-16)

Delivered `finance-procurement-schema.sql`, `finance-procurement.ts`, real `/didar/treasury` + Persian `/manage/treasury`, one request per paid gold exposure, synthetic purchase records/approval, bounded multi-purchase/multi-request allocation, separate title/custody facts, partial mixed and rial-only settlement, reversals, due dates and owned/unallocated stock. Database idempotency keys compare JSONB payloads. Supplier purchase-desk data stays private. No trade/bank execution.

Final production build and fresh disposable QA passed: **83 backend/workflow/security/migration tests / 755 assertions**, **1 native Medusa HTTP test**, **10 Playwright tests**. Acceptance includes concurrent allocation rejection, title/physical gates, rial-only queue and migration replay preserving facts. Source self-review and whitespace check passed. MAC_UAT_PENDING / REAL_RFID_PENDING. Gates 3–5 remain unfinished.

## Gate 1 — CODEX_LINUX_VERIFIED (2026-10-16)

Implemented additive supplier contract/version/review and immutable checkout terms; fine-gold µg/IRR supplier events on verified payment; default gold, mixed/rial and ownership rules; one-time return-gated synthetic refunds; scoped Persian `/manage/finance`. No historical-order backfill or Phase 1 UID/price changes. Existing synthetic test teardown now retires fixtures instead of deleting financial history; browser assertions target seeded products/tenant scope while retaining history.

Verification: full production codegen/panels/API/Next build passed; **80 backend/workflow/security/migration tests, 640 assertions, zero failures; 1 native Medusa HTTP test; 9 Playwright tests passed** against the compiled API/Next servers and fresh PostgreSQL/Redis. Explicit Cloud browser overrides: CHROMIUM_PATH=/usr/bin/chromium and PLAYWRIGHT_NO_SANDBOX=1. Gate 0 was not reimplemented. Self-review: SQL append-only/uniqueness/foreign keys, source/tenant boundaries, immutable pricing and gate-controlled refunds checked; git diff whitespace check passed. `MAC_UAT_PENDING`, `REAL_RFID_PENDING`. Gates 2–5 remain in progress; no claim that the whole roadmap is complete.

# Didar local-first Mac workflow delivery — 2026-10-16

**Linux Cloud verification passed. MAC_UAT_PENDING.** This delivery implements the existing local-first specification and Gate 0 tooling. GitHub `main` is the canonical owner delivery; native Mac/Docker Desktop/Apple Silicon and real-device acceptance are not claimed. No Oracle, hosted staging, SSH, VM or production deployment is required or attempted. Phase 2 finance remains excluded.

## Implemented

- `local:setup`, `local:dev`, `local:status`, `local:stop`, `local:test`, `local:browser`. Pinned Node 24/Bun 1.4.3, OS/CPU/local-Docker checks, loopback environment guards, port diagnostics, functional readiness and safe owned-process shutdown. A session lock protects shared build outputs.
- Existing native PostgreSQL containers/volumes and configuration/passwords are reused. Fresh native data uses persistent `didar-local-postgres`. Existing additive migrations preserve UIDs, exact weights, EPC/reservation/return history, permissions, prices and orders. No application business features or architecture were replaced.
- Automated tests create independent disposable QA PostgreSQL/Redis, synthetic accounts and random loopback app ports. They never read the owner's persistent database configuration. Cleanup removes only the containers/anonymous QA volumes created by that invocation.
- Playwright uses its managed platform Chromium by default, honors explicit `CHROMIUM_PATH`, and disables the sandbox only with explicit `PLAYWRIGHT_NO_SANDBOX=1`. Full-Compose SQL checks use a loopback Docker exec relay; no host bridge-IP access or published Compose PostgreSQL port.
- Production build mode is explicit. Optional `local:test --reuse-build` requires matching source/lock/config, complete relevant output, Node/OS/CPU receipts. Changed/missing/damaged/cross-platform output is refused. Private `.local` state/logs are excluded from source/image contexts.

## Verified results

| Check | Result |
|---|---|
| Backend/workflow/migration/security suites | **74 passed / 570 assertions**: existing 52 plus 22 workflow regressions |
| Native Medusa HTTP integration | **1 passed** |
| Full Playwright production journeys | **8 passed**, zero skipped/failing tests |
| Existing setup/deployment guards | **23 passed**, local/mocked only |
| Official codegen, native panels, API and Next production build | Passed |
| Native Linux setup/start/status/owned stop/restart | Passed; API/proxy data match, RTL HTML and loopback app listeners |
| Persistent data after QA and native restart | Both databases retain identical complete rows across **7 history tables** and original volume identities; **204+29 units**, **64+13 orders** |
| Real private Compose SQL relay | Passed, read-only; PostgreSQL unpublished |
| Prepared archive privacy probe | Source retained; private logs, env, keys and backups excluded |
| Native macOS/Apple Silicon/Docker Desktop | **MAC_UAT_PENDING**; Mac dependency variants checked statically only |
| Physical RFID reader/scale/chip writing | **HARDWARE_PENDING**; software mock/HID text boundary only |

The successful runtime/regression command was `CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test --reuse-build`, against a new disposable database and a receipt-verified successful production build. Earlier attempts exposed a read-only Cloud home, development-mode build leakage, a short cold-start deadline and overly short status probes. These were corrected; failed attempts are not presented as successful complete runs. Component build evidence and successful regression/lifecycle results are in [verification/local-first](verification/local-first/README.md). Existing application source was preserved; the tested Gold-First, supplier isolation, intake/UID/RFID, exact reservation/payment, return and fulfillment journeys remain operational.

## Mac owner commands

Prerequisites: Node 24, Bun 1.4.3, Git and running Docker Desktop. First checkout: clone this repository and `cd didar-b2c-marketplace`. For an existing clean checkout, stop native dev, inspect `git status --short`, then:

```sh
git switch main
git pull --ff-only origin main
bun run local:setup
bun run local:browser
bun run local:test
bun run local:dev
```

In another terminal: `bun run local:status`; stop with `bun run local:stop` or Ctrl+C. Open `localhost:3000`, `/manage` and `/manage/operations`. Disposable Didar logins: `admin@didar.test`, `supplier@didar.test`, `customer@didar.test`; password `DidarDemo2026!` (existing passwords are never reset). Keep synthetic data only. Never remove persistent database containers/volumes, prune volumes or run `down -v`. Backups and diagnostics are in [ENVIRONMENT.md](ENVIRONMENT.md).

Manual UAT on the exact main SHA (`git rev-parse HEAD`):

1. Product/supplier creation, approval/publication, supplier isolation and grant/revoke/write denial.
2. Grouped 5/2/12-piece intake with individually entered measurements totaling 135/127/117 g; reject mismatch, assign 19 permanent UIDs, reject duplicate EPC, verify/post and inspect supplier stock.
3. Verify 100 g/750 Gold-First example 124.2 g-equivalent with actual IRR VAT; reserve/sell the same UID once, sandbox failure/expiry release, fulfillment and return/quarantine/restock.
4. RFID mock/HID count: deduplicate, detect unknown/missing/sold stock; stop/restart and confirm the same UID/order history. Actual RF reading/chip writing/scale work requires hardware evidence.

## Publication and remaining acceptance

Verified implementation published to **`origin/main` at `ed39a01bc5c6a8479f619fe0f38dd0759f3ddf59`**, via normal, non-force push. Both owner roadmap commits through `4896f4b` and Phase 1 history are preserved. GitHub's public main tree returned HTTP200; seven source/delivery files at that immutable commit returned HTTP200 and matching SHA256. [Publication evidence](verification/local-first/github-publication.json) identifies the tested implementation commit; this later documentation-only commit records its publication.

The reviewed task branch `didar/local-first-mac` is also published. PR creation was attempted and returned exactly `Post "https://api.github.com/graphql": Forbidden`; no PR was created. The authorized verified merge/publication completed through normal Git transport. No source push was blocked, no force push/history rewrite occurred, and original recovery bundles remain unchanged.

The reusable Cloud install/start configuration is saved as a draft; review/save and publish it in Environment settings to persist those startup instructions. Saving the draft does not publish the environment or establish fresh-task restoration.

Only owner-run native Mac UAT and real hardware checks remain outside Cloud verification. There are no Oracle/deployment credential blockers to this workflow. Live payments and Phase 2 accounting remain excluded.

---

# Historical Phase 1 delivery record

The following earlier record predates the owner's Phase 1 merge and the current local-first workflow. Its former Oracle/PR limitations are historical, not current acceptance dependencies.

# Didar Gold Phase 1 — verified implementation delivery

Repository: https://github.com/alirezasefidpour747/didar-b2c-marketplace
Branch: `didar/phase1-intake-uid-rfid`. Application source milestones: `fb99850dee98d60560e18b38733c7ac2e00f4a11`, `9a840a50c34ac929c3640450c007a851c438ed5d`, and final isolation/packaging fix `ba85987bbdcf63a96a868a1c5572b15c3cfec0f6`. The final evidence/documentation commit is identified by `git rev-parse HEAD` and the handoff's exact remote SHA. Main was not changed by this work; no force push or PR merge occurred.

The authoritative Phase 1 specification and mandatory Gold-First/governance addendum are implemented in the existing Mercur application. Read [operator/API/pricing guide](docs/PHASE1_OPERATIONS.md), [coverage matrix](REQUIREMENTS_MATRIX.md) and [execution evidence](verification/phase1/README.md).

## Implemented journey

- Admin-created shared product/category/description/images/attributes, approval/publication, supplier account and offers; existing multi-supplier catalog and sandbox commerce remain operational.
- Supplier invoice with optional Tahesab reference → grouped lines → separately entered exact item weights → permanent generated/manual UIDs → optional unique normalized EPCs with raw history → quantity/weight reconciliation → admin verification/posting → derived available stock.
- Read-only supplier defaults with eight independent, immediately revocable backend permissions. Supplier reads include its assigned/unpublished products, invoices, units, EPCs, reservations, sales, returns and fulfillment. Admin overrides and authenticated denials are audited. Out-of-scope scan observations are redacted for suppliers, while admin retains the original observation.
- Gold-First percent/fixed-equivalent making plus independent additive distribution/retail markups, configurable taxable components and actual IRR VAT. The mandatory 100 g / 750 / 12% + 3% + 7% / 10% VAT example yields 124.2 g-equivalent monetary value. Policies are append-only; quote/order snapshots preserve the agreed terms. PDP, cart, checkout and order detail share the calculation.
- Checkout atomically reserves deterministic physical units and maps UID to order line. Payment sells the same units once; cancellation/failure/expiry releases the same units once. Fulfillment follows the actual unit associations. Physical returns are requested, received into quarantine, then explicitly restocked once; later resale preserves the earlier sale history.
- Focused keyboard/Enter/paste scanning, a documented reader adapter and visibly labeled mock input. Count sessions snapshot expected stock and show distinct units, duplicate reads/UID aliases, unknown, missing, sold/absent or unexpected stock. Browser reads queue rather than dropping a rapid second Enter. Scans never mutate stock; corrections are separate authorized/audited operations.

There is one logical location. No multi-warehouse/shelf/bin system, ERP, financial obligations, procurement, wallets, treasury, general ledger, settlement or live Tahesab posting was introduced. Returns do not issue a financial refund. Existing native Mercur panels/authentication remain separate and available; Didar's operational gold registry owns physical stock and checkout.

## Verified results

| Check | Verified result |
|---|---|
| Backend/integration/migrations against compiled API | **52 passed / 507 assertions** |
| Same complete backend suite against actual Compose PostgreSQL/API | **52 passed / 507 assertions** |
| Full Playwright suite against Compose API/storefront | **8 passed** in one final run |
| Existing compiled-standalone browser suite | **8 passed**; final Docker run also covers the isolation-fixed API |
| Cold restart and mobile navigation | **1 passed**, with explicit product URL and level-one heading assertions |
| Native Medusa HTTP health | **1 passed** |
| Oracle/deployment safety guards | **23 passed**, local/mocked only |
| Official codegen, native admin/vendor, API, Next production builds | Passed; **18 storefront routes** |
| Prepared local Docker API/storefront images and four-service health | Built; PostgreSQL, Redis, API and storefront **healthy**; loopback app ports |
| Packaged runtime/source comparison | **119 files match**, code revision `ba85987`; no embedded runtime `.env` files at checked paths |
| Physical stock integrity | **0 cache mismatches**, **0 legacy-linked physical units** |
| Restart persistence | **29 units** and identical UID/state checksum before/after restart |
| Secrets review | No token/private-key/credential findings in source/history review; **6 actual runtime values** have **0 matches** in source/build files |
| ARM64 | Locked dependency/native-artifact static audit passes; actual native ARM runtime remains external |

All successful results above are fresh executions. Earlier failed/restarted runs are retained under `/tmp/didar-phase1-evidence` for diagnosis and are not substituted for the successful evidence. Browser testing found and fixed rapid-scan and pending-permission checkbox behavior. Final isolation review added a regression for competitor identifiers in scoped count reports.

The 19-piece acceptance data comprises individually entered synthetic measurements: 5 units / 135,000 mg, 2 / 127,000 mg and 12 / 117,000 mg. Tests verify software reconciliation, not actual jewelry weights or brand authenticity. QA physical identifiers/history are permanent; their products/suppliers are retired after tests rather than deleting history.

Legacy aggregate offers/order lines stay explicitly `legacy`. Migrations never create physical UIDs or infer unit weights for old stock. Existing aggregate compatibility paths remain separate from verified itemized stock. Legacy fixed-IRR making terms stay explicitly labeled pending commercial review; current global markups are additive, while historic price JSON remains unchanged.

## Source publication and PR limitation

Verified normal pushes advanced the requested feature branch. The final remote fetch/tree check and source manifest establish the delivered application files. A recovery bundle is available at `/workspace/didar-gold-phase1.bundle`; the original `/workspace/didar-gold-delivery.bundle` and prior MVP bundle remain intact. Bundles contain committed source/history and evidence, not ignored runtime environments, credentials or dependencies.

**PR #1 was already merged externally:** GitHub's public PR payload confirms state `MERGED`, merged by repository owner `alirezasefidpour747` at `2026-10-15T21:41:48Z`, containing only specification commit `3bddce5038220c66bafad341c0955970fbc8be3f`. It cannot acquire the later implementation commits. None of this implementation was merged by the agent.

Creating a successor **draft** implementation PR was attempted, but GitHub CLI/API returned exactly `Post "https://api.github.com/graphql": Forbidden`. No successor PR was created. The requested branch is published and independently verified through both Git transport and GitHub's public source endpoint (matching SHA-256). A new draft review must be created through the repository UI or after API access is restored: [compare implementation with main](https://github.com/alirezasefidpour747/didar-b2c-marketplace/compare/main...didar/phase1-intake-uid-rfid?expand=1). Its concrete review description is prepared in [PHASE1_PR_REVIEW.md](docs/PHASE1_PR_REVIEW.md).

## Hardware and external staging blockers

- Physical RFID reader, antenna/read range, chip encoding and a real scale have not been verified. Mock/HID text input is the verified boundary; optional EPC binding does not imply writing a chip.
- No Oracle deployment was attempted. An existing eligible Ubuntu ARM64 Ampere A1 Always Free VM/capacity and SSH/access settings are still needed. Do not provision paid resources or exceed 2 OCPUs / 12 GB RAM. Native ARM install/build/runtime and acceptance on that host remain pending; local prepared images are amd64 and must not be promoted to ARM.
- External staging still needs secure destination configuration/accounts, staging marker, domain/TLS and operational backup/restore verification. Existing guarded scripts remain in `deploy/oracle`; their local/mocked safety tests do not prove cloud access. Real payments and Phase 2 accounting remain excluded.

## Reproduction

The currently running application is the local Compose stack; use `node scripts/test-compose.mjs` to bind all fixtures to its actual database. For host development, select the matching host API/database configuration (the final compiled host backend run used `TEST_API_URL=http://localhost:19000`). Use the existing checked-out source and ignored local environments. `bun run db:setup` applies additive migrations without resetting stock; `bun run test` waits for the running API, then runs all backend suites; `bun run test:e2e` exercises the browser. `bun run build:all` builds official route types, both native panels, API and storefront; stop Next dev before writing the same `.next` directory. See README for normal source Docker builds and the prepared-artifact fallback. In this managed workspace, Docker client build state required a writable `DOCKER_CONFIG` (`/workspace/.docker-didar-phase1`).

The four-service local Compose test helper checks local sandbox mode and loopback ports, binds fixtures to the **actual container PostgreSQL database**, and withholds credentials. Never run these demo fixtures against external staging/production. No dependency reinstall or application reinitialization was performed.

---

# Historical MVP delivery (through `6a206bf`, superseded where Phase 1 differs)

The following earlier results and scope statements are preserved as history. Its no-UID, old pricing/default supplier writes and bounded order-list statements describe the earlier MVP, not the current Phase 1 implementation above.

# Didar Gold delivery

Repository: https://github.com/alirezasefidpour747/didar-b2c-marketplace

Baseline: `c71e31354ce9e34c65b5919fc75ccd38d73fee49`. Continued the existing official Mercur 2.3.7 / Medusa application; no new starter, reset, framework clone or discarded source.

**Software MVP complete and locally verified. External Oracle staging pending. Production launch pending.**

Verified feature milestones: `0d1804903b129ec0ea5505cff8592ee563743b5b` (gold ledger/backend), `618b962` (routed interfaces), `e368d8b2b42e7285ea9b3247e2b9db992a23cdfd` (acceptance and guarded builds). These were normally pushed to main. The final delivery/evidence commit and exact remote SHA are reported in the handoff; `git rev-parse HEAD` identifies this checkout's complete delivery.

## Capabilities

- Shared native-linked master catalog with category/subcategory hierarchy, collections, names/descriptions/reference/type/purity/weight range, admin editing and publication/activation. Search and exact/range weight filters, independent product/detail/category/collection pages.
- Multiple operator-uploaded PNG/JPEG/WebP images, gallery, alt text/order/removal and private draft previews. Bounded validated bytes persist in PostgreSQL. Sample products honestly show missing-photo placeholders; no invented jewelry photographs.
- Supplier signup pending administrator approval, activation/deactivation, shared-product requests and idempotent admin approval/rejection. Multiple exact integer-milligram stock groups, quantities, fixed/percentage making fees, terms and active offers. Supplier ownership is enforced server-side.
- BigInt/integer IRR pricing: manual rate/source interface, making charge, configured margin/tax, per-piece fees and upward rounding step. Coherent catalog snapshots, fresh-rate/version checks, 15-minute committed reservation and immutable order pricing inputs/components. Parameters are demonstration policies requiring commercial/legal approval before real trading.
- Persian RTL responsive storefront with reusable components, centralized locale foundation, meaningful route navigation, cart, checkout, authentication, saved profile/address, order history and detailed payment/fulfillment tracking. Unavailable/stale cart lines are surfaced; checkout intent survives retries/reload.
- Atomic PostgreSQL reservations, concurrent purchase protection and checkout idempotency. One sandbox payment attempt per order; initialize/confirm/authenticated callback simulations support success, failure, cancellation, replay and expiration. Failed/expired stock is restored once. Iranian-rial adapter boundary deliberately refuses live operations.
- Gold admin/supplier interfaces manage catalog, supplier approvals, pricing, available inventory, payment states and audited operations. Checkout allocates each line to the selected supplier; paid allocations progress through preparation, dispatch with carrier/tracking and delivery. Suppliers cannot access others' inventory/order lines or perform admin delivery confirmation.
- Explicit local-only demo identities, opaque hashed expiring sessions, persistent login/IP limits, session cap, authorization/input checks, bounded streaming proxy uploads, security headers and safe SQL errors. Actual secrets stay outside Git/build contexts. Build-only panel config values are random and temporary; runtime secret enforcement remains required.

Didar is the customer-facing seller/payment collector. The `didar_*` ledger alone owns gold stock/reservations/orders/payments/fulfillment. Native master products are mirrors; no generic Mercur stock/order/commission/payout flow is created or synchronized. SQL inspection after gold workflows found zero native orders, native offers and native stock levels. No physical UID, warehouse system, split payment, commission, payout, B2B settlement or ERP was added.

## Current-run verification

| Check | Result / evidence |
| --- | --- |
| Pricing/inventory/security + real HTTP/database commerce suites | **36 passed, 0 failed, 210 assertions**; includes all eight prior commerce tests |
| Chromium/Playwright production storefront acceptance | **7 passed, 0 failed**: six browser workflows plus bounded chunked-upload HTTP test |
| Native Medusa actual-process HTTP health test | **1 passed** |
| Environment/Oracle/SSH/backup safety tests | **23 passed**; mocked/local temporary-file tests, no real cloud operation |
| API TypeScript and storefront TypeScript/lint | Passed |
| Mercur route codegen, native admin/vendor, backend and Next production builds | Passed; all 17 storefront routes built |
| Native panel asset subpaths without runtime build secrets | Correct `/dashboard/assets` and `/seller/assets`; no config fallback warning |
| Source Docker API and standalone storefront images | Built from fresh frozen dependencies/current source; amd64 |
| Full Compose regression and restart | **36 backend tests/210 assertions +7 Playwright checks passed again** against the actual container database; all four services healthy after restart, catalog persisted;68 application/build source files match committed inputs |
| Secure provisioning/native dashboards | Password via stdin, authenticated admin login and fixture cleanup passed; both native panel HTML and assets200 |
| Default Compose configuration | API/storefront catalog requests passed, all four services healthy, demo login rejected with401, no runtime secrets baked into image ENV |
| ARM64 availability | All four official image manifests and locked native-artifact integrity/selector audit pass; native ARM execution still pending |
| Secret review | Current source and complete Git history reviewed; six ignored actual secret values compared in memory with zero source/history matches; no private keys or actual tokens found |

Durable logs and genuine desktop/mobile screenshots are in [verification/2026-10-15](verification/2026-10-15/README.md). The operational browser test creates a category, subcategory, collection, product and two images, approves a supplier, enters two exact weights, finds the product through collection/category pages, pays once, checks one order/payment/stock deduction and allocation, then tracks admin fulfillment through delivery as the customer. Separate tests cover failed/expired payment, stock concurrency/release, forged callbacks, supplier isolation/deactivation, product request approval/retry, profile persistence and 390px layout without horizontal overflow.

Earlier development-server reload interruptions, a message selector defect and real mobile intrinsic-width overflow were diagnosed and fixed; the results above are completed final runs, not those interrupted attempts. Native panel builds needed temporary config-discovery values on clean builds; a child-process helper fixed asset bases while retaining required runtime secrets. Local VFS storage also required removing disposable migration/build artifacts; source, original bundle and database volumes were preserved.

The API image is about 2.14 GB; storefront about 506 MB. The storefront image promotes the standalone output compiled in the fresh source API build, avoiding a duplicate full rebuild while source documentation changed. No host-installed dependency fallback was used for this clean build. Standard source Dockerfile/Compose targets remain the clean-machine deployment path; release directories are immutable during Oracle builds.

## Entry points and local commands

No external application URL exists. The private local storefront uses port 3000 and API port 9000. Customer paths include `/products`, `/products/ID`, `/categories/SLUG`, `/collections/SLUG`, `/cart`, `/checkout`, `/login`, `/account`, `/orders` and `/orders/ID`. Gold operational dashboards are `/manage/admin` and `/manage/supplier`. Native Mercur panels are `/dashboard` and `/seller` on the API and use separate native authentication.

Use Node 24, Bun 1.4.3, PostgreSQL 17, Redis 7 and Chromium. From the existing checkout:

```sh
export PATH=/workspace/tooling/node_modules/.bin:$PATH
export XDG_CONFIG_HOME=/workspace/.config
export NODE_USE_ENV_PROXY=1
# Only if dependencies are missing:
bun install --frozen-lockfile
node scripts/cloud-env.mjs
bash scripts/cloud-services.sh
bun run db:setup
bun run dev:api
# Separate persistent terminal:
bun run dev:web
# With the development services running:
bun run test
bun run test:e2e
bun run --cwd packages/api test:integration:http
# Stop this task's Next dev server before building the same .next directory:
bun run build:all
```

For ordinary clean Linux Docker execution:

```sh
node scripts/configure.mjs
docker compose up -d --build
```

Ports bind loopback, PostgreSQL/Redis stay private and volumes persist. Managed proxy builds may need the documented injected CA BuildKit secret and existing proxy build arguments; TLS/integrity verification stays enabled. See README for exact commands.

For an explicitly isolated local Compose test stack after building images:

```sh
DIDAR_ENVIRONMENT=local DIDAR_SEED_DEMO=true docker compose up -d --no-build
node scripts/test-compose.mjs
```

The helper checks local sandbox runtime and loopback bindings, then binds HTTP/browser fixtures to the API's private Linux Docker database without printing credentials or exposing a database port. `api` or `browser` selects one suite. Never run these demo tests on staging/production. If the memory/disk-constrained VFS sandbox cannot briefly hold two API filesystem copies, stop/remove only the task's API container before its test-mode recreation; retain every named volume. Do not run Next dev/build concurrently against the same output directory.

## Accounts and operation

Only isolated local opt-in seeding creates `customer@didar.test`, `supplier@didar.test`, `admin@didar.test` with public fixture password `DidarDemo2026!`. Staging rejects those identities even when old rows exist. Demo seeding requires explicit local and non-production source mode. Do not expose this local demo stack publicly.

Provision a genuine staging administrator with a securely supplied password over stdin:

```sh
docker compose exec -T api sh -c 'cd /app && bun scripts/create-account.ts admin@example.com "Operator" admin'
```

No password belongs in argv, source, chat or shell history. Suppliers can sign up pending approval; the CLI also supports an existing supplier ID. See [ENVIRONMENT.md](ENVIRONMENT.md) for full variable/account/setup requirements and [DECISIONS.md](DECISIONS.md) for the authoritative ledger and inventory contract.

## External staging and production

**External staging pending:** no existing authorized Oracle VM address, confirmed available/account-eligible Always Free capacity, verified host key or usable staging SSH key was supplied. The target remains Ubuntu ARM64 Ampere A1, at most 2 OCPUs / 12 GB; no Oracle provisioning, paid resource, production deployment or didargold.ir modification occurred.

Manifest availability is verified, but a native ARM dependency install/build, migrations/runtime and complete acceptance on the actual eligible VM remain unverified. Use [Oracle instructions](deploy/oracle/README.md), [ARM evidence](deploy/oracle/ARM64_VERIFICATION.md) and [rollback guide](deploy/oracle/ROLLBACK.md). Guards require an independent staging-only marker, strict host-key checking and read-only shape/resource checks; only committed source transfers to a fresh release with destination-only secrets. Updates preserve database/upload volumes and verify a private pre-migration backup. A full restore drill has not been performed; no destructive restore was attempted.

**Production launch pending:** live payment verification/credentials and explicit authorization, approved commercial/tax/rate policies, real catalog photographs/content, genuine operator accounts, TLS/access/backups/monitoring and applicable legal/operational review. No real charges, external rate feed, automated shipping labels, email/password recovery, refunds or supplier payouts are activated. Fulfillment/tracking and rate control are manual. Only one API replica is supported with the starter's process-local native event/workflow providers; gold transactions themselves use PostgreSQL locks. Recent order lists are bounded to 100 records per response. English translations are not enabled.

## Source preservation and environment reuse

All feature milestones are committed and normally pushed; no force push or history replacement. The original `/workspace/didar-gold-delivery.bundle` remains unchanged and verifies complete baseline history, SHA-256 `b4a438fc7735cb4e41592278d079c1d8903c439abbbea4dd7b77fd341bd47d28`. A separate final completion bundle is provided in the handoff; it does not overwrite the original.

The existing install script was retained. Updated `start_skill` instructions were saved to the environment review draft with local safety boundaries, workflows, test/database separation and pending native ARM access. Saving did not publish a new environment version; review/save/publish through environment settings when desired. The restored original workspace was used throughout.

[REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md) maps every requirement across all 14 mission sections to implementation, current evidence and remaining actions. Locally implemented MVP requirements are verified; actual Oracle ARM execution and external production-provider/legal prerequisites remain explicitly blocked by external dependencies. No production-readiness claim follows solely from passing sandbox tests.

## 2026-10-16 — Issue #4: shared ranked taxonomy, permanent UID labels and canonical PDP

Implemented and verified the complete Issue #4 software flow, including the later owner coordination requirement: active Family → Category → Subcategory publication guards, retained legacy publication reviews, current Persian `/fa` hierarchical PDP with immutable key, working legacy/renamed-path redirects, permanent public UID resolver, admin single/selected/batch Code 128 + QR printing, printer size/quiet-zone guards, Persian controls, server authorization and existing UID/HID counting without RFID. Existing inventory, master/offer ownership, suppliers, orders, payments and financial semantics remain intact.

Verification: **108 backend/workflow tests, 1,274 assertions; native HTTP 1; Playwright 14; all production builds/codegen pass**. See [`verification/issue4/RESULTS.md`](verification/issue4/RESULTS.md), the [actual existing database crosswalk](docs/audits/b2c-taxonomy-reconciliation.md) and [operator guide](docs/TAXONOMY_UID_LABELS.md). Both stopped preserved database snapshots were audited/upgraded only as disposable physical copies; original-field fingerprints and public masters remained unchanged. The owner's original database services, volumes and configuration were not modified.

Customer QR requires operator-verified real public HTTPS origin. `MAC_PRINT_SCAN_UAT_PENDING`, printer calibration, actual HID scanner, native phone-camera, Mac and real RFID checks are not represented as automated verification. No Oracle, production deployment or live financial/accounting operation occurred. Separate Issue #5 facets, governed collection extensions, server faceted discovery and additional approved locale vocabulary are **PENDING**; reuse the shared structural model and resolver delivered by Issue #4.
