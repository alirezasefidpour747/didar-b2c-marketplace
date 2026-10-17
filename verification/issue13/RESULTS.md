# Issue #13 — native authorization / managed launch review package

Scope: [approved ADR-BIZ-01](../../docs/adr/ADR-BIZ-01-APPROVED-managed-merchant-progressive-delegation.md), [bounded ADR-CORE-02 design](../../docs/adr/ADR-CORE-02-PROPOSED-native-permissions-managed-merchant.md) and the current [Issue #13 assignment](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/13). Baseline `5fab026`. [Implementation and permission matrix](../../docs/ISSUE13_NATIVE_AUTHORIZATION.md).

The engineering verification below is evidence for **Chief Architect review**, not independent acceptance or approval of broader commerce authority changes. Work #02 independent delta verification remains pending. No staging deployment, CRM Phases 5–9, live payment/settlement, Oracle or cross-supplier retailer resale.

## Reproducible disposable checks

Linux x64, Node 24.19.0, Bun 1.4.3, PostgreSQL 17, Redis 7, actual compiled Medusa API, native Admin/Vendor and Next production apps, system Chromium. Only uniquely named, labeled disposable QA containers are mutated. Persistent UAT configuration and original data volumes are excluded.

```sh
MERCUR_BACKEND_URL=same-origin bun run build:all
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test -- --reuse-build
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test -- --no-demo-install-only --reuse-build
```

`--reuse-build` validates the complete current source/output/platform receipt, including the native panels bundled in the compiled backend. The final native panel artifacts use the supported same-origin SDK configuration; a preliminary manual build using the development API default failed native navigation and was replaced before final acceptance. It is not a passing artifact or result.

Final verification: **183 backend tests, 2,531 assertions; 1 native HTTP integration test; 28 production browser tests; zero failures.** All four production builds pass using same-origin native panels, and the current source/output/platform receipt is verified. The separate clean no-demo browser/HTTP proof passes with one explicit Admin/bridge and zero demo users/products/orders. See [full QA log](QA_FINAL.log), [production build log](BUILD.log), [no-demo transcript](NO_DEMO_BOOTSTRAP.log) and [artifact receipt](BUILD_RECEIPT.json).

Screenshots from authenticated production-browser journeys:

- [Native Admin managed launch](screenshots/admin-managed-launch.png) · [native Product workspace](screenshots/admin-products.png).
- [Native Vendor actual paid UID history during suspension](screenshots/vendor-suspended-history.png) · [390px view](screenshots/vendor-suspended-history-390.png) · [approved Product workspace](screenshots/vendor-products.png).
- [B2C customer paid merchant order](screenshots/customer-managed-paid-order.png).
- [Scoped native staff CMS](screenshots/vendor-staff-cms.png) · [staff 390px](screenshots/vendor-staff-390.png).
- [First non-demo Admin](screenshots/first-admin-no-demo.png) · protected [Admin](screenshots/admin-legacy-handoff.png) / [Vendor](screenshots/vendor-legacy-handoff.png) deep links.

The final browser fixture isolates its synthetic authentication-attempt budget in the strictly guarded disposable database. Production rate limits and their backend security regression assertions are unchanged.

## C01–C10 evidence mapping

| Criterion | Actual exercised path and assertion |
| --- | --- |
| C01 Managed launch | `native-policy.test.ts` uses real native Admin APIs to provision approved same-supplier store/share/intake and a customer scoped quote, exact-UID checkout and sandbox payment before any owner bridge. Browser `native-policy.spec.ts` publishes a new approved shop in the real Admin form, then registers/pays through B2C while that merchant has no native Member. Stored merchant context, UID reservation and real Admin audit are asserted. After the sale, that merchant registers a native owner, proves the existing canonical account and reads the same paid order/UID and ledger balances in the suspended native Vendor interface. |
| C02 Unlinked owner | Native auth registration, native seller creation/approval/selection, real `members/me` with bootstrap-only permissions; generic products/offers/orders/payments/customers/payouts GET and commerce POST/DELETE denied. Product guard remains uniform. |
| C03 Approved supplier | Real dual proof and selected Seller; generic products/offers/orders read only, generic payments denied, no bank/customer/payout rights. Rival private Master list/count/detail/variant/preview reads are denied through the original native handler with canonical visibility narrowing. Absent gold grants deny writes. Explicit intake permission works through native and legacy canonical APIs and immediate revocation denies both. Granting a DIDAR gold action never permits a generic offer writer. |
| C04 Assisted/delegated handover | Real native Admin adds an existing native staff member to the same Seller. CONTENT_EDIT permits own draft only, SHARE and CONTENT_PUBLISH are added progressively; central review and delegated publication work. Store/offer/UID/order/financial fingerprints remain identical. Revoking SHARE denies that same person's native and legacy writes while commerce stays eligible. |
| C05 Two-store staff | Existing real HTTP `native-panels.test.ts` and native browser staff journeys select A and B, restrict context/scopes/media/options to selection, verify immediate grant/membership revocation and customer role retention, and redact bank/legal relations including requested nested fields. No native Vendor banking capability is introduced. |
| C06 Actor ACL vs commerce | Native READ_ONLY and DISABLED policies deny native writes/private history. Canonical legacy authority is explicitly separate. Shopper scoped quote, exact-UID checkout and sandbox payment succeed while the native editor is disabled. Business eligibility does not depend on actor login/link/ACL. |
| C07 Commercial suspension | Actual supplier pending/rejected/inactive states, native suspend/unsuspend workflows, native pending/terminated/deleted states; native generic and DIDAR/legacy commerce denials, pending-payment denial, narrowly authorized own history and personal customer history. Paid order, line, reservation, finance-event and posting fingerprints stay fixed. Deleted native relationship becomes a controlled 403. |
| C08 Canonical grant revocation | Native and old-token SHARE revoked on the same actor/store; separate canonical staff storefront revocation tested, without supplier role promotion or changed storefront identity. Native ACL is not mislabeled global revocation. |
| C09 No-demo first operator | Empty additive install, explicit supported provisioning script (not QA fixture seed), repeated migrations, native browser login and dual proof. Generic HTTP denied before proof and allowed afterward. Exactly one canonical Admin and bridge, zero demo users/products/orders. [Screenshot](screenshots/first-admin-no-demo.png). |
| C10 Regression / preserved authorities | Full prior regression plus new HTTP/browser policy cases, production builds and current receipt; contract/Gold-First/UID/idempotency/balanced-journal tests; protected legacy handoffs; two historical read-only clone fingerprints. No new commerce authority or schema model. |

## Historical preservation

[Native volume clone](HISTORICAL_NATIVE.log): 7 products, 8 offers, 2 orders. [Compose volume clone](HISTORICAL_COMPOSE.log): 15 products, 8 offers, 3 orders. Original volumes are mounted **read only** into temporary clones and never started as original services. Repeated migration fingerprints for products, offers, orders, paid lines, collections/membership and original image bytes are unchanged. These old snapshots have **no UID table**; current populated HTTP QA separately proves actual exact-UID, order, contract and ledger preservation. Do not interpret an absent historical UID table as a UID migration result.

## Resolved defects and bounded limitations

- Added tenant-safe native Product allowlists, counts, detail/variant/preview guards and a status-only legacy pending-supplier response, without exposing current stock or finance.
- Removed generic `full()` rights for unlinked native owners and linked suppliers. Rights now derive from verified canonical scope, current business lifecycle, existing grants and native ACL narrowing.
- Separated native DIDAR gold capability keys from generic native commerce rights; denied unsupported generic Vendor mutations and the unbound native permissions fallback.
- Kept native selection, dual proof and pending status usable. Added controlled handling for the shipped native deleted-Seller null dereference.
- Native generic Vendor payments list references unavailable `seller_payment` in this installed integration. That surface is deliberately denied; authentic DIDAR financial reports remain connected via `didar.finance`. No fake native payment projection/link or new financial authority was added.
- Enforced business and action prohibitions on legacy supplier/merchant writes and pending payment, while supplying a separate audited supplier history UI/API. Native ACL remains an actor/surface restriction.
- Explicit real-actor/target-merchant audit for managed storefront/sharing/grant operations; supported no-demo first-operator provisioning with no automatic bridge.

**Remaining decisions:** cross-supplier retailer resale/economic parties (ADR-CORE-01/03), broader native-vs-DIDAR Product/Offer/Cart/Order/Customer/finance authority convergence, shared identity/session migration and crash-atomic projection redesign are not authorized here. Existing supplier ownership still supplies canonical own-store non-gold privileges; this correction does not replace that business authority with a new role model. Native Vendor banking/generic financial mutation and the unsupported generic payment list are not enabled by this patch.

**External acceptance:** independent Work #02/Chief Architect review, owner usability/Mac/physical label or RFID hardware checks, legal/commercial/provider readiness and any deployment verification are not claimed. Native panel route additions require the complete rebuilt native and API artifacts. No owner staging was changed.

**STOP at Chief Architect review.** Do not start CRM Phases 5–9, cross-supplier resale, staging rollout or broader authority migrations on the strength of this engineering test report.
