# ADR-CORE-01 (DRAFT) — Domain, Field and Transaction Authority

**Project:** DIDAR B2C (Mercur 2.3.7 / MedusaJS 2.21.2 / Next.js / PostgreSQL 17 / Redis 7)
**Date:** 2026-10-17
**Status:** **PROPOSED / NOT APPROVED / NO CODE CHANGE AUTHORIZED**
**Owner approval required:** YES — any change in catalog, order, seller-of-record, customer or financial source of truth.
**Reference code:** main `0aeec24d2292fb3e60848ac2deaa68b76a478ded`; architecture audit accepted as evidence in documentation-only PR #8, merge `c04dbcd88133f2b2174cf43d56f82373da651c38`.
**Evidence:** [source-grounded architecture audit](../audits/mercur-medusa-core-as-is-2026-10-17.md) sections A–F, evidence D01–D35, N01–N15, M01–M02.
**Project governance:** `AGENTS.md`, `docs/MERCUR_NATIVE_PANEL_ARCHITECTURE.md`, approved v3 roadmap, `DECISIONS.md`. Older decisions are historical as dated; do not extrapolate legal/tax policy from them.

## 1. Business objective

The DIDAR owner adopted Mercur/Medusa **to reuse a mature multi-vendor marketplace**, accelerate delivery and avoid parallel Product, Seller, Offer, Cart, Order, Customer and Admin/Vendor systems. DIDAR additionally needs approved gold-specific identity, true per-piece weight/UID/RFID, retailer-specific making/terms, immutable gold/IRR quotes, gold commitments, contracts and journals.

The core unsolved decision is **which entity/workflow is authoritative for each field and business event**, while preserving original Mercur Admin at `/dashboard`, Vendor at `/seller`, Next B2C/account and every existing DIDAR historical identifier.

Do not conflate:
- **Master Product** (shared catalog) vs **Merchant Offer** (particular seller's commercial offer) vs **UID** (individual physical measured item).
- **Merchant/Seller marketplace presence** vs **supplier contractual counterparty** vs **legal seller-of-record/customer invoice issuer**.
- **Native monetary payout/commission** vs **gold obligations/custody and IRR ledger**.
- **Read projection** vs **transaction authority**: a panel displaying rows does not establish the ability to mutate or settle them safely.

## 2. Verified AS-IS at audited SHA — facts, not design approval

| Domain / critical fields | Current writes / authority | Native Mercur/Medusa reality | Evidence and current disconnect |
| --- | --- | --- | --- |
| Product description, status, primary identity | `didar_product`, `native_id` links native Product; DIDAR writer invokes native create/update workflow | Native shared master, variants and product lifecycle already exist | Native row contains only partial projection; separate SQL/native transactions [D07/D09,N01] |
| Category/Collection | `didar_category`, `didar_collection`, scoped mapping | Native category tree, collections, attributes exist | No complete native category/collection projection or unified editor [D13/D14,N03] |
| Facets F01–F12 | `didar_facet*`, assignments, review/evidence and discovery | Native typed attributes and variant options exist | Same-purpose generic concepts; governed evidence/locale differs [D14,N03] |
| Product proposal/review | `didar_product_request` and DIDAR approval | Native ProductChange review pipeline exists | Distinct proposal flows, native reviewer not DIDAR authoritative review [D29,N04] |
| Seller/merchant commercial status | `didar_supplier`, commercial profile, `didar_native_seller` link | Native Seller lifecycle and SellerMember roles | Parallel approval/suspension; one-to-one supplier link and weak staff/multi-store bridge [D18/D19/N05/N06] |
| Offers / terms / quantities | `didar_offer` and stock from measured UID items | Native seller Offer per variant with price/inventory | No live native Offer mirror; current gold trade does not use native offer [D07/D15,N02] |
| Physical inventory/UID | DIDAR intake, per-item weight/UID/RFID, immutable locks and reservations | Native inventory item/reservation uses generic quantities | Native cannot be presumed authoritative per-piece by weight; two reservation writers prohibited [D15,N02/N07] |
| Rate, Gold-First pricing, profile/tax quote | DIDAR `pricing.ts`, `merchant-profiles.ts`, quote/version/snapshot | Native monetary price lists, tax and promotions exist | Monetary native price not proven to implement precise changing gold and component snapshots [D16,N02/N08] |
| B2C cart and order | Browser cart; DIDAR server quote, `didar_order*`, payment/fulfillment | Native cart/order group/split, payment and returns exist | Native report may not contain DIDAR gold orders; generic order paths still coexist [D10/D11,N07,M02] |
| Customer profile/login | `didar_user` credentials/sessions for Next; native admin/member separately, linked proof | Native Customer and auth APIs exist | Parallel customer authentication; mapping/transition unresolved [D12/D18/D20,M01] |
| Media/images/video/CMS | DIDAR protected sanitized variants, approvals, CMS page version/publish | Native File/MediaImage provider exists | Native media does not automatically carry private approval/provenance; bytes coexist [D30/D31,N11] |
| Supplier settlement/financial facts | DIDAR gold/IRR contract, entitlement, exact journaling, treasury/mock Tahesab | Native commission/payout supports generic monetary economics | Native payout cannot discharge gold liabilities without explicit approved semantics [D17/D22/D23,N08/N09] |
| Admin/Vendor UI | Native Mercur SDK routes/widgets now exist in `apps/admin`/`apps/vendor` | Existing native shell and extension SDK | Many gold screens reuse same DIDAR services, legacy Next /manage remains; native shell ≠ unified data [D03–D06,D24/D33,N10] |

**Additional P0 facts:** non-demo installer presently skips `native-schema.sql` [F01,D18/D25/D27]; native fine-grained rights are conditional on resolver configuration [F04,N14]; product projection is not crash-atomic [F05,D09]. These must be addressed by bounded, independently tested remediation — not hidden under an approved-looking ADR.

## 3. Options requiring architectural comparison

### Option A — Native-first authority for *all* generic domains, gold services as bounded extensions
- Native Product/Seller/Offer/Cart/Order/Customer are authorities wherever semantics and durability match.
- Reuse is maximized; standard reports and workflows are valuable.
- Requires explicit IDs, currency/weight, economic seller, gold price snapshot, UID reservation, compensation and historical migration proof. Too risky to order as immediate wholesale switch.
- **Assessment:** potentially superior long-term, but **NOT YET SHOWN SAFE** for the full current transaction workflow.

### Option B — Retain the existing DIDAR commerce authority for gold flows, use native panels and read projections
- Lowest short-term data migration risk; preserves verified per-UID/Gold-First/ledger history.
- Reuses native Admin/Vendor shell but duplicates generic catalog/commerce capabilities and may degrade standard native statistics.
- Needs durable projection, write guards, drift repair, staff RBAC, source-of-truth labeling and disciplined exception documentation.
- **Assessment:** safest interim implementation if transparently bounded, **not a justification for indefinitely duplicating generic functions**.

### Option C — Modular incremental convergence (RECOMMENDED FOR INVESTIGATION, NOT APPROVED)
- Adopt already-suitable native general features for product, category, seller, credentials, offer/cart/order orchestration **one capability at a time**, while preserving gold-specific UID, custody, Gold-First pricing and multi-instrument settlement as linked domain extensions.
- Use one writer per invariant; read-only projections are explicit and recoverable; reversible feature/route gates with full historical data preservation.
- Begin with a disposable equivalence proof for **one shared Master, two Sellers, two different measured UIDs, CASH/CREDIT, expiry/retry/refund/partial gold settlement**. Test economic seller-of-record and native order splitting assumptions before any adoption.
- **Assessment:** best candidate for time-to-delivery vs future maintainability, **conditional** on proof. Owner must approve any substantial native authority change.

### Option D — Discard Mercur or rewrite all DIDAR finance/physical stock
- Loses mature capabilities, demands wholesale migration of legally/financially relevant records, slows delivery and increases risk.
- **Assessment:** not justified by present evidence; REJECT as a default proposal.

## 4. Provisional recommendation for owner review (not implementation authorization)

**Recommended strategic direction: Option C after a bounded proof; meanwhile preserve Option B's current authoritative data with read-only native projection and existing native SDK panels.** No bulk conversion or parallel writers. This is a *proposed* target, not an accepted decision.

### Candidate per-domain authority boundary

| Domain | Interim authority to preserve now | Candidate eventual authority, pending compatibility/ADR | Non-negotiable invariant |
| --- | --- | --- | --- |
| Master ID, title, images, variants | DIDAR `didar_product` + native Product projection | Native Mercur Product for general catalog; DIDAR links for governed gold attributes | Exactly one product master ID map; no arbitrary two-way edits |
| Family/Category/Subcategory | DIDAR approved tree and legacy review | Native Medusa ProductCategory with fixed-rank and governance adapter | No invented or mass-reassigned legacy leaves; canonical URL/UID stays stable |
| F01–F12 | DIDAR controlled vocabulary and approvals | Native typed attributes when equivalent; retain approval/evidence semantics | Lifestyle/heritage never silently becomes variants or automatic luxury label |
| Product approval | DIDAR governed request | Native ProductChange linked to DIDAR media/UID workflow | Seller cannot publish unauthorized catalog |
| Seller lifecycle | DIDAR approval + native Seller association | Native Seller as storefront party with formalized DIDAR contractual role | Suspension must stop both public and private gold sale paths |
| Merchant Offer | DIDAR offer/version and making terms | Native Offer adapter if exact quote and stock safe | One Offer identity map, one stock/price writer |
| UID/weight/custody/reservation | DIDAR only | DIDAR extension linked to native commerce if chosen | **Exactly one reservation source; permanent UID and correct weight** |
| Gold-First rates, IRR quote and payable | DIDAR only | DIDAR gold-domain extension of approved native workflow | Quote/order immutable snapshot; no double revenue/payout |
| Customer auth | DIDAR customer session; native panel identity linked separately | Native Customer account convergence with explicit migration/consent | No forced reset, email-based auto-match, dual unauthorized account |
| Checkout, Order, fulfillment | DIDAR gold domain until ADR-CORE-03 | Native orchestration plus DIDAR guarded steps IF proven | No second order/payment event; historic orders immutable |
| Supplier obligations, wallets, ledger, Tahesab | DIDAR multi-instrument finance | Retain DIDAR authority, integrate provider only by approved contracts | No gold discharge through generic payout, no double financial posting |
| Media | DIDAR controlled assets + native File provider | Native File/object storage for bytes IF approved, DIDAR governance remains | Preserve exact asset IDs, permissions and historical URLs |
| Content/CMS | DIDAR DB pages and native panel extensions | Keep approved CMS renderer in Next, Mercur edit extension | No unapproved private storefront leak |

**Important:** A reversible CRUD/API UI integration is not equivalent to financial-core conversion. Implement safe install/security correctness now; compare deeper commerce authority on disposable data first.

## 5. Business/legal questions that gate a fundamental change

1. **Economic party:** Is DIDAR the seller-of-record and invoice issuer for all B2C customer orders, or are retailers legal sellers with DIDAR marketplace services? Existing `DECISIONS.md` states DIDAR customer-facing seller and collector for earlier gold sandbox; the newer Merchant storefront does not automatically change the invoice/legal contract. Need owner confirmation before using native seller order-splitting or commission.
2. **Physical/financial treatment:** Does one customer line under a Merchant storefront always create *one* supplier obligation, or may fulfillment split across multiple suppliers? Gold title/custody and immutable allocation timing need retention.
3. **Master ownership:** Is Product general descriptive structure authorized for DIDAR central edits only, while Vendors propose change requests? Existing governance suggests yes but exact mapping to Native ProductChange requires validation.
4. **Migration preference:** Is the objective quickest controlled commercialization keeping DIDAR gold checkout temporarily, or immediate maximum native reuse despite a longer/riskier conversion? Recommend controlled first, not full rewrite.
5. **Auth and legal consent:** Which native identity is allowed to represent customer/merchant staff, and how are existing DIDAR passwords/sessions preserved while migrating? Detailed decision under ADR-CORE-02.
6. **Accounting/regulator:** Do real VAT, payment, gold payables and physical stock obligations impose constraints beyond sandbox examples? Keep live execution off until contracts and approvals.

## 6. Acceptable evidence before architecture approval

- Independent source/installed-doc audit and real `main` code reference.
- Disposable test demonstrating Native Product / Seller / Offer / Cart / Order compare against DIDAR for exact values and identities, not merely passing published old tests.
- Written authoritative event+field map (writer, reader, immutable snapshots, ID links, events, recovery, path/role).
- Upgrade/reset avoidance: read-only fingerprints of genuine historical production-like copies, duplicate-link tests, crash injection, permission isolation, rollback plan.
- Time, maintenance, upgrade and risk comparison from test data; no invented delivery dates or productivity guarantees.
- Owner approval explicitly recorded before switching any fundamental writer or ledger.

## 7. Scope explicitly not authorized by this draft

- Replace native Mercur UI, create another Next management system, or remove existing `/manage` before native parity.
- Restructure production data/keys/category tree or rewrite gold UID/reservation/finance history.
- Adopt native order splitting, payments, commissions, native monetary payouts, auto-withdrawals or new external providers by default.
- Auto-merge customer identities or elevate staff rights by bypassing Mercur permissions.
- Enable live payments/price feeds, concrete Tahesab, bullion settlement or third-party photo/video licensing.
- Treat doc merge, preflight checks or code compilation as software feature delivery.

## 8. Next governance artifacts / checkpoints

**R1 engineering repair:** native schema installer on clean and populated non-demo deployments; write Issue with exact conditional and acceptance tests. This is a bounded defect fix, not architecture replacement.

**ADR-CORE-02:** per-person actor, native SellerMember role, permission resolver and DIDAR merchant-scope mapping; fail-closed staff and multi-store lifecycle.

**ADR-CORE-03:** disposable Native Offer/cart/order compatibility trial with gold exact UID/quote/journal and safe seller-of-record semantics.

**ADR-CORE-04/05/06:** catalog hierarchy/attribute convergence, durable product projection and storage/provider choices. Each requires distinct owner approval if writer/authority changes.

## 9. Decision record

| Field | Value |
| --- | --- |
| Owner decision | **PENDING** |
| Chief Architect | Proposal prepared; audit evidence reviewed |
| Selected strategic alternative | **NOT YET APPROVED** (Option C recommended for comparison) |
| Existing source-of-truth switch | **NONE** |
| Implementer authorization | **Installer R1 safe correction only after task acceptance; NO new generic authority migration** |
| Status changes | DRAFT → PROPOSED FOR OWNER REVIEW → APPROVED/REJECTED with dated owner approval and migration gate |
