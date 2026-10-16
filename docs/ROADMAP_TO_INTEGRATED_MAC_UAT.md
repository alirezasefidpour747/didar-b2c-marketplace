# DIDAR — Roadmap to One Integrated MacBook UAT

Status: planning and execution gates, **not a claim of implementation**.
Repository: `alirezasefidpour747/didar-b2c-marketplace`; canonical reviewed code branch: `main`.
Testing/deployment decision: **No Oracle, no cloud staging**. Codex Cloud develops and runs its automated Linux/Docker tests; owner executes one consolidated business UAT on their macOS laptop with a persistent, isolated, synthetic dataset. See `docs/LOCAL_FIRST_MAC_WORKFLOW.md`.
Scope decisions: complete current Phase 1 commerce and lightweight per-item intake; **all supplier finance, purchase requests, melted gold, wallets, GL and Tahesab journal posting are Phase 2**. Do not silently migrate them into Phase 1. Avoid new branches for each discussion; one task branch for substantial code, merge verified increments to main.

## Current baseline (2026-10-16)

Phase 1 implementation is merged to main: Mercur/Medusa/Next storefront, one shared master product/multiple suppliers, product and supplier governance, complete intake line → individually weighed UID → EPC/RFID scan/count, single logical stock location/no shelves or advanced WMS, item-level reservation/checkout and sandbox payment, return/restock, supplier read-only by default and granular permissions, Gold-First additive pricing with IRR VAT. Codex evidence records 52 backend tests/507 assertions and 8 Playwright tests in its local containers. **No physical RFID reader/macOS run/real live gateway or Tahesab write has been verified.** Business accounting/settlement Phase 2 has not been implemented.

## What "ready for one integrated Mac UAT" means

A clean MacBook checkout of the reviewed main SHA can start the whole application and needed test doubles with a small number of safe local commands; a single reproducible test dataset can complete:
Supplier contract → grouped incoming invoice / optional Tahesab document reference → measured units + UID/EPC → reconciliation and stock acceptance → offer/publication → customer order and sandbox IRR payment → seller-scoped gold/rial exposure → purchase request → actual *simulated/manual-booked* gold purchase with purity/price/custody → allocation → **separate** ownership/physical settlement confirmation → partial/mixed settlement → supplier statement and internal double-entry → batch/nightly Tahesab **dry-run/mock** summary → reconciliation, reversals, retries, inventory count and stock return.
No live money, gold acquisition, tax submission, wallet withdrawal, or live external-accounting writes. Financial and tax/legal booking assumptions are flagged for professional approval before live activation.

## Gate 0 — Mac readiness, before the expensive remaining build

Codex implements a local development toolkit and an isolated repeatable UAT dataset workflow, based on `docs/LOCAL_FIRST_MAC_WORKFLOW.md`.
- Small number of commands: setup, start, stop, status, test, optional seed, preserve/back up local data. Detect macOS + Apple Silicon and validate pinned Bun/Node/Docker; diagnose port collisions and missing credentials.
- Fix Playwright's hardcoded Linux Chromium path; browser installer and runner must work on macOS.
- Replace/bypass the Linux-bridge-IP assumption in `scripts/test-compose.mjs` for Docker Desktop; do not publish PostgreSQL or loosen authorization.
- Container and host workflows should not conflict on ports 3000/9000 or overwrite one another's persistent databases. Handle services started by older development scripts cleanly.
- Protect existing `didar_*` rows and previous QA UIDs; migrations only additive, no `down -v` or forced resets, no real data in QA.
- Codex documents exact commands and locally mocks the tests it can. If Codex runs on Linux, clearly report `MAC_UAT_PENDING` until owner runs on the Mac.
Acceptance: local install and restart preserve UIDs; Mac Playwright invocation is portable; full Phase 1 regression remains green. The owner need not perform the final business UAT yet.

## Gate 1 — Phase 2: contractual and accounting-ready business event model

Implement as part of **one cohesive Didar Financial Core architecture**, with sequential vertical slices and tests, not independent incompatible ledgers.
- Supplier/merchant gold/rial accounts and a contract version, including GOLD_ONLY / RIAL_ONLY / MIXED settlement preferences, approval/effective time, due dates; administrative overrides/audit and scoped supplier statements.
- Ownership types: supplier-owned consignment, Didar purchase-for-resale, Didar-owned inventory. Distinguish custody and stock receipt, transfer of title/control, commercial gold exposure, recognized payable, jewelry material stock, melted-gold inventory and settlement.
- Use standardized fine-gold quantity in precise integer units with 750-equivalent display. Capture actual purity, grams, monetary IRR and immutable transaction rate, taxes and contractual terms. Preserve the already implemented Gold-First price engine; do not recalculate historical snapshots.
- On verified customer payment record supplier-specific exposure exactly once. A **consignment intake by itself must not incorrectly book a supplier purchase debt**. Didar-owned inventory must not create a fictional external supplier payable. Map every event to an immutable order line/UID/invoice/supplier identifier.
Acceptance: 100 g/750 with 12% supplier making → **112 g 750-equivalent contractual entitlement** when appropriate, independent of Didar 3%/7% selling margins and tax; full payment/refund replay and contract version/change tests pass.

## Gate 2 — Phase 2: procurement, treasury and manually controlled settlement

- Verified paid order → **idempotent internal gold purchase request** for the gold settlement share. A request is *not* an executed purchase.
- Finance dashboards for outstanding merchant gold/rial, procurement requests, actual purchases, purchase source/document, price, purity, fine gold, acquisition cost, physical custody and gold stock; allocate one purchase over multiple requests without over-allocation.
- Track 'requested', 'approved', 'purchased', 'allocated', 'title transferred', 'delivered/held in custody', 'settled' and 'reversed' as separate facts. Allocation is never automatically gold delivery, ownership transfer or payable discharge.
- Partial, gold/rial mixed settlement and due-date handling. Refund/cancellation/returns must reverse or adjust financial obligations safely. Every action is server-authorized, scoped and auditable.
- No real external trade/bank execution. A human may enter **clearly flagged synthetic/manual-booked** execution evidence into local QA; finance statements never label requested but unexecuted trades as purchased.
Acceptance: item, gold and IRR subtotals reconcile, repeat callbacks do not double-create purchases, events or settlement; overdraft/double allocation rejected.

## Gate 3 — Phase 2: one double-entry Wallet/GL/Treasury core

- Transactional append-only double-entry ledger with balanced IRR journals and separately balanced quantity-ledger movements; related but not interchangeable instruments.
- Supplier and customer wallet accounts for gold and rial (if legally authorized later), reserves and releases, available vs pending vs pledged balances; prevent double spending/concurrent withdrawal; wallet balances are derived, not edited manually.
- Statutory/chart-of-accounts projection of cash/clearing, owner jewelry vs consignment memo assets, melted gold, supplier payable, customer funds, VAT, revenue principal-v-agent per approved contract, COGS, gold valuation differences. Do not double-book both wallets and supplier payable as unrelated liabilities.
- Treasury custody/title tracking, reconciliation, immutable correlation IDs, reversals rather than deletion. Manual-booked QA only; production accounting and tax treatment require professional approval.
Acceptance: zero unbalanced entries, replay idempotency, no negative unauthorized balances, each supplier/customer only sees entitled data, and financial reports derive from one controlled event/journal system.

## Gate 4 — Tahesab *aggregate accounting adapter*, safe to test offline

Tahesab is **downstream accounting for Didar-vs-Merchant aggregate activity**, not a customer/PDP/UID database, not the Wallet book and not the source of per-item inventory.
- Supplier invoice document/reference and aggregated incoming jewelry lines can exist/be entered in Tahesab; Didar holds supplier invoice detail plus physical UID/weight line breakdown. Expose exact invoice and account mappings, account code, document number and accounting cut-off.
- Financial close groups by supplier, date, event type, metal/purity basis and IRR/gold currency. Summarize movements **without netting away** the difference between merchandise received, sale-triggered payable, real gold procurement, physical/title settlement, refunds and IRR bank movement.
- From `api-1.json` OpenAPI contract, build a strictly validated, versioned Tahesab adapter and a **local mock server/dry-run export with sample responses**. If API spec file is not in the repository, obtain a copy supplied by owner; don't hardcode invented endpoints or pretend contract tested.
- Correctly handle Bearer and DBname, positional request arrays with mixed types, Jalali dates, unique Factor_Code >= 20 characters, monetary IRR vs gold weight and purity, transient errors, pending/acknowledged/rejected states, exactly-once business intent, stable IDs, retry/reconciliation and deleted/edited external document detection.
- Import/read of Tahesab aggregate supplier invoices and balances only when the needed external API behavior has been confirmed. No online Tahesab writes or automatic bank operations in UAT; don't expose real accounting credentials.
Acceptance: mock provider verifies submitted summary vouchers and invoice mappings, accounting figures match Didar ledger, repeated nightly close generates no duplicate external postings, isolated buyer information is never sent.

## Gate 5 — Final integrated regression and Mac UAT release gate

- Single local UAT scenario: e.g., merchant invoice **5 units / 135 g, 2 /127 g, 12 /117 g** individually weighed, unique UIDs and EPCs, publication, read-only supplier permissions, inventory scan counting, purchase/sale/refund, gold pricing, obligation creation, request, simulated purchase, allocation, title/physical settlement, wallet/ledger and Tahesab dry-run summaries.
- Include a separate 100 g/750 product with making 12%, distribution 3%, retail 7%, taxable margin VAT 10% (theoretical customer payment equals 124.2 g * rate; 112 g supplier entitlement before agreed split).
- Test mixed settlement contract and earlier/later effective dates; no fake 'settled' statuses. Reconciliation difference conditions, retries, supplier restrictions, concurrent sales, reload/restart and persistence.
- Codex runs unit/integration/migrations, full browser suite, source build, Docker health and security tests; logs actual counts and SHA. Explicitly distinguishes source verification from **Mac UAT pending**.
- After code review, merge verified implementation into main and update an unambiguous `docs/MAC_UAT_CHECKLIST.md` with screens, QA accounts, expected values and instructions in Persian. Avoid screenshots with credentials. User tests manually **once as one end-to-end scenario** on their Mac, returning defects with expected/actual screenshots.

## Decisions that must not be inferred from mock tests

1. Contractual date that recognizes a supplier payable and principal-v-agent book entries, real VAT tax base/rate, legal custody/title and wallet licensing.
2. Actual Tahesab account code/GID mapping, basis fineness, sign conventions, the external API's impact on accounts, record/update or delete semantics; confirm on a separate authorized test database, not live accounts.
3. Hardware RFID scanner adapter, EPC normalization and reader mode; physical chip encoding is outside the software-only mock tests.
4. Real payment, real purchase execution, bank transfers, AML/KYC/identity and general public exposure are excluded pending separate approvals.

## Development policy

Each gate must deliver a completed **database → backend → API → Persian RTL UI → automated tests → documentation** vertical slice. Gates 1–4 use one coherent domain model and correlated event/journal IDs, implemented incrementally. No multi-location WMS, shelves, bins or UID reconstruction of legacy inventory. Preserve data/old order snapshots through additive migrations. No silent destructive changes or forced Git history rewriting. Do not create a branch for each discussion; documentation decisions can be edited in main. Publish code to main only after successful review and tests. For a single integrated owner acceptance, only Gate 5 is the required complete Mac walkthrough; early technical smoke on macOS is advisable to catch platform issues but is not a substitute for it.
