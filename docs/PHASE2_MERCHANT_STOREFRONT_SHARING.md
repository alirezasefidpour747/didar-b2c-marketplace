# Phase 2 merchant storefront, luxury foundation and sharing

Baseline: `3bfb982fca143ea1695df059c952b45119fefbf7`. Extends the existing official Mercur/Medusa + Next app. Issues #4/#5/#6 remain the product/taxonomy/UID/pricing sources.

## Phase 2A

`storefront-schema.sql` adds storefront configuration, stable handle, version/approval, three visibility modes, scoped members and expiring customer invites. Original suppliers without storefront configuration retain public discovery. A configured draft/private storefront never accidentally becomes public. Store configuration creation and edits serialize by merchant, including competing first-save requests; revisions reject stale edits. Suppliers manage their approved own store; a visibility-policy change needs DIDAR review. Admin grants limited STOREFRONT/SHARE/ONBOARDING capabilities to existing identities; these grants never change global auth roles or unlock finance. Original supplier permissions still govern product and Offer creation.

`/m/{handle}` routes shared catalog/PDP/auth/cart/checkout/order components within one merchant. The central user identity remains unchanged. An HttpOnly SameSite=Lax cookie holds an opaque, hashed-at-rest, expiring server context. The Next proxy ignores client context-token headers and forwards only its cookie. A non-authoritative expected-handle header catches stale/multiple-tab context switches, with fail-closed responses. Context mutations enforce same-origin request Host. INVITE_ONLY checks a currently authenticated customer's live grant each time; an ordinary link never grants private access.

Global discovery and merchant reads restrict eligible Offer joins, product visibility, collection ownership/counts, quote, checkout, product resolver and images on the server. A public shared Product Master can still exist while an individual merchant's Offer is hidden. Old public masters with no active supplier remain visible for backwards compatibility; exclusively private merchants' masters are hidden globally. Permanent UID links remain global, never a private-merchant bypass. No fallback to a competing offer.

Order origin and store presentation are nullable on old orders and immutable for accepted new orders. Original Gold-First price/profile/quote keys, item reservations, contracts, payment provider and balanced journal logic remain authoritative. Supplier/price lock order is preserved. Isolated carts are convenience state only; server quote and reservation always revalidate ownership, quantity and access.

## Phase 2B

Central navy `#142D50`, white `#FFFFFF`, gold `#C5A46A`, champagne `#EEE6D9` tokens and shared responsive surfaces support the existing homepage, catalog/cards, PDP, merchant shell, forms and footer. The real homepage uses eligible catalog media when present and an original DIDAR typographic fallback otherwise. No copied brand media, proprietary fonts or fabricated commercial product pictures. Shared components are reusable by the later Phase 4 CMS; this phase does not claim a visual Page Builder.

Mobile menu has explicit expanded state, keyboard focus and Escape close. Reduced motion, touch target minimums, visible focus, Persian RTL and mixed-direction identifiers/prices are preserved. Browser screenshots are actual production-built pages at 1440 and 390 pixels.

## Phase 2C

`share-schema.sql` adds one extensible share-page domain with stable IDs/slugs, CURATED or PRODUCT kind, ordered references to existing masters, versions and publish/pause. CURATED publication requires 10–20 eligible own products; PRODUCT requires exactly one. Drafts may retain references when original stock changes. Live pages dynamically omit ineligible/out-of-stock sources without cloning a Product, Offer, UID or ledger.

`/manage/sharing` is a connected Persian selection/reorder/edit/publish UI. `/m/{handle}/c/{slug}` preserves store context. Individual PDP links also stay scoped. Copy, OS-native Share, WhatsApp, Telegram and SMS composition only open local/user-controlled sharing; no messages are sent automatically and no messaging API is called.

Visits are recorded by an explicit first-party browser call after page entry, not by metadata scrapers. The server validates context, merchant, publication and an opaque seven-day visit identifier; the proxy keeps the identifier HttpOnly. No IP, device fingerprint, address book or customer contact is collected. Repeat views with the same current page token do not inflate visit rows. Limits apply per server context. Counts are recorded visits, not a claim of unique humans or bot-proof analytics. The most recent valid, unexpired published share-page token attributes a subsequent sandbox order only when its merchant matches the order origin; query/body supplied page IDs and sale amounts cannot set attribution. Accepted order/page/visit links cannot be changed. Cross-device attribution and advanced fraud/campaign logic remain later work.

Merchant metrics are own-page recorded visits, paid attributable order counts and gross paid IRR, explicitly distinct from DIDAR income and rewards. They read persisted authoritative orders and exclude non-paid states. No affiliate reward, payout, new accounting ledger or marketing consent is implied.

## APIs and screens

- Existing `/didar/catalog`, `/quote`, `/checkout`, `/orders`, `/payment`, `/product-link`, `/image` gain access-aware checks while retaining their contracts.
- `/didar/storefront`: public authorized metadata/entry; authenticated own configuration, admin approval/membership, own invite grants/revocations.
- `/didar/sharing`: authorized page read/visit; own/admin list/edit/publish and metrics.
- Persian `/manage/storefront`, `/manage/sharing`; merchant `/m/{handle}` plus scoped products/categories/collections/discovery/login/account/wallet/cart/checkout/orders.

## Verification

Actual release commands/counts, screenshots, changed files and final SHA are recorded in the release evidence after the integrated suite passes. Owner-operated Mac testing is deferred until all feature phases; it is not a development gate. Physical devices, commercial media and live providers are not claimed from Linux testing.

Final reviewed run: **143 backend tests, 1,771 assertions, 1 native HTTP test, 20 production Playwright tests; zero failures/skips**. All four production builds and official code generation passed. The final source/output/platform receipt matches. Evidence: [results](../verification/merchant-phase2/RESULTS.md), [actual changed files](../verification/merchant-phase2/CHANGED_FILES.txt), [screenshots](../verification/merchant-phase2/screenshots). Historical clone preservation: [Compose copy](../verification/merchant-phase2/clone-compose.txt), [native copy](../verification/merchant-phase2/clone-native.txt). Both migrations were replayed twice, with unchanged original product/offer/order/line/collection fingerprints; old orders retain null origin/attribution. No production database migration or owner-volume reset was performed.

**DONE & TESTED:** 2A/2B/2C software and automated technical acceptance. **PENDING:** subsequent roadmap phases, commercial content and external post-feature acceptance. **BLOCKED:** no Phase 2 software blocker. This is not a claim that the full v3 roadmap, Visual CMS, CRM, affiliate, referral or Growth Center is implemented.
