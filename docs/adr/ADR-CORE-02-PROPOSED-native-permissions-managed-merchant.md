# ADR-CORE-02 — Native Mercur Authorization with DIDAR-Managed Merchant Launch

**Status:** PROPOSED TECHNICAL DESIGN / Chief Architect bounded-remediation specification — **NOT a decision to merge identities, commerce authorities, or change financial ownership**
**Date:** 2026-10-17
**Business mandate:** [ADR-BIZ-01 — owner APPROVED: merchant sells first; self-manages optionally and progressively](ADR-BIZ-01-APPROVED-managed-merchant-progressive-delegation.md).
**Basis:** Mercur 2.3.7 / Medusa 2.21.2; DIDAR implementation `41089a7a0ac8084b74bb3a7f128f9a9ca038528b`, [PR #8 baseline](../audits/mercur-medusa-core-as-is-2026-10-17.md), [Work #02 Delta Audit](../audits/mercur-medusa-core-delta-41089a7.md), [Issue #13](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/13), [MERCUR_NATIVE_PANEL_ARCHITECTURE.md](../MERCUR_NATIVE_PANEL_ARCHITECTURE.md).
**Architectural constraints:** Existing native Admin `/dashboard`, native Vendor `/seller`, Next customer `/m/{handle}`; retain DIDAR SQL commerce/UID/finance records; no parallel panel or auth system. This is an **implementation plan for a bounded existing-module correction**. Any fundamental party/Order/Offer/identity-authority switch still requires separate owner approval under ADR-CORE-01/03.

## Decision summary

**Separate (A) COMMERCIAL ELIGIBILITY of a store/offer from (B) OPERATOR AUTHORIZATION of a person using a dashboard or API. They must never be inferred from one another.** An eligible DIDAR-managed merchant store can be published and receive shopper orders without its merchant owner logging in to native Vendor. DIDAR Admin operates transparently on behalf of the target store; as readiness improves, the exact SAME store/product/offer/order IDs remain while scoped operator permissions are progressively granted.

A real commercial suspension stops new sales regardless of self-management mode. A disabled Vendor account, an unset native actor link or an operator's native ACL restriction **does not itself stop** an otherwise eligible DIDAR-managed store. This distinction avoids onboarding friction without weakening business controls.

## Verified AS-IS and gaps

| Concern | Existing code/capability to reuse | Gap needing bounded attention |
| --- | --- | --- |
| Public shop state | `didar_storefront` keyed by existing supplier, published/approved; `didar_supplier.active/status`; `didar_storefront_identity_guard`; `storeAllowed` | Distinguish shop commercial approval from any person's native member login. No additional management-mode database enum until proven essential. |
| Public sellable Offer | `didar_offer`, `assertOfferScope`, `didar_native_saleable_supplier`, `didar_visible_product`, verified quote + checkout locks | Native seller business lifecycle is a commercial condition **if mapped**, while native actor login/link/ACL is not. Check every new-sale entry consistently. |
| Central operational acts | DIDAR `admin` role, `storefront.ts`/sharing/content/admin controls, `didar_audit`; original native Admin extensions | Ensure real authenticated Didar Admin actor and target merchant/context are auditable and validated; no vendor impersonation. |
| Scoped staff grants | `didar_merchant_member` with STOREFRONT, SHARE, ONBOARDING, CONTENT_EDIT/PUBLISH, plus `didar_supplier_permission` for gold operational actions | Avoid a second role database; enforce effective grants per capability and selected seller even when normal Mercur generic screens/requests are used. |
| Native Mercur actors | `seller_member`, selected-seller middleware, native `user`/`member` authentication and `didar_native_actor` dual-proof | `PermissionsService` gives an **unlinked owner** `full()`, and a linked supplier `full()` without checking both business lifecycles. |
| Native narrowing policy | `didar_native_acl`, `native-access.ts`, `permissions` Medusa module | Native ACL restricts the native actor **surface**, not the original DIDAR-token session. This is a deliberately documented transition boundary, not universal revoke. |
| Historic read | Immutable DIDAR order/price/store/UID/journal history | Generic native rights and DIDAR-specific read routes may deny all read after suspension. Separate strict read-only own-history from new-sale/mutation prohibition. |
| First admin | Fresh no-demo setup includes native schema; dual native + existing Didar Admin proof | End-to-end clean non-demo first operator provisioning/login/link without fixture shortcuts is not independently proven. |
| Merchant vs supplier | Current `didar_storefront.supplier_id`, `didar_share_page.supplier_id`, `didar_offer.supplier_id` | **Important scope boundary:** one store currently scopes to one supplier and its offers. Curating an independent retailer shop from another physical supplier's offers is NOT proved safe by this ADR; separate offer/stock/economic-party mapping must be decided under ADR-CORE-01 before enabling cross-supplier stock. Do not clone offers, stock, or change seller-of-record to simulate it. |

## 1. Two independent eligibility decisions

### A. New customer-facing sales — existing DIDAR business state

For the present DIDAR flow, a new sale should be permitted only when:
- DIDAR supplier/business record is active and approved; storefront is active/approved/published and its visibility permits customer entry; existing native Seller **business status** is open if the supplier is explicitly mapped to one; applicable product/offer is published, approved and available; real stock/UID reservation, quote expiry/pricing/tax/checkout idempotency and customer access conditions pass.
- Existing unmapped legacy supplier paths retain their documented compatibility behavior, subject to DIDAR approval and store/offer checks. Do NOT quietly require merchant account linkage just to display/sell an approved DIDAR-operated shop. Deny commercial paths if the actual business was suspended.
- Merchants who have not connected their own vendor credentials can still receive correctly attributed sales on an eligible store managed by authenticated DIDAR staff.

This is **not** permission to auto-approve unverified sellers, auto-create financial obligations, infer a gold stock source, use live payment providers, or silently open suspended business entities.

### B. Management action — actor + actual business context

For every request determine **real actor**, native/legacy authentication surface, **validated selected Seller / Didar supplier / merchant**, requested action, object scope, existing DIDAR-specific grant, current business-state rule and any native ACL restriction. Client-supplied `supplier_id` is an object target to validate, never evidence of authorization. The actor may be a DIDAR Admin acting explicitly ON BEHALF OF a merchant through native Admin. No copied credentials or role spoofing.

A disabled/absent native Vendor actor link is NOT a business suspension signal for the shopper-facing B2C store.

## 2. Permission matrix (design target for engineering)

**Central principle:** broad native `products/orders/payments` rights cannot be inferred merely because a Mercur member is `is_owner`. Keep native generic routes under appropriate supported Mercur permission checks; do not implement a separate dashboard permission engine.

| Actor / state | Own onboarding/status + proof | Own reports/historical records | Own storefront/share/content actions | Generic Product / Offer / Orders / Finance writes | New B2C sales by the store |
| --- | --- | --- | --- | --- | --- |
| DIDAR central authorized Admin | Can centrally provision/link via native Admin | Scoped or central as existing role allows | May manage on behalf of a validated target; approve/publish centrally | Only by existing governed native/DIDAR workflows; no automatic bypass of gold locks | Based on store/offer eligibility, not Admin login |
| Mercur Seller owner with no DIDAR actor link | Safe connection/status/bootstrap only | No private commerce/history until relationship established and appropriately authorized | None except narrowly designated initial profile/registration fields | **DENY** by default (existing unlinked `full()` is a gap) | If store separately DIDAR-approved/managed, YES; owner must not log in to start sales |
| Approved DIDAR supplier owner, valid native Seller link and selected membership | Own account/status | Own authorized reporting; no competitor data | Granted own-store actions only; initial view-only policy remains valid | Only explicit product/offer/intake/grant policy; generic gold-linked operations cannot bypass DIDAR guard | Eligible store YES |
| Retailer/merchant staff with one or multiple scoped grants | Own status and approved merchant memberships | Own-store **minimum necessary** read; no bank/legal/other seller | Only explicitly granted STOREFRONT/SHARE/ONBOARDING/CONTENT_* on selected store | Deny unless separately and explicitly granted in existing system | Not dependent on this staff login; eligibility governs |
| Content-only operator | Applicable own authorized content scope | No customer/treasury/finance/private supplier data | Own/scope-limited drafts and authorized publish process | Deny | Unrelated to customer's ability to purchase eligible offers |
| Native actor link revoked / native ACL disabled | Audited access/recovery only when policy allows | No native privileged data; controlled legacy rights are a distinct surface | Deny native writes | Deny native writes | Business can remain eligible while DIDAR Admin operates it, unless a separate commercial suspension exists |
| Commercially pending/inactive/rejected/suspended/deleted Seller/Supplier | Minimum own status/appeal, scoped evidence | **Narrow, explicit lawful historical read-only** (owner-approved content policy); deny other tenants | No new commercial publications/orders; drafts/status actions only if expressly allowed | Deny new gold-linked write/offer/order/payment actions | **NO NEW SALE** if the actual business is commercially ineligible |

**Initial DIDAR policy:** existing physical inventory and supplier offer mutation grants are OFF unless explicitly issued. Granting a Vendor UI route is not permission to edit UID items or Making Charge. Vendor staff can be granted content-only while DIDAR continues price, stock, dispatch and finance.

## 3. Managed → assisted → optional self-managed (no data migration)

- **Managed:** existing DIDAR Admin account selects an existing validated merchant/business record; creates or updates the existing storefront and curated share pages using only approved offers/products/media, records `actor_id` + target `supplier_id` and relevant changes in current `didar_audit`. Store URL `/m/{handle}` becomes eligible as soon as business/store/offer approvals pass. Merchant's native Vendor login is **not a prerequisite**.
- **Assisted:** issue one or more existing per-merchant action grants. The exact same storefront/offer/UID/order identifiers remain. New Vendor member proves and links the correct existing DIDAR actor, selects authorized Seller, and may use only granted operations while DIDAR remains able to help.
- **Self-managed:** further action grants permit merchant to curate content/share/approve their own *permitted* changes and use existing supported Vendor features. DIDAR retains central pricing/tax, sensitive financial operations, approvals, actual UID inventory and oversight unless separately authorized.
- **Remain managed or revert:** removing Vendor management grants leaves the eligible store running under DIDAR supervision; never unpublish solely due to an actor permission revocation. Separately recorded **commercial suspension** stops new sales, preserves immutable past contracts/orders, and offers a narrowly scoped legitimate historical read.

No new `MANAGED/ASSISTED/SELF_MANAGED` table/enum is required to make the business experience functional: derive available actions from existing grants. A display label, if useful, is a presentation projection.

## 4. Critical surface consistency and requested P0 correction

### Native generic Vendor routes

- Reuse Mercur Permissions module, selected `seller_member`, DIDAR explicit links and native seller lifecycle. An unlinked Seller owner gets only onboarding/status/proof capabilities — **not default all generic orders/products/payments**; avoid a workaround that disables native login/store selection and creates onboarding deadlock.
- For a linked Supplier ensure effective generic native rights also respect `didar_supplier.active/status`, `didar_native_seller.active`, native `seller.status/deleted_at`, real selected membership and explicit action grants. Decide historical-read rights per route, not `full()` for everyone.
- Generic routes with native data must be scoped to selected seller. For DIDAR-linked gold records enforce approved gold domain workflows, one writer, no generic editing / mirror orders or duplicate payouts.
- Real seller-offboarding, member revocation, last-admin guard and bank/legal field redaction remain independent of UI hiding.

### Native DIDAR extensions

- Retain `native.ts`'s real actor linkage and strict Didar business action checks, but distinguish pure own status/history GET from new-sell/mutate routes after suspension.
- Existing content/grant flags remain true source of operational authority; native permission resolver can **narrow but not manufacture** permission.

### Legacy DIDAR token routes

- **Explicitly distinguish** `didar_native_acl` from a person-wide DIDAR-login revocation: turning off native UI permission alone does not terminate legacy DIDAR `sessionUser()` tokens. Never claim universal revocation or new silent identity merging.
- Business sale bans, supplier active/approval checks, scoped merchant memberships and critical grant revocations must be checked server-side for the action independent of whether invoked via legacy `/didar/*` or native `/vendor/didar/*`. A person whose own DIDAR merchant grant was revoked must not retain its merchant write through another route. Native panel-only READ_ONLY policy does not by itself revoke an independently authorized DIDAR Admin legacy role; if global revocation is needed, it requires separately defined authority/consent controls.
- Keep guarded `/manage` fallback until role and deep link parity. Do not delete history or create a third management panel.

### Central DIDAR operations on behalf of Merchant

- Use existing central Admin services and native `/dashboard` shell; validate target Seller/Supplier and access before writes. Include `real_actor_id`, `target_merchant_id`, request kind/approved scope and immutable audit metadata wherever not already present (add fields only when existing `didar_audit.details` cannot convey them safely).
- Do not write an impersonated DIDAR vendor session or auto-register a customer to make storefront operations pass. If a complex operation currently demands a Vendor token, adapt an **already authenticated server-side Admin service boundary** with central authorization and target validation; do not bypass current transaction/financial locks.

## 5. Known blocking ambiguity — storefront economic party vs stock Offer supplier

Current B2C shop/selection uses `didar_storefront.supplier_id` and current `didar_offer.supplier_id`, with `assertOfferScope` requiring the scoped Store `supplier_id` to match Offer `supplier_id`. That supports **DIDAR-managed launch for an existing supplier/store with eligible offers**. It does NOT yet demonstrate the business scenario "Retailer A markets and sells Supplier B's measured units" while preserving both retail seller attribution and original supplier stock/custody/gold payable.

- **Do not** solve this by cloning Supplier B's stock/UIDs into retailer A, creating a fake Offer, moving ownership of physical gold, or generating a duplicate order/payment/ledger.
- Before supporting cross-supplier curated resale, map `merchant_store_id`, `origin_supplier_id`, `inventory_owner`, `offer supplier`, `customer invoice issuer`, `settlement beneficiary` and customer/merchant CRM attribution under ADR-CORE-01/03 with an explicit disposable vertical slice.
- This unresolved business/data contract must be transparently reported. It should not block the narrower identity/permission bug repair or the existing same-supplier managed journey.

## 6. Verification plan — actual HTTP + PostgreSQL/Redis, not in-memory mocks alone

All tests MUST use disposable data; real source/owner volumes remain untouched or read-only cloned. Check all native generic and DIDAR endpoints with real Medusa request pipeline, PostgreSQL 17, Redis7, current compiled builds, browser login/store selector and real B2C checkout, not just direct function mocks.

| Case | Expected evidence |
| --- | --- |
| **C01 Managed launch** | DIDAR native Admin provisions an eligible same-supplier merchant storefront + curated products, no Vendor login/link for the merchant. Customer opens `/m/{handle}`, sees eligible offers, gets quote, completes sandbox purchase; order holds original correct Merchant/store/offer/UID/price snapshot. |
| **C02 Owner without bridge** | Real native Seller owner can connect/status as intended but cannot POST generic native products/offers/order/payments, see finance/customer/other sellers, or bypass Gold editor. No activation deadlock. |
| **C03 Approved supplier** | Native owner/member completes dual proof, selects store, has approved own minimum read-only view; gold stock/price/making writes are denied absent specific existing grants. |
| **C04 Assisted handover** | Staff receives CONTENT_EDIT/SHARE etc on Store A; can edit only own drafts/approved links in Vendor. DIDAR Admin still operates same IDs. |
| **C05 Two-store staff** | Same person legitimately on A+B selects A then B; each surface/API/data/media restricted to current selection, immediate revocation honored, no A-authorized bank/legal data leaks into B. |
| **C06 Native ACL vs store eligibility** | Set Vendor editor READ_ONLY or disabled: deny its writes and sensitive reads; DIDAR Admin-managed approved B2C storefront keeps selling from eligible offers without merchant login. |
| **C07 Commercial suspension** | Disable actual supplier/seller commercial eligibility: deny new public offer/quote/checkout and generic native commerce mutations across all surfaces. Original paid orders and UID/financial snapshots unchanged; authorized own-history read-only still possible according to defined policy. |
| **C08 Revoked DIDAR grant vs legacy token** | Revoke merchant's specific `didar_merchant_member` grant: native and old DIDAR-token merchant writes denied immediately. Deliberately label actor-only native ACL as surface-specific (no false global revoke claim). |
| **C09 No-demo bootstrap** | On clean database, run real additive migrations and explicitly provision first DIDAR Admin and native Admin using supported flows; complete dual proof without QA-only fixture injection or unapproved default privileges; repeat migrations without creating demo accounts. |
| **C10 Full regression** | Build all 3 apps, run existing 174+ backend/27+ browser suites plus new API tests; one finance/UID source-of-truth, no new stock/financial ledger, no cross-tenant access; retain historical fingerprints and deep links. |

Inspect and address optional full Mercur route-level mutation paths; document any unsupported generic route which must be denied for DIDAR-linked commerce.

## 7. Alternatives and impact

| Option | Delivery / maintenance | Risk | Disposition |
| --- | --- | --- | --- |
| **A. Reuse existing Mercur permission resolver + DIDAR grants, correct effective rights and shared business checks** | Small, localized; native upgrade compatible; no new parallel role model | Requires precise route/state tests and native/legacy boundary disclosure | **RECOMMENDED for bounded P0 remediation** |
| B. Require self-service/Native link before any Merchant sale | Simple blanket gate but defeats approved merchant activation | High business friction | **REJECTED as business experience** |
| C. Grant Native owner all generic rights on account creation | Low code effort | Unapproved product/order/finance actions | **REJECTED** |
| D. Replace DIDAR user identity or migrate all commerce to Native immediately | Large and disruptive; still needs gold semantics | Account lockout, duplicate orders, custody/settlement errors | **NOT AUTHORIZED** |
| E. New DIDAR role-management application and dashboard | Duplicates native Mercur | High maintenance | **REJECTED** |

## 8. Approval boundary and delivery status

**Chief Architect recommended routine implementation strategy:** Option A, on existing native + DIDAR code paths, limited to concrete safety and low-friction managed-store onboarding, with accepted business requirements from ADR-BIZ-01. This recommendation authorizes **no new economic-party/Order/Offer master authority**, no blanket account conversion, no migrations based on assumptions, no live payment, no staging deployment and no CRM/growth Phase 5–9 work.

**Engineering acceptance:** actual Native Admin, Native Vendor and B2C role journeys; full route-by-state authorization matrix; re-run regular regression in disposable setup and compare historical snapshots. A code compile and tests using mocked SQL alone are insufficient. The reviewer must independently classify any uncovered behavior as an issue; do not silently widen existing Merchant rights.

**Gate:** Post-implementation Chief Architect review required before merging any fundamental ADR change, production rollout or extending CRM workflows. The P0 code repair can be implemented only within the existing approved native architecture and this explicit bounded task scope.
