# DIDAR B2C — Merchant Commerce, CRM, Growth, Campaigns & Affiliates
## Master implementation roadmap for Codex Cloud + integrated Mac UAT

**Version:** 1.0 | **Date:** 2026-10-16
**Scope:** Extend the EXISTING `alirezasefidpour747/didar-b2c-marketplace`, official Mercur/Medusa + Next.js + PostgreSQL/Redis application, without rebuilding it.
**Status:** Approved concept / EXECUTION ROADMAP, not a claim that any pending feature is coded. A published document is not delivered software.
**Runtime strategy:** Codex Cloud implements and tests on its available Linux runtime, submits verified changes to GitHub `main`; the owner performs final integrated MacBook UAT on localhost. No Oracle or live financial providers required.
**Core goal:** One real retailer journey, from acquisition and own product intake to scoped storefront, product sharing, actual sandbox checkout, CRM visibility, campaign attribution and opt-in rewards — without exposing competing retailers or their customers.

> **MANDATORY:** Inspect fresh main before every phase. Reuse existing classes, auth, modules, migrations and routes. Do not build parallel product/catalog/ledger systems. Complete each phase's **Database → Backend → API → Frontend → Automated Tests → Documentation** gate before marking it delivered. Ship useful vertical slices, not a large disconnected UI mock.

---

# 0. Verified starting point / dependency map

At roadmap authoring, verified GitHub `main` HEAD is `69e631c2b06b54cf26844193af3a2cc98dadfb2c`, with completed:
- **Issue #4:** ranked active Family → Category → Subcategory before new publication; permanent UID, optional RFID/EPC, Code 128 and public QR labels, stable `/i/{uid}` to current /fa canonical PDP. Legacy public products preserved through audited exceptions. Customer QR needs real HTTPS origin; physical printing/phone/Mac UAT pending.
- **Issue #5:** governed F01–F10 facets, F11 collection types, F12 merchandising, real admin and public-filtered storefront with migration/regression verification. Reuse it; do not reseed old B2B taxonomies or reimplement classifications.
- **Earlier Phase 1:** one canonical master product, multiple supplier-specific offers, seller governance, group invoice/real per-unit weight and permanent UID, sandbox cart/checkout, exact-unit reservations/sales/returns, management dashboards.
- **Earlier Phase 2 sandbox:** approved supplier contract/entitlement, procurement/settlement, gold/IRR ledger, customer/supplier wallet QA and provider-independent mock Tahesab. No live banking, payments, wallet withdrawals, external Tahesab or legal/tax production approval.
- **Issue #6:** two Merchant pricing types and profile rules are SPECIFIED but **not yet implemented** at roadmap creation. Authoritative `docs/MERCHANT_TWO_TYPE_PRICING_PROFILES.md` plus the owner's later clarification: component C may apply on CASH depending on the profile. The cash rule is recorded in Issue #6. Avoid treating the issue's earlier payment-method ambiguity as a license to hardcode CASH exemption.

Always re-check `main` and Issue #6 status before work. If any scope has since been implemented, prove equivalence via code/tests and skip duplication.

**Source-of-truth references:**
- `docs/B2C_PRODUCT_TAXONOMY_FACETS_SPEC.md`
- `docs/MERCHANT_TWO_TYPE_PRICING_PROFILES.md` and GitHub Issue #6
- `docs/TAXONOMY_UID_LABELS.md`
- `docs/PHASE1_OPERATIONS.md`, `docs/PHASE2_FINANCIAL_CORE.md`
- `docs/LOCAL_FIRST_MAC_WORKFLOW.md`, `docs/MAC_UAT_CHECKLIST.md`, `docs/ROADMAP_TO_INTEGRATED_MAC_UAT.md`
- `verification/issue4/RESULTS.md` and actual Issue #5 release evidence

Do not clone the historical B2B site or implement a wholesale exchange, even though the original taxonomy began in B2B. This is a single B2C marketplace plus merchant-scoped capabilities.

# 1. Non-negotiable business model

## 1.1 Terminology and separation of concerns

| Entity | Meaning | Primary system responsibility |
| --- | --- | --- |
| **Merchant** | Approved gold seller/supplier operating in Didar; commercial type can be Manufacturer, Retailer, or future governed types | Own offers/listings, storefront, appropriate customer relationship scope |
| **Merchant Commercial Type** | Classifies business model but is **not** an auth role | Suggest a default Fee/Pricing Profile; does not force every Merchant to identical rates |
| **Merchant Pricing Profile** | Reusable, immutable-versioned, effective-dated rules for additive price components and tax treatment | Exact customer quotes by Merchant/Offer |
| **Product Master** | Single canonical product with taxonomy/facets/images/public PDP | One ID even if many supplier Offers or collection placements |
| **Offer / Inventory UID** | Supplier-specific making/price terms and exact physical item lifecycle | Existing sale/UID stock remains authoritative |
| **Customer Identity** | One Didar account for a real customer | Central identity and allowed account data |
| **Merchant–Customer Relationship** | Separate explicit context linking that identity with a Merchant | Merchant CRM can see only authorized relationship data |
| **Storefront Context** | Merchant-scoped browsing/cart/checkout entry context | Tenant visibility and attribution, not just a frontend skin |
| **Campaign** | Scoped program or curated page owned by Didar globally or one Merchant | Share, eligible products, contacts with consent, landing and tracking |
| **Referral / Affiliate Program** | Rule for attribution and rewards: staff Agent→Merchant vs Customer→Customer | Separate accrual ledgers and beneficiaries; never conflate |
| **Didar Central CRM** | Platform-authorized unified view | Globally consistent customer ID, orders, campaigns, merchant relationships, analytics and policy-controlled access |

Merchant staff, Didar marketing Agent, Merchant admin, Customer, and Didar admin are *different authorization scopes*. Do not broaden global auth on existing `didar_user.role` without auditing every endpoint. Favor additive membership and permission relations reusing the current auth/session model.

## 1.2 Owner-confirmed Gold-First price structure

Use a single parametric price engine, **not one function per Merchant type**.

`P = G + M + D + R + C + T` in IRR, where:
- `G` = exact gold content valued at the authoritative verified IRR rate for 750-equivalent gold;
- `M` = Merchant's own manufacturing making charge or retailer's complete making charge, sourced from its Offer;
- `D` = Didar wholesale/distribution and operations component (business intent includes distribution, packaging and shipping);
- `R` = Didar end-retail operational component (can be zero);
- `C` = Didar credit/financing operations component (can be zero; **not intrinsically payment-method-dependent**);
- `T` = applicable VAT/tax on legally approved taxable components, separate from gold principal and determined by governed tax rules.

**ALL owner-confirmed profile percentage examples** use the **same `G` gold monetary base** at 750-equivalent purity; percentage components are additive, never compounded, and **not percentages of the Merchant making charge**.

**Verified owner illustration, not universal default tariff:**

| Profile example | Merchant making `M` | `D` | `R` | `C` | `T` illustrative | 100g 750 gold at 65m IRR/g, M=12% |
| --- | --- | --- | --- | --- | --- | --- |
| Manufacturer | Offer's manufacturing making (e.g. 12%) | 3% of G | 7% of G | 0% | 10% × (M+D+R) | **8,073,000,000 IRR**, 124.2g equivalent |
| Retailer | Offer's complete making (e.g. 12%) | 3% of G | 0% | 2.5% of G | 10% × (M+D+C) | **7,751,250,000 IRR**, 119.25g equivalent |

**Profile-controlled C eligibility:** `ALWAYS`, `CREDIT_ONLY`, `CASH_ONLY`, `BY_PAYMENT_METHOD`, `DISABLED` or equivalent safe data-backed rules. For an applicable Retailer profile, `C` **may be present even on cash orders**. Do not derive `C=0` merely because checkout is CASH. Different Merchants of the same type may receive different profile/version assignments; third/fourth types are data/configuration extensions, not duplicated pricing code.

**Distribution vs separate packaging/shipping charges:** `D` may commercially **cover** these operations; do **not** quietly stack an additional packing/delivery surcharge on top of an inclusive `D`. Implement an auditable `included_in_D` vs `separately_customer_chargeable` vs `merchant_cost` vs `didar_internal_cost` policy and explicit per-item/per-order allocation. Initial deployment of new surcharge types remains disabled pending owner price approval. Preserve the base formulas exactly. External shipping/carrier or credit actual cost may be tracked internally even when not charged separately. Refund/tax treatment needs approved rules, not guesses.

Profiles have stable ID, type, immutable versions, active effective intervals, non-overlapping Merchant assignments, payer/recipient, controlled component bases and tax policies. Change only affects **new quotes**, not immutable accepted/order snapshots. Do not confuse customer selling components with supplier gold entitlement, Didar recognized commission, supplier payable, tax liability or internal cost. Preserve existing financial journals/returns and existing seller-of-record designation.

## 1.3 Two visibility contexts for the same customer platform

**A. DIDAR_DISCOVERY:** the public Didar marketplace, category/facet pages and global campaigns for authorized publicly listed offers.

**B. MERCHANT_SCOPED:** a link-opened Merchant storefront in which home, menus, search, PDP, selected offers, campaign, cart, sign-up, login, checkout, orders and recommendation widgets **stay limited to this Merchant**, without displaying competing retailers. The shopper need not traverse the Didar home or a merchant directory. Shared Didar login still creates one central customer ID. Required legal platform/seller/invoice disclosures must remain visible.

Supported independently selectable merchant discoverability modes:
- `PUBLIC_MARKETPLACE`: eligible offers discoverable in Didar global browsing and Merchant storefront.
- `UNLISTED_LINK`: Merchant storefront and its dedicated products/campaigns accessible via direct share URL but not linked/search-listed in global discovery.
- `INVITE_ONLY`: a genuine server-authorized access grant or validated signed invitation is required; **not** just an obscure link or hidden menu.

A Merchant can share single products and independently curated pages. An ordinary shared link is not a password; do not call UNLISTED a security boundary. A product Master can be public globally while its **merchant-specific Offer** is unlisted; enforce visibility on Offer joins, search, quote, cart and checkout, not just Product listings. Products cannot jump to rival Offers when the selected Merchant's exact UID becomes unavailable.

# 2. Target architecture and information boundaries

## 2.1 One core with tenant-scoped access, not separate websites or databases

Extend the existing PostgreSQL schema. Conceptual entities (choose actual table names/conventions after audit):

1. `merchant` / existing `didar_supplier` augmented with `commercial_type`, optional logo/brand theme, discoverability policy, approved storefront handle; do not change historical supplier IDs.
2. `merchant_membership` and `merchant_permission` for staff/operator and limited content/CRM campaign rights, with enforced org scope on every API. Didar marketing Agent is not a customer or unrestricted supplier admin.
3. `merchant_profile`/`profile_version`/`merchant_profile_assignment` (Issue #6; reuse any code delivered meanwhile).
4. `merchant_listing` / `merchant_product_visibility` where necessary: seller owns a listing/Offer, not a duplicate `didar_product` Master; editorial promotion and draft review statuses. All published Masters still obey the existing taxonomy/facet gate.
5. `merchant_storefront`, brand details, locale-safe handle, visibility policy, content panels and publication; optional future domain mapping but no DNS work required for MVP.
6. `didar_customer` is the EXISTING `didar_user` customer identity; **do not fork it**. Add `merchant_customer_relationship` with provenance, merchant scope, contact preferences, interaction stage and source/consent. Per-merchant annotations/notes/tasks remain tenant-private.
7. `contact_consent` and `communication_preference` with channel, scope (Merchant vs Didar), proof/source, timestamps and revocation, legally appropriate retention.
8. `campaign`, `campaign_product`, `campaign_page`, `campaign_share_link`, `campaign_audience` (if selected), with owner scope `DIDAR_GLOBAL` or `MERCHANT`, draft/approved/published/paused/expired, URLs, scheduling and eligibility.
9. `tracking_event` with privacy-aware first-party campaign/link/referrer, merchant context, anonymous-to-account association where lawful, validated conversion attribution. No forged self-declared sale totals.
10. `marketing_agent`, `merchant_acquisition`, `merchant_visit`, `merchant_activation`, `product_onboarding_contribution`: distinguish acquiring agent from uploading assistant; timestamps, region, workflow status and reviewer.
11. `referral_program`, `referral_invite`, `referral_attribution` for customer→customer programs scoped to merchant and optional platform scope. Safe attribution windows, unique invite IDs, anti-abuse, eligibility rules and refund reversals.
12. `reward_rule_version`, `reward_entitlement`, `reward_ledger`, `reward_redemption` with payer (Didar/Merchant/approved shared), beneficiary, statuses and audit; do not create immediate cash/gold balance without approved regulated wallet and reconciliation.
13. `media_asset`/`media_variant`/`image_processing_job` if the existing `didar_product_image` storage cannot safely support uploads/variants. Reuse the current image and authorization routes; no second unrelated asset service.

**Shared product, restricted business data:** Private stock UID/EPC, supplier cost/making deal, exclusive listings, finance contract, invoice, physical custody, another Merchant's CRM, other store campaigns/contacts and acquisition bonus rates **must never leak** across tenants or public APIs, even through counts, faceted search, SSR HTML, metadata/OG tags, QR redirects, image URLs or exports.

**Central CRM and privacy:** Didar can centralize customer data processed with appropriate lawful basis for operation and authorized platform needs; **registration is not blanket consent for unrelated marketing, cross-Merchant disclosure or unlimited staff access**. Merchant CRM sees only relationships and communications permitted for its organization. Record source, purpose, channel opt-ins and revocations; apply access controls, logging, retention/deletion obligations and safe exports. No merchant may view another merchant's customer relationship or order history. Global customer identity and Merchant-scoped relationships can coexist without duplicating accounts.

## 2.2 Integration contracts (illustrative; adapt existing APIs)

- Current `/didar/catalog`, `/didar/manage` and existing storefront/product/checkout remain canonical. Extend scope safely; don't create another commerce API.
- Merchant control plane (name final paths after repository audit): `/manage/merchants` (Didar), `/merchant` (authorized Merchant staff), `/merchant/products`, `/merchant/storefront`, `/merchant/crm`, `/merchant/campaigns`, `/merchant/rewards`.
- Public routes: `/m/{merchantHandle}`, `/m/{merchantHandle}/products/{canonicalProductKey}`, `/m/{merchantHandle}/c/{campaignSlug}`; global campaigns `/campaigns/{slug}` or existing collection/curated equivalent. A single product may render in both global and Merchant context without a cloned Master.
- Login and checkout preserve first-party scoped Merchant context in an integrity-protected cookie/session or server-backed context, validated against every requested Offer, never trust a user-editable merchantId, query parameter, Host or Referer.
- Existing public `/i/{uid}` QR remains permanent and resolves only allowed global PDP; do not leak Merchant-private UID/Offer via QR. For Merchant-specific share, use a separately validated scoped link to the approved Master/Offer, not a competing UID resolver.
- Public canonical OG/title/image metadata per Merchant/campaign for previews in WhatsApp/Telegram/social sharing; never expose hidden products in OG crawlers. Only published/non-invite campaigns can have public OG previews.
- Analytics service consumes real authoritative order/payment/refund events, with append-only idempotent attribution and anti-double counting; may buffer click/view events separately. Backend services remain server-side, scope protected and output paginated.

---

# 3. Phased build plan (STRICT sequence; useful software at every gate)

## Phase 0 — Preflight, threat model, preserved schema baseline [small]

**Goal:** Confirm what is already implemented as of latest main, identify minimal extension points, and produce a safe, executable plan without rebuilding core.

Implementation:
- Audit `didar_supplier`, Merchant auth/permissions, `didar_product`/Offer/UID, approved taxonomy/facets/collections, price `pricing.ts`/`didar_pricing_policy`/`didar_rate`, checkout/order snapshots, finance events, existing image constraints, storefront routes and web-to-API proxy.
- Inspect open Issue #6 and resolve any completed code first. Preserve Issue #4/#5 baseline and actual historical migrations.
- Create `docs/audits/merchant-growth-baseline.md` with DB tables, endpoints, UI, gap matrix, data risks, finance invariants and routes to extend. Maintain a concise dependency tracker in this roadmap or `PROGRESS.md`.
- Explicitly define merchant isolation at API, query, PDP, cart, checkout, share resolver, CRM, events and analytics levels. Default `deny` on missing scope.

**Gate 0:** No business rows or secrets changed, baseline tests pass, 0 destructive migration steps, proof baseline commit and issue status captured.

## Phase 1 — Merchant Commercial Types + Pricing Profiles [Issue #6 first]

**Outcome:** Two merchants selling the SAME Master can present two valid profile-specific Gold-First customer quotes and execute sandbox checkout without finance regression.

Work:
- Add safe commercial_type, reusable approved profile versions and effective-dated per-merchant assignment in existing schema; legacy suppliers remain unclassified/fallback until admin review. Profiles per type unlimited; support additional governed Merchant type codes later.
- Model `M` from each Offer and data-controlled `D`, `R`, `C` and taxed eligible components, separately from physical operations internal cost. Credit component `C` can apply on CASH, CREDIT, both or neither according to approved profile. Do not enable unapproved external shipping/packaging fee duplications.
- Preserve current 750 equivalent base, integer mg/IRR, BigInt exact arithmetic and explicitly configured tax, immutable quote/checkout/order snapshots, re-quote when changed. Preserve supplier ownership entitlement and balanced financial journals.
- Admin Persian panel: Merchant type, named profiles/versions, assignment effective period, fee component enablement/eligibility, preview per Offer and checkout breakdown; merchant sees own active terms only.
- Test 100g 750 / 12% / 65m: Manufacturer `8,073,000,000 IRR`, Retailer `7,751,250,000 IRR`, VAT demo 10%; cash with C ALWAYS vs C disabled; mixed merchant cart; assignment change after quote; partial returns; old paid orders unchanged.

**Gate 1:** Complete PostgreSQL→API→admin/consumer→sandbox sale/ledger plus tests, reviewed to main. Issue #6 may close only if all claimed behavior genuinely delivered. No LIVE tax/legal sign-off inferred.

## Phase 2 — Merchant Membership, Scoped Storefront & Own Listings [first visible MVP]

**Outcome:** A retailer can send `/m/shop-a`; visiting customer sees ONLY shop A, signs in on Didar and buys only shop A's eligible offers.

Work:
- Add Merchant-scoped memberships/roles, branded storefront handles and visibility modes (`PUBLIC_MARKETPLACE`/`UNLISTED_LINK`/`INVITE_ONLY`), publish/disable/expiry states and tenant-safe routes. Initially use Didar hostname; defer custom domains.
- Give existing approved Merchant a simple Persian panel to manage profile/brand/logo/contact/public page, see its catalog and submit its own products/Offer terms. Reuse existing supplier product request, catalogue approval, exact item intake and UID governance. Staff may assist on behalf of Merchant with an audit trail.
- A Merchant-defined new Master must pass Didar taxonomy, image/content and classification approval; no immediately sellable UID stock without verified individual intake. Existing Master with own Offer uses the same canonical product row.
- Storefront context persists through scoped category/facet/search, PDP, login/registration, cart, checkout, order confirmation and share links. Scoped offers cannot be silently replaced by competing merchants when unavailable. Handle mixed-merchant carts outside scoped storefront according to existing global flow.
- Merchant-scoped metrics and staff permissions are enforced by Postgres-backed server filtering; mobile RTL works. Security: direct URLs, unauthorized IDs, hidden collections, price and stock APIs cannot leak rival merchant details.
- Keep Didar platform seller-of-record/legal and payment disclosures accurate; don't introduce fictitious merchant payment routing.

**Gate 2:** Two merchants A/B; A's shared link, login, product, eligible offer, cart and sandbox purchase never render B's brand/offers/products; global site remains intact; invite-only link genuinely auth-guarded. Can be owner-demoed before launching CRM/referrals.

## Phase 3 — Merchant-Assisted Onboarding + Automatic Media Processing

**Outcome:** Merchant or authorized Didar marketing assistant uploads real product content without knowing correct image dimensions; publication follows existing approval and exact UID rules.

Work:
- Merchant onboarding wizard: registration, validation, Didar review, type and approved profile, business/storefront details, first Product Draft or join existing Master, making charge, image upload, SKU, taxonomy/facets/collections, request review/publish, accepted item/UID and available Offer.
- Separate `created_by` / `uploaded_by` / `assisted_by_agent` / `approved_by` and who is authorized to modify the listing. Attribution must reflect **actual audited actions**, not self-entered numbers.
- Accept bounded JPEG/PNG/WebP originals safely; verify decoded media, pixel limits, magic bytes, orientation, image decompression, protected image authorization. Normalize without changing jewelry color/shape/content. Strip EXIF/GPS/private metadata; preserve color profile correctly.
- Generate proportional derivative WebP sizes (e.g. small card, medium PDP and large zoom, dimensions configurable) with no forced distortion; configurable quality/byte-budget, lazy load/responsive srcset, alt text, privacy and content review. Maintain secure storage/lifecycle, compatibility with existing small PostgreSQL image blobs; if storage migration required, make it additive and retain original historic image IDs/routes.
- On success show the Persian receipt: source accepted, orientation/size optimized, WebP variants ready, preview URL and measured sizes. On failure give actionable reason, no broken public image. Do not fabricate pictures or use external random jewelry images.
- Authorized Agent onboarding activity and assistance records feed Phase 6 acquisition attribution; record events now even if reward engine follows later.

**Gate 3:** Large camera photo safely processed to variants, reloaded after restart, PDP/merchant store/OG select correct formats, hidden content inaccessible, no distorted jewel imagery, 10–20 image operations tested, no duplicate Product/UID.

## Phase 4 — Dual CRM Foundations: Didar Central + Merchant Relationship CRM

**Outcome:** One account can interact with multiple Merchants; each sees ONLY its own allowed relationships, Didar sees authorized central analytics.

Work:
- Add `merchant_customer_relationship`, relationship lifecycle (`prospect` with permission, `registered`, `lead`, `buyer`, `repeat` etc.), lawful acquisition source, explicit opt-ins per channel/scope, Merchant-owned notes/tags/tasks, activity feed and indexed search; keep global Customer identity as it is.
- Determine relationship by attributable explicit merchant registration, campaign opt-in, checkout/sale or confirmed allowed introduction; **mere unsolicited visiting/tracking does not automatically grant Merchant contact details**.
- Central CRM: authorized Didar staff can view platform account/transaction relationships and cross-Merchant aggregated performance under least privilege, consent and audit. Merchant CRM: show purchase history and campaigns related to THIS merchant only; never buyer data from others.
- Segmentation v1: order frequency/last order within Merchant, new customers, referred users, selected own customers consenting to marketing. No direct access to device address book or unrestricted cross-merchant email/SMS exports.
- First-party context continuity and consent preference center, unsubscribe/suppression, retention policies, right-to-access/deletion workflows as permitted while preserving regulated order records. Search and exports must be scoped/paginated.
- Persian /merchant/crm and central /manage/crm, responsive mobile, separate permissions for contact read, campaign targeting and exports.

**Gate 4:** One Didar Customer buys from A, later B; Didar CRM sees both authorized relations, A only A-related orders/allowed profile, B only B; withdrawal of marketing consent immediately excludes them from send/export; unauthorized API cannot enumerate users.

## Phase 5 — Curated Share Pages + Merchant Campaign MVP + Global Display

**Outcome:** Merchant picks 10–20 already-approved own products, publishes a special page, shares it in WhatsApp/Telegram/SMS and sees legitimate views and purchases. Didar can separately run one global visible campaign.

Work:
- One campaign domain with `owner_type=MERCHANT` or `DIDAR`, draft/review/publish/pause/expire, title/intro/hero, ordered product selection, allowed products/offers, scope/visibility, share URL, canonical metadata/OG preview, click and order attribution.
- Merchant special page examples: new arrivals, featured, holiday, curated 10–20 products and a single-product share. Products referenced; never copy Product Masters or UID stock. If source product unpublished/out of stock, show correct state/remove eligible offer rather than 404 entire page.
- Merchant dashboard provides selection, reorder, preview, live share links and platform Web Share API where available, plus WhatsApp/Telegram share URL, SMS composition and copy link. **Do not require a WhatsApp/Instagram automation API or SMS provider for MVP.** For Instagram use downloadable/ready-approved visual/copy and a shareable landing link; do not promise automatic Instagram direct-message sending.
- Didar admin builds campaign for all platform visitors or eligible subsets with global scope, can feature selected approved participating public Merchants/products. Global campaign cannot accidentally expose UNLISTED/INVITE_ONLY Merchant offers without an explicit approved participation/visibility grant.
- Storefront-context rule: when opening a Merchant campaign, stay within that Merchant, including login/cart/checkout; global campaign remains visibly Didar. The same Master can appear in multiple campaigns without duplicate inventory.
- First-party minimal tracking: campaign ID, merchant ID, short opaque share token, click/view (consent policy), order attribution; robust against link-sharing cross-device limitations, bot previews, expired links and replay.

**Gate 5:** Customer opens A campaign from shared link without entering general Didar, sees only A's products, registers, purchases in sandbox; order records selected Merchant/campaign. Global Didar campaign is publicly visible and draws only permitted eligible offers. Share previews contain no private data.

## Phase 6 — Didar Agent Acquisition Affiliate & Merchant Activation Analytics

**Outcome:** Didar can audit where, when and by whom a retailer was acquired and helped to publish products, then determine provisional/reconciled sales-based marketing agent rewards.

Work:
- Didar-authorized `marketing_agent` identity/permission and lightweight field-visit / lead / Merchant registration / qualification / approval / first-listed-product / first-sale statuses. Record visit date, user-declared region/shop, channel, optional owner-authorized supporting evidence. No mandatory continuous GPS or unrequested location tracking.
- Record acquiring Agent separately from assisting uploader/content Agent and closer; configurable assignment/attribution effective window, no double ownership and admin correction with reason/evidence.
- Agent dashboard: visits per date/region, leads, registered Merchants, approved activated Merchants, products created/approved/published by attributed assistance, sales generated, Didar attributable net revenue, retention and conversion funnels. Admin sees team/cohorts; agents only own assigned leads with approved scopes.
- Reward **rules** configurable per activation/milestone and/or a share of eligible **Didar net recognized revenue** rather than product Gold GMV. Rules versioned, effective-dated, caps/periods, payer, hold until sale and refund windows, reversals, manual finance approval; **no guessed percentages, automatic cash settlement or fictitious finance posting**.
- Idempotent facts from approved merchant, Product publication and paid/refunded order events. Merchant commercial pricing profile drives the known revenue components; audited eligibility, Merchant moves/sales/refunds cannot double payout.

**Gate 6:** Two Agents visit different/overlapping leads, one registers A while another uploads products; reports attribute both distinct roles correctly. Paid/refunded sales calculate and reverse pending reward once; no award from mere click or unverified sale; cross-agent visibility denied.

## Phase 7 — Customer Referral / Merchant Affiliate Rewards

**Outcome:** Retailer can optionally reward an existing customer for referring a genuinely new customer that makes a qualified purchase from that retailer.

Work:
- Merchant may enable, pause or disable a `CUSTOMER_REFERRAL` campaign, with approved reward kinds (e.g. next-purchase voucher, store-specific credit/discount, eligible gift benefit), payer/eligible spend, max budget, expiry, minimum qualified order and hold/reversal rules. Defaults **OFF** until merchant and Didar policy approval.
- Existing customer obtains opaque merchant-bound invitation/referral link or code; new customer's voluntary registration or confirmed purchase resolves attribution inside Didar without exposing the referrer's contact identity to other users or merchants.
- Handle existing vs new customer criteria, self-referrals, duplicate account manipulation, cyclic/employee referrals, same device abuse signals with privacy-safe procedures, idempotency, cooldown and dispute workflow. Do not claim foolproof fraud prevention.
- Award only after qualifying verified sandbox sale and prescribed return/dispute hold; create append-only `pending → eligible → approved → redeemed/expired/reversed` record with exact campaign/rule version, merchant, payer and order reference. Refund, cancellation and claim duplication reverse or reject awards.
- **No real cash/gold wallet issuance** without separate legal/tax accounting treatment and explicit authorized wallet integration. MVP can issue bounded discount vouchers/promotional entitlements under validated rules, or hold other rewards as pending for manual approval.
- Merchant can see only their own participants and merchant-scoped conversions. Didar can view permitted platform-wide cross-campaign statistics and financial obligation report.

**Gate 7:** A invites B to Merchant A; B purchases A's eligible Offer once; reward is pending then eligible after hold; no duplication on callback replay; B's purchase at Merchant C does not earn A's reward; refund reverses; privacy/cap conditions pass.

## Phase 8 — Merchant Growth Center, Central Marketing & Operations Hardening

**Outcome:** Small retailer can manage customer communication and campaigns through friendly guided workflows; Didar can run global campaigns and monitor healthy operations at scale.

Work:
- Persian **مرکز رشد فروش** in /merchant: simple actions ("محصولات جدیدم را معرفی کنم", "صفحه ویژه بسازم", "مشتری معرفی کند", "به مشتریان مجاز خبر بدهم", "نتایج را ببینم") with approved template copy/images and reusable campaign definitions.
- Communication options start with manual/copy/OS-share and contact-safe audience export only with consent and least privilege. Automated SMS/WhatsApp/Instagram integrations are **separate provider-connected opt-ins**, disabled until credentials, consent, provider policy and rate limits are approved.
- Didar central campaign console: public campaigns, Merchant eligibility/opt-in, featured slots, calendar, simple channel distribution and measurement. Own customer/merchant communications are scoped by recorded purpose and contact preferences.
- Analytics: funnel by Merchant and Agent (visits, registration, activation, listed SKUs, approved UIDs, links sent, valid visits, add-to-cart, paid/refunded sales), campaign conversion, Didar margin/net recognized revenue vs marketing/reward costs, customer retention. Clearly distinguish gross merchandise value vs Didar income and estimate vs booked expense.
- Roles, audit trail, dispute/reversal admin controls, security tests (tenant isolation and PII), search indexing, mobile accessibility/performance, scalability. Database-backed scheduled jobs only for safe expiration/preview, no external messaging by default.
- Do not silently turn campaign discount into a gold/rial payout. Reuse validated profile price and existing journals for real-sale facts.

**Gate 8:** A non-technical Merchant completes a campaign in a few UI steps, shares to permitted contacts, sees only own metrics; Didar global campaign is visible to permitted public visitors and properly tracks sales; red-team cross-tenant tests and existing Phase 1/2 suites green.

## Phase 9 — One integrated local Mac acceptance & handoff

1. Codex Linux full database/migrations, auth, finance, catalog, API and Playwright verification; source/build receipts and GitHub commit identifiers. Verify on a fresh DB AND an upgraded populated legacy fixture, with repeat migration and restart preservation.
2. Update `docs/MAC_UAT_CHECKLIST.md` with a **new optional merchant-growth addendum**, preserving the previous 20-UID financial checklist. Seed fully synthetic, isolated 2 Merchants (MFR and RET), 2 Agents, 3 Customers, 2 profiles, 10–20 sample Merchant products only in QA, selected campaigns and contacts with explicit test consent. UAT preparation is idempotent and must not erase persistent owner data.
3. Owner Mac commands remain supported: `git switch main`, `git pull --ff-only origin main`, `bun run local:setup`, `bun run local:browser`, `bun run local:test`, `bun run local:dev`. Adapt `uat:prepare` safely if needed; no `docker compose down -v`.
4. Demonstrate in real browser: Retailer A registration by Agent 1; Didar approval and Type RETAILER profile; assistant Agent 2 helps upload and WebP-process 10 product images; supplier exact weights and UID; retailer A store link (B hidden); customer signup in A context; selected campaign share → checkout with cash and C charged according to active profile; merchant A CRM and Didar central CRM; reward attribution; change profile later with historical snapshot unchanged. Show separate Manufacturer quote and Didar global campaign. Scan existing barcode/QR in actual device workflow when public origin verified.
5. Record proof and clearly segregate: `CODEX_LINUX_VERIFIED`, `MAC_UAT_PENDING/PASSED`, `REAL_PRINT_SCAN_PENDING`, `LIVE_PROVIDER_BLOCKED`, `TAX/LEGAL_SIGNOFF_PENDING`. Real customer data must NOT be copied into cloud/test fixtures.

**Gate 9:** Human-readable Persian journey, no data reset, no prior regression, explicit known operational blockers and exact final branch/commit receipts.

---

# 4. Mandatory end-to-end user journeys (acceptance catalog)

| Journey | Primary actors | Minimal accepted output | Delivery phase |
| --- | --- | --- | --- |
| J01 — Merchant acquisition | Didar Agent → admin | Dated/scoped lead, registration, approval and responsible Agent attribution | 3/6 |
| J02 — Multi-profile Merchant assignment | Admin | Effective approved profile attached to specific Manufacturer/RETAILER, changeable | 1 |
| J03 — Own product onboarding | Merchant/assistant → Product Ops | Uploaded draft, approved category/facets, governed approval and one shared Master | 2/3 |
| J04 — Responsive WebP transformation | Merchant | Fast correct variants, clear Persian result/error, authorized visibility | 3 |
| J05 — Exact physical intake | Warehouse/Admin | Real per-unit UID and validated stock, optional RFID, Code128/QR with safe public origin | Existing #4 + 3 |
| J06 — Isolated Merchant storefront | Customer from Merchant link | No rival navigation, offer leakage or unexpected merchant switch through checkout | 2 |
| J07 — Global storefront | Didar visitor | Only globally eligible offers with current approved faceted taxonomy | Existing #5 + 2 |
| J08 — Cash checkout with C | Customer/retailer | Merchant profile may apply C on cash; exact VAT, frozen snapshot, independent supplier entitlement | 1/2 |
| J09 — Central/merchant CRM | Didar & Merchants | One customer ID, tenant-specific views, consent/notes and accurate purchase scope | 4 |
| J10 — Single-product sharing | Merchant → Customer | Link to merchant-scoped product, valid preview and attribution | 2/5 |
| J11 — 10–20-item curated page | Merchant → Customer | Publish/edit/share/expire selected products, merchant-only checkout | 5 |
| J12 — Global campaign | Didar → all eligible visitors | Public campaign with correct visibility and real conversions | 5/8 |
| J13 — Marketing Agent affiliate | Didar Agent/Admin | Visits, activated merchants, products and reward based on qualified Didar revenue | 6 |
| J14 — Customer referral | Customer A → B at Merchant A | One qualifying purchase, controlled reward, refund reversal, no C leakage | 7 |
| J15 — Growth guidance and outreach | Merchant | Guided share templates and consent-controlled communications | 8 |
| J16 — Security/legacy acceptance | Admin/Owner | No cross-tenant data leak, duplicate product/UID, old order mutation or accounting imbalance | Every phase/9 |

J13 and J14 share attribution primitives but **have separate beneficiaries, liabilities, campaign scopes and reward rules**.

# 5. API, UX and test-quality guardrails

**Exactly-one ownership and identity:** one Didar Customer user; one canonical Product Master; multiple valid Merchant Offers; one immutable physical UID per item; one effective Merchant profile per assignment scope and time. Tenant relationships and campaign membership never clone these.

**Supplier vs retailer visibility:** public global catalog may show multiple eligible supplier offers under one Master when allowed; in scoped storefront filter BOTH master listing and **that merchant's offers** at every query/price/sale step. An unlisted Offer is hidden from global listings even if Master is public. Approvals and cancellation/return rules remain enforced.

**Do not expose customer data because of referral clicks:** a Merchant needs a genuine allowed relationship and channel-specific consent before contact or outbound marketing. Sales/payment data and legal documents only appear to authorized parties. Public links must never contain phone/email/address or bearer tokens. Never publish CRM data through meta tags, analytics exports or logged URLs.

**Referral fraud and costs:** never pay on unverified clicks, registration-only claims unless explicitly approved acquisition milestone, duplicate events, cancelled/refunded orders or gross gold GMV as if it were Didar revenue. Record campaign eligibility, attribution window, payout basis and reversible reward journal. Two independent programs must not cause duplicate credit on one event unless explicitly budgeted and approved.

**Media honesty and performance:** no AI generative beautification that changes real jewelry. WebP conversion standardizes size, type and load, not authenticity/color/specification. Use stable accessible asset URLs, secure MIME decoding, remove GPS metadata and protect drafts. Customer media optimizes for phone first. Do not require external CDN provider for MVP.

**SEO and sharing:** merchant-scoped PDP/campaign routes have explicit canonical/index/noindex policies based on PUBLIC/UNLISTED/INVITE status; only authorized product data in previews, with share metadata correct in WhatsApp/Telegram/SMS. Preserve existing global PDP and immutable `/i/{uid}`.

**Security:** default deny, test object-level ownership, auth, signed invite, rate-limited share/lookup endpoints, duplicate referral replay, campaign budget races, data exports and PII masking. Use server authorization, not a front-end filter or secret URL.

**Durability:** append-only source audit and sales/rewards ledger; use real DB transactions/idempotency keys/unique constraints and snapshots. Do not reset original Docker volumes; no destructive migration, force pushes, unaudited accounting or fabricated live prices/products.

**External service boundaries:** manual sharing works independently of provider tokens; no automated sending until approved consent and provider access. No real wallet credits/gold transfers without separate compliance approval; all finance integration sandbox only, mock Tahesab is still not actual vendor compatibility.

# 6. Dependency graph and release strategy

`Issue #4 & #5 done → Phase 0 audit → Phase 1 pricing (Issue #6) → Phase 2 Merchant isolation → Phase 3 assisted onboarding/media → Phase 4 dual CRM → Phase 5 Merchant/global campaign share MVP → Phase 6 Didar Agent affiliation → Phase 7 Customer referrals/rewards → Phase 8 growth tools/hardening → Phase 9 Mac integrated UAT`.

**Fastest genuinely demoable point:** after Phases **1–3**, a retailer has an assigned pricing profile, own secure scoped storefront, accepted product/UID and optimized images. Phase **5** adds curated page sharing; Phase **4** establishes truthful CRM and consent before outbound targeting; affiliate rewards are later, but event provenance must start in the first phases to avoid data backfill guessing.

Do not delay delivering Phases 1–3 until all 10 phases are designed. Each phase requires its own small migration/backend/UI/tests; ship, verify and continue. If a later phase is blocked by a legally undefined reward or tax rule, implement it as disabled configuration and proceed with already-safe work. Never silently choose commercial rates, credit interest, messaging consent or payout rules.

# 7. Issue/phase execution protocol for Codex

For each phase, repeat this disciplined loop:

1. **Rebase reality:** `git status --short`, `git switch main`, `git pull --ff-only origin main`, `git rev-parse HEAD`. Read latest issue/docs and inspect real code. Do not discard uncommitted user work.
2. **Scope:** create a short phase checklist of current vs missing functionality and changed components. Record blockers/defaults in `DECISIONS.md`; do not ask routine naming/form questions.
3. **Implement DB+domain first**, secure constraints, migrations, source event compatibility, populated-vs-fresh repeat and rollback/runbook. Existing owner data and configuration remain intact.
4. **Complete API, Persian RTL UI and real sandbox journey** before declaring feature complete. Avoid read-only fake screens, hardcoded mock array products or localStorage-only persistence.
5. **Evidence:** run all relevant unit/integration/API, current browser suite (auth→customer→checkout) and official production builds. Record actual commands, counts, failures, exact SHA, schema hash where used; zero regressions and no privacy leaks.
6. **Review/commit/merge:** reviewed cohesive branch/PR when needed; no force push or arbitrary replacement. Merge verified additions into `main` (or report precisely why it cannot be merged). Do not claim success before GitHub confirms.
7. **Update source-controlled truth:** `PROGRESS.md`, `DELIVERY.md`, a concise new `docs/merchant-growth/PHASE_N.md`/test receipt and Mac UAT addendum. Tag each part `DONE & TESTED` / `IMPLEMENTED NOT VERIFIED` / `BLOCKED` / `NOT STARTED`.
8. **Continue automatically to next safe phase**; pause only for genuine access, security, legal, external provider or destructive action requiring owner approval. A blocked provider integration must not stop independent demo-safe development.
9. **End-of-phase handoff:** one-paragraph Persian status with screen URLs, QA login/test data references, actual tests, code SHA, no secret disclosure and next phase.

Implementation gate requires **Database → Backend → API → Frontend → Test** all complete; a document or UI-only proof is not sufficient.

# 8. Policies awaiting owner approval (DO NOT invent or silently enable)

| Policy | Safe build default until approved |
| --- | --- |
| Additional customer-charged packaging/shipping on top of D | OFF; store cost allocation only, no double-charge |
| New Merchant type pricing rates beyond owner examples | Inactive profile versions awaiting approval |
| Tax treatment of credit service, rewards and newly added logistics line items | Configurable, production-disabled/awaiting tax signoff; preserve verified example calculations |
| Which Merchant products may enter Didar global campaigns | Default public-approved only; invite/unlisted excluded absent explicit opt-in |
| Customer referral bonus amounts and eligibility windows | OFF / admin-approved templates, no unconditional payouts |
| Didar Agent bonus shares, revenue basis, payout time | Track acquisition/events and calculate provisional only after explicit approved rule |
| Cash/gold reward or credit issuance | OFF pending licensing/accounting signoff; prefer bounded coupon once approved |
| Automated SMS / WhatsApp / Instagram sending | OFF; native share, SMS compose and copy link only |
| Privacy/marketing consent texts, retention, exports | Explicit review; prohibit contact harvesting/unconsented outbound messages |
| Ownership of customer data and campaign obligations | Platform account with purpose-limited Didar access; Merchant relation-scoped rights; contractual/legal review |
| Verified public HTTPS origin for customer QR | OFF until configured and verified in deployment; warehouse barcode remains usable |
| Real printing, phone QR scan, Mac native runtime, external accounting | Pending external UAT; Linux test not equivalent |

# 9. Final Codex master instruction (one copy/paste)

**Mission:** Implement all **pending** roadmap phases in `docs/ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md` in the existing GitHub Didar B2C repository. First audit current `main` and all previous Issue #4/#5/#6 changes to avoid duplication. Use one shared Product/UID/pricing/financial core and one Didar Customer identity. Build real Merchant-type pricing with cash-applicable C, tenant-isolated merchant storefront, own product/media onboarding, central + merchant-scoped CRM, curated Merchant pages and approved public Didar campaigns, Didar Agent attribution, optional Merchant customer referral rewards and guided marketing tools. Complete each incremental database-backend-API-Persian UI-test gate and merge verified changes to main, preserving original business data and prior Phase 1/2 behaviors. Deliver the earliest usable merchant buyer journey first. No invented rates, marketing consent, reward payments, Tax/Oracle/live APIs or destructive database resets. Update Mac UAT docs, source-controlled evidence and accurately mark human/external pending checks. Proceed without asking routine business questions; only escalate true blockers requiring owner/legal authorization.

**Do not treat this roadmap publication as implementing any feature.**

---

# Progress checkpoint — 2026-10-16, merchant pricing delivered

**Software implementation baseline:** `main` at `84e1c1b0e186a23cb004adb5d696ba2505fa241e`, [Issue #6 implementation handoff](../docs/MERCHANT_PRICING_IMPLEMENTATION.md). This checkpoint updates the status stated at **roadmap authoring** in section 0; historical baseline references there are intentionally retained.

- **Phase 0 baseline inspection for pricing:** completed within Issue #6's dedicated audit/migration tests. The wider Merchant Growth threat model and CRM/storefront tenant isolation audit remain part of the next-phase preflight.
- **Phase 1 Merchant types/pricing profiles:** `CODEX_LINUX_VERIFIED / MAC_UAT_PENDING`. Confirmed source includes type registry, approved reusable immutable profile versions, central tax-policy versions, effective-dated Merchant assignment, cash-applicable component C, single authoritative checkout quote, order-level shared-charge allocation, frozen order snapshots, isolated supplier read scope and balanced journal/returns. On the example 100g/750 at 65,000,000 IRR/g with 12% making, Manufacturer = 8,073,000,000 IRR; Retailer with C=2.5% ALWAYS = 7,751,250,000 IRR. Codex's documented verification: **135 backend tests, 1,680 assertions; one native HTTP test, 19 Playwright journeys, all production builds**. These were not independently re-run on the owner's Mac in this checkpoint.
- **Phases 2–8 Merchant-scoped storefront, assisted WebP onboarding, dual CRM, campaigns, staff affiliation, customer referrals, growth center:** `NOT YET CLAIMED IMPLEMENTED`; inspect freshest main before starting each phase.
- **Phase 9 integrated Mac UAT:** `MAC_UAT_PENDING`, including printer/scanner/phone-camera verification. Live financial activity, real Tahesab, commercial profile activation and tax/legal/accountant sign-off remain separately pending.

**Next actionable task: Phase 2 — Merchant-scoped storefront plus tenant isolation.** Begin with a concrete *one-merchant link → only that merchant's eligible offers → registration/login preserving merchant context → cart/checkout sandbox → correctly attributed order* vertical slice. Preserve Issue #6's profile-version quote keys and the existing canonical Product/UID/QR model, existing shared Master and global marketplace. Public/unlisted/invite-only must be backed by server authorization/query constraints, not CSS hiding. Do not duplicate an existing public customer into merchant-local accounts, expose rival merchants, or mutate checkout/financial snapshots. Then continue sequentially to Phases 3–9.
