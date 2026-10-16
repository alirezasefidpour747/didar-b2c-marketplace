# Phase 3: assisted onboarding and safe product photos

Extends Phase 2 commit `00447d39ffa64881c35813b5242b95fd356c84bb`. Reuses the existing Mercur/Medusa native-linked Product, `didar_product_request`, taxonomy/facet controls, Supplier, Offer, intake/UID, profile and approval workflows. No second catalog, identity, marketplace or ledger.

## Connected Persian workflow

`/manage/onboarding` is available to approved suppliers, DIDAR administrators and existing identities with an explicit merchant-scoped ONBOARDING membership. Pending suppliers can see their own registration status; they cannot upload or list before DIDAR approval. Central customer identity and existing global roles stay unchanged. Scoped staff memberships appear in their own `/me` response/navigation and are checked fresh for every write/read; revocation immediately blocks API access.

The wizard shows real registration/type/profile/storefront/request/media/accepted-UID state. It reuses the existing Family → Category → Subcategory fields and controlled facet suggestions, links to the existing profile/storefront/intake/share screens, and submits content into existing DIDAR review. A new Product Draft needs approval; “join existing master” reviews an association to the exact original ID and never creates another Product. SKU and proposed making terms are recorded for the warehouse/merchant handoff; they cannot overwrite an existing Offer or create pretend UID stock. Existing authorized intake records actual per-piece weights, making terms, supplier SKU in line details, verification and posting. Availability and quote price come from the accepted original Offer and effective pricing profile.

Requests record actual `created_by`, the authorized assisting actor, reviewer and timestamps. Old request attribution remains null where unknown; it is not fabricated. Uploads separately record actual creator/uploader/assistant/approver. Client-supplied creator/assistant/approval counts are ignored. Append-only `didar_onboarding_event` records successful request, assistance, upload, approval/rejection actions; it is an input for future Phase 7 attribution, not an acquiring-agent/reward engine.

An approved new master proposed from a private merchant remains out of global discovery before its first public eligible Offer. A later approved public Offer may expose the shared Master while the private merchant's Offer/media remains hidden. Replaying older storefront migrations retains this protection. Existing public legacy masters and permanent UID resolution remain preserved.

## Real media processing and review

`POST /didar/media` accepts bounded JPEG/PNG/WebP bytes only, max 8 MiB, max 32 million decoded pixels, max edge 12,000 px, static single-frame imagery. It verifies signatures, declared/decoded format, valid decoding and dimensions. SVG/GIF/disguised/corrupt/oversized inputs are rejected. Per-process processing concurrency is bounded. The proxy/native parser allow a larger bounded body only on this upload endpoint; other commerce endpoints retain their prior limit.

The pinned server-side Sharp pipeline applies EXIF orientation, converts pixels to standard sRGB, strips EXIF/GPS/private metadata, preserves transparency and aspect ratio, and never enlarges, reshapes, crops, recolors or generates jewelry content. A bounded sanitized WebP source is retained privately; the original metadata-bearing upload is not exposed or stored. Proportional WebP card/medium/zoom derivatives use configurable bounds (initial 400/900/1600) and quality (initial 82), with an operator-configurable output-byte budget (hard maximum 768 KiB for legacy storage compatibility). If needed, encoding quality reduces within the safe bound; each receipt records the actual output quality. Explicit receipts report actual accepted/normalized dimensions, original and variant byte sizes, normalization and preview. These are measured values, not estimates.

`didar_media_policy` is versioned optimistically; DIDAR can change bounded dimensions/quality/byte budgets in the connected screen. Existing assets keep their original policy snapshot and bytes. Source/intent/actor/receipt records and variants are immutable; replacing an image uses a new reviewed asset. Upload intent keys prevent duplicate assets on retry and reject reused keys with changed content. Up to ten pending/approved images per merchant/resource are permitted; withdrawing an image preserves private evidence and permits a replacement. Every derivative and source stays in PostgreSQL with the original legacy image blobs/IDs untouched.

Uploaded photos stay private pending DIDAR review and Product approval. Approved assets attach a medium-image reference to the existing `didar_product_image`; the old `/didar/image` route serves approved variants under the same authorization rules. Direct asset IDs, legacy primary-image IDs, card/medium/zoom URLs, catalogs and collection images share access checks. Original image IDs/routes remain valid.

Default media visibility is MERCHANT_ONLY. Shared-master reuse requires the uploader's explicit permission plus a DIDAR reviewer selecting SHARED_MASTER. A shared public Product never automatically exposes another merchant's private upload. Invite-only customer image access requires current authenticated invitation; authorized own operators may preview pending or withdrawn evidence. Rejection/withdrawal, including removal through the existing product editor, removes public access while retaining the audit. No original source/GPS data or other merchant's private asset appears in public JSON or previews.

Cards/PDP use responsive WebP `srcset`, actual derivative widths, lazy loading below the fold and eager main PDP imagery. Private images load authenticated blobs rather than leaking credentials into URLs. Mixed-direction identifiers, Persian errors, touch targets and the Phase 2 navy/white design remain in use.

## Schema and API

`onboarding-schema.sql` is additive/idempotent: request attribution/intent fields, central media policy, assets/variants, optional legacy-image association and immutable onboarding events. Original Products, Offers, UIDs, RFID/EPC, orders, pricing snapshots, payments, finance events and journals are not rewritten.

- `GET /didar/onboarding`: own/admin/assigned-merchant workflow state and governed master/taxonomy choices.
- `POST /didar/onboarding { operation: request }`: new or join request with SKU/proposed making, actual actor and optional idempotency.
- Existing `/didar/manage` product-request review approves the original request and attaches pending media to its one native-linked Master.
- `GET /didar/media`: authorized own receipts/policy.
- `POST /didar/media`: upload, admin review/withdrawal, central policy update.
- Existing `/didar/image?id=...&variant=card|medium|zoom`: protected decoded WebP; no public original source endpoint.

## Verification and external scope

Release results, changed files, production build receipt and actual browser captures are recorded in `verification/merchant-phase3/` after the integrated run passes. Tests include genuine decoded orientation/color/transparency/metadata checks, twenty image operations, uploader/assistant attribution, join without duplication, approval/withdrawal, cross-tenant images, invitation/revocation, quotas, large camera-sized upload through the actual proxy, exact UID intake, profile-specific prices, migration replay and disposable PostgreSQL restart. Read-only historical database clone audits additionally preserve existing image data and all previously audited commerce fingerprints.

The browser camera fixture is synthetic test imagery, not fabricated commercial jewelry photography. Commercial photos/content remain an external content task. No physical camera/phone/printer/RFID or native Mac claim is made from Chromium/Linux; owner Mac acceptance remains outside development after all feature phases. No real payment/Tahesab/Oracle or live reward execution is introduced. Phase 4 CMS and Phases 5–9 remain separate pending work at this checkpoint.

Final reviewed result: **152 backend tests / 1,922 assertions; 1 native HTTP; 21 production Playwright; zero failures/skips.** Four production builds, official route generation and final source/output/platform receipt passed. [Actual changed files](../verification/merchant-phase3/CHANGED_FILES.txt), [results](../verification/merchant-phase3/RESULTS.md), [actual mobile PDP](../verification/merchant-phase3/onboarding-pdp-390.png), [merchant wizard](../verification/merchant-phase3/onboarding-merchant.png), [historical Compose clone](../verification/merchant-phase3/clone-compose.txt), [historical native clone](../verification/merchant-phase3/clone-native.txt).

OG previews resolve an approved public/unlisted storefront and eligible own product/media on the server, without granting a checkout context. Invite-only previews never disclose media anonymously; direct URLs recheck current visibility after a policy change. Approved verified public origin config supplies metadata base; external social-crawler/public HTTPS reachability remains an external acceptance item, not a claim from local Chromium. Customer UID labels are gated by global visibility; warehouse barcode generation and immutable UID identities are untouched. The existing scan test now preserves its explicit reader/format hints, without changing barcode/QR generation.

**DONE & TESTED:** Phase 3 software. **PENDING:** actual commercial content and separate post-feature owner/hardware acceptance; Phases 4–9. **BLOCKED:** no Phase 3 software blocker.
