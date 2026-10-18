# Issue 18 — bounded sale mandate and accounting adapter

Scope: ADR-BIZ-02 / ADR-CORE-03 sandbox implementation on PR #15. This document describes implementation, not independent acceptance or permission to roll out.

## Authority and native reuse

Mercur 2.3.7 bundled `learn/sellers.mdx`, `learn/order-groups.mdx`, `learn/commissions.mdx`, `learn/payouts.mdx` and the installed extension APIs were inspected. Native Seller/Member authentication and SDK Admin/Vendor routes are reused. The generic native order splitting/capture/commission/payout engine does not represent the original exact UID reservations or GOLD_UG/IRR discharge. No native order, payout or commission write is added. DIDAR's existing order/payment/event/journal/settlement remains the only writer.

`didar_fin_event.supplier_id` remains the existing physical supplier dimension. `didar_fin_sale_terms.snapshot` is unchanged, including historical version-0 contracts. New role evidence is linked to that immutable line through `didar_sale_role`; historical orders receive no invented role, principal, mandate, document or posting.

## Activation and immutable evidence

The adapter is disabled unless **all** of `DIDAR_AGENCY_MODE=sandbox`, `DIDAR_ENVIRONMENT=local`, and `DIDAR_PAYMENT_MODE=sandbox` are explicit. No migration creates mandates or demo data. A supplier with zero mandate records keeps the existing unclassified behavior. Creating the first mandate explicitly opts that supplier into mandatory checks: the latest version alone governs; pending, denied, revoked, expired, future-effective or mismatched latest records fail closed. It never falls back to a prior approved version or legacy behavior. Disabling the feature after opt-in also denies new transactions.

Additive/replayable `agency-schema.sql` adds:

- `didar_sale_mandate`: supplier/version uniqueness; original approved financial contract; AGENCY or DIRECT_DIDAR; effective/expiry; approved component allocation and conversion-rounding bound; explicit beneficiary mapping; requesting actor/reason.
- Separate immutable `didar_sale_mandate_review` and `didar_sale_mandate_revocation` evidence. Reviews cannot be changed from approved to denied, or vice versa. Revocation is append-only and immediate.
- `didar_sale_role`: one record per original financial sale-terms line. Freezes seller display identity, mandate/contract/pricing/tax/profile versions, physical source, origin/share/curation attribution, accepting operator, approval evidence, exact original item/receipt references and accepted numeric allocations.
- `didar_sale_document`: immutable sandbox invoice/credit projection referencing the original order/events. A sequence provides concurrent uniqueness; numbers may have transactional gaps and are **not statutory numbering**. One invoice per order/principal and one credit per refund event prevent duplicate callbacks from producing duplicate documents.

Same-party AGENCY requires a CONSIGNMENT contract and evidence that its exact physical items entered under that ownership. The actual third-party seller and payee is the original supplier ID, whether its approved commercial type is retailer or manufacturer. DIRECT_DIDAR requires DIDAR_OWNED, exact serialized original owned receipt evidence, and sets seller/principal DIDAR without an external agency principal liability. It neither fabricates a cost valuation nor treats an old consignment receipt as an ownership transfer. Undocumented acquisition cost remains absent; existing documented jewelry valuation and COGS behavior remain authoritative. Upstream A-reseller/B-supplier title/entitlement is not inferred or supported.

## API and native surfaces

Original native Admin/Vendor extensions call the existing native adapter, which also enforces native rights and selected business membership.

- `GET agency`: Admin's governed records, available suppliers/contracts; Vendor's own minimal mandate status only, without allocation/reasons/beneficiary economics. `POST agency` is Admin-only: `mandate_request`, `mandate_review`, `mandate_revoke`.
- `mandate_request`: `supplier_id`, `mode`, `contract_id`, `effective_at`, `expires_at`, `rounding_limit_irr` (0–10000), `reason`; `allocation_rule` is the bounded `COMPONENTS_V1`. Optional `beneficiaries` maps existing approved profile rule codes to approved business IDs. Unknown recipient mappings deny the quote/acceptance.
- `GET invoice?order_id=...`: own Customer, canonical Admin, or actual agency seller only. An attributed curator gains no invoice or customer access. Unauthorized IDs return not-found. The document discloses frozen seller, DIDAR issuer/collector/on-behalf role, original exact UIDs/weights, payment method, customer price components/order charges and rate. Internal costs, actor proofs, contracts, beneficiary economics and upstream information are absent. Pending or historical unclassified orders produce no invented invoice.

The original quote key now includes mandate/version/contract and public seller disclosure. New-mode checkout requires those keys. Acceptance freezes numeric per-unit allocations before payment-provider initialization. Payment checks mandate, contract and effective pricing/profile/tax/rate versions; a change conflicts/requires a new accepted quote, never silently substitutes the seller or terms. Paid duplicate callbacks return original paid facts, even after subsequent revocation.

## One recognition and explained allocation

`agencyAllocation` uses original `recognizedProfilePrice` and `entitlement`. It does not become a second price, order, payment or ledger engine. `COMPONENTS_V1` explicitly assigns legacy distribution/retail/service fee/rounding to DIDAR and respects approved profile recipient rules. Existing profile charges from merchant/DIDAR preserve their separate payer and approved beneficiary. In AGENCY, a merchant-paid service charge explicitly names the approved principal seller as payer. A nonzero MERCHANT-paid profile rule in DIRECT_DIDAR is denied at quote/acceptance: no separate upstream fee contract exists to charge the physical supplier, and DIDAR is not silently substituted as payer. Such upstream economics remain outside this bounded design. THIRD_PARTY is never a nameless payable in the new mode: the mandate must map the rule to an approved existing business ID.

The conversion adjustment is **derived**, not an unexplained income residual:

`accepted metal + making price − (ceil(contract gold_ug × original rate / 750000) + contract IRR)`.

Its signed magnitude must fit the approved per-unit rounding bound. Allocation separately records component share, customer profile consideration, price rounding, conversion basis/adjustment, tax/version, seller gold quantity and its IRR book valuation, seller IRR obligation and any approved partner amount. An unknown amount, negative DIDAR share or collection mismatch fails before a new order/payment can succeed. At recognition, the computed allocation must equal the original accepted JSONB allocation.

One existing SALE_EXPOSURE and journal per exact reservation retains the original unique event intent. AGENCY credits one original supplier liability (gold quantity plus its book value, and contractual IRR), approved tax and DIDAR's agreed share; gross agency collection is not principal revenue. DIRECT_DIDAR credits principal revenue and no external agency principal payable. Gold book valuation and fine-gold quantity are two representations of the same obligation, never two monetary amounts independently due. GOLD_ONLY, RIAL_ONLY and MIXED and current CASH/CREDIT/profile rules remain supported.

Payment preserves original order → offer/items → financial-domain locking. A fresh check before provider initialization and a second check under the financial lock after stock finalization serialize revocation against recognition without introducing the reverse offer/financial lock order.

## Reversal and settlement

Existing return receipt requirements, original-event reversal and settlement services are reused. A new-mode refund reverses the original role/allocation postings. Already executed settlement is not erased; resulting positive seller debit claims are explicitly reclassified to `SUPPLIER_REFUND_RECOVERABLE` in their original IRR/GOLD_UG and `SUPPLIER_REFUND_RECOVERABLE_VALUATION` for gold book value. A credit projection links the exact original economic unit/invoice and refund event. Financial refund alone does not restock a UID or execute a bank transfer. Actual collection of a recoverable/offset remains a separately governed operation rather than an invented automatic settlement.

## Verification and residuals

Implementer unit test file: `tests/agency-allocation.test.ts` covers all three contractual instruments, AGENCY/direct distinction, signed conversion bounds, CASH/CREDIT component beneficiaries, rejection of unknown/negative residuals and feature activation. Separate agent-owned HTTP/PostgreSQL/browser acceptance files provide independent integration evidence; release logs/receipts and consolidated handoff carry the exact final totals and SHA. This file alone makes no acceptance claim.

Every new posting/document is SANDBOX_PROVISIONAL. Tax/legal invoice certification, live gateways, external Tahesab, cross-party actual resale/upstream legal contracts and distributed financial locking are not implemented or authorized. No owner-server mutation, rollout, automatic merge or CRM Phases 5–9 is performed.
