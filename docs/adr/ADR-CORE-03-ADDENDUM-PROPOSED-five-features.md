# CORE-03 proposed addendum — asset-backed wallet, business acquisition/resale and offline benefits

Date: 2026-10-18
Status: PROPOSED ARCHITECTURE; not approved implementation or economic/accounting policy.
Extends existing CORE-03/ADR-BIZ-02 and the Phase 5–9 design. Does not supersede historical facts or authorize rollout.
Full source-grounded assessment and Q01–Q25 register: ../audits/FIVE_FEATURES_ARCHITECTURE_AND_SEQUENCE_FA.md.

## Business requirement

The owner's brief content v0.2 requires:
F1 incremental gold purchase, full-cost wallet purchasing power, physical acquisition and gold buyback;
F2 online-sales-only merchant settlement, producer principal+making always GOLD;
F3 Individual and prefunded Business producer purchases with three commercial profiles;
F4 actual retailer ownership acquisition followed by automatic resale listing, two custody/delivery paths;
F5 consented nearby shops and verified offline voucher purchase, with ALL three incentive types.

This is broader than PR #20 zero-fee curation. Actual retailer resale is a new economic/inventory design; no silent relaxation of existing guards.

## Existing implementation

At c82f196 / unmerged PR #20: one exact-UID registry and reservation; source supplier/Offer permanent; current gold/IRR ledger and local sandbox wallets; withdrawals disabled; manual single IRR/g750 rate; supplier contract/recognition/procurement and on-behalf invoices; limited curation with B principal and A curator. Native Seller/team/Product/Offer/panels are integration foundations.
The brief file name says v0.1 but its content says v0.2; exact source digest is recorded in the assessment.

## Decisions proposed for approval

### A. Quantity basis
Keep existing fine-gold integer micrograms as computational authority; physical weight/assay retained. Equivalent grams of owner-approved base fineness are a projection/contract field.
Do not transform all historical quantities if the displayed base changes. Rate-side/base/version conversion must be explicit; current rate is per g750.
Owner's 705 vs 750 ambiguity remains unresolved. No constant/migration may silently choose it.

### B. Wallet and obligations
Extend the existing financial event/journal and wallet party model, not another gold bank/ledger.
Use proven party+context for personal and business assets; shares in the same login never merge balances.
Collection, actual backing execution, title/allocation, wallet credit, withdrawal and settlement are separate facts.
PAYABLE_TO_WALLET is a reclassification of the same debt. Producer gold liability survives backing failure.
Costs beyond metal must be funded within the approved wallet arrangement; choose approved gold/IRR composition and directional conversion before implementation.
Withdrawals and external execution remain separately controlled; pending/unknown cannot be displayed as available/confirmed.
Promotion-restricted wallet credit has provenance/payer/restriction and existing-ledger postings; no second wallet or automatic cash-out.

### C. Current selling entitlement vs source intake
Preserve UID, original source supplier, physical weight/assay and old transactions.
Compare a minimal title/custody history + current exclusive selling allocation linked to the native/new retail Offer against supported native stock/location links.
New retail Offer may legitimately differ from upstream Offer; the exact physical unit is not duplicated.
Rework guards only after proving one current sellable claim and proper historical B2B sold reservation continuity. Do not erase old sold reservations or reinsert the same item with a new UID.
Title, custody and right to sell change through explicit events, not a text owner_descriptor edit.

### D. Business context and publication
One application core, original Admin/Vendor/customer workspaces; no unapproved second B2B platform.
Business gets only approved producer offers with GOLD prefunding; no consumer checkout/credit bypass.
After final funded acquisition, proven title/allocation and approved retail profile, create/publish automatically without a new manual click.
DIDAR-held and shop-delivery paths are required. Publication is not proof of onsite presence or immediate ship readiness.
The exact right to accept a new customer payment while the item is in transit requires an explicit delivery promise/policy.
Price of new retail sale is not copied from the upstream acquisition price.

### E. Offline benefits
Reuse P5 consent/relationship, P6 CMS/campaign/Promotion adapter, P8 benefit lifecycle and the existing ledger; add a separate offline purchase confirmation/redemption source, not a fake online order.
Provide all three sandbox vertical paths: immediate discount/merchant reimbursement, wallet credit, future online credit/discount.
Scan alone is not verified purchase. Proposed proof is merchant amount/invoice reference + explicit customer confirmation; approval pending.
Reserve sponsor budget before promised instant discount; confirm/reconcile purchase before final reimbursement/credit. No automatic deduction from seller's online-sale balance.
Gold reward backing and wallet restriction, rule basis/cap/stacking, eligibility/refund remain explicit decisions. No assumed 1%/2% or live issuance.

## Alternatives, rationale and trade-offs

| Alternative | Delivery/maintenance/upgrade impact | Integrity/risk | Recommendation |
| --- | --- | --- | --- |
| New B2B app, gold wallet and parallel stock | Large duplicate surface, migrations and auth/upgrade burden | Competing identities, quantities and liabilities | Reject absent superior explicit evidence |
| Use native payout/inventory counts as-is for all gold/physical ownership | Superficially short delivery, later extensive repair | Monetary payout is not gold discharge; SKU count is not title/assay | Reject unproved equivalence |
| Retain only curation, call it resale | Low implementation effort | Contradicts F4, no actual ownership transition | Reject as fulfilling this brief |
| Extend current financial/UID authority with native links/workflows/panels and scoped title/sale allocation | Incremental delivery; review new lifecycle only; installed docs/types preserve upgrade seams | Requires real atomic reservation/transfer/refund proof | Preferred bounded design |
| Full WMS/POS/map provider rollout immediately | Larger infrastructure/cost/operations scope | Does not itself prove showroom stock/consent | Defer; use minimal custody/location contract after review |
| Coupon-only offline MVP | Smaller scope | Fails D09 all-three-incentive requirement | Reject as full F5 delivery |

Native module availability and version-specific equivalence must be documented before adding tables/services. A link/module is not merely a new table for every conceptual label.

## Risks and dependencies

Current item triggers prohibit supplier/Offer changes and permanent active sold reservations; actual resale cannot be a superficial API patch.
Financial lock ordering, async external execution, owned/consigned assets, issuer/principal, rate-side conversion and refunded/redeemed benefits require independent failure testing.
Read model changes may affect private catalog/count/media/QR and native generic routes; preserve #15/#20 guards and positive behavior.
Shipment/shop presence and opt-in public location broaden previous single-logical-stock assumptions, but do not mandate a full WMS.
Current fa-only CMS is not multilingual acceptance; preserve the project locale requirement during additions.
Exact legal/tax/provider/POS/hardware acceptance remains external; no assumed approval.

## Migration and proof gate

1. Freeze accepted source/ADR/state and preserve old records, IDs, amounts and role snapshots.
2. Approve gold base/quote composition, title-transfer contract, buyer context, resale pricing and offline proof policies before their dependent implementation.
3. Isolated prototypes compare native/current extensions: same UID acquired then sold once by new owner, wallet+stock lock races, partial delivery/return and reprocessing.
4. Demonstrate every quantity/money allocation and compensation, backing failure, unknown provider outcome, duplicate callbacks and safe replay.
5. All three offline incentive paths must produce actual sandbox ledger/entitlement records, confirmed redemption/budget and refund behavior.
6. Independently verify native Admin/Vendor/customer HTTP+browser, fresh/non-demo/populated migrations, replay/restart/restore, original fingerprints and continued CMS/privacy.
7. Chief Architect acceptance and phase-specific implementation release; rollout/live bank/gold/provider remains separate.

## Decision status

This addendum proposes the technical direction and identifies business blockers; it does not claim they are resolved.
Owner D02–D09 must be preserved without repeated questioning; D01's numeric ambiguity remains.
Issue #18 continues unchanged. This analysis does not authorize F1–F5 execution, force a moving main deployment, or start CRM.
