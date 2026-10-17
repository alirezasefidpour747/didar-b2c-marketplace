# ADR-BIZ-01 — Merchant Sales Activation First; Progressive Self-Management Later

**Project:** DIDAR B2C — native Mercur 2.3.7 Admin/Vendor, Medusa v2, Next.js B2C
**Decision date:** 2026-10-17 (Asia/Tehran)
**Status:** **APPROVED — OWNER BUSINESS POLICY**; technical permission/identity integration and rollout plan **NOT YET APPROVED OR IMPLEMENTED BY THIS RECORD**
**Approval source:** Owner explicitly confirmed the Chief Architect's clarified proposal in the B2C project conversation after correcting the overly restrictive proposal.
**Related:** [Issue #13](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/13), [Master Issue #7](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/7), [Draft ADR-CORE-01](ADR-CORE-01-DRAFT-domain-and-data-authority.md), [Work #02 delta audit](../audits/mercur-medusa-core-delta-41089a7.md), [Native Panel Architecture](../MERCUR_NATIVE_PANEL_ARCHITECTURE.md), [Merchant Growth roadmap](../ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md).

## 1. Business requirement and non-negotiable owner decision

**DIDAR must make it possible for a merchant/retailer to begin selling with the lowest responsible onboarding friction. DIDAR can initially establish, curate and operate that merchant's approved B2C storefront on the merchant's behalf. The merchant may subsequently assume individual operating responsibilities through native Mercur Vendor permissions as capabilities, trust and willingness develop. Self-management is OPTIONAL, not a prerequisite for sales or a mandatory final state.**

This **supersedes the previous over-restrictive Chief Architect proposal** to hold *all* merchant selling until the merchant has connected a native Vendor login and obtained full self-service business rights.

**Commercial eligibility and operational self-service authorization are separate questions:**
1. **May this storefront sell its authorized offers?** This depends on the existing approved merchant/storefront status, eligible actual Offer(s), real available stock, approved profile/price/tax/quote, legal/commercial conditions and verified transaction controls — **not the merchant's personal ability to operate a dashboard**.
2. **Who may perform a particular management action?** DIDAR staff may act through centrally authorized native Admin tools on behalf of the merchant; specific actions may later be delegated to verified vendor owner/staff through Mercur's native Vendor authentication and permissions.

Do **not** infer that unverified, legally ineligible or commercially suspended businesses may trade without necessary approval. Low-friction onboarding means DIDAR performs required setup work, not that business controls are bypassed.

## 2. Approved experience model

| Mode (business experience, not necessarily a new database enum) | Merchant can sell through approved B2C storefront? | DIDAR Admin responsibilities | Merchant native Vendor responsibilities |
| --- | --- | --- | --- |
| **A — DIDAR-Managed** | **Yes** when the storefront and offers meet commercial eligibility. Merchant login/self-service is **not required for launch**. | Onboard and verify minimum commercial facts, configure the store, select approved Master/Offer inventory, prepare product/media/CMS and approved terms, publish links, support fulfillment and record true merchant attribution. | May be absent or read-only/status/own reports if provisioned. No requirement to create/edit products or stock. |
| **B — Assisted / Co-Managed** | **Yes** under the same eligibility and immutable quote/stock rules. | Retain central approvals and assist with operations as requested. | Granular approved actions: suggest/add eligible shared catalog items to own curation, content/media drafts, share links, own analytics/order follow-up as granted. |
| **C — Self-Managed** | **Yes** under exactly the same sale rules. | Central commercial approvals, oversight, exceptional operations, support and compliance. | Uses **existing Mercur Vendor app** `apps/vendor` at `/seller`; may operate only enabled features and owned data. |
| **Suspended / Commercially Ineligible** | **No new transactions** regardless of the management mode. | Handle exception, settlement and history according to approved policy. | Narrow status/history-only access as legally and commercially appropriate; no new offers/orders/settlements. |

**Transitions:** A→B→C are optional, reversible/adjustable per capability. A merchant may remain in A indefinitely. No new product IDs, cloned order/financial history, inventory sources, credentials or duplicated panels are created merely to change management mode.

**Illustrative, NOT hard-coded limits:** DIDAR may curate 10–20 existing eligible products for a first-store link, consistent with the already-built sharing/storefront journey. Merchants need not perform taxonomy, WebP upload, pricing, UID intake or CRM configuration before the store can be commercially launched by DIDAR.

## 3. Existing platform architecture to reuse

**Admin (existing):** `apps/admin` / `/dashboard`. DIDAR's staff perform approved operations on behalf of a merchant via existing Mercur SDK Admin extensions and DIDAR services.

**Vendor (existing):** `apps/vendor` / `/seller`. Used for optional progressively delegated owner/staff operations and merchant-limited reports. Native Mercur membership/store selection is reused; a native seller/member account existing for platform integration must not be conflated with the merchant completing self-service onboarding.

**B2C (existing):** `apps/storefront`, public merchant shop `/m/{handle}`, PDP, cart, checkout, customer account/history. The merchant's buyer-facing link should work once DIDAR sets up the commercially eligible store without forcing the merchant to log into the back office.

**Reuse DIDAR domain invariants:** existing shared Product Master, merchant curation and offer pricing profiles; exact UID/RFID measured inventory and one reservation authority; quote/checkout terms; order and store snapshots; gold/IRR journals; approved media/CMS, storefront context and role-scoped sharing/attribution. A merchant storefront does **not** automatically grant ownership of its supplier's physical gold or authority over a separate supplier's stock or payout.

**Party distinction:** retailer/merchant of the customer storefront, inventory/Offer supplier/manufacturer and legal seller-of-record/invoice issuer may be different roles. Their actual approved economic relationship must follow the pending [ADR-CORE-01](ADR-CORE-01-DRAFT-domain-and-data-authority.md), not be invented in an authorization patch.

## 4. Approved authority principles, not an implementation design

- **Commercial activation != dashboard autonomy.** Do not block an otherwise authorized DIDAR-operated merchant store because its owner has not completed native Vendor proof/self-service. DIDAR may provision necessary internal records using authenticated and approved Admin workflows; never use fake shared merchant credentials.
- **Real actor and beneficiary context.** Every DIDAR-managed write must record the real authorized DIDAR staff actor, the target merchant/storefront, action and applicable approval/audit trail. Never impersonate a vendor by copying passwords or spoofing an `Authorization` header.
- **Action-level progressive grants.** A vendor's self-service rights are explicit, owned-store-scoped and independently revocable; native Seller ownership alone cannot silently grant broad Product/Order/Finance management for DIDAR commercial operations.
- **Consistent business restrictions across access surfaces.** A true commercial suspension, revoked store membership or forbidden gold action must be enforced server-side on applicable native generic, native DIDAR and legacy DIDAR API routes, with historical read-only rights separately defined. A restriction on the *operator's management access alone* should not unintentionally turn off an otherwise eligible DIDAR-managed storefront.
- **Historical preservation and no dual writers.** Preserve original product/offer/UID/order/finance IDs, prices, snapshots, logs and links. A change from managed to self-managed must not trigger a second stock/order/payment source or data reset.
- **No blanket access or secrecy by UI.** Tenant isolation and real permissions must be checked by service/API, not by hiding navigation.

## 5. Existing implementation versus gaps (NOT claims of completion)

**Known reusable work:** Phase 2A/2C merchant-scoped storefront, selected 10–20 product sharing, Phase 3 assisted onboarding/WebP, Phase 4 published CMS, native Admin/Vendor SDK recovery at implementation `41089a7`, DIDAR central management services and merchant-specific state/permission checks. These are reported/verified to their respective source checkpoints, **not proof that this newly approved staged-delegation model has already passed end-to-end**.

**Unresolved technical questions:**
1. Inventory existing store approval/activation, merchant-member grants, `didar_native_actor`, Seller membership and native generic Permission Resolver. Reuse existing fields/roles; do **not** create a redundant onboarding-state table without a proven gap.
2. Specify one authoritative per-action mapping: DIDAR staff on behalf of Merchant X vs Merchant X's owner/staff, including UI/API calls, scope, approval and audit. No mutation by arbitrarily supplied merchant IDs.
3. Ensure native ownership before linkage cannot trigger unauthorized generic commerce/finance writes, **without** requiring the merchant to log in for centrally managed approved sales.
4. Resolve temporary legacy `/manage` vs native policy scope with targeted server-side enforcement; distinguish global commercial bans from surface-scoped staff rights.
5. Define commercial suspension vs temporarily disabled vendor editor; test both independently.
6. Decide exact minimum compliant storefront-launch requirements and Seller-of-record/invoicing/custody implications separately, before enabling real payment providers.
7. Independently test real Admin-managed storefront creation and checkout, co-managed delegation on same records, no-login merchant launch, revocation, two-store staff, tenant isolation and suspended-historical read.
8. Public staging `/dashboard` and `/seller` failed Work #03 inspection; actual deployment remains a separate release gate.

**ADR-CORE-01** (catalog/Offer/cart/order/party/economic authority) remains DRAFT. **ADR-CORE-02** (native identity and scoped permissions) should now use this approved business principle as a constraint; its technical detail remains open. **Issue #13** is the analysis/verification gate, not automatic permission to change code.

## 6. Architecture choice and rationale

**Chosen at BUSINESS level:** DIDAR-Managed → Assisted → Optional Self-Managed, with independently evaluated commercial eligibility and granular management capabilities.

**Why:** permits earlier merchant activation and lower operational friction; uses DIDAR operational support; reuses mature Mercur native Admin/Vendor rather than building another panel; avoids duplicating merchandise/history; allows merchant autonomy when commercially useful; preserves security and gold/financial invariants.

**Alternatives not selected as a required merchant experience:**
- Mandatory merchant self-service product/stock/configuration before storefront launch: too much friction, contradicts explicit owner objective.
- Blanket permission to native Seller owner before commercial approval: unauthorized management risk.
- Third custom Next management system: duplicates existing mature Mercur applications.

## 7. Decision boundaries and next verification

**Approved now:** business operation model and architectural distinction between *storefront selling eligibility* and *an actor's self-management rights*.

**Not approved now:** new state/schema, direct implementation instructions, default bypass of regulated/commercial eligibility, fundamental native Order/Offer/customer authority migration, Seller-of-record policy, retrospective transaction changes, live provider/payment/settlement, staging deployment, CRM Phases 5–9 or closure of the F01–F12 audit findings.

**Required next:** Chief Architect updates Issue #13 to cite this ADR as the overriding business principle, then commissions a narrow permission/operational-mode design and real HTTP/PG verification through existing Mercur/Medusa extension points. Separate code authorization and acceptance must follow that review.

## 8. Decision log

| Item | Decision |
| --- | --- |
| Owner business principle | **APPROVED 2026-10-17** |
| DIDAR-managed launch | **APPROVED when commercially eligible; no forced merchant self-service** |
| Assisted/co-managed | **APPROVED** |
| Self-managed progression | **OPTIONAL and adjustable** |
| Active store vs actor write privileges | **INDEPENDENT CONTROLS by design** |
| Technical implementation / ADR-CORE-02 | **PENDING** |
| ADR-CORE-01 source of truth and seller-of-record | **NOT APPROVED** |
| Production/staging deployment or Phase 5–9 authorization | **NOT APPROVED** |
