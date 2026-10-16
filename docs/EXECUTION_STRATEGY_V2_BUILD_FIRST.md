# DIDAR B2C — Execution Strategy v2: Critical Thinking + Design Thinking, BUILD FIRST

**Decision date:** 2026-10-16
**Status:** OWNER-CONFIRMED EXECUTION PRIORITIES; documentation only, NOT a claim of newly delivered code.
**Applies to:** `docs/ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md`, Master GitHub Issue #7 and `docs/PHASE10_LUXURY_VISUAL_CMS.md`.
**Implementation baseline when authored:** `main` at `e417f13d36926be39f78dc1aef6e4194146b269e`. Issue #4 and #5 delivered; Issue #6 merchant pricing delivered and closed, with native Mac acceptance outstanding.

## 1. The owner's explicit strategic decisions

1. **BUILD ALL AGREED FEATURES FIRST.** Do not require new live retailer/customer interviews, behavioral experiments, feature-market validation, sales uplift evidence or business KPI achievement to start/continue engineering. The owner already tested the basic retailer adoption/storefront interest and product onboarding sufficiently to proceed. Do not repeat those exercises as mandatory gates.
2. **TECHNICAL TESTS ARE MANDATORY THROUGHOUT.** Each implemented slice still requires real PostgreSQL → domain/backend → API → connected Persian RTL frontend → automated integration/Playwright/build/regression and security verification. Existing data must remain safe. This is NOT permission to build an untested monolith.
3. **CUSTOMER USABILITY AND BUSINESS TESTS COME AFTER FEATURE COMPLETION.** When all planned capabilities and the final luxury CMS are integrated, owner can run customer/merchant usability studies and business measurement using real opt-in audiences. These results guide *post-completion iteration*, not authorization to build.
4. **PRIORITIZE BY BUSINESS VALUE, RISK AND TECHNICAL DEPENDENCIES.** Prioritization is an engineering ordering tool and a Critical Thinking discipline, not a veto over owner-approved features. Preserve the entire committed scope.
5. **CRM MUST START SIMPLE**: one central Didar identity, merchant-scoped related customers, purchase history, consent-safe notes and basic segments; advanced CRM analytics and automation later. No big CRM/PIM rewrite.
6. **SHARING FIRST, ADVANCED CAMPAIGNS LATER**: ship a simple merchant-only selected-products page, share links and basic first-party attribution in the earliest safe merchant storefront iteration; comprehensive Merchant/Didar Campaign Management later without rebuilding that capability.
7. **LUXURY UI EARLIER, ADVANCED CMS LATER**: adopt navy/white Didar visual identity and a polished real B2C consumer storefront **from Phase 2 onwards**; stage the large media hero, editorial layout and responsive composition in early phases. Keep the full PostgreSQL Visual Page Builder, authored slider/mosaic/video, scheduling/approval/rollback and final polish in Phase 10. Do not postpone every design decision to the end.
8. **Product onboarding has already been tested by the owner**, and need not be re-validated before coding. Preserve later improvement flexibility if new supplier categories/media flows make it more complex.
9. **No invented commercial figures or compliance facts.** Owner-approved pricing maths and consent, tax, affiliate-payout and real service-provider boundaries remain enforceable.

## 2. Critical Thinking: practical technical decision discipline

For each upcoming phase, record at most one compact phase design note:

- **Business value:** what requested capability this unlocks and for which owner-approved actor (Didar admin, retail Merchant, customer, Agent).
- **Technical dependency:** what existing Product, Merchant Pricing Profile, UID, cart, permission, CRM or campaign module it **must reuse**.
- **Risk and failure mode:** tenant data leakage, price/UID mismatch, unapproved finance/marketing action, irreversible migration, slow media or inaccessible UI.
- **Simplest compliant path:** choose the smallest reversible tested vertical slice and record what is deliberately deferred to another phase.
- **Proof:** actual automated tests and reproducible manual operator QA using synthetic data.

This is an engineering design review, **not a mandatory new user research or business experiment gate**. Critical challenges should improve architecture, not endlessly expand feature complexity or trigger routine questions to the owner.

## 3. Design Thinking: product-led development without premature field testing

Apply empathy and usability principles using existing owner insights and the already agreed journeys. Codex can run prototype/browser usability checks internally with QA personas and standard interaction heuristics, but do **not** mandate new customer interviews or conversion evidence before implementation.

Mandatory design principles during build:
- Retailer feels its digital storefront and own customer relationship are theirs; no rival Merchant shown through shared links, PDP, registration, cart or checkout. Keep accurate legal disclosures and one Didar identity.
- Retailer can add a product, see automatic image preparation, select 10–20 own products, preview a share page and copy/share links with few understandable Persian interactions.
- Customers can enter directly through a Merchant link, sign in only once to Didar, see relevant approved products and purchase under the same Merchant context with correct profile-based quote.
- Didar Central CRM is purpose-limited and operationally complete; merchant CRM is separate in authorization, not a duplicated central account.
- Navy/white design identity, editorial image-led navigation and mobile clarity should be visible **before** the advanced Visual CMS is written.

Run external user/merchant evaluation **after complete system construction and final integrated technical acceptance**. Use insights later for improvements, not to claim testing occurred earlier.

## 4. Revised phased implementation sequence

The **existing eleven phases 0–10 and all 19 acceptance journeys remain intact**. The following revised staging overrides older sequencing language only where explicitly stated.

| Stage | Development work | Priority logic | Real user/business testing |
| --- | --- | --- | --- |
| 0 | Actual main/code, privacy/security, version, route and DB audit; concise assumptions/risks | Foundation to protect historical data | NOT a gate; existing owner validation accepted |
| 1 | Merchant types + approved pricing profiles and C-on-cash | DONE (Codex/Linux verified) — reuse, do not rebuild | Deferred |
| 2A | Secure merchant-only storefront, account context, Merchant Offer filtering, profile quotes, sandbox buy | Highest business value and tenant security prerequisite | Automated/owner sandbox only |
| **2B EARLY VISUAL** | **Premium navy/white shared design tokens, header/navigation, product cards, basic homepage/merchant storefront composition, elegant responsive desktop/mobile, existing taxonomy/facet browse and correct price UI** | Avoid redoing all pages in Phase 10; provide visual screenshots early | Design review by owner allowed; no merchant/customer market pilot |
| **2C SIMPLE SHARE** | **Minimal Merchant product selection (10–20), shareable private/unlisted scoped page, single Product share URL, copy/WhatsApp/Telegram/SMS composer and safe attribution token** | High value and dependency for campaigns; keep advanced campaign builder for Phase 5 | Automated click/checkout tests only |
| 3 | Merchant-assisted onboarding and real WebP image optimization; image upload messaging, exact Product/UID readiness | Content quality + operational simplicity; early design uses current assets and upgrades afterward | Repeat usability study deferred |
| 4A | Lightweight dual CRM: one Didar Customer + scoped Merchant relation, customer identity, own purchases, basic notes and consent preferences | Core trust and merchant retention; avoid CRM bloat | Technical data isolation tests |
| 5 | Complete Merchant/global campaigns, editorial selected pages and share tracking, approval, scheduling and governance | Extend Phase 2C, no second campaign/link stack | Sandbox conversion instrumentation |
| 6 | Didar Agent acquisition, onboarding assistance attribution, visits, region, provisional bonus rules | Needs Merchant and genuine sale events | Reward QA with synthetic orders |
| 7 | Merchant customer referral rewards with anti-abuse, budget/consent, refunds | Needs campaigns + customer relations + order events | Synthetic tests before live use |
| 8 | Advanced Merchant Growth Center, segmentation, approved campaign tools and analytics; CRM 4B advanced capabilities here | Depends on established CRM/events; do not overbuild Phase 4A | Technical/performance/security tests |
| 9 | Integrated *functional and financial* local Mac UAT baseline for Phases 0–8 | Verify technical correctness and stability | NOT an external customer-market test |
| **10 FULL VISUAL CMS** | **PostgreSQL-backed Visual Page Builder; admin-manageable Hero Video, Slider, asymmetrical Mosaic, Split Story, Collection/Product/Campaign blocks, preview, approval, scheduling, rollback; extend re-usable renderer to merchant/campaign scopes; final responsive/visual performance polish** | Design foundation already exists from Phase 2B, media pipeline Phase 3 and campaign entities Phase 5 | Final visual/browser/Mac technical acceptance; external pilot AFTER this phase |

**Important:** Phase 2C may precede the full Phase 5 campaign module and may use one minimal approved scoped share-page relation and first-party attribution; Phase 5 **must extend those exact records/links**, not fork them. Phase 2B can initially use safe existing photo assets and simple static block composition; Phase 10 delivers actual dynamic CMS and media controls. Phase 3's media pipeline will upgrade 2B assets without redesigning routes.

## 5. Two distinct acceptance stages

**During development — always mandatory:**
- `Gate A: ENGINEERING VERIFIED` = migrations fresh/populated/repeated; Backend → API → actual Persian UI; unit/integration/browser; security and tenant isolation; build, immutable quotes, UID and ledger snapshots, safe restart; exact commit/test evidence.
- `Gate A-MAC: OWNER TECHNICAL UAT` = local Mac test of functionality when available; this is technical owner verification, not mandatory external retailer interviews.

**After completing ALL accepted feature scope, including Phase 10:**
- `Gate B: USER USABILITY REVIEW` = actual small opt-in retailers, customers, marketing Agents; task completion, clarity, trust, product input, share pages, campaigns and CRM workflows.
- `Gate C: BUSINESS PERFORMANCE REVIEW` = actual adoption and activation, time-to-first-published-product, share rates, qualified traffic, merchant-attributed purchases, Didar recognized net revenue, campaign/referral cost, retention.
- Gates B and C determine the next optimization backlog and **must never be represented as completed by successful Playwright or synthetic sandbox sales**.

Technical correctness remains a hard delivery condition; the owner explicitly chooses not to interrupt feature implementation for external customer feedback cycles.

## 6. Phase 2 immediate implementation contract for Codex

Do **not** start with Phase 10 Page Builder or wait for market validation. Phase 2 must deliver:
1. Merchant privacy/offer/cart/checkout scoped by cryptographically validated context and authoritative shared Merchant profile quotes.
2. Persian responsive navy/white design tokens, shared storefront navigation, elegant home/merchant shell/PDP/product cards, restrained gold/champagne.
3. A minimal 10–20-product Merchant share page with safe link and privacy gates. A didar admin may preselect test products; final Merchant permissions govern editing.
4. One QA journey: Merchant A creates/receives approved products, shares page, customer enters through A, sees no B, signs up, completes CASH sandbox quote/order tied to A and frozen Profile version. Global Didar catalog remains fully functional.
5. Real browser screenshots for desktop (e.g. 1440px) and mobile 390px, accessibility checks, category/facet consistency, quote snapshot validation and every older Phase 1/2 regression suite.
6. No automatic sending to social accounts; use native share/copy/prepared channel links only. No customer-market testing requested.

**Outcome:** The owner sees the premium design earlier and has a working Merchant share journey; advanced Visual CMS remains scoped for Phase 10.

## 7. Source/documentation requirements

Before modifying code, read latest `docs/ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md`, `docs/PHASE10_LUXURY_VISUAL_CMS.md`, `docs/MERCHANT_PRICING_IMPLEMENTATION.md` and this v2 strategy. If requirements conflict, this owner decision controls **timing of external user testing, staged luxury design and early share pages**. Core finance/price, privacy and legal requirements retain their original precedence.

Do not change previously approved commercial rates, tax interpretations or item-specific stock/UID semantics. Avoid building separate new identities, catalog, commission ledger or generic CMS for Phase 2. Use small sequential reviewed commits (or one coherent verified feature branch) and report genuine statuses; never call a Markdown commit a completed feature.

**Codex one-shot update instruction:**
> Update Master Issue #7 to follow `docs/EXECUTION_STRATEGY_V2_BUILD_FIRST.md`. Continue with Phase 2A tenant-isolated Merchant storefront, Phase 2B premium navy/white UI foundation, Phase 2C simple shareable selected-product pages, then Phases 3–9 and full Phase 10 Visual CMS. Do not require additional external customer/retailer/business experiments before building all planned features. Maintain mandatory full technical QA gates and Mac UAT; conduct external usability/commercial validation only after Phase 10. Reuse all implemented catalog/UID/pricing/ledger/CRM/campaign services. Do not stop at documentation; ship verified end-to-end code and evidence to main.
