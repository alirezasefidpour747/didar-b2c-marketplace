## 2026-10-16 — Phase 2 Gate 5 and acceptance boundaries

Reconciliation reports always query PostgreSQL; admin cannot submit fabricated pass results. Checkpoint SHA is an operator-supplied review reference, explicitly not source attestation or human acceptance. New QA preparation never publishes products or executes payment/purchase/settlement. Restart verification selects only a uniquely labelled disposable didar_qa container and fingerprints complete rows. Explicit random loopback QA ports stay stable across Docker restart; persistent Gate 0 owner config/volumes are untouched. Reuse a single backend test-admin session rather than weaken production login rate limits. Public output remains code on GitHub main, not a hosted production deployment. Keep MAC_UAT_PENDING, REAL_RFID_PENDING, statutory sign-off and concrete Tahesab BLOCKED_BY_SPEC explicit; do not close Issue #3 or claim complete vendor/physical acceptance.

## 2026-10-16 — Phase 2 Gate 4 offline adapter

The owner's OpenAPI spec is unavailable. Implement Didar's explicitly provider-independent aggregate contract/mocks only; concreteTahesabRequest fails BLOCKED_BY_SPEC. Never infer vendor endpoints/import semantics or publish a private spec. Close source claims are unique per merchant/event even across overlapping periods; payloads retain event types/debit-credit/currency/purity/date and exclude all per-buyer/UID data. Counterparty wallet identities are aggregated. Local synthetic Bearer/DBname/mixed positional mock protocol is not presented as Tahesab compatibility. Nightly close prepares exports without dispatch. Preserve missing/changed external mock documents for reconciliation rather than blindly recreating them.

## 2026-10-16 — Phase 2 Gate 3

Use one event-linked append-only double-entry projection; IRR, fine-gold quantity and custody memo instruments balance separately. Wallets are liability accounts with database-enforced nonnegative balances, never editable caches. Payable-to-wallet reclassifies the same liability. Last gold discharge consumes the exact remaining IRR liability, avoiding partial-rounding residues. New stock acceptance records memo/source facts only; documented owned QA cost is required for COGS and missing history stays explicitly unvalued. No fictional legacy purchases, real withdrawals or statutory approval claims.

## 2026-10-16 — Phase 2 Gate 2

Procurement request is intent, purchase is separate synthetic executed evidence, allocation is a reservation, and title, custody and payable discharge require distinct facts. IRR-only contracts must remain actionable without gold requests. Partial settlement and reversal derive balances from immutable source events. Negative supplier balances after refund of an already-settled sale represent recoverable advances; never silently delete settlement. Cost/source documents remain admin-only. No external trade or bank provider is enabled.

## 2026-10-16 — Phase 2 Gate 1

Continue baseline 0e569d4 with the existing PostgreSQL gold-domain extension. Fine gold uses integer µg; entitlement is independent of sales margins/VAT. Contracts freeze at checkout; verified payment recognizes the sandbox obligation. Default version 0 is GOLD_ONLY consignment. Didar-owned goods create no external payable. Keep legacy IRR making in IRR. Never backfill old orders or erase financial history; retain retired synthetic fixtures. Physical returns and synthetic financial refunds are separate. No real trade/bank execution. See docs/PHASE2_FINANCIAL_CORE.md for rounding and provisional legal assumptions.

# Didar Gold engineering decisions

## 2026-10-15 — Continue the published baseline

Preserve official Mercur 2.3.7 / Medusa starter and existing gold extension. No regeneration, framework fork or version upgrade. Baseline c71e313 is already published; original delivery bundle is retained unchanged.

## One authoritative gold ledger

Didar is the customer-facing seller and payment collector. `didar_*` PostgreSQL tables own all gold offers, quantities, reservations, pricing snapshots, payment attempts and fulfillment. Native Mercur products remain linked master-catalog records; no generic native stock/cart/order/payout records are created by these gold flows. Native panel credentials remain separate. Gold operational interfaces use Didar roles. No supplier commission, payout or split-charge system.

## Additive migrations and simple inventory

Extend the existing schema with idempotent additive migrations, preserving persisted rows. Stock is available quantity per supplier/product/exact integer mg weight. Reservations deduct availability transactionally; releases restore exactly once. Inventory edits set available stock (exclude already reserved pieces), with optimistic versions and audit records. No physical serial UID or warehouse system.

## Sandbox first, explicit external boundaries

Use a persisted sandbox payment attempt and owner-authenticated sandbox confirmation, with idempotent terminal transitions. The Iranian gateway boundary stays disabled without an approved verified provider. Manual gold rate is the initial source, commercial tax/rounding parameters are configurable examples requiring owner/legal approval before money trading. No Oracle deployment, production host changes or paid provisioning without authorized infrastructure.

## Customer experience and catalog assets

Extend the current UI into real routes with shared components. Persian is primary; locale formatting/labels are reusable for later English. Product imagery must be uploaded by an operator and stored durably; absent images show an honest missing-photo placeholder. Do not generate product photographs. Preserve current backend transaction logic and existing meaningful tests while adding operational journeys.

## Phase 1 (2026-10-16): authoritative scope and legacy bridge
`docs/PHASE1_UID_RFID_INTAKE.md` and the mandatory user addendum supersede previous UID exclusions. New intake is serialized, single-location physical stock. Existing offers/orders retain an explicit `legacy` stock mode; migrations never invent unit weights or physical UIDs. Itemized available quantity is a trigger-maintained cache, not a separately editable source.

Current pricing uses additive Gold-First making/distribution/retail components with IRR VAT and immutable policy/check-out snapshots. Historical breakdown JSON stays untouched. Legacy fixed-IRR making charges remain explicitly labeled pending commercial review, rather than being converted into invented gold weights; legacy offers use the same new additive markup policy. New physical intake requires percent or fixed gold-equivalent making terms. No supplier financial obligations, accounting, gold purchasing, wallets or settlements are created.

Supplier operational writes require explicit per-action grants, disabled by default. Database supplier row locks serialize mutations with immediate revocation. Admin operational overrides are audited. RFID supports keyboard-wedge/manual input plus a clearly labeled mock adapter; no verified hardware integration is claimed.
