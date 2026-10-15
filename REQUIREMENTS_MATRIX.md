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
