> **HISTORICAL FILE / NOT CURRENT PHASE NUMBER.** The owner moved this complete luxury Visual CMS feature to **development Phase 4**, after Merchant storefront and image processing and **before CRM**. Use the **current executable specification** [PHASE4_LUXURY_VISUAL_CMS.md](PHASE4_LUXURY_VISUAL_CMS.md) and [v3 roadmap](ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md). The old “Phase 10 after Phase 9 Mac UAT” statements below are superseded and must NOT schedule any Mac testing as a development phase. Retained only for historical design details.

# DIDAR B2C — Phase 10: Luxury Experience & Visual CMS / Page Builder

**Document:** Implementation specification / Codex execution contract
**Date:** 2026-10-16
**Status:** PLANNED; publishing this specification does **not** mean the UI/CMS is implemented.
**Scope:** Final, post-Phase-9 experience/design tranche for the existing Didar B2C application. Add after all earlier merchant pricing, storefront, image, CRM, campaign and affiliate work. Phase 9 currently contains the prior integrated Mac UAT baseline; Phase 10 adds its own final visual/browser/Mac acceptance and must not invalidate that baseline.
**References:** Owner-provided Cartier screen recordings and Paon d'Or (paon-dor.com) reference, and the current prototype discussion. Draw inspiration from whitespace, premium editorial storytelling, large photos, moving media and asymmetrical image placement; **do not copy** Cartier/Paon d'Or trademarks, site code, visual assets, fonts, identifiable campaigns or unique protected layouts. The brand is DIDAR.
**Related:** `docs/ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md` (Master Issue #7), `docs/B2C_PRODUCT_TAXONOMY_FACETS_SPEC.md`, `docs/TAXONOMY_UID_LABELS.md`, `docs/MERCHANT_PRICING_IMPLEMENTATION.md`, `docs/PHASE1_OPERATIONS.md` and completed campaign/merchant storefront phase docs when present.

## Owner v2 sequencing note (2026-10-16)

The owner expressly chose to **implement all agreed features before external customer/merchant usability and commercial evaluation**, while maintaining rigorous automated and technical Mac UAT during development. Refer to [`EXECUTION_STRATEGY_V2_BUILD_FIRST.md`](EXECUTION_STRATEGY_V2_BUILD_FIRST.md) for the controlling execution strategy.

**Split visual delivery intentionally:** Phase **2B** must already deliver the **navy/white Didar brand design tokens, premium real B2C homepage/merchant shell/header/product cards, responsive PDP and clean navigational language**, with only safe early editorial content and the real current catalog. Phase **10** delivers the **full configurable PostgreSQL Visual CMS**: approved Page Builder, media/video slider, asymmetrical mosaics, editable split-story/product/collection blocks, responsive previews, publication scheduling, roles, version history and rollback. Reuse Phase 2B design/real components and Phase 3 optimized media pipeline, rather than replacing them.

Phase 10 remains after Phase 9 baseline technical Mac UAT; upon Phase 10 completion run a final visual and full technical regression acceptance. **Only then** conduct external retailer/customer user testing and commercial KPI review. These do not block prior engineering.

## 1. Business outcome

Replace the fixed, text-led Didar B2C home presentation with a **media-first, luxury visual experience**, controllable through an actual PostgreSQL-backed admin **Visual CMS / Page Builder**. DIDAR administrators must compose, order, preview, schedule, approve, publish, disable and revise content sections without requiring source-code changes. The same authorized and tenant-safe block renderer can later be reused for Didar-wide campaigns, collection/category editorial landing pages and merchant-only campaign/storefront pages created in previous phases.

**Critical boundaries:** This phase is **visual composition + content governance**, not a new commerce engine, new CMS separate from Didar, a new retailer marketplace, or a substitute for real product/offer/UID/price information. Preserve existing Next.js, native Mercur/Medusa panels, API proxy, Product Core, taxonomy F01–F12, merchant scoped storefront, Gold-First merchant profiles, checkout snapshots, financial ledgers, CRM privacy, campaign attribution and historical routes. Integrate with them through stable internal IDs and existing read services.

## 2. Owner-approved design language

**Primary palette (proposed design tokens, editable via centralized brand configuration):**
- DIDAR Navy: `#142D50`, primary headings, header/nav emphasis, premium deep-background sections;
- White: `#FFFFFF`, dominant canvas, content whitespace;
- Soft Gold: `#C5A46A`, controlled highlights/lines/CTA accents, not large gaudy surfaces;
- Champagne: `#EEE6D9`, editorial backdrops and subtle section dividers;
- Neutral text: dark navy/neutral grey selected for WCAG contrast.

No earlier olive/beige/green-dominant palette as main identity. Gold is sparingly decorative, white space and photography carry prestige. Tokens rather than scattered hardcoded hexes, one consistent typographic scale, responsive spacing and editorial rhythm. Persian `fa` RTL first, visually correct mixed direction for Latin SKUs and currencies. Respect any actually deployed localization; do not claim fully translated `en/ar/fr` frontend from tokens alone. Implement theme variants only with Didar owner approval. Merchant identity (logo/name/cover) may appear inside constrained approved templates, but must not compromise Didar's core brand/legal seller-of-record disclosures.

**Visual hierarchy:** minimal unobtrusive navigation; restrained Didar wordmark; cinematic photo/video hero; quiet typography; spacious split editorial stories and nonuniform mosaics; selected product/collection blocks grounded in the real catalog. Animations gentle, short, optional; no autoplay sound; reduced-motion fallback. The CMS must be suitable for 390px phones and large desktop screens.

## 3. Required reusable page blocks (real content, not decorative placeholders)

Implement a **versioned allowlisted block registry**, with validated configuration, design presets and layout editing:

| Block type / code | Core configurable fields and behavior |
| --- | --- |
| `HERO_VIDEO` | 1 full-width or full-viewport approved video with desktop/mobile sources, image poster/fallback, optional overlay gradient, title/subtitle, CTA linking to safe in-site published content, crop/focal point, contrast variant, play controls; allow muted/playsInline background as policy. |
| `HERO_MEDIA_SLIDER` | Ordered mix of images/video slides with desktop/mobile asset variants, separate alt/poster, CTA, optional captions, manual arrows/dots, controlled autoplay/pause, bounds and reduced-motion support. |
| `EDITORIAL_MOSAIC` | **Owner-priority:** flexible asymmetric side-by-side imagery (e.g. 1 large + 2 small, 2 offset tall photos, 3-column varying span, editorial magazine grid) with configurable span, aspect ratio, focal crop, content/text overlay, item CTA and mobile order. No forced distortion. |
| `SPLIT_STORY` | Media beside title/text/CTA, reversible left/right placement, optional video or responsive image, navy/white/champagne variants. |
| `FULL_BLEED_MEDIA` | One edge-to-edge photograph/video, focal area, height preset, optional accessible caption and CTA. |
| `COLLECTION_SPOTLIGHT` | Existing approved collection ID/label + real collection-linked image/media + product CTA; no duplicate collection entities. |
| `CATEGORY_FACET_EDIT` | Existing taxonomy Family/Category/Subcategory and F01–F12 discovery views (e.g., Everyday, Occasion, Luxury approved, Heritage approved) with dynamically resolved cards. |
| `FEATURED_PRODUCT_GRID` | Existing real published Product/Offer IDs or safe curated query filters; configurable columns, card sizes and item order; live quote and availability from existing pricing, not CMS-stored static price. |
| `PRODUCT_CAROUSEL` | Real product rail, bounded product count, accessible navigation, optional audience filters, responsive layout; never show private merchant Offers in global/public context. |
| `CAMPAIGN_PROMO` | Existing Didar-global or Merchant-scoped campaign by validated ID, visibility, start/end and approved media; preserve campaign source attribution. |
| `BRAND_STORY` | Restrained editorial heading, paragraph, compliant brand/story media and internal link. |
| `SPACER_DIVIDER` | Limited whitespace and subtle line options; prevent arbitrary code/script injection. |

MVP must implement the first **four blocks** plus `COLLECTION_SPOTLIGHT` and `FEATURED_PRODUCT_GRID` end-to-end; other blocks can be incrementally layered within this phase and must be marked honestly. A **homepage preset** should demonstrate a video/slider hero, multiple image mosaics, one split editorial, curated collections, and products. Templates are starting points only; the owner can re-order/delete/replace blocks.

**Block safety:** do not allow arbitrary HTML/JS/CSS code from content editors, external script embeds, unsanitized URLs, cross-tenant product IDs or unapproved media origin. Use typed JSON schemas in backend/API, bounded sizes/counts and explicit permitted outbound CTA destinations. For private/invite-only pages, preview and rendered media/meta responses enforce their access policy.

## 4. CMS data/domain model (adapt existing tables instead of duplicating)

Before coding, audit Phase 5 Campaign Builder, Phase 2 Merchant pages, current category/collection data and existing media/image tables so CMS extends them rather than branching into a parallel page store. Suggested conceptual relations:

- `didar_content_page`: stable key/id, `page_kind` = `DIDAR_HOME | DIDAR_CAMPAIGN | COLLECTION_LANDING | CATEGORY_LANDING | MERCHANT_HOME | MERCHANT_CAMPAIGN`, owner scope, slug/path reference, locale, status, current_publication_version, schedule, renderer version, created_by and audit.
- `didar_content_page_version`: immutable version, ordered typed blocks config, schema_version, draft/review/approved/published/archived, author/reviewer, created_at, optional preview token; changes are new versions; one effective published version per page/time scope.
- `didar_page_block_asset` / existing media linkage: asset ID and usage, locale/desktop/mobile role, accessibility fields, focal metadata; no orphaned asset deletion; reuse Phase 3 image variants.
- `didar_page_publication` / publication history: effective start/end, actor, conflict-free publish/unpublish/rollback, idempotent signed-off revisions.
- `didar_design_theme` or source-controlled Didar tokens: global sanctioned color and typography; merchant limited safe presets if previously supported; do not let retailer edit Didar-wide theme.
- `didar_editorial_audit` via the existing audit stream and role-appropriate approval workflow, with version-level changes and publishing reason.

No static filesystem JSON/localStorage as the canonical CMS state. Use PostgreSQL and additive idempotent migrations with constraints, unique effective versions, soft retirement and populated-database backward compatibility. Keep `/` original page routing functional during migration with safe fallback when no published CMS layout exists; do not break SEO/bookmarks/catalog.

## 5. Admin UX: Visual CMS / Page Builder

**Entry:** existing Persian `/manage` → `مدیریت صفحات و رسانه` and a practical destination such as `/manage/pages`; reuse existing auth/RBAC and active admin styling while modernizing consumer-facing pages.

From a real admin interface, DIDAR Content Ops should:
1. Select a page by scope: Didar Homepage, Didar general campaign, category/collection landing, or permitted Merchant homepage/campaign. Display permissions and locale.
2. Click `افزودن بخش`; choose block template; edit real caption, title, approved media, linked existing products/collections/campaigns, crop focal point, responsive settings, alt/subtitles, CTAs and optional theme variation.
3. Reorder sections with accessible drag-and-drop **plus keyboard/up-down buttons**, duplicate one section, disable/unpublish, edit mobile ordering and preview separate breakpoints. Media cannot stretch or hide legally required text.
4. Upload authorized image/video; see processing, dimensions, transcoding status, poster preview and actual optimized sizes. If Phase 3 image processing exists reuse its pipeline. For video add a bounded safe transcode path only when dependency supports it; otherwise report pending and initially support validated browser-playable assets, without pretending full transcoding exists.
5. Preview draft at authenticated private preview route with noindex/no public leakage; compare Desktop/Mobile; request review, approve, schedule, publish, pause, revert prior version with audited event. No broken public page on rollback.
6. Report broken links, unpublished target products, unapproved collection visibility, expired campaigns, missing alt text, invalid video/crop or inaccessible overlay contrast BEFORE publication. Disallow server publication when required checks fail.
7. Audit author/editor/publisher IDs, timestamps, version diffs; Admin and authorized Content Ops can publish Didar-wide pages; Merchant editors can only draft/manage their own approved scoped pages/campaigns within bounds. No Merchant may edit the Didar homepage or another retailer's private campaign.

**Optional, later:** broad WYSIWYG freeform design is NOT required; keep a reliable block/template editor to avoid security and scope creep. A clever drag/drop prototype alone does not count as an implemented CMS.

## 6. Media ingestion, performance and accessibility

**Images:** reuse Phase 3 secure upload with validated bytes/EXIF removal, proportional WebP responsive variants, correct object-fit and focal point, lazy loading below fold, alt text and accurate product/color representation. Optional AVIF only if safe and supported. No image generation or unauthorized Cartier/Paon d'Or assets as production fixtures.

**Video:** only allow approved actual media, bound format/MIME/duration/pixels/bytes, private upload and staged processing, mobile variant or poster fallback, stable CDN/object URL or existing controlled media store. No unlimited base64 videos in PostgreSQL or embedding arbitrary remote-player scripts. Prefer MP4/H.264 compatibility and optimized/WebM where practical. Implement muted autoplay only in in-view contexts as allowed; `playsinline`; user play/pause + captions/transcripts where content carries meaning; poster for unsupported data-saving/low bandwidth. Autoplay must not delay main content; disable when `prefers-reduced-motion` / data-saver applies.

**Page experience:** responsive srcset/sizes, stable aspect ratio to avoid CLS, fetch/stream hero priority intelligently, deferred offscreen video/carousels, minimal blocking JS, accessible carousel controls and swipe with keyboard alternative, correct RTL interactions, no flashing transitions. Define measured budgets relative to current app + realistic target: mobile LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms at representative network/device where practical; report measurements instead of claiming absolute scores from synthetic fixtures. Real media are not in GitHub; placeholder/test assets must be licensed or synthetic and never presented as real DIDAR stock.

**SEO/OG:** use actual published page version title, description, image and canonical; index only public Didar or genuinely public Merchant page; `UNLISTED_LINK` noindex as appropriate; `INVITE_ONLY` no private OG leaks; never expose unauthorized supplier/UID/CRM/finance info. Shared WhatsApp/Telegram previews should be correct for published allowed content. Keep accessible link labels, alt text, adequate contrast and readable overlay.

## 7. Multi-tenant reuse without brand or data leakage

- **Didar public homepage:** curated public approved products and collections only. No visibility of unlisted/invite-only Merchant Offers merely because their Product Master is published globally. Didar-admin campaign participation follows previous approved sharing rules.
- **Merchant homepage:** only products/eligible Offers of the current Merchant; Merchant-only sections, calls to action and campaign blocks preserve immutable/authorized Storefront Context through PDP, signup, cart, checkout, quote and order. Other Merchants remain invisible in tenant-scoped navigation and product recommendations.
- **Campaigns:** page blocks reference existing Phase 5 campaign and analytics ID; don't create new campaign attribution silo. Media links and share previews resolve only authorized active campaigns.
- **Customer CRM:** CMS does not expose contact lists, tracking IDs containing PII, private relationship notes or other merchants' audience data, including preview/SSR/OG image routes.
- **Commercial truth:** product cards/prices call the existing Merchant Profile-aware quote engine with CASH/CREDIT eligibility; never store static final price in page layout, change gold-based D/R/C/VAT or create incorrect refund/payout entries. Block publication of misleading fixed price copy if unbound to a verified quote.

## 8. Mandatory acceptance journeys / automated QA

| ID | User journey | Expected verified output |
| --- | --- | --- |
| V01 | Didar admin creates homepage draft with HERO_VIDEO + EDITORIAL_MOSAIC + FEATURED_PRODUCT_GRID | Persists to PostgreSQL and reloads correctly after restart; old public page unaffected before publish |
| V02 | Admin selects desktop/mobile media for slider or video | Correct variants, posters, overlay, ordering, controls and mobile layout |
| V03 | Admin builds 1-large+2-small Mosaic without a slider | Real asymmetrical image arrangement on desktop and intentional stacking on mobile; each tile optional CTA works |
| V04 | Admin previews, reviews and publishes Version 1, edits Version 2 | Visitors see only current approved version; scheduled rollout/rollback valid, no mixed versions or broken SEO |
| V05 | Changes CTA from approved collection to withdrawn/private target | Publication validation blocks unsafe link or omits target safely, audit captures decision |
| V06 | Customer opens Didar home, clicks featured Product, checks cart | Correct canonical PDP, real Merchant-authorized Offer quote and available UID, no duplicated product/price |
| V07 | Merchant A edits its own store/campaign page | B's products/CRM/Offer cannot appear; A cannot edit Didar or B pages; scoped purchase stays in A |
| V08 | Didar global campaign includes only participating public Merchants | UNLISTED/INVITE_ONLY Offers and media excluded; valid first-party attribution retained |
| V09 | Mobile accessible media | No layout jump, media poster on slow connection, pause/mute/reduced-motion, keyboard RTL slider buttons, screenreader alt/captions |
| V10 | Repeat additive migrations, full Phase 1–9 regression and production builds | Existing UID/EPC, quotes, signed orders, gold/IRR journals, CRM and referral/reward data unchanged |

Run clean and populated migrations twice; API authorization/injection/cross-tenant tests, unit rendering, browser Chromium desktop + 390px mobile, media decode/transform validation, real SSR/OG and purchase journeys, visual regression for major breakpoints, production builds, source preservation and manual Mac smoke with actual video/photography. Record actual counts, screenshots/videos, performance metrics, code SHA and unresolved UAT. No passwords or sensitive data in screenshots.

## 9. Phase 10 completion gate and explicit non-goals

**DONE & TESTED** only after: PostgreSQL-backed editor + typed validated APIs, live published responsive DIDAR home, functional Hero video and slider, Mosaic, split story, collection and genuine product sections, mobile preview, safe versions/approval/publish/rollback, sensible performance/accessibility, global/merchant permission isolation, full commerce/finance regression and documented operator workflow all work together.

**NOT PART of automatic completion:** physical photo/video capture, licensing/creating final campaign imagery, brand trademark approvals, real-domain deployment, live media CDN/service provider, Mac native/manual QA, production tax/payment signoff, physical printer/phone checks, custom retailer domains, AI-generated jewelry image substitution or automatic external social publishing. They require independent content/operations approval.

**Execution order:** Must run **after Phases 0–9** of `docs/ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md` unless owner explicitly reprioritizes. The previous Phase 9 Mac UAT remains its baseline; rerun and extend integrated **final UAT after Phase 10** to cover Visual CMS and premium B2C home. Do not mark MASTER Issue #7 fully delivered until Phase 10 and prior scope pass all required gates.

**Codex copy/paste:**
> Implement Phase 10 exactly as defined in `docs/PHASE10_LUXURY_VISUAL_CMS.md` after verifying earlier phases. Preserve Didar commerce, CRM and existing media pipeline; do not clone other brands. Use deep navy/white and restrained champagne/gold design tokens, actual admin-managed Hero Video, Media Slider, asymmetric Mosaic, Split Story, Collection Spotlight and live Product Grid; versioned PostgreSQL pages, tenant-aware public routes, scheduled publication and rollback. Complete database → backend → API → Persian visual admin editor → B2C frontend → desktop/mobile/browser/performance/security/regression tests, update Mac UAT and merge reviewed code into main, reporting exact evidence.