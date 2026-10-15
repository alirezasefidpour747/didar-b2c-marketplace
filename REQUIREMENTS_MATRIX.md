# Didar Gold requirements matrix

Audit date: 2026-10-15. Baseline: `c71e31354ce9e34c65b5919fc75ccd38d73fee49`, fetched remote main and confirmed identical to HEAD. This initial audit records source inspection; historical tests in DELIVERY are not new-run evidence. Status will be updated with current verification.

Statuses: VERIFIED; IMPLEMENTED BUT UNTESTED; PARTIALLY IMPLEMENTED; MISSING; BLOCKED BY EXTERNAL DEPENDENCY.

| Mission section / requirement | Initial status | Implementation / evidence | Remaining action |
|---|---|---|---|
| 1 Autonomous incremental execution, progress, decisions, commits | PARTIALLY IMPLEMENTED | PROGRESS.md, existing six commits | Maintain decisions/matrix; publish verified milestones |
| 2 Official supported Mercur starter, pinned TS/Medusa/React/Next | VERIFIED | MERCUR_STARTER.md, package.json, initial implementation history | Preserve architecture and pins |
| 2 PostgreSQL, Redis, Docker, Playwright | IMPLEMENTED BUT UNTESTED | compose.yaml, playwright.config.ts | Start restored services and verify current workflow |
| 3 Didar customer seller, shared catalog, multiple upstream suppliers | IMPLEMENTED BUT UNTESTED | didar/schema.sql, service.ts, README | Make customer-facing operator responsibility clear |
| 3 No commissions, splits, automatic payouts, ERP/B2B | VERIFIED | Didar service checkout creates gold order only | Keep generic native commerce separate |
| 4 Categories, subcategories, collections | PARTIALLY IMPLEMENTED | product.category text only | Add hierarchical category/collection management and pages |
| 4 Shared products, names, descriptions, purity | PARTIALLY IMPLEMENTED | didar_product, native_id; create only | Add edit controls and native mirror consistency |
| 4 Reference, jewelry type, declared weight range | MISSING | No schema fields/forms | Add validated fields and display |
| 4 Multiple images, management, honest placeholders | MISSING | Decorative glyphs only | Secure upload/removal/alt text/gallery, no invented photos |
| 4 Search, category, exact/range weight filters | PARTIALLY IMPLEMENTED | homepage title/category search | Expand search and weight filters |
| 4 Activation/publication and admin edit | PARTIALLY IMPLEMENTED | active column, no controls | Add publish/deactivate/edit workflows |
| 4 Responsive detail/category/collection pages | MISSING | Monolithic page.tsx | Add independent routes and reusable components |
| 5 Existing-product exact mg stock/quantity, multiple weights | IMPLEMENTED BUT UNTESTED | offer uniqueness product/supplier/weight; management forms | Verify multi-weight supplier path and improve forms |
| 5 Supplier onboarding approval/activation/deactivation | MISSING | Admin can create active supplier; CLI account only | Pending registration and admin lifecycle |
| 5 Supplier product requests/admin approval | MISSING | No request table or workflow | Implement request/review and shared publication |
| 5 Making fees, terms, offer deactivation | PARTIALLY IMPLEMENTED | fixed labor/margin only | Percent labor, terms, active control |
| 5 Allocation and fulfillment updates | PARTIALLY IMPLEMENTED | Orders filter own lines; no statuses | Add per-line fulfillment transitions/tracking |
| 5 No physical UIDs/advanced warehouse | VERIFIED | Integer milligrams + grouped quantities | Preserve simple model |
| 5 Atomic stock under concurrent/retry/fail/expiry/update/paid | IMPLEMENTED BUT UNTESTED | pg row/advisory locks; existing commerce tests | Run regression and extend reserved-stock update coverage |
| 6 Integer IRR/mg/BigInt metal/fixed labor/margin/tax | IMPLEMENTED BUT UNTESTED | pricing.ts, pricing.test.ts | Rerun and extend policies |
| 6 Percent labor, fees, rounding, configurable commercial policies | PARTIALLY IMPLEMENTED | fixed labor/tax/margin only | Add explicit configurable options, document legal assumptions |
| 6 Manual rate + replaceable source interface | PARTIALLY IMPLEMENTED | didar_rate/manual admin | Introduce feed interface without external calls |
| 6 Quote expiry/server price validation/immutable snapshot | PARTIALLY IMPLEMENTED | rate age/version and snapshots | Explicit quote validity, publish/offer checks, prevent stale price display |
| 7 Persian RTL responsive layout/localized numbers | IMPLEMENTED BUT UNTESTED | globals.css, layout.tsx, Intl | Verify desktop/mobile and accessibility |
| 7 Home, listing, detail, category/collection, search | PARTIALLY IMPLEMENTED | Single page state views | Real pages and meaningful navigation |
| 7 Cart and checkout | IMPLEMENTED BUT UNTESTED | local cart, server checkout | Dedicated routes, stale/missing cart line handling |
| 7 Auth/profile/history/tracking | PARTIALLY IMPLEMENTED | auth/history, no profile or fulfillment | Add profile and detailed tracking |
| 7 Reusable components, future English, loading/error/empty | PARTIALLY IMPLEMENTED | monolith, inline strings and basic states | Extract shared UI/context/i18n foundations |
| 8 Server pricing/reserve/order/expiry | IMPLEMENTED BUT UNTESTED | service checkout/expireOrders + cron | Regression and snapshot tests |
| 8 Provider init/confirm/idempotent callback/cancel | PARTIALLY IMPLEMENTED | sandbox outcome updates order directly | Persist payment attempt, provider interface and callback handling |
| 8 Sandbox works; Iranian rial gateway boundary | PARTIALLY IMPLEMENTED | sandbox success/failure, no adapter | Build sandbox provider and disabled live adapter contract |
| 8 No duplicate charges/deductions, failure/expiry release | IMPLEMENTED BUT UNTESTED | terminal order guard + stock transaction | Callback/retry/cancel/expiry tests |
| 8 Success + failure browser tests | PARTIALLY IMPLEMENTED | Failure browser path only | Add successful operational journey |
| 9 Product/category/supplier/publication operations | PARTIALLY IMPLEMENTED | partial admin forms | Finish complete clear workflows |
| 9 Inventory/pricing/orders/payments/fulfillment/audit UI | PARTIALLY IMPLEMENTED | inventory/rate and orders only | Payment/fulfillment/audit/config UI |
| 10 Role auth/supplier isolation/validation/server authority | IMPLEMENTED BUT UNTESTED | auth.ts, scoped manage/orders, SQL binds | Review new paths + negative tests |
| 10 Transactions/idempotency/audit/errors/secrets | PARTIALLY IMPLEMENTED | checkout/pay audit; no expiry audit | Audit all critical transitions, safe errors and secret review |
| 10 Production demo guard/session/rate limit/payment restrictions | PARTIALLY IMPLEMENTED | NODE_ENV seed check, hashed bearer 12h, peremail/IP login limit | Explicit demo runtime flag and sandbox guard; strengthen shared abuse controls |
| 11 Unit pricing/inventory | PARTIALLY IMPLEMENTED | 4 pricing tests, no inventory unit module | Add meaningful availability cases |
| 11 Integration stock/checkouts/reservations/concurrency/isolation | IMPLEMENTED BUT UNTESTED | 8 historical commerce tests | Preserve and rerun with new workflow tests |
| 11 Callback retries and all failure states | PARTIALLY IMPLEMENTED | repeated payment + expiry tests | Add attempt ownership/callback/cancel and config tests |
| 11 Full admin→supplier→customer→paid→allocated→fulfilled→tracking E2E | MISSING | 3 narrower browser tests | Add operational journey incl images and stock evidence |
| 12 Docker/migration/sample data/account/env/build/test docs | IMPLEMENTED BUT UNTESTED | Dockerfiles, compose, scripts, README | Reverify after changes, migrations repeatable, secure accounts |
| 12 Rollback instructions | PARTIALLY IMPLEMENTED | Oracle scripts | Document backups/image rollback/schema cautions |
| 12 Oracle Always Free A1 <=2 CPU/12GB staging safeguards | IMPLEMENTED BUT UNTESTED | deploy/oracle guards + 8 mocked tests | Rerun static/guard tests; preserve no provisioning |
| 12 Native ARM64 manifests/build/runtime and external staging | BLOCKED BY EXTERNAL DEPENDENCY | No authorized VM/SSH/capacity; x86 host | Verify available manifests; native authorized A1 run remains required |
| 13 Working integrated software + delivery evidence | PARTIALLY IMPLEMENTED | Historical DELIVERY only covers smaller scope | Complete actual workflows and current evidence; distinguish external/production pending |
| 13 External live gateway/feed/email/shipping/legal credentials | BLOCKED BY EXTERNAL DEPENDENCY | None configured | Preserve sandbox/manual adapters and document production prerequisites |
| 14 Seven integrated slices, incremental commits/push | PARTIALLY IMPLEMENTED | This audit begins slice 1 | Implement remaining slices, test and publish |

## Verification ledger

- Initial audit: clean existing checkout; remote `refs/heads/main` and FETCH_HEAD equal baseline; original bundle retained.
- No application code changed before this audit. Reviewed AGENTS, README, DELIVERY, PROGRESS, schema, backend/auth/pricing, monolithic frontend/proxy, tests, Docker and Oracle scripts. DECISIONS did not exist.
- Current-run feature/build results will be recorded here as they execute. No inference from historical passing counts.
