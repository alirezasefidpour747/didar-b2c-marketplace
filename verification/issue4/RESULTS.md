# Issue #4 verified software delivery — 2026-10-16

Scope includes the new owner coordination comment: one ranked active **Family → Category → Subcategory** taxonomy shared with Issue #5, one current Persian `/fa` canonical PDP and one permanent `/i/{uid}` resolver. No competing catalog or inventory model.

| Check | Actual result |
| --- | --- |
| Full `bun run local:test` after ranked implementation | **108 passed, 0 failed; 1,274 assertions**, 15 backend/workflow files |
| Native Medusa HTTP test against actual running process | **1 passed** |
| Playwright, compiled production storefront → proxy → API → PostgreSQL | **14 passed**, 46.0 seconds |
| Codegen + admin/vendor TypeScript/Vite + Medusa + Next production builds | Passed |
| Build reuse source/output/platform receipt | Matched after final run |
| `git diff --check` | Passed |
| SVG independent raster/decoder tests | Code 128 exact UIDs (including 80 chars), QR exact absolute permanent resolver URLs passed |
| Additive/repeat migration on current synthetic test history | Existing UID, offer and immutable financial-event rows unchanged |
| Upgrade/repeat migration on both preserved local physical-copy snapshots | Product/publication, offer, historical-order and paid-line fingerprints unchanged; 4 public masters retained per copy |

The full suite retains prior Phase 1/2 pricing, exact-item reservations/concurrency/releases, permanent UID/EPC history and optionality, supplier isolation and granular permissions, returns, sandbox checkout/payment, supplier contracts, procurement, wallets, balanced ledger, mock Tahesab and integrated persistence checks. New cases cover active ranks, invalid depth/cycle/orphan/slug, draft/photos, legacy review exceptions, rejection of new/re-publication without a full path, customer label visibility/origin, single/batch print, unauthorized requests, UID-only HID count deduplication, public redirects and stable QR after slug/reclassification, sold offer availability and financial snapshot preservation. Browser checks cover desktop/mobile RTL, three cascading selectors, print dimensions/CSS, canonical head link/breadcrumbs and QR continuity.

Read-only clone audit and crosswalk: [`docs/audits/b2c-taxonomy-reconciliation.md`](../../docs/audits/b2c-taxonomy-reconciliation.md). The original services remained stopped; no original database/configuration was reset or written. Disposable QA services and clone volumes were removed. These old physical snapshots predate the UID table; current UID preservation evidence comes from the integrated suite, not an invented snapshot count.

Customer QR remains disabled by default until the operator sets a real verified HTTPS public origin. The synthetic QA origin attestation exists only in disposable test-process environments and was never applied to owner configuration. No production domain was verified, customer label deployed or actual financial transaction executed.

**Pending external/manual checks:** `MAC_UAT_PENDING`, `MAC_PRINT_SCAN_UAT_PENDING`, `PRINTER_UAT_PENDING`, `PHONE_CAMERA_UAT_PENDING`, `REAL_RFID_PENDING`. Test the intended stock, printer scale/quiet zones, real HID scanner and native phone camera against the real public origin. No Oracle, new production deployment or live Tahesab/financial action occurred.

**Separate Issue #5 pending:** F01–F12 vocabulary/assignment governance, facet search/counts/pagination, collection governance and additional approved locale vocabulary. The structural model and UID resolver delivered here are the common foundation; this result does not close Issue #5 or claim those wider acceptance flows.
