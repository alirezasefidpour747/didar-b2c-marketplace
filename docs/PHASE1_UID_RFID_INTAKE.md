# Didar Phase 1 — Itemized Intake, Unique UID and RFID

## Status and precedence
Authoritative **implementation specification**, not a claim of implemented functionality. The current verified software baseline is GitHub main at `6a206bf4ab092261019d12403c3f79027fbde3d7`. This document supersedes conflicting older mission statements that excluded physical UIDs. **It also supersedes earlier plans to build supplier liabilities, gold procurement, accounting or wallet functionality in Phase 1.**

Work incrementally on the existing official Mercur/Medusa application. Preserve its shared product catalog, multi-supplier PDP, existing checkout, sandbox payment, grouped offers and operational dashboards. Do not regenerate the project or silently break historical orders.

## Final phase boundary
### Phase 1: executable commerce and lightweight unit-level intake
- Shared master product, multiple supplier offers, Persian RTL storefront, admin and supplier portals.
- Supplier intake with invoice/batch header, grouped invoice lines, exact-weight individual units, globally unique permanent UID per physical jewelry item.
- Optional unique RFID EPC binding to the UID, scanner-assisted capture and searching/counting.
- One logical stock location. **No multi-warehouse, shelves, bins, automated location tracking, advanced warehouse module or physical GPS-like tracking.**
- Stock acceptance/reconciliation, unit-level reservation, payment finalization, release on failure/expiry, sale, fulfillment and returns. Preserve audit.
- Supplier accounts visible from day one, read-only for all operational mutations by default; Didar administrators create and manage catalog, intake and inventory on behalf of each supplier. Granular, revocable, audited permissions can enable specified supplier actions later.
- Customer-facing price calculation, applicable gold-rate conversion, tax breakdown and sandbox checkout are commerce necessities and must remain operational; pricing evolution must not create supplier payables or settlement/treasury actions.
- Capture the supplier's making charge as agreed gold-equivalent weight or percentage of relevant base weight; persist versioned, immutable commercial information required for later Phase 2 calculations. Keep existing historical rial-value snapshots unchanged.
- Capture external Tahesab invoice reference as optional source metadata, without relying on a live accounting API.

### Phase 2: integrated financial core
Implement **together as one separate mission**: supplier gold/rial obligations, melted-gold purchase requests, actual purchasing, allocation and settlement, treasury, customer/supplier rial/gold wallets, double-entry transaction ledger and general ledger, reconciliation, controlled automated settlement, and batch/nightly Tahesab posting. Do not build these in Phase 1.
The Tahesab accounting system holds supplier/merchant summary vouchers, not buyer-level orders or jewelry-unit data. Full customer details remain in Didar. Phase 1 captures stable supplier, invoice and sale references for later mapping, not live posting.

## Intake UX
An admin opens **Supplier Intake** and creates:
1. Header: `supplier_id`, supplier invoice number, optional Tahesab document reference, receipt timestamp, intake operator, reference purity, optional notes, and draft/verified/posted status.
2. One or more invoice lines: description/product or unlinked draft product, invoiced quantity, invoiced **total weight**, purity, making-charge terms where known, optional images/details.
3. Exactly N **individual item records** per line, each with one immutable UID and an exact measured physical weight. Allow manually entering the UID or secure unique generation; never duplicate or silently reassign.
4. Optional RFID EPC read/paste/scan pairing. Each active EPC belongs to at most one active UID across the entire installation. Normalize consistently; preserve full raw value for audit. Allow secure audited replacement/unpairing of a damaged tag without changing UID.
5. Real-time reconciliation: `item_count === invoice_line.quantity` and `sum(item_weight_mg) === invoice_line.total_weight_mg`. Do not infer per-item weights by dividing line weight by quantity; no fictional weights. Present delta weight and delta quantity clearly.
6. Submit/verify/post only after reconciliation succeeds; any explicit exception requires elevated approval, recorded reason and a defined tolerance policy. No unverified unit becomes sellable.
7. On posting, associate every item with a supplier and shared master product, compatible sellable offer and current owner/custodian descriptors (without launching an advanced warehouse system).

Concrete mandatory example: supplier invoice has **5 Rolex services with combined weight 135 g**. Capture five separately measured pieces, five different UIDs and EPCs, and verify sum precisely 135 g. Another line has **2 services weighing 127 g total**; record both exact weights and verify 127 g. A line of 12 rings weighing 117 g must similarly have 12 measured pieces. All 19 physical pieces must be individually findable and countable. Avoid inventing brand authenticity or product imagery.

## Identifier and RFID behavior
- `uid`: stable globally unique item identifier, searchable and never reused; optional print-friendly representation/QR/barcode.
- `epc`: hardware-transmitted RFID tag code; optional at intake, globally unique while active, bound to precisely one UID. EPC and UID are **not necessarily identical** and no chip write/encoding is implied.
- Admin operator can type or scan an EPC, find the item by UID or EPC, and inspect its details. Provide a focused scan field accepting a keyboard-wedge/HID reader and a documented device-adapter boundary. Do not claim universal direct browser-to-RFID hardware support.
- Scan-count session for the one small physical storeroom: track distinct valid scanned active items, unknown EPC, duplicates, sold/absent, expected-but-not-seen. Repeated scan of one tag counts one piece only. Sessions must not modify stock merely by scanning; variance corrections require separate authorization and audit.
- Prevent selling, returning, retagging or reassigning an item into impossible states; scanner failure never corrupts stock.
- No Tahesab RFID dependency in Phase 1. Its RFID API is a separate downstream accounting integration, not the authoritative Didar UID/EPC registry.

## Data model (additive migrations)
Conceptual entities (adapt names to project):
- `didar_intake_batch`
- `didar_intake_line`
- `didar_inventory_item` with immutable UID, exact integer mg weight, purity, supplier/product/offer linkage, source line, lifecycle status and audit metadata
- `didar_item_rfid_binding` with EPC, active interval, actor, timestamp, reason, and unique partial index on active EPC and active UID
- `didar_item_reservation` linking a specific physical item to order line, expiry and state
- `didar_scan_session` and `didar_scan_observation` (deduplicated per EPC/UID/session)
- `didar_supplier_permission` and supplier-scoped write audit if not already properly implemented

Unicity and referential integrity must be enforced in PostgreSQL, not only by UI checks. Do not delete sold-item history. Keep the current aggregate offer quantity as a **consistent derived/cache view or carefully bridged legacy value**, never a competing stock source. Old unsserialized stock remains separately marked as legacy until manually verified; never invent per-piece weights or UIDs in a migration. Historical orders, snapshots, paid reservations and old stock must remain valid.

## Inventory/sales transaction model
- After verified intake, physical item state starts AVAILABLE.
- Customer storefront still shows one shared PDP and eligible supplier/weight offers. An exact-weight item may be selectable as an offer; expose physical UID only where operationally appropriate.
- At checkout, atomically reserve exact **physical items**, with row locks in deterministic order and optimistic validation, not just subtract a grouped quantity.
- Persist a mapping from each reserved item UID to order line. Payment success marks those exact UIDs SOLD/ALLOCATED, with fulfillment tracking. Failure/timeout releases the same UIDs once. No oversell, no double assignment, no race-based stock anomalies.
- If business UI defers choosing a particular unit until fulfillment, reserve a deterministic eligible item set at checkout so payment cannot oversell. No invisible unreserved placeholder stock.
- Customer and admin order history, supplier sale views and customer tracking must refer consistently to actual item associations.
- Where a supplier is Didar itself, retain its distinct identity and avoid fictitious finance actions.

## Supplier permissions and isolation
Default supplier access: login and read own assigned products, intake receipts/lines/UIDs, own stock/reserved/sold, offers, paid orders, delivery and performance. **No write access by default.**
Admins can grant/revoke granular `REQUEST_PRODUCT_CREATION`, `CREATE_OWN_OFFER`, `EDIT_OWN_OFFER`, `EDIT_OWN_INVENTORY`, `EDIT_OWN_MAKING_CHARGE`, `CREATE_OWN_INTAKE`, `PAIR_OWN_RFID`, `UPDATE_OWN_FULFILLMENT` as explicitly supported. Distinguish entering an intake draft from final verification/posting; posting and master-product publication remain Didar-governed. Check server-side authorization and scope on every action, support immediate revocation, log admin acting on supplier behalf, prohibit reading competitors.

## Phase 1 UIs and minimal workflows
Admin: Supplier Intake list/detail/draft editor, one-by-one weighing, UID generation/entry, RFID pairing, reconciliation/verification/posting, stock finder, RFID scan counting, supplier permissions, compact inventory and orders.
Supplier: own intake summaries, each item UID/weight/EPC/status and sale information, read-only default, conditional controls only if authorized.
Storefront: existing PDP/cart/checkout/payment/tracking, no complex WMS visuals.

## Tests and acceptance gates
- 5 units/135000 mg and 2 units/127000 mg reconcile; mismatches block ordinary posting.
- A 12-ring/117000 mg line can be split into 12 exact measured items; each UID unique.
- Duplicate UID and active EPC rejected across suppliers, parallel intake and concurrent requests.
- Same scanned EPC cannot be attached to multiple active UIDs; audited tag replacement works.
- Scan-count 5 EPCs once each returns 5; duplicate reads do not increase count; unknown/missing/sold tags flagged.
- Admin-created item immediately visible to its supplier, invisible to other suppliers; unauthorized supplier writes denied.
- Customer purchase reserves an identifiable item; successful sandbox payment marks it sold exactly once.
- Failed, cancelled and expired payment release the identical UID once.
- Concurrent buyers cannot reserve/sell the same UID, including legacy aggregate compatibility.
- Refund/return workflow cannot manufacture duplicate active stock.
- Reconciled batch cannot be silently edited in a way that breaks historic sales.
- Existing pricing, catalog, images, customer workflows, admin/supplier accounts, 36 unit/integration tests, browser suite and all deployment guards must continue passing, with current evidence regenerated rather than assumed.
- No finance engine, supplier payable, gold procurement, wallet, GL journal, real Tahesab write, automatic gold purchase or real funds movement is introduced.

## Execution instructions for Codex
Work on this branch, auditing the latest main and existing tests first. Implement complete vertical slices **database → backend → API → admin and supplier UI → checkout → tests**. Do not stop at schema or documentation. Apply additive migrations. Keep changes incremental, test, repair and retest. Update `DECISIONS.md`, `REQUIREMENTS_MATRIX.md`, `PROGRESS.md`, `DELIVERY.md` without representing future phases as complete. Commit verified implementation. Do not deploy to production or perform any real accounting/financial operations. If a physical RFID device is unavailable, complete scanner-input/manual pairing and a mock reader for E2E without claiming tested hardware integration.

## Mandatory completion addendum — Gold-First pricing and governance

The user's completion addendum also governs this implementation:
- Administrators retain full shared master creation/editing/approval/publication, category, description, image and attribute management, and can operate offers, intake, measured items, making terms and EPC bindings for any supplier with audit.
- Approved suppliers read all their own operational records, including assigned/unpublished products, invoices, UIDs, weights/EPCs, available/reserved/sold stock, sales and fulfillment. Operational writes default to disabled. The eight permissions listed above are independent and enforced in the backend, support immediate revocation and never authorize master publication or final intake posting.
- Current customer pricing is **Gold-First**. Supplier making is a percent of the agreed gold-weight base or a fixed gold-equivalent weight. Administrator-configured distribution and retail percentages are additive components of that same base, not compounded on making or each other. VAT percentage and taxable component rules are independently configurable, and the actual VAT obligation persists in **IRR**.
- Mandatory hand-check: for 100 g at 750, making 12% = 12 g equivalent, distribution 3% = 3 g, retail 7% = 7 g, VAT 10% on those 22 g-equivalent components = monetary VAT equivalent to 2.2 g; customer price is the monetary value of **124.2 g** at the verified IRR/g rate. Pricing policies are versioned and checkout snapshots remain immutable. Historical rial snapshots are preserved.
- The storefront, cart, checkout, payment and order detail use a consistent quote/snapshot. Admin product/supplier creation, individually weighed/reconciled intake, UID/EPC assignment, supplier visibility, exact-item reservation/payment/sale, fulfillment and remaining-stock counting must all be executable and tested before implementation is merged.
- Finance, obligations, procurement, treasury, wallets, GL, settlement and Tahesab accounting integration remain Phase 2. Physical RFID hardware/encoding and scales must not be represented as verified when only simulated/manual/HID text input has been tested.
