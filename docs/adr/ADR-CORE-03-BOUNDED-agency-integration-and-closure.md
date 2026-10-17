# ADR-CORE-03 — Bounded pre-rollout agency/direct-sale integration

Date: 2026-10-17
Status: CHIEF ARCHITECT APPROVED BOUNDED SANDBOX DESIGN for the implementation gates below.
Business authority: owner-approved ADR-BIZ-02 in PR #16.
No fundamental native/DIDAR source-of-truth migration, live accounting, rollout, CRM or automatic PR merge is authorized.
A reviewed plan is not delivered functionality.

## 1. Problem and inspected implementation

Source baseline: PR #15, efbdfcdf8a2ab7f3e397f2d67672328ebcf36254.
Its bounded fixes are acceptable in architectural scope, pending consolidated completion; main is unchanged.

- storefront.ts: storeScope validates a server-backed context; assertOfferScope currently requires offer.supplier_id == storefront.supplier_id.
- merchant-quote.ts: cartQuote scopes Offer, supplier eligibility, price and rate inside one current quote path.
- commerce.ts: payment owns order locking, sandbox confirmation, item finalization and recognizePayment in the existing transaction.
- finance.ts: snapshotTerms freezes a supplier contract; recognizePayment emits idempotent SALE_EXPOSURE per reservation/unit; entitlement derives gold/IRR from the frozen contract.
- finance-ledger.ts: projectEvent already separates cash clearing, supplier liability, VAT, profile charges and agent/principal accounts in a single balanced journal. Its current agent/principal selection depends on ownership == CONSIGNMENT, not an explicit sale mandate.
- finance-schema.sql: immutable contract/review/sale terms/event records; unique event intent; existing supplier_id continues to identify the existing supplier dimension.

Existing capability: substantial gold consignment, supplier liabilities, refunds, procurement, wallets and journals already exist. Reuse these. Do not build another agency ledger/order/payment service or decide legal seller merely from a revenue account name.

Version-matched Mercur 2.3.7 / Medusa 2.21.2 capability assessment is recorded in PR #15 PRE_ROLLOUT_AUTHORITY_MATRIX.md. Implementation must re-check installed bundled docs and concrete extension APIs, including native Seller/order/commission/payout semantics, before edits. No new native commerce writer is selected.

## 2. Selected boundaries and alternatives

| Domain | Selection | Reason |
| --- | --- | --- |
| Admin/Vendor | Existing Mercur SDK extensions, native auth and scoped grants | Mature environment and current recovery; no parallel Next management panel |
| Customer | Existing Next B2C, quote/cart/checkout/account | Retains the tested customer journey |
| Physical source | Existing Product Master/Offer/UID/reservation | Exact weight and title cannot be duplicated into a second stock system |
| Financial source | Existing event + journal + settlement services | Preserves multi-instrument obligations and immutable historical records |
| Party semantics | Explicit versioned sale mandate/role snapshot with existing business IDs | Seller, stock source and storefront branding can differ |
| Native commission/payout | Reuse only where equivalence is demonstrated | Native monetary payout alone cannot discharge a gold obligation |

Rejected shortcuts: infer principal from display brand; equate ownership enum to agency role; remove assertOfferScope without replacement; clone inventory/offers as a fake resale; mirror financial orders into native flows as a second writer; calculate DIDAR income as an unexplained residual for new agency contracts.

## 3. Two sale modes and immutable role facts

AGENCY: the approved third-party seller is principal; DIDAR is invoice-issuing/collection agent. DIDAR retains only contractually assigned consideration. No gross agency merchandise revenue.

DIRECT_DIDAR: DIDAR is the seller/principal. Do not create an external agency liability for the same sale principal. A genuine separate upstream procurement liability may remain.

Commercial type (retailer/manufacturer), physical ownership, custody, store attribution, native Member identity and sale mode are independent dimensions.

Reuse current business IDs and original actor bridge. Do not introduce a second customer or universal economic-party engine.

Minimum conceptual snapshot, using existing fields when equivalent:
- schema/terms version and mode;
- actual principal seller business ID, DIDAR collector and invoice-on-behalf role;
- physical supplier, Offer/Master/UID references and upstream contract where distinct;
- origin store/share and curation agreement where applicable;
- actual operator and approval evidence;
- approved mandate/version and effective dates;
- exact entitlement/payee, pricing/tax/component beneficiary versions;
- settlement instrument/rounding and relevant return/reversal rules.

IDs/rates/roles must be server-derived from approved records, not trusted client fields. Freeze facts at order acceptance and display the material seller/mode before payment. Terms/profile/mandate changes before payment follow the current conflict/requote model rather than silently substituting a different seller.

## 4. Additive data design

Implement a narrow immutable mandate/version and approval/revocation history only where existing contract/review records cannot represent these facts safely. Prefer linking sale terms to existing business and supplier records; document why each new relation is necessary.

Extend or add a versioned sale-role snapshot linked to existing didar_fin_sale_terms / order line. Do not mutate frozen legacy contract snapshots to insert assumed roles. Database uniqueness/checks must prevent conflicting effective authorizations and duplicate mandate snapshots.

Record legacy orders as historical/unclassified for the NEW role schema where evidence is absent. Preserve their existing snapshots, output and postings; no inferred migration of the universal old seller assumption into actual agency/direct facts.

Do not repurpose existing fin_event.supplier_id for a different party. New role-aware projections/reads may join the immutable snapshot while older events retain legacy behavior. If multiple payees are required, use supported allocations linked to the original event; never emit the same full payable twice.

Migration and feature activation: additive/replayable; new role semantics disabled for owner environments pending accepted release. Enable explicitly in disposable QA. No default demo mandates or auto-approvals in non-demo setup.

## 5. Accounting and payment contract

Keep the current verified-payment recognition timing for the bounded sandbox; no new unconditional customer receivable on an unpaid cart. Distinguish payment expectation, verified collection, seller obligation, earned/held DIDAR consideration and actual settlement.

For an agency line, demonstrate a frozen allocation of collected IRR among seller obligation valuation, approved DIDAR share, tax liability and any approved third-party obligations/rounding. Recipient and tax basis come from approved versions. Every residual must be explained by a governed rule; unknown/negative allocation fails closed for NEW mode.

Gold payable quantity and its IRR book valuation represent the same obligation in different instruments, not two amounts independently due. Preserve fine-gold integer precision and contractual GOLD_ONLY/RIAL_ONLY/MIXED treatment. No automatic conversion of all liabilities to rial because customer payment is rial. Existing procurement/valuation differences remain traceable.

Use appendEvent/projectEvent idempotency and existing lock order. One verified capture/finalization and one recognition per economic unit, including duplicate callbacks. Reclassifications such as payable-to-wallet must transfer the same liability, not recognize another one.

DIRECT_DIDAR must preserve correct owned stock/cost behavior without falsely creating third-party agency liability; no fabricated cost history.

Refund/return must reverse the ORIGINAL role/contract allocation. After partial/full settlement, record recoverable/offset balances explicitly. Do not erase journals, change past exchange rates or infer product restock from a financial refund alone.

All entries remain SANDBOX_PROVISIONAL. This design is not statutory tax/revenue certification and enables no live provider.

## 6. Invoice and customer disclosure

Inspect existing native and DIDAR invoice/order-document capability first. Extend it; create a bounded document projection only if absent.

Invoice facts must come from the accepted order snapshot, showing the actual seller and DIDAR's on-behalf capacity for agency mode; own seller identity for direct mode. Preserve unit weights, approved price/tax breakdown and original order linkage. Issuer/operator and underlying seller are distinct.

An invoice correction/credit document is versioned and linked, not an overwritten paid snapshot. Define whether numbering exists and reuse it; if missing, specify concurrency/idempotency safeguards. No government/e-invoice submission or claim of legal compliance.

Customer may see own permitted invoice/order only; seller sees own scope; upstream supplier and storefront curator receive only their authorized view. Do not expose acquisition costs, unrelated seller terms or customer records.

## 7. Cross-party shop/stock gate

Support explicit, revocable curation authority without changing physical stock identity. Two bounded cases:
1. Store and physical Offer party are the same approved third-party seller: AGENCY.
2. Store A presents B stock while B remains the approved actual seller: A is attributed curator only under explicit approved agreement. This is NOT automatically A's resale and creates no invented fee for A.

If retailer A is the actual seller of stock supplied by B, do not default to case 2. Require approved upstream ownership/entitlement/settlement facts and prove the allocation. The general agency decision establishes DIDAR's role, not an invented B-to-A contract. Such configuration remains denied until its required facts and dedicated proof are present.

Replace equality-only scope checks only after approved agreement checks cover catalog/count/media/PDP/quote/checkout/payment and revocation. Private B stock is not globally public merely because A knows its ID. Scope cannot fall back to competitor stock when an item is unavailable.

Two simultaneous A/B-store checkouts for the same UID compete on the SAME reservation; only one wins.

## 8. Product projection durability (workstream D)

DIDAR master remains authoritative. Compare supported native workflow recovery with a durable revisioned one-way outbox, preserving stable native links. Authorize disposable prototypes FIRST; final durable adapter must be justified by version-matched reuse evidence and independent fault testing.

Proof: terminate between native and canonical commits; inject final canonical COMMIT failure and compensation failure; restart, retry and reorder revisions/concurrent edits. Demonstrate deterministic repair, no duplicate/orphan exposure or publication of private/unapproved stock. Logging alone is not durable recovery.

An outbox design must include transactional source revision + job record, idempotent stable-ID projection, monotonic/stale revision handling, bounded retries, observable terminal failure and safe reconciliation. Do not promise atomicity across independent stores; document convergence and safe public behavior.

## 9. Implementation sequence and ownership

G0: Reconcile fresh HEAD, PR #15 and docs-only PR #16; preserve user work and do not merge moving branches automatically.
G1: Independent Core agent confirms native reuse map and field/event migration plan; implementer integrates snapshot and mandate checks in a cohesive review branch.
G2: Implement same-party AGENCY and DIRECT_DIDAR end-to-end, including native Admin finance/approval, own Vendor reads and customer seller/invoice disclosure. Reuse current price/profile rules; no invented production rates.
G3: Add bounded approved curation case only with the authority checks in section 7. Report actual A-reseller/B-supplier contract gaps separately; no fake closure.
G4: Complete D durability proof; implement the selected bounded recovery adapter only after documenting comparison and independent review of the design. Any fundamental source-of-truth switch returns to Chief Architect.
G5: Separate reviewer reruns native HTTP/PG/browser scenarios, populated replay/restart/restore and full regression; CMS visual and protected-media cases must remain green.
G6: Provide consolidated source/PR/receipt and residuals for Chief Architect acceptance. No rollout, Phase 5 or automatic issue closure.

Independent streams may proceed in parallel; writes and migration/financial changes require coordinated ownership. A reviewer must not approve their own implementation. Findings from separate subagents must be actual independent executions where claimed.

## 10. Required acceptance

- Third-party retailer agency and supplier agency each show correct seller/on-behalf invoice, one collection, one exact obligation, and separately agreed DIDAR consideration.
- DIDAR direct sale has own seller and no duplicate external agency principal liability; legitimate procurement history stays separate.
- Paid financial snapshots preserve IRR/gold rounding, actual beneficiary and tax versions, CASH and CREDIT rules; no guessed fees.
- Default non-demo migration creates no approvals, sellers, demo stock or historical postings.
- Revoked/expired mandate and commercial suspension deny new transactions; preserve lawful historical reads and distinguish operator ACL from commercial eligibility.
- Real native Admin managed launch before Vendor login, progressive delegation, Vendor finance/history and customer checkout/invoice all operate on unchanged business/UID IDs.
- Multi-store scopes/counts/media/export/invoice and direct HTTP denials pass.
- Duplicate payment callbacks, racing UID reservation, changed terms, restart, partial settlement, returns and refund after settlement are deterministic and balanced.
- All current backend/native HTTP/browser/build suites; independent D kill/restart proof and historical fingerprint checks pass. Report separate suite totals rather than inventing aggregate counts.
- Runtime release-readiness is isolated only; single replica until distributed event/locking providers are separately verified.

## 11. Risks and limits

Important dependencies: existing append-only triggers and finLock order, gold valuation/discharge, implicit legacy contract version 0, snapshot compatibility and invoice privacy.
Statutory review/live gateways/external Tahesab specification and actual licensed staging media remain separate external acceptance.
Cross-party actual resale cannot be declared done from generic curation or from a successful agency test.
Neither this ADR nor a green PR means the full package is closed. Acceptance is based on implemented scope and explicit residuals.
