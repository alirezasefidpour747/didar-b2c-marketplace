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
