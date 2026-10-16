# Category publication and permanent UID labels (Issue #4)

## Operator workflow

The Persian catalog form now separates **دسته** and **زیردسته**. Select an existing parent and leaf subcategory before checking **انتشار در ویترین**. Deeper trees display the full ancestor path. Drafts, attributes and image upload remain available without classification. Supplier product proposals remain governed by admin review; suppliers cannot publish masters or print labels.

Database and API guards reject publication with no category, a root alone, a non-leaf, missing ancestors, cycles or invalid slugs. Category changes cannot invalidate an already published product. First unpublish the affected masters if restructuring would remove their valid classification, then reclassify and publish them. Category/product slugs use lowercase ASCII letters/digits separated by hyphens, up to 100 characters. The product ID is immutable and distinct from its editable slug.

The additive `taxonomy-schema.sql` migration preserves all products, offers, item IDs/UIDs, EPCs, receipts, order/payment snapshots and financial records. An old published master lacking a valid hierarchy becomes a retained draft; its prior publication flag is recorded in `didar_taxonomy_migration_draft`. It is not assigned an invented category. Existing valid classified products remain published. Apply through the usual `bun run db:setup`; take the normal backup before upgrading the owner's persistent database. No reset is required.

## Stable URLs and visibility

Canonical PDP format: `/products/{ancestor-slugs}/{leaf-slug}/{product-slug}/{immutable-product-id}`. The complete hierarchy appears in breadcrumbs and category filters. Multiple supplier offers retain one master/PDP. `/products/{id}` and previous taxonomy/product paths return a 308 redirect to the current canonical path using the ID at the end; no finite alias list is needed.

QR content is always `{verified-public-origin}/i/{permanent-uid}`. The resolver returns a **307, no-store** redirect to the current canonical PDP, so taxonomy/product slug changes never require relabeling. Unknown, draft or void items and inactive/unapproved/unpublished masters return a generic 404. A sold/withdrawn piece may still resolve to the published master. The PDP's real eligible offer quantities determine availability; the scan never promises that particular item can be purchased.

The public resolver/API returns only public master identity, title, canonical path and breadcrumbs. It does not return the UID association, EPC, supplier, invoice, costs, custody, sale or ownership history. The server validates product routes before streaming HTTP headers, preserving actual 308/404 statuses. The broad root loading boundary was removed so it cannot commit a 200 before these checks; existing catalog/detail/admin loading states remain. Invalid URLs and IDs never become redirect destinations. Redirects use relative, server-generated paths; no destination or origin is taken from request Host, query parameters or forwarded-host values.

## Public QR configuration

Customer QR is disabled by default. Configure **server-side API environment** only after checking the real HTTPS public domain, certificate, reachability and `/i/{uid}` routing:

```dotenv
DIDAR_PUBLIC_ORIGIN=https://YOUR-VERIFIED-PUBLIC-DOMAIN
DIDAR_PUBLIC_ORIGIN_VERIFIED=true
```

These are optional deployment settings, not credentials. Do not copy the placeholder or disposable QA origin. No existing configuration is automatically rewritten. The origin must be HTTPS without credentials, port, path, query or fragment. IPs, localhost, local/internal/reserved test/example names and sandbox/staging/preview names are rejected. Explicit verification is an operator attestation, not automated proof of domain control. Keep it false/empty for local Mac development unless a real verified public origin is intentionally configured. A caller cannot supply an origin to the label API. Without valid configuration, warehouse Code 128 labels remain available and the UI explains why customer QR is unavailable.

## Printing and scanning

As admin, open **عملیات → پذیرش تأمین‌کننده → انتخاب پذیرش → بارکد UID و QR دائمی / چاپ برچسب**. Choose warehouse UID-only labels or customer UID+QR, select one/multiple pieces or the entire batch (maximum 100 per request), generate a preview, set label width/height and print. Voided pieces are excluded from batch printing. Customer labels require accepted items and public, fully classified products; warehouse labels can identify drafts without public links.

The locally generated Code 128 encodes the existing exact UID, with readable UID text as fallback. QR encodes only the permanent absolute resolver URL. RFID is optional; no tag encoding or new item identifiers are created. Supplier access to labels is denied, including suppliers with operational-write permissions. Each generation is audited.

Width: 50–420 mm; height: 65–150 mm (customer QR printing requires at least 80 mm). Barcode width reserves quiet zones and at least 0.33 mm per module. Printing is disabled if a long UID will not fit, rather than shrinking the bars. Increase width/use appropriate stock for long UIDs. Print at 100% with zero margins and browser headers/footers off; select the matching printer paper size. Dedicated print CSS emits one piece per page and hides application controls. Preview generation is not evidence of actual printer calibration.

A keyboard-wedge/HID scanner reading Code 128 sends the UID as text plus Enter. Use existing authorized **قطعات و UID** search or the scan-count field. It finds/counts the same physical piece; repeated UID/EPC reads remain deduplicated. Neither label generation nor scanning alters inventory, finance or payment state.

## API contract

- `GET /didar/product-link?id=...` or `?uid=...`: public minimal current PDP mapping, or generic 404. Storefront proxies the same allowed query keys.
- `GET /didar/labels`: admin-only configuration readiness (401 unauthenticated, 403 other roles).
- `POST /didar/labels`: admin-only `{mode: "warehouse"|"customer", item_ids: [one-to-100 unique IDs]}` or `{mode, batch_id}`. Exactly one selector. Response contains UID, public title, barcode SVG data URI, required physical barcode width, and optional resolver URL/QR SVG. Mixed invalid/private/draft customer batches fail as a whole; no partial private label response.
- Existing catalog/manage responses add `slug`, `canonical_path`, `breadcrumbs`. Existing IDs and APIs remain available. Product requests can be approved with an admin-selected valid `category_id` override.

## Verification and remaining physical checks

Automated regressions cover additive/repeat migration, database/API taxonomy rejection, drafts/photos, admin/supplier authorization, multiple offers, hierarchy redirects, permanent QR continuity, customer-origin guards, Code 128/QR decoding, bulk labels, UID lookup/count deduplication, sold inventory, financial snapshot preservation and the Persian browser print workflow. See the final verification entry in `PROGRESS.md` for actual run totals and SHA.

**PRINTER_UAT_PENDING / PHONE_CAMERA_UAT_PENDING:** print on the intended stock/printer, check physical scale and quiet zones, scan Code 128 with the actual HID scanner, and scan QR with iOS/Android camera against the configured public HTTPS origin. Native Mac UAT and real RFID hardware acceptance remain separately pending. No Oracle, real financial transaction or live accounting call is part of Issue #4.
