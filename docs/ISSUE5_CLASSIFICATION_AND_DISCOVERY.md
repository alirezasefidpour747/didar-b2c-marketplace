# Issue #5 — governed classification and discovery

Implementation extends `a75adcaf4058233cae0678bf77df78803cb67bad`. Issue #4 remains the structural taxonomy, canonical PDP, permanent UID resolver and Code128/QR/print implementation. No parallel taxonomy, collection store, stock model or accounting model is introduced. The incoming owner documentation commit `37f05d3f6bfc50eaf71ae2d023559322c1736fcc` for separate Issue #6 merchant pricing profiles is preserved. Issue #5 reuses the current authoritative offer price engine and does not claim that those future profiles are implemented.

## Database and migration

`bun run db:setup` applies `packages/api/src/didar/facets-schema.sql` and the idempotent `seedFacetVocabulary` after the existing taxonomy migration. Existing setup instructions and backup requirements still apply. No reset is needed. Production demo creation remains disabled. Only the vocabulary and reusable discovery-page definitions are seeded: **12 dimensions / 113 values**, supplied Persian and English labels, no product classifications, offers or jewelry inferred from archival lists. Existing inactive values and reviewed translations survive seed replay.

New tables: `didar_facet`, `didar_facet_value`, `didar_catalog_translation`, `didar_product_facet_assignment`, `didar_classification_event`, `didar_discovery_page`. F01–F10 target products, F11 targets existing collections, F12 is DIDAR merchandising. `didar_effective_classification` enforces approval, active/visible parent and value, Persian label approval and optional time windows. Applications additionally restrict the product to public, active, published, approved taxonomy. Codes are immutable, retirement preserves history. Approval transactions lock the master product; the database rejects multiple approved F02 tiers even during concurrent requests. Classification audit events cannot be changed/deleted.

Existing `didar_collection` and `didar_collection_product` retain identities and memberships. Collections gain immutable code, F11 type, optional supplier owner, approval/publication/active flags, description, evidence, artwork, timestamps, order and version. Pre-migration collections remain public under a recorded legacy exception until explicitly governed. New collections default to draft; publishing requires a valid active F11 type; limited-edition collections also require documented evidence. Public memberships omit hidden masters. Artwork is exposed only when its source product is public.

No changes are made to exact item IDs/UIDs, RFID pairing, offers, order/payment snapshots, supplier contracts, wallets, treasury, balanced journals, Tahesab, taxes or checkout calculations. Weight and price filtering use the existing offer/GoldFirst quote calculation rather than creating facet attributes for those facts.

## Authorization and review

Suppliers require the independent `SUGGEST_OWN_CLASSIFICATION` grant, default denied. Ownership is checked against existing own offers/intake, even for a public shared master. Proposals stay pending and never affect public results/counts. Suppliers cannot approve, create vocabulary, write collections, or assign F12. Revocation is synchronized with writes by the existing supplier permission lock. DIDAR reviews each proposed value with an explanation; evidence is required for heritage, luxury/high jewelry and limited-edition claims. F02 tier replacement requires explicit retirement of the old approval. Optimistic versions reject stale reviews/updates. Internal evidence, supplier proposals and audit identities are absent from public classification.

F12 uses the same governed assignment history with start/end timestamps. `best_seller` requires documented evidence and at least five units on paid orders for that master at approval time. This is a manual, reviewed badge, **not real-time popularity analytics**. Use `editors_pick` for editorial selections without sales evidence. Expired or retired assignments disappear from PDP descriptors, filters and counts.

Only administrators maintain controlled values, dimension visibility/order and translation revisions. Labels are plain text, length bounded and script checked on approval. New label drafts do not replace a published label. Approval retires the prior revision atomically and retains both in history. Spec-supplied fa/en labels have an explicit source reference. Arabic/French remain **pending owner review**, as instructed; they are not invented or automatically approved.

## API

- `GET /didar/classification` — authenticated admin/supplier vocabulary and own eligible product picker; admin receives draft/review history and curated-page definitions.
- `GET /didar/classification?product_id=...` — private approved/pending classification for an authorized master. Supplier scope does not permit inspecting competitors' private suggestions.
- `POST /didar/manage`, `kind=classification` — `suggest`, `assign`, `review`, `retire`, with `product_id`, `value_id` (e.g. `usage.everyday`), `version` for an existing assignment, reason/evidence and optional ISO times. Only DIDAR can assign/review/retire; suppliers can suggest F01–F10.
- `kind=vocabulary` — `value_create`, `value_update`, `facet_update`, `translation_draft`, `translation_review`; active/visible/order/version or revision identity, label and review reason as appropriate.
- Existing `kind=collection` — existing fields plus `type_code`, `owner_supplier_id`, `active`, `published`, `approved`, `description`, `evidence`, `image_id`, `sort_order`, `version` on updates. Existing product-membership editing is retained.
- `kind=curated_page` — administrator-only slug/name/kind, strict controlled filter `query`, visibility/order, times, version and reason. Fixed page filters are intersected with shopper filters; shoppers cannot escape a curated page's criteria.
- `GET /didar/catalog?page=1&limit=12&usage=everyday,formal&design_style=minimalist` — public server discovery. OR inside a dimension, AND across dimensions. F01–F12 codes are supported; F11 resolves through public collection memberships. Additional keys: `q`, `category` (ID subtree), `category_slug`, `collection_slug`, `discovery_slug`, `purity`, `weight_min`, `weight_max`, `weight_exact` (mg), `price_min`, `price_max` (rial), `in_stock=true`, `sort=title|price_asc|price_desc|weight_asc|weight_desc`, `locale`.

Queries use parameterized SQL `EXISTS` for classification/category/collection filtering and one repeatable-read snapshot. Matching eligible offers are priced on the server using current policy before sorting/counting/paging; all weight/price constraints must match the same offer. Stale quotes do not satisfy a price bound. Offer sorting uses the lowest available matching offer price/weight per product and product ID as the stable tie breaker. Returned products are distinct masters, not offers or tags. `page` is 1–10000, `limit` 1–48, numeric bounds are safe integers, search is at most 150 characters, and unknown filters/codes are rejected. No UID/financial-account tables participate in public filter counts.

Response adds `total`, `total_pages`, `page`, `limit`, approved `facets` with value counts, `pages`, public product `classification`, and `landing`. Counts are **distinct products in the complete currently matching set**, before pagination, including every selected filter (`count_semantics=distinct_matching_products`); they are not disjunctive forecast counts. Empty/out-of-range pages return an empty list with the correct total. Filtering/pricing work scales with the matching candidate set; a future large-catalog optimization can precompute quote indexes without changing the acceptance semantics.

The no-query catalog response remains compatible with the shared existing PDP/cart bootstrap. All browse screens request the paginated server path; they no longer independently filter an already loaded product list. The Next proxy forwards bounded query strings and rejects duplicate query keys. `locale` chooses vocabulary labels only; missing approved labels are omitted, never replaced with raw codes. `storefront_locales` is always `['fa']`. There are no newly implemented English, Arabic or French storefront routes/content.

## Persian screens and discovery

`/manage` adds **طبقه‌بندی و پیشنهادها** for the controlled editor, own supplier proposals and DIDAR review. Existing product editors also open a classification panel. F02 uses a single value selector; every value has a visible review status. F12 is a separate admin-only group. The vocabulary section provides lifecycle/order controls, four-locale draft entry and owner review. Existing collection creation/edit forms expose F11, ownership, visibility, artwork and memberships. Curated page controls persist to PostgreSQL through the same management API.

`/products`, `/categories/[slug]`, `/collections/[slug]` and `/discover/[slug]` share the server-driven catalog, Persian filters, current result counts, safe pagination, quote/weight sorting and links to the same canonical PDP. Lifestyle, occasion, heritage and editorial entry views contain no copied masters. Reusable empty discovery views show an honest empty state. Requests debounce and cancel stale responses. Mobile remains RTL; mixed identifiers are isolated where used as codes. PDP descriptors contain only effective approved labels.

## Verification and external acceptance

Run `bun run local:test` for a fresh disposable PostgreSQL/Redis instance, migration/seed, native API + admin/vendor + storefront production builds, backend regressions, native HTTP check and browser suite. It uses no owner database credentials/configuration or persistent volume. Final reviewed run on 2026-10-16: **122 backend tests passed, 0 failed, 1,519 assertions; 1 native Medusa HTTP test passed; all 17 Playwright browser journeys passed**. Production API, admin, supplier and Next.js builds passed. The source/artifact/platform build receipt matched afterward; `git diff --check` passed. The new browser journeys cover persisted product facets/F11 and mobile PDP discovery, supplier proposal → DIDAR review, and vocabulary drafts/approval/retirement plus F12 and curated-page editing. The existing 14 browser regressions cover commerce, UID/printing, financial and accounting operations. Migration replay also passed on both read-only-source historical snapshot copies, with unchanged original-field fingerprints.

Status: **DONE** — Issue #5 code, migration, APIs, Persian screens, discovery, regression verification and handoff. **PENDING** — external owner/physical acceptance below. **BLOCKED** — no Issue #5 implementation blocker; the pre-existing live Tahesab vendor mapping remains outside this issue and requires its private authoritative specification.

The migration preservation evidence is in `docs/audits/b2c-taxonomy-reconciliation.md`. The existing Mac runbook remains applicable. Additional Mac checks: set F01/F02/F03/F05 on a real unpublished bracelet, review an evidenced heritage tag, add an approved F11 collection, publish with the existing valid structural leaf, browse everyday/Nowruz/collection views, intake an exact UID with RFID optional, and verify its existing printed QR after renaming/reclassification. Recheck ordinary checkout and supplier review/revocation on the Mac.

External statuses: `AR_FR_VOCABULARY_OWNER_REVIEW_PENDING`, `MAC_UAT_PENDING`, `MAC_PRINT_SCAN_UAT_PENDING`, and real RFID hardware validation pending. Production database deployment/owner data classification and physical printer/camera acceptance cannot be claimed from Linux disposable QA. Live financial transactions remain prohibited; Tahesab stays mock/dry-run.

## Changed-file map

| Area | Files |
| --- | --- |
| Database and canonical seed | `packages/api/src/didar/facets-schema.sql`, `facet-vocabulary.json`, `facet-seed.ts`; `packages/api/src/scripts/didar-seed.ts` |
| Domain and API | `packages/api/src/didar/facets.ts`, `discovery.ts`, `catalog.ts`, `permissions.ts`, `service.ts`; `packages/api/src/api/didar/classification/route.ts` |
| Persian management | `apps/storefront/src/components/didar/classification.tsx`, `manage.tsx`, `operations.tsx`, `locale.ts` |
| Public discovery | `apps/storefront/src/components/didar/catalog.tsx`, `store.tsx`; `apps/storefront/src/app/discover/[slug]/page.tsx`, `api/didar/[action]/route.ts`, `globals.css` |
| Verification wiring and tests | `tests/facets.test.ts`, `tests/browser/facets.spec.ts`, `tests/upgraded-commerce.test.ts`, `scripts/local/test.mjs`, `package.json` |
| Documentation | This guide, `README.md`, `docs/audits/b2c-taxonomy-reconciliation.md`, `docs/MAC_UAT_CHECKLIST.md` |

Issue #4 taxonomy/UID resolver/barcode/QR/printing implementations and Phase 2 financial implementations are reused; their source files are not replaced.
