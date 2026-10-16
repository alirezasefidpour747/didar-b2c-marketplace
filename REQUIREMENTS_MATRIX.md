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

# Phase 1 implementation matrix (2026-10-16)

Authoritative scope: `docs/PHASE1_UID_RFID_INTAKE.md` plus the mandatory Gold-First/governance addendum. The historical MVP matrix below records the earlier baseline and does not exclude current physical UID/RFID work. Final execution results and limitations are in `DELIVERY.md`; operator/API details are in `docs/PHASE1_OPERATIONS.md`.

| Requirement | Implemented path | Verification |
|---|---|---|
| Existing shared masters/categories/images/collections, approve/publish/unpublish, attributes | Existing Mercur workflows + `catalog.ts`, `/manage` | Original catalog/image regressions, existing Playwright management journey |
| Admin creates supplier/account and operates for any supplier | `manage` supplier/account, all intake/inventory/RFID services with audited admin overrides | Backend fixtures and browser supplier creation/intake journey |
| Supplier reads own assigned/unpublished products, invoices, units/EPCs/states/sales/fulfillment | Scoped catalog/intake/inventory/orders/returns/count APIs; operational portal | Cross-supplier read/write denial tests; supplier read-only browser |
| Eight independent permissions, disabled by default, immediate revocation | `permissions.ts`, supplier row locks, `/permissions`, admin permission screen | Per-field grants/revokes, pairing/intake/fulfillment/revocation and isolation tests |
| Gold-First percent/fixed-equivalent making, independent additive distribution/retail, selected taxable components, IRR VAT | `pricing.ts`, immutable `didar_pricing_policy`, admin settings, PDP/cart/order details | Mandatory 100 g → 124.2 g-equivalent test, fixed making, tax selection, old snapshots unchanged |
| Grouped invoice → separately measured pieces → reconciliation → verification/posting | `phase1-schema.sql`, `phase1.ts`, `/manage/operations` | 19 units: 5/135 g, 2/127 g, 12/117 g; mismatch blocks; source immutability; admin-only posting |
| Explicit tolerance exception with version/reason, count always exact | Append-only intake policy and verification snapshot | Zero default, admin denial, reason required, old approved version still posts after policy update |
| Permanent UID, optional globally unique active EPC, replacement/unpair, raw audit | Database uniqueness/triggers; `/rfid` and pairing UI | Duplicate/concurrent UID/EPC, cross-supplier constraints, retagging without UID changes |
| Exact unit reservation, sale once, failure/cancel/expiry release once | `item-stock.ts`, checkout/payment/expiry transactions, unique active reservation index | Two customer identities racing, successful duplicate callback, identical UID release, equal-weight quantity-two grouping |
| Physical return, quarantine, restock once; later resale preserves history | `/returns`, customer requests, admin receive/restock UI | Retry-safe physical return/resale; old successful payment cannot re-sell returned UID |
| Item-associated customer/supplier/admin order history and fulfillment | `/orders` item mappings, native existing delivery workflow extended to reservations | Supplier privacy/grant tests, browser paid → preparing → dispatched → delivered |
| Counting snapshot, distinct items, duplicate aliases, unknown/sold/missing/absent flags | Count tables and report; focused Enter input with queue | Five distinct EPCs, UID alias dedup, unknown/missing/sold flags, supplier report isolation, browser remaining-stock count |
| Mock and keyboard-wedge adapter, no unverified hardware claims | `rfid-reader.ts`, visibly labeled simulated mode | Playwright text/Enter scans; physical RF hardware and scales remain unverified |
| Legacy stock/orders preserved, no fabricated physical identifiers | Separate legacy/itemized modes; additive migrations | Fresh/repeat migrations retain quantity + historic price JSON, zero legacy-linked physical units |
| Derived quantity integrity | Database trigger-maintained available cache, direct edits blocked | Global cache invariant reports zero mismatches |
| Docker/ARM64, regressions and source preservation | Existing four-service Compose/source build, no new native dependencies | Fresh source builds and current regression evidence; native ARM runtime remains external |
| No multi-warehouse, ERP, supplier liabilities, procurement, wallets, treasury, GL, settlement or Tahesab writes | Phase boundary maintained; external invoice reference metadata only | Source review and implementation path; no Phase 2 tables/services added |

## Historical MVP matrix (baseline through `6a206bf`)

# Didar Gold requirements matrix

Audit date: 2026-10-15. Baseline: `c71e31354ce9e34c65b5919fc75ccd38d73fee49`, fetched remote main and confirmed identical to HEAD. Initial statuses are preserved in audit commit a3ca078. The table below reflects current-run source, API and browser verification; Docker runtime acceptance is recorded separately below. Historical results are not counted as current evidence.

Statuses: VERIFIED; IMPLEMENTED BUT UNTESTED; PARTIALLY IMPLEMENTED; MISSING; BLOCKED BY EXTERNAL DEPENDENCY.

| Mission section / requirement | Current status | Implementation / evidence | Remaining action |
|---|---|---|---|
| 1 Autonomous incremental execution, progress, decisions, commits | VERIFIED | PROGRESS.md, DECISIONS.md, preserved baseline and incremental normal pushes | Continue normal release discipline |
| 2 Official supported Mercur starter, pinned TS/Medusa/React/Next | VERIFIED | MERCUR_STARTER.md, pinned package.json/bun.lock; no regeneration or upgrade | None for MVP |
| 2 PostgreSQL, Redis, Docker, Playwright | VERIFIED | compose.yaml; real PostgreSQL/Redis workflow; production builds + Playwright7 pass | Container acceptance ledger below |
| 3 Didar customer seller, shared catalog, multiple upstream suppliers | VERIFIED | schema/service and explicit customer seller labels; multi-supplier integration/browser flows | None for MVP |
| 3 No commissions, splits, automatic payouts, ERP/B2B | VERIFIED | Didar checkout creates only gold orders; SQL native orders/offers/stock levels all zero | Keep native generic commerce outside gold operations |
| 4 Categories, subcategories, collections | VERIFIED | catalog.ts hierarchy/collections; integration cycle/edit and browser parent/child/collection paths | None for MVP |
| 4 Shared products, names, descriptions, purity | VERIFIED | catalog.ts saveProduct, native workflows/compensation; API + browser admin create/edit | None for MVP |
| 4 Reference, jewelry type, declared weight range | VERIFIED | schema.sql/productInput/ProductFields and detail specs; persisted integration assertions | None for MVP |
| 4 Multiple images, management, honest placeholders | VERIFIED | bytea images, MIME/magic/size/count validation; image CRUD API + two-image gallery browser | Owner supplies actual product photographs |
| 4 Search, category, exact/range weight filters | VERIFIED | Catalog exact/range offer filters, normalized Persian search/reference; browser exact weights/search | None for MVP |
| 4 Activation/publication and admin edit | VERIFIED | catalog.ts admin active/published + offer flags; visibility/role tests | None for MVP |
| 4 Responsive detail/category/collection pages | VERIFIED | Independent product/category/collection routes; Playwright390px no overflow + screenshots | None for MVP |
| 5 Existing-product exact mg stock/quantity, multiple weights | VERIFIED | Supplier multiple grouped integer mg offers; integration + two-weight browser journey | None for MVP |
| 5 Supplier onboarding approval/activation/deactivation | VERIFIED | Transactional pending signup, admin approval/state; activation/deactivation + existing-token tests | None for MVP |
| 5 Supplier product requests/admin approval | VERIFIED | Product request/review; approved native-linked publication, rejection and repeated approval tests | None for MVP |
| 5 Making fees, terms, offer deactivation | VERIFIED | labor_mode/labor_bps/terms/active; pricing and supplier CRUD tests + forms | Commercial terms need owner review before real trading |
| 5 Allocation and fulfillment updates | VERIFIED | Authoritative order-line supplier allocation; scoped paid fulfillment and customer tracking; full E2E | None for MVP |
| 5 No physical UIDs/advanced warehouse | VERIFIED | Internal row IDs only; integer mg grouped stock; no serialized/warehouse subsystem | None for MVP |
| 5 Atomic stock under concurrent/retry/fail/expiry/update/paid | VERIFIED | Row/advisory locks, sorted stock, optimistic versions; concurrency/retry/update/failure/expiry/paid tests | None for MVP |
| 6 Integer IRR/mg/BigInt metal/fixed labor/margin/tax | VERIFIED | BigInt pricing and 7 handchecked pricing tests; 3 inventory tests | None for MVP |
| 6 Percent labor, fees, rounding, configurable commercial policies | VERIFIED | Configurable fixed/percent labor, offer margin/default, tax, perpiece fee, upward rounding step | Parameters are examples requiring commercial/legal approval |
| 6 Manual rate + replaceable source interface | VERIFIED | Admin manual source and GoldRateSource interface in rate-source.ts; persisted version/freshness API tests | External live feed deliberately deferred |
| 6 Quote expiry/server price validation/immutable snapshot | VERIFIED | Repeatable-read catalog, 24h rate validity; server rate/offer versions,15min committed reservation, immutable input/component snapshot tests | None for MVP |
| 7 Persian RTL responsive layout/localized numbers | VERIFIED | lang fa/dir rtl, localized IRR/mg/date; responsive actual Chromium checks/screenshots | None for MVP |
| 7 Home, listing, detail, category/collection, search | VERIFIED | Independent home/products/detail/categories/collections routes; search and browser navigation | None for MVP |
| 7 Cart and checkout | VERIFIED | Dedicated cart/checkout, unavailable-line handling and persisted checkout intent; success/failure browser | None for MVP |
| 7 Auth/profile/history/tracking | VERIFIED | Opaque auth, persisted profile/address, order history/detail and per-line tracking; API/browser tests | No email-based password recovery provider in MVP |
| 7 Reusable components, future English, loading/error/empty | VERIFIED | Shared store/catalog/customer/manage components, locale foundation and loading/error/empty screens | English translations are a future locale, not enabled |
| 8 Server pricing/reserve/order/expiry | VERIFIED | Existing locks/snapshots/expiration retained; old8 commerce tests + new integration regressions | None for MVP |
| 8 Provider init/confirm/idempotent callback/cancel | VERIFIED | commerce.ts and persisted unique-order attempts; initialize/confirm/callback/cancel ownership/concurrent retry tests | Callbacks are authenticated sandbox simulations |
| 8 Sandbox works; Iranian rial gateway boundary | VERIFIED | SandboxProvider works; IranianRialProvider interface fails closed without approved integration | Live gateway integration external/production prerequisite |
| 8 No duplicate charges/deductions, failure/expiry release | VERIFIED | Terminal order guard + one attempt/order + transactional releases; forged/duplicate/concurrent/expiry tests | None for MVP |
| 8 Success + failure browser tests | VERIFIED | Playwright full paid flow plus original failed and independent expiry flows | None for MVP |
| 9 Product/category/supplier/publication operations | VERIFIED | Admin routed catalog/supplier/request/publication forms and role-guarded APIs; real browser operational flow | None for MVP |
| 9 Inventory/pricing/orders/payments/fulfillment/audit UI | VERIFIED | Inventory/policy/payment state/audit UI; exact supplier allocation and fulfillment tracking | Allocation is selected offer supplier, no manual reassign of committed stock |
| 10 Role auth/supplier isolation/validation/server authority | VERIFIED | Scoped identities in auth/SQL; supplier spoofing, crosssupplier, customer/admin/anonymous tests | None for MVP |
| 10 Transactions/idempotency/audit/errors/secrets | VERIFIED | Stock/payment/expiry/fulfillment audits, safe SQL errors/retry conflicts, hashed sessions; secret history/current comparisons | Periodic operational security review remains production work |
| 10 Production demo guard/session/rate limit/payment restrictions | VERIFIED | Explicit local demo guard; staging/production denied, persistent login/IP limits,5sessions, sandbox disabled production, bounded proxy, CSP | Use secure staging accounts/TLS access; no live credentials embedded |
| 11 Unit pricing/inventory | VERIFIED | 7 pricing +3 inventory +5 security tests in consolidated36-test pass | None for MVP |
| 11 Integration stock/checkouts/reservations/concurrency/isolation | VERIFIED | 8 preserved commerce +13 upgraded integration tests;36total/210assertions/0fail | None for MVP |
| 11 Callback retries and all failure states | VERIFIED | Concurrent init/callback, owner/attempt binding, replay/cancel/expiry and unpaid fulfillment tests | None for MVP |
| 11 Full admin→supplier→customer→paid→allocated→fulfilled→tracking E2E | VERIFIED | 7 Playwright checks pass; complete role journey, gallery/categories/collections, stock/paid/order/tracking and failure/expiry/mobile | None for MVP |
| 12 Docker/migration/sample data/account/env/build/test docs | VERIFIED | Fresh frozen source build; additive repeated migrations, account/env/build/test docs; Docker ledger below | See exact container acceptance evidence below |
| 12 Rollback instructions | VERIFIED | Read-only backups with failure/privacy/image-retention tests; deployment guard tests and rollback guide | Full restore drill remains operational prerequisite |
| 12 Oracle Always Free A1 <=2 CPU/12GB staging safeguards | VERIFIED | 23 environment/Oracle/SSH/backup tests; shape/resources/marker/host-key/source-transfer safeguards | Use existing authorized Always Free VM only |
| 12 Native ARM64 manifests/build/runtime and external staging | BLOCKED BY EXTERNAL DEPENDENCY | All4 official image ARM descriptors + frozen native artifact audit pass; host is x86_64 | Native ARM build/runtime needs eligible available UbuntuA1 VM, host/key/access |
| 13 Working integrated software + delivery evidence | VERIFIED | Operational source/API/browser/build evidence in DELIVERY and verification artifacts | External staging and production readiness explicitly separate |
| 13 External live gateway/feed/email/shipping/legal credentials | BLOCKED BY EXTERNAL DEPENDENCY | No live gateway/feed/email/shipping credentials or legal approval configured; sandbox/manual MVP complete | Approved providers and legal/commercial review before production |
| 14 Seven integrated slices, incremental commits/push | VERIFIED | Initial pre-code audit + integrated vertical slices + regression, incremental commits and non-force GitHub publication | Preserve this matrix and progress on future releases |

## Verification ledger

- Initial audit: clean original checkout; fetched remote main matched baseline c71e313. Audit/decisions committed before application edits (a3ca078); original bundle retained unchanged. Subsequent milestones normally pushed, no force/reset/regeneration.
- Current run: 36 unit/integration tests, 210 assertions, zero failures; 7 Playwright checks pass. Both suites passed again through the Compose-aware helper against the containerized API/database/production storefront, including the full operational journey. Native HTTP health1 and environment/deployment23 pass.
- Fresh frozen source Docker build compiled native panels/backend/Next; standalone web promotes that same clean output. Default staging rejects demo login401 and embeds no runtime secrets in image ENV. Secure stdin account creation/login/cleanup and both native panel assets200 verified.
- All four Compose services healthy, matching catalog persists after API/web restart. Sixty-eight application/build source files in the source-built API image match committed inputs. Native offers, stock levels and orders remain zero after gold E2E, confirming one ledger.
- Current evidence: verification/2026-10-15. API/source/frontend builds and typechecks pass; 390px and desktop screenshots reviewed. Four current ARM image manifests and locked native artifacts verified; no native ARM VM execution or external deployment occurred.
- Software MVP complete; external staging pending authorized eligible Oracle Ubuntu ARM64 A1 access/capacity. Production pending approved real-money/provider/commercial/operational prerequisites. The two BLOCKED rows concern those external prerequisites, not incomplete local sandbox flows.
