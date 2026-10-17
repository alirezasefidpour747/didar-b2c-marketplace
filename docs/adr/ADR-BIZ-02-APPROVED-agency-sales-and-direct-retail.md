# ADR-BIZ-02 — APPROVED business policy: agency sales and DIDAR direct sales

Date: 2026-10-17
Status: OWNER-APPROVED BUSINESS INTENT; technical mapping/implementation and statutory treatment NOT accepted by this document.
Scope: clarifies workstream E in PR #15 and supersedes the historical universal "DIDAR is the seller" assumption for future target design.
No rollout, main merge, application/data modification or CRM Phases 5–9 authorization.

## Owner clarification (Persian)

قاعده عمومی پلتفرم فروش نیابتی است. اگر کالا متعلق به خرده‌فروش یا تأمین‌کننده دیگری باشد و او فروشنده معامله باشد، دیدار به نیابت از همان فروشنده فاکتور صادر می‌کند و وجه مشتری را دریافت می‌کند؛ سهم متعلق به دیدار جدا می‌شود و مانده طبق قرارداد به فروشنده پرداخت/تسویه می‌شود. وجه وصول‌شده متعلق به دیگری، درآمد ناخالص فروش دیدار فرض نمی‌شود و بدهی تسویه به فروشنده باید قابل ردیابی باشد. وقتی خود دیدار فروشنده است، فروش مستقیم دیدار داریم. برندسازی ویترین یا ورود/عدم ورود پذیرنده به Vendor تعیین‌کننده این نقش اقتصادی نیست.

The owner's statement sets the product/business model. It is not independent legal/tax validation, an approved statutory journal, or a mandate to silently rewrite historical orders.

## Requirement and previous state

DECISIONS.md historically assumes DIDAR is always the customer-facing seller and collector. The inspected PR #15 authority matrix shows that existing orders/financial obligations use a line supplier and that scoped checkout currently requires storefront.supplier_id == offer.supplier_id. Native Seller, storefront origin, physical supplier and contracting seller are not thereby proven equivalent.

PR #15 is an unmerged bounded corrective change. Its authorization/CMS/runtime findings do not implement this policy.

## Approved decision

| Case | Underlying seller | DIDAR role | Invoice and funds |
| --- | --- | --- | --- |
| Third-party retailer/supplier sale | The actual approved third-party seller for that sale | Agent for sale, invoice issuance and collection | Invoice issued by DIDAR on behalf of that seller; collection and seller settlement obligation traceable; DIDAR's own share separated |
| DIDAR direct retail sale | DIDAR | Seller/principal and collector | Own-sale invoice; own-sale economic treatment; do not create an agency payable for the same sale principal |

Use the actual approved sale/contract facts, not the displayed merchant brand or native Member identity, to select the mode. Physical custody, underlying title, supplier procurement obligations, commercial seller and storefront attribution remain distinct concepts. A procurement payable on a DIDAR direct sale is not ruled out; it must not be confused with an agency collection payable.

The seller may be a retailer or a supplier. No automatic rule equates legal seller with every stock supplier, and no automatic rule makes retailer A a mere affiliate when A is the actual seller. If a separate upstream B supplies A, their title/contract and obligations require a specific mapping; this clarification does not invent a B→A title transfer.

## Alternatives and rationale

1. DIDAR always principal: rejected as the universal target rule; contradicts the owner clarification.
2. Every merchant always an affiliate while DIDAR sells: rejected as the universal rule; a third party can be the actual seller.
3. Per-sale explicit agency/direct roles with one existing transaction and ledger authority: selected business direction. Supports actual seller invoicing/collection and DIDAR's own retail activity without duplicating stock or orders.

This is an economic role policy, not selection of a new commerce engine.

## Technical design obligations — pending reviewed CORE-03

- Inspect the version-matched installed Mercur/Medusa Seller, OrderGroup, order splitting, commission, payment and payout capabilities alongside existing DIDAR code.
- Map separately: invoice issuer acting as agent, underlying seller/principal, collector, physical supplier/title/custodian, storefront origin, customer, actual operator and payee.
- Reuse existing fields where semantics match; do not create a parallel identity or infer equivalence from matching IDs.
- Freeze agency/direct mode, actual seller, mandate/contract revision, attribution and applicable pricing/tax/fee/settlement versions with accepted order facts. Define historical mode explicitly without guessing or rewriting old records.
- Design the existing append-only ledger extension for collection, seller obligation, DIDAR earned share, tax and refunds. Gross collection is not automatically DIDAR sales revenue in agency mode. Exact timing, amounts, debit/credit mappings and recognized revenue remain design/accounting questions.
- Preserve approved gold/IRR/mixed settlement contracts. Agency collection does not mean all payable liabilities become IRR-only, nor authorize double recognition of the existing supplier entitlement and a new seller payable.
- DIDAR's deducted share must come from an approved versioned agreement. Do not invent a commission rate or assume every existing price component belongs to DIDAR.
- Native monetary payout is not automatically equivalent to fine-gold discharge. Evaluate native reuse and extension before selecting adapters.
- Define reversals for failed/expired payments, cancellation, return, refund after partial/full settlement and disputed collection. Preserve original snapshots and journals; do not erase history.
- Require seller-scoped access to invoice/financial/order data, audit actual DIDAR actor and principal seller, and retain managed launch without Vendor login.

## Risks, dependencies and explicit open questions

The core agency-versus-universal-principal decision is resolved by the owner. The following remain technical/commercial detail, not grounds to ask the same binary question again:
- Actual seller for cross-party A/B scenarios and the contractual path if A resells B's stock.
- Invoice identity/presentation, numbering, permissions and mandate evidence; statutory validation separately.
- Settlement waterfall, DIDAR fee entitlement, tax base, refunds/clawback and fine-gold/IRR instruments from approved contracts.
- Mapping native Seller and order/commission objects without duplicate Product/Offer/UID/reservation/order/payment/journal writers.
- Historical compatibility and any additive migration.

Do not enable cross-supplier checkout merely by removing assertOfferScope. The current same-supplier restriction stays until the complete authorized role/contract mapping and disposable proof pass.

## Acceptance proof to design before implementation

Use disposable PostgreSQL/Redis and real native Admin/Vendor/B2C:
1. Retailer-owned sale: retailer is underlying seller; DIDAR issues on its behalf, collects once, records one correct obligation and separate agreed own share.
2. Supplier-owned sale: same agency principle with the actual supplier as seller.
3. DIDAR direct sale: DIDAR is seller; no external agency liability for that same principal; legitimate upstream procurement remains independently traceable.
4. Cross-party A/B scenario: explicit approved seller/title/entitlement mapping, one UID/reservation/payment/order and no duplicate liability.
5. Duplicate callbacks, concurrent reservations, revoked mandate, restart, partial settlement, return and refund after settlement; exact quantities/money and balanced postings.
6. Tenant-safe invoice/financial history, actual operator/principal audit, preserved old fingerprints and no assumed economic reclassification of historical records.

## Next authorized boundary

Prepare CORE-03 technical design and disposable proof specification based on this approved policy; compare reuse choices and submit it for Chief Architect review. Do not independently authorize a fundamental source-of-truth migration or commercial/financial implementation. Product projection durability remains separate workstream D.

Owner's NO-ROLLOUT instruction remains controlling. This documentation PR does not merge PR #15 or close Issues #13/#14.
