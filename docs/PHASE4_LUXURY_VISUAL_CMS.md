# DIDAR B2C — Phase 4: Luxury Visual Experience & CMS Page Builder

**Owner-approved roadmap sequence v3 — 2026-10-16**
**Status:** PLANNED; this is a specification, not implementation.
**Placement:** After Phase 2 (Merchant storefront, early navy/white UI, simple share pages) and Phase 3 (merchant onboarding + media upload/WebP), and **BEFORE** lightweight dual CRM, full Campaign Management and affiliate programs.
**Repository:** `alirezasefidpour747/didar-b2c-marketplace`
**Related:** `docs/ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md`; `docs/EXECUTION_STRATEGY_V3_FEATURES_FIRST.md`; previous design specification `docs/PHASE10_LUXURY_VISUAL_CMS.md` for archival design intent.

## 1. Goal and sequencing decision

Create the complete **DIDAR luxury navy/white identity and functioning PostgreSQL-backed Visual CMS** now, rather than waiting until after CRM and the entire growth system. The owner wants all agreed features coded and technically tested BEFORE their separate, final real MacBook/user evaluation. No owner-operated Mac acceptance or external retailer/customer survey is a prerequisite for Codex continuing to the next engineering phase.

The design references provided by the owner are Cartier screen recordings and Paon d'Or; these provide *inspiration* for large media, sophisticated whitespace, asymmetric images, editorial storytelling and minimal navigation — do not copy third-party copyrighted video, photography, brand, source code or proprietary layout.

**Core architecture:** one Didar product/catalog/offer/UID/pricing engine, one existing authenticated app. Extend existing `/manage`, content/media/storage, pages and permissions. Do **not** create an isolated design demo, a parallel commerce frontend, a separate Product Master or different cart/checkout.

## 2. Visual design contract

Design tokens with predominantly:
- **DIDAR Navy** `#142D50`: brand header, typography/accent surfaces, contrasted sections.
- **White** `#FFFFFF`: primary page background and generous negative space.
- **Soft gold** `#C5A46A` and **champagne** `#EEE6D9`: sparing decorative/CTA/editorial accents, not an olive/brown-dominant interface.
- Premium typography, accessible contrast and consistent hierarchy; mobile-first Persian RTL, clear bidi handling for SKU/price, measured responsive breakpoints including 390px and desktop.
- Animated transitions calm and optional; reduced-motion, focus and accessible controls. Video autoplay is muted and plays inline, never with audible autoplay.

**Phase 2B reuse:** preserve and expand the early navy/white component tokens and storefront shell built in Phase 2B; Phase 4 makes those components **admin-composable** and production-like, not a second visual design system.

## 3. Must-have content block types

| Code | Editable capability |
| --- | --- |
| `HERO_VIDEO` | Full-width/near-viewport media, desktop/mobile video poster, title, muted autoplay policy, pause, CTA, overlay and focal placement |
| `HERO_MEDIA_SLIDER` | Ordered image/video slides, distinct portrait/mobile assets, manual navigation, optional controlled auto-advance, pagination and accessibility |
| `EDITORIAL_MOSAIC` | Asymmetric static images as the owner emphasized: one-large-plus-two-small, staggered portrait, unequal column spans; responsive mobile stacking, independent image links |
| `SPLIT_STORY` | Left/right video or image beside text, optional CTA and navy/white/champagne surface |
| `FULL_BLEED_MEDIA` | Entire-width image/video with focal point, optional overlay, heading and fallback |
| `COLLECTION_SPOTLIGHT` | Existing real, approved collection only; never clone product rows |
| `FEATURED_PRODUCT_GRID` | Real currently eligible Products/Offers with prices derived from active Merchant Pricing Profile and stock status |
| `PRODUCT_CAROUSEL` | Accessible horizontal real-product rail, no fake prices or static inventory |
| `CATEGORY_FACET_DISCOVERY` | Existing Family→Category→Subcategory, approved F01–F12 browse definitions |
| `BRAND_STORY` / `SPACER_DIVIDER` | Editorial content and limited safe spacing |

**First working delivery:** build `HERO_VIDEO`, `HERO_MEDIA_SLIDER`, `EDITORIAL_MOSAIC`, `SPLIT_STORY`, `COLLECTION_SPOTLIGHT` and `FEATURED_PRODUCT_GRID` from DB → backend → API → admin UI → live B2C frontend → browser tests, then finish other approved block types in this phase. Do not treat HTML-only previews as a delivered CMS.

## 4. Pages and ownership

Page scopes that exist at this time:
- `DIDAR_HOME`: Didar homepage and its owner-controlled premium layout.
- `MERCHANT_HOME`: shop A homepage under `/m/{handle}`; owned by authorized Merchant, must never show shop B Offers, Customers, CRM, sales/finance info.
- `CATEGORY_LANDING`, `COLLECTION_LANDING`: approved catalog and facet navigation.
- `MERCHANT_CURATED`: upgrade Phase 2C's simple 10–20-product share pages to use approved media block presentation; preserve existing share URL and attribution.

**Future-ready, not blocked on future entities:** add reusable typed `DIDAR_CAMPAIGN` / `MERCHANT_CAMPAIGN` page-kind support or a clean adapter only if it can be done without creating a fake parallel Campaign Engine; **Phase 6** (full Campaign Management) must attach campaigns to this exact Page Builder and existing share URLs rather than rebuild a second renderer. Similarly, Phase 5 CRM and Phase 7/8 referrals integrate with the published page and event IDs but are NOT dependencies that can block Phase 4.

Merchant/private publication modes `PUBLIC_MARKETPLACE`, `UNLISTED_LINK`, `INVITE_ONLY` preserve Phase 2 access rules throughout SSR, APIs, media URLs, OG previews, canonical paths, CTA links, product queries, cart and checkout. Only Didar Content Ops may publish the global Didar homepage.

## 5. Persistent CMS and media contracts

**Extend existing tables/workflows where appropriate**. Conceptual entities:
- `content_page`: page ID, type/owner Merchant scope, locale, stable route key, current published version, lifecycle and audit.
- `content_page_version`: immutable versioned ordered allowlisted blocks JSON validated by schema, author/reviewer, publish state, change timestamp.
- `content_page_asset`: existing secure image/video asset reference, desktop/mobile variants, alt/caption/poster, focal crop and owner permission.
- `content_publication`: effective periods, scheduling, safe atomic publish/unpublish/rollback, idempotency and audit, no broken draft visibility.
- `content_preset`: centrally approved reusable page layouts without unsafe custom HTML/JS/CSS.

Use additive, idempotent PostgreSQL migrations; run on clean AND old populated DB fixtures, do not rewrite historical UIDs/products/orders or change merchant rate/tax rules. Media assets reuse Phase 3 validated WebP derivatives; videos need bounded MIME/pixel/size/duration checks and efficient browser-compatible encoding or defensible tested fallback to approved pre-encoded sources. Never store unlimited base64 video in PostgreSQL or allow arbitrary third-party scripts.

**Product prices, inventory and merchant ownership remain dynamic external truth:** page blocks reference existing product/collection IDs, and invoke existing authorized read/quote code; no static pricing or duplicated inventory snapshots.

## 6. Persian admin Visual Page Builder

In the existing management app, add `/manage/pages` (or equivalent):
1. Choose Didar homepage, authorized Merchant homepage or existing curated landing page.
2. Create a draft from template, add/remove/duplicate/edit/reorder blocks; provide drag and keyboard/up/down reorder alternatives.
3. Upload/select approved media with desktop/mobile poster, alt, captions, focal/crop, link and theme; do not deform jewelry images or alter metal color.
4. Show desktop/mobile previews from the actual rendering components; hide unpublished content behind authenticated and noindex previews.
5. Validate target visibility, pending products, media decoding, unsafe CTAs, overlay contrast and role permissions before publication.
6. Approve, publish immediately or schedule, pause, revise and rollback to an earlier published revision. Log the actor, version and reason; concurrent editors cannot silently overwrite.
7. Merchant can edit only their own permitted scoped pages; no Merchant can publish Didar's global home or see/edit other merchant unpublished campaign/page/media.

**Important:** the owner is the final editor of media/storytelling, not a developer. No freeform universal WYSIWYG page builder is required; a typed block/template builder that works end to end is preferable.

## 7. UI performance / SEO / safety

- Use responsive `picture/srcset/sizes`, WebP variants, exact dimensions and poster images; lazy-load below-fold and defer offscreen video. For video provide muted play/pause, reduced-motion/data-saving fallback, captions when needed. Aim to measure and report LCP, INP and CLS honestly for representative mobile/desktop fixtures.
- Canonical/OG images are determined from public published content, not private data; `UNLISTED_LINK` noindex, `INVITE_ONLY` never leaks private product/merchant assets to anonymous scrapers.
- Preserve Didar one-customer identity, Merchant quote and store context, exact UID/reservation, customer/supplier privacy and append-only finance/ledger contracts.
- No copying external logos, unique third-party footage, images, trademarks or fonts into the repository. Real commercial media acquisition is an external content task, separate from the coded feature.

## 8. Required QA and phase completion

| Acceptance | What must be proven |
| --- | --- |
| P4-01 | Admin composes real DB-backed home with Video Hero + Slider + Mosaic + live Collection/Product, reloads after API/DB restart |
| P4-02 | Draft/preview/private pages do not leak, published version/rollback and scheduling work without old public URL breakage |
| P4-03 | Mosaic asymmetric geometry on desktop and readable intentional stacking on 390px mobile; slide/video controls usable with keyboard and RTL |
| P4-04 | Real public Product quote from the EXISTING profile engine, correct Gold-First price, stock/Offer eligibility and sandbox checkout |
| P4-05 | Merchant A's homepage/curated pages cannot leak B's offers/media/customers; Didar global home excludes unlisted/invite-only offers |
| P4-06 | Phase 2C shared pages retain original stable URLs/attribution; later Phase 6 Campaign Engine can attach without a parallel sharing schema |
| P4-07 | Media processing/variants, safe uploads/permissions, lazy loading, poster fallback, reduced motion and responsive accessibility work |
| P4-08 | Full prior Phase 1/2/3 pricing, UID/EPC, taxonomy, profile, finance and tenant privacy regressions plus official builds pass |

**Engineering gate is mandatory**: Database → Backend → API → Persian RTL Page Builder → B2C/Merchant responsive renderer → automated tests, real Playwright Chromium in Codex environment. Capture browser screenshots/short recordings from the actual built software. No owner-run Mac test or real-client research required before moving to Phase 5.

**Owner acceptance happens AFTER ALL feature phases are implemented**, outside the numbered development roadmap. Previous Mac technical checklist remains separately available as an optional, deferred owner runbook, not a phase or mid-roadmap approval gate. Honest statuses: `CODEX_LINUX_VERIFIED`, `OWNER_MAC_UAT_NOT_RUN`, `LIVE_MEDIA_CONTENT_PENDING`, `LIVE_PROVIDER_PENDING`. Do not claim physical phone or printer tests from Linux.

**Codex execution instruction:** implement Phase 4 with all capabilities above, reuse Phase 2 premium UI and Phase 3 media, preserve tenant isolation and financial/UID systems. Merge verified software into `main`, document actual DB/API/screens and test counts, then proceed to Phase 5 CRM Lite and onward without asking the owner to run Mac tests or interview users.
