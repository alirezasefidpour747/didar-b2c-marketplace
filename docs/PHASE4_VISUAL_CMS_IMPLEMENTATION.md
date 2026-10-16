# Phase 4: PostgreSQL luxury Visual CMS

Extends verified Phase 3 main `95836630ce29cef3a23a251a6f0991116cae8f76`. This is the same Didar app, authenticated `/manage`, Product Master, Offer, merchant profile quote, UID stock, cart and accounting system. No parallel storefront, product, inventory, sharing or ledger domain was introduced. The owner-approved v3 roadmap continues with CRM Lite and Phases 6–9 after this engineering gate; Mac acceptance is separate after all features.

## Connected pages and editor

`/manage/pages` supplies the Persian typed page builder; `/manage/pages/preview/{version}` is authenticated and noindex. Central administrators or explicitly granted Content Ops can compose the global homepage. Existing merchant owners can compose their own home, category/collection landing pages and existing curated/single-product share URLs. Scoped staff have separate `CONTENT_EDIT` and `CONTENT_PUBLISH` capabilities, rechecked against current persisted membership. They cannot publish Didar's home, inspect another merchant's private drafts or gain finance/customer permissions. Central content capability is not a global role promotion.

Eleven allowlisted block types are implemented from PostgreSQL through API to the same public/preview renderer: video hero, image/video slider, asymmetric mosaic (large plus two, staggered portraits, unequal columns), split story, full-bleed media, existing collection spotlight, live product grid/carousel, controlled category/facet discovery, brand story and bounded spacer/divider. Content is plain text; no arbitrary HTML, scripts, CSS or third-party media URLs are accepted. White/navy/champagne themes reuse Didar's navy `#142D50`, white, soft gold `#C5A46A` and champagne `#EEE6D9` foundation.

Editors can start from centrally approved structural presets, select an authorized page, add/edit/delete/duplicate blocks, drag or use accessible up/down controls, order slides/images, select desktop/mobile media, set alternative text/caption, proportional contain or deliberate art crop/focal point, and add governed internal CTAs. Media upload, real processing receipts and review are connected to the existing protected asset pipeline. Explicit select names support keyboard and assistive technology. An earlier version remains available for preview and rollback; editing creates another immutable version. Structural presets remove media/product/collection IDs and private CTAs before approval; approved presets cannot silently change.

Publishing needs an approved version, approved real media with alt text, permitted currently published Product/Offer and collection references, correct merchant ownership and a published approved target storefront/share. Empty structural templates are drafts, not fake published media. Product and collection blocks reference existing IDs and render the same ProductCard/OfferCard with current catalog/profile prices and stock; the CMS never stores a copied price or inventory snapshot. Private preview fetches an authorized scoped catalog after releasing supplier locks, preserving pricing lock order, and disables purchase actions. Actual checkout still revalidates the original Offer and reserves exact existing UIDs.

## Versions, publication and authorization

`content-schema.sql` adds scoped stable page routes, immutable version blocks **and title**, reviewed presets, relational asset references, publication intervals and append-only actor events. A draft title cannot change the current public title or metadata. Draft saves require the current page revision; competing writes serialize on the page and one stale edit fails. Publication locks the parent page, rejects overlapping intervals, validates the reviewed version and records an intent key/reason. Retry preserves the same publication; mismatched intent content fails. Immediate/future publication, pause and rollback retain prior versions and historical intervals. Requested schedules cannot backdate; future changes cancel superseded future slots rather than run a separate scheduler. Reads use PostgreSQL time, so scheduled cutover survives process restarts.

Public readers see only the currently effective approved publication. Home/category/collection metadata uses a read-only published-content lookup; no quote/store context is minted from an OG request. Merchant metadata uses the existing fresh public/unlisted storefront preview check and appends a read-only image preview handle. Unlisted pages remain noindex; anonymous invite-only metadata, pages and assets are denied. Store cookie/session/invite revocation and eligible Offer/media rules remain authoritative. No customer, cost, UID/EPC, original upload, processing receipt, actor or private draft is included in public CMS payloads.

Merchant curated presentation wraps Phase 2C's exact existing `/m/{handle}/c/{slug}` page and tracking flow; the original share page/visit/order attribution IDs remain. Reserved `DIDAR_CAMPAIGN`/`MERCHANT_CAMPAIGN` kinds are an adapter for Phase 6; their publication is deliberately unavailable until the actual campaign governance attaches. They are not claimed as a campaign engine in Phase 4.

## Images and bounded video

Editorial assets extend the Phase 3 `didar_media_asset` and `didar_media_variant` tables rather than adding a separate media service. Product-resource requirements remain for Product photos; editorial assets have an explicit purpose and owner. Photos use the existing real Sharp decoder, EXIF orientation, sRGB normalization, metadata stripping and proportional card/medium/zoom WebP variants. Existing product/image IDs and bytes remain intact. Editorial assets are private even after approval until a currently published eligible page references them. Withdrawal removes public access while retaining immutable evidence. Asset lists/processing are owner-scoped with a bounded quota and upload-intent digest replay protection.

MP4/WebM input is limited to 20 MiB, 45 seconds, one video stream and bounded decoded dimensions/pixels. FFprobe inspects actual streams; FFmpeg normalizes to browser H.264/yuv420p, muted, metadata stripped, at most 1920×1080 landscape or 1080×1920 portrait and 24 fps. CPU jobs, duration, output bytes/bitrate, timeouts, temp files and metadata output are bounded. Arguments use no shell, remote protocols and MOV external data references are disabled, and temp files are removed. A real decoded poster goes through the same WebP derivative pipeline; immutable video bytes and validation receipt stay in PostgreSQL.

`GET/HEAD /didar/media-file?id=...` checks current authorization before exposing byte length/data and supports a bounded single byte range. Originals never receive public URLs. Below-fold media is deferred; video is muted/inline with explicit pause/play. Reduced-motion/data-saving uses the poster. Public images use responsive WebP srcset/sizes and fixed aspect-ratio containers. Merchant/private previews use authenticated bounded blob fetches where video/img tags cannot carry a Bearer session. They do not put tokens into URLs. Public global video supports streaming ranges; private blob playback may download the bounded clip in full.

### Runtime dependency

The API host needs **FFmpeg and FFprobe with libx264**. On macOS, install `brew install ffmpeg` alongside Node 24/Bun 1.4.3 before local setup/testing. Optional `FFMPEG_PATH`/`FFPROBE_PATH` select trusted executables. Local prerequisites check the tools/encoder and fail with an actionable message. Both API Dockerfiles install FFmpeg from Debian repositories. Prepared-image packaging still reuses installed JS dependencies but now requires OS repository access for FFmpeg; it is not a completely offline image build. No Oracle deployment or live provider is required or performed.

## API

- `GET /didar/pages`: authorized scopes, pages and approved structural presets.
- `GET /didar/pages?page_id=...`: own authorized immutable versions, publication history and audit.
- `GET /didar/pages?options=1&supplier_id=...`: authorized existing eligible catalog choices, fresh profile pricing and controlled facets.
- `GET /didar/pages?kind=...&route_key=...`: current public publication under the validated merchant context; optional public `handle` lookup is read-only and cannot bypass invite-only access.
- `POST /didar/pages`: `draft`, authenticated `preview`, `review`, `publish`, `pause`, `rollback`, central `preset` and administrator `operator` governance.
- `GET/POST /didar/content-media`: owner library, bounded `upload` and authorized `review`/withdrawal.
- Existing `/didar/image` serves protected poster/WebP variants. `/didar/media-file` serves normalized protected video, never uploaded originals.

The existing Next proxy preserves context cookies, same-origin write checks, protected headers, upload limits/timeouts and media range status. The generic commerce body limit remains unchanged.

## Verification and remaining acceptance

Actual final command, counts, migration audits, responsive screenshots, short software recording and lab performance samples are recorded in `verification/merchant-phase4/RESULTS.md`. Synthetic geometric images/video are first-party QA fixtures, not commercial jewelry photography or copied brand material. Automated browser use measures lab LCP/layout shift and observed interaction durations; it is not a field INP score, business KPI or physical phone/Mac claim.

No original database was reset. Additive migrations are replayed on clean/populated QA and isolated clones of both stopped historical volumes, with original sources read-only. Product/Offer/image bytes, collection membership, inventory/UID, paid order lines and financial snapshots are preserved. Current scope is sandbox payments/mock Tahesab only. Commercial media/content, owner Mac/physical device review, live provider credentials/specification and legal/accounting approval remain external acceptance tasks, not reasons to block the next software phase.
