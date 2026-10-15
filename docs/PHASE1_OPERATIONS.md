# Phase 1 operations and implementation

Scope: [authoritative specification](PHASE1_UID_RFID_INTAKE.md) and the Gold-First/governance completion addendum. Phase 2 finance is excluded. This is the existing Mercur 2.3.7 application, not a replacement starter.

## Operator journey

1. Log in as a Didar administrator. `/manage` retains master products, categories/subcategories, images, collections, approval/publication, supplier accounts and shared offers. Product attributes are a JSON object. Creating a supplier can also provision its login with an explicitly entered email and initial password (minimum 12 characters); passwords are hashed and excluded from audit details. Self-registration remains pending until admin approval.
2. Open **پذیرش، UID و RFID و مجوزها** → `/manage/operations`. Create a supplier invoice with receipt time, operator, reference purity, notes and optional Tahesab document reference. Tahesab is metadata only; no external accounting request occurs.
3. Add grouped lines with invoiced quantity, total integer milligrams, product/purity, percent or fixed gold-equivalent making terms. A draft may temporarily have no product. Optional line details/image references can be stored in its JSON details. Product/purity cannot be changed beneath existing non-void units.
4. Weigh and enter **each physical piece separately**. Type a permanent UID or leave it blank for secure random generation. Never divide aggregate weight to invent pieces. Draft weights can be corrected; voiding retains the UID permanently. The displayed reconciliation updates after each saved measurement.
5. Optionally pair an EPC by keyboard, paste or an HID reader that sends text and Enter. Hexadecimal EPCs are normalized (case, whitespace, separators and `EPC:`/`0x` prefixes); the full raw input and actor/reason remain in audit/binding history. Active EPCs and active item bindings are globally unique. Replacement/unpair is audited and preserves UID. Sold/reserved items cannot be retagged.
6. Verify the batch as admin. Every line must have exactly the invoiced piece count and measured weight sum. Default tolerance is zero. A versioned, explicitly approved tolerance (maximum 1,000 mg per line) plus an administrator's reason can accept a weight discrepancy; quantity discrepancies cannot be waived. All lines require a matching shared product/purity and compatible weight bounds before verification/posting. Verified source data is immutable.
7. Post verified stock. Items become AVAILABLE and are grouped into compatible exact-weight supplier offers. Sellable quantity is derived from AVAILABLE items, maintained transactionally by a database trigger. Product publication/approval and supplier eligibility independently gate customer visibility and checkout.
8. Approved suppliers can see their own invoices, units, UIDs, EPCs, exact weights, offers, reservations, sales, returns and fulfillment. `/manage/operations` is read-only by default. An administrator grants/revokes each of the eight documented permissions independently. Final verification, posting and master-product publication remain admin-only.
9. Customer PDP/cart/checkout use the same Gold-First quote. Checkout locks offers and deterministic physical units, stores an immutable pricing snapshot, and reserves concrete items. Successful sandbox payment sells the same UIDs once. Failure, cancellation or expiry releases the identical items once. Historical aggregate orders stay valid.
10. `/orders/ID` shows actual UID associations and fulfillment. Authorized supplier/admin users progress preparing → dispatched (carrier/tracking required); admin confirms delivered. A customer can request physical return of a sold UID. Admin receives it into quarantine, then explicitly restocks it after inspection. This does not issue a financial refund or settlement. Repeated requests/callbacks cannot manufacture stock; a restocked UID may later have another sale, while its earlier sale history remains intact.
11. An admin starts a count session for all logical stock or one supplier. Expected AVAILABLE/RESERVED items and their EPC/UID/weight are snapshotted. Scan EPCs or UIDs in the focused Enter field. The browser queues rapid reads; distinct physical items count once even when read using both UID and EPC. Reports show duplicates, unknown, unexpected, sold/absent and missing items. Scanning never changes stock. Withdraw/restore operations are separate permission-controlled corrections with reasons/audit.

## Pricing

The gold rate is IRR per gram at 750 purity. All weights persist as integer mg. The agreed base is `physical_weight × purity / 750`. Making (percent of that base or a fixed agreed 750-equivalent weight), distribution and retail are additive components of the **same base**. Rational BigInt arithmetic avoids floating-point money; individual monetary components round upward to an IRR, then the configured total rounding step applies. VAT applies to the administrator-selected components and persists as an actual **IRR** amount.

For 100 g at 750 and making 12%, distribution 3%, retail 7%, VAT 10% on making/distribution/retail:

| Component | Gold-equivalent basis | At 65,000,000 IRR/g |
|---|---:|---:|
| Gold | 100 g | 6,500,000,000 IRR |
| Making | 12 g | 780,000,000 IRR |
| Distribution | 3 g | 195,000,000 IRR |
| Retail | 7 g | 455,000,000 IRR |
| VAT obligation | monetary value equivalent to 2.2 g | 143,000,000 IRR |
| Customer total | value equivalent to 124.2 g | 8,073,000,000 IRR |

Policies are append-only versions. Changing the policy/rate invalidates stale checkout quotes. Order-line breakdowns and order rate/policy snapshots remain immutable in application workflows. Historical rial-first JSON is never recomputed. Legacy fixed-IRR making terms are explicitly labeled for review; they retain the agreed IRR amount instead of inventing a gold-weight charge. Their current customer quotes use the new additive global markups. New physical intake always uses Gold-First making terms; the legacy aggregate API is retained for backward compatibility.

## Data and authorization

`src/didar/phase1-schema.sql` runs additively through `bun run db:setup`; clean and repeat migrations are tested with legacy stock/paid-order fixtures. `stock_mode=legacy` is preserved for previous aggregate offers/order lines. No migration creates physical units. Itemized quantity cannot be directly edited; item-state transitions update its cache. Permanent UIDs cannot be deleted/reassigned, verified source weights cannot be changed, and a partial unique reservation index prevents a physical item being assigned twice.

Business transactions live beside the existing Didar PostgreSQL service, while native master product creation/editing continues through official Mercur/Medusa workflows. Supplier permissions are read from the database for each write; supplier row locks serialize writes with grant/revoke. Tenant scope is enforced on read and write. Admin operational overrides and authenticated access denials are audited. Native Mercur authentication/panels remain separate from the Didar operational portal.

New API routes (same bearer authentication and bounded JSON proxy):

| Route | Operations |
|---|---|
| `/didar/intake` | list/detail, create/header/line, measured item/correction/void, verify/post, tolerance policy |
| `/didar/inventory` | scoped lookup by UID/EPC; separately authorized withdraw/restore |
| `/didar/rfid` | pair/unpair, count snapshot, scan, close/report |
| `/didar/permissions` | scoped grants read; admin grant/revoke |
| `/didar/returns` | scoped returns read, customer request, admin receive/reject/restock |

Existing `/catalog`, `/manage`, `/checkout`, `/payment`, `/orders` and `/fulfillment` integrate the new model. Supplier order responses retain customer-address/total privacy. EPC registry details remain operational; customer orders receive UID associations.

## RFID boundary and test fixtures

`apps/storefront/src/components/didar/rfid-reader.ts` defines the adapter callback contract. Keyboard-wedge readers work by sending text/Enter to the focused input; a future authenticated reader bridge can implement the same boundary. **Mock mode is visibly labeled; physical reader connectivity, RF range, antenna behavior, chip writing/encoding and a real weighing device have not been verified.** Reader failure/unknown input cannot mutate stock.

Automated fixtures deliberately enter synthetic measured values, including 5 pieces totaling 135,000 mg, 2 totaling 127,000 mg, and 12 totaling 117,000 mg. They prove software reconciliation and operational state handling, not actual jewelry measurements or brand authenticity. Their permanent identifiers/history are retained and their QA products/suppliers retired after testing. Each run uses fresh unique identifiers/EPCs.

## Verification commands

With PostgreSQL, Redis and the existing API/storefront running locally:

```sh
bun run test
bun run test:e2e
bun run --cwd packages/api test:integration:http
python -m unittest discover -s deploy/oracle -p 'test_*.py'
```

Stop this checkout's Next dev server before `bun run build:all` to avoid simultaneous writes to `.next`. Docker Compose includes the same migration and four existing services; source and prepared-image build paths are preserved. Never run local demo fixtures against external staging/production. See `DELIVERY.md` for completed run evidence and limitations. No Oracle deployment or production merge is part of this change.
