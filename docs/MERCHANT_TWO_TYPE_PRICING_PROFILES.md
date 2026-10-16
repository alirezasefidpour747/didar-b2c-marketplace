# DIDAR B2C — Two Merchant Types and Versioned Gold-First Pricing Profiles

**Status:** Owner-confirmed commercial calculation rules on 2026-10-16. IMPLEMENTATION REQUIRED; this document does not claim code already supports per-Merchant profiles.
**Precedence:** This document and the updated GitHub Issue #6 supersede the previous incorrect "commission is a percentage of the Merchant's making-charge amount" interpretation. Existing Phase 1/Phase 2 behavior must be preserved unless changed explicitly here.
**Working repository:** `alirezasefidpour747/didar-b2c-marketplace`; reuse existing `didar_supplier`, `didar_offer`, `didar_pricing_policy`, checkout snapshots, finance ledger and Persian RTL management interface. No replacement application, no wholesale B2B platform.

## 1. Non-negotiable mathematical basis

ALL percentage components in BOTH models are **additive percentages of the same base value of the gold content at the configured 750-equivalent rate**. They are **NOT percentages of the supplier's making charge** and are **NOT compounded on one another**.

Define:
- `G_750 = exact_item_weight_g * purity / 750` (equivalent grams at purity 750; use authoritative integer mg / BigInt rational arithmetic, no floats).
- `R = verified current IRR per gram 750`.
- `B = G_750 * R` (gold base monetary value).
- `m` = supplier making percentage as declared in the offer; an agreed fixed gold-equivalent making basis may continue to be supported. Do not confuse `m` with the Didar margins.
- `t = 10%` example owner-confirmed pricing configuration on combined making/fees **only**. Tax is an actual monetary **IRR** component, subject to later legal validation; do not levy VAT on bare gold principal in the confirmed example.

Percent bases and all rounded IRR components must use the existing `Gold-First` precise price engine. Approved fee-profile versions may set different commercial percentages later, but changing a profile only affects future uncommitted quotes and orders.

## 2. Merchant Type 1 — MANUFACTURER / تولیدکننده

A manufacturer supplies a manufacturing making charge `m`. Didar then adds:
- `d` = Didar distribution/wholesale margin, **3% of B** under the currently agreed example.
- `r` = Didar end-retail margin, **7% of B** under the currently agreed example.
- Tax: `10% × (manufacturer making IRR + Didar distribution IRR + Didar retail IRR)`.

Therefore `CustomerTotal = B + B*m + B*d + B*r + VAT` (plus **separately approved** explicit charges if ever enabled). Do not apply Merchant Type 2 credit-operations percentage to Manufacturer. The original checked example, 100g at purity 750, `m=12%`, `d=3%`, `r=7%`, `t=10%`, gives **22%** total making/margins, **2.2%** VAT-equivalent, **124.2%** of B customer total = **124.2g-equivalent**. With `R=65,000,000 IRR/g`, `Total=8,073,000,000 IRR`.

## 3. Merchant Type 2 — RETAILER / خرده‌فروش

A retailer sets a **complete own retail making charge** `m` on its Offer. Didar does **not** add the Manufacturer Type's additional 7% retail margin.

Didar adds:
- `d = 3%` of **B** for Didar's distribution/wholesale component.
- `c = 2.5%` of **B** for Didar's credit-sales operation component (as named by the owner).
- Thus Didar's two additions total **5.5% of B**.
- Tax is `10% × (retailer's complete making IRR + d*B + c*B)`.

Therefore `CustomerTotal = B + B*m + B*3% + B*2.5% + VAT`.

**The owner expressly confirmed** that the percentages 12%, 3%, and 2.5% all independently apply to the **gold base**, not to one another and not to the retailer's 12% making amount. For the illustrative retailer `m=12%`, the pre-tax total making/additions are **17.5% of B** and the tax adds **1.75% of B**, so customer total is **119.25% of B** = **119.25g-equivalent** at 750. At `R=65,000,000 IRR/g` with 100g/750, the expected total is **7,751,250,000 IRR**. The `12%` is an example of retailer-set making, NOT a universal fixed retailer making rate.

**Credit operations naming:** The owner described the 2.5% component as "عملیات فروش اعتباری" while also saying it is part of the standard 5.5% Type 2 addition. Implement the agreed Type 2 arithmetic and name it accurately; do **not** independently invent automatic payment-method eligibility switches or additional credit fees. A conditional credit-only application policy requires separate explicit owner confirmation.

## 4. Profile management

Profiles are admin-governed, named, reusable, versioned calculation configurations tied to a Merchant commercial type.

- `didar_supplier.commercial_type`: `MANUFACTURER` or `RETAILER` for classified merchants, with existing records safely retained as `LEGACY_UNCLASSIFIED` pending admin assignment. Supplier authentication, ownership and visibility rules remain separate from this classification.
- `merchant_pricing_profile`: stable ID/code, human title and `merchant_type`, active/retired state; multiple profiles of each type allowed.
- `merchant_pricing_profile_version`: immutable approved version with independent components, exact calculation bases all explicitly `GOLD_BASE_750_IRR` (or explicit safe fixed-gold existing making semantics), tax configuration and audit fields.
- `merchant_profile_assignment`: Merchant to profile version with effective_from/effective_to and approver. Admin may change assignment; no overlaps or ambiguous effective resolution. Profiles reusable across different Merchants. Retiring doesn't delete order references.
- Supplier product Offer determines **its own making charge**; an assigned profile adds the type-specific Didar components. Keep weight/purity/price snapshots, exact UID and multi-supplier Product Core authoritative.
- The current one-global `didar_pricing_policy` remains as **legacy fallback only** for unclassified historical suppliers and old orders until explicitly migrated; do not silently reprice existing products/sessions using a guessed type. For new classified offers, select the effective approved Merchant profile. No type mixing.
- The base gold rate continues to be global and authoritative; the sales price is per eligible supplier Offer, based on that offer's own making plus the supplier's assigned active profile. Avoid global retail-margin override for RETAILER type.
- Approval/version and monetary component inputs must be snapshotted **at quote/checkout**. Invalid stale quotes must fail/requote; changing profile after payment never updates old orders. Avoid double-charging margins due to legacy Offer `margin_bps` or `rate.pricing_policy_id`.

## 5. Cost items vs percentages / boundaries

The previously proposed packaging, delivery, miscellaneous operating costs and commission-on-making schema **must NOT alter the owner-confirmed base formulas or be automatically charged**. They can be modeled as disabled optional, explicit separate line-item services in a later independently approved scope, with payer/recipient attribution and once-per-order shipping rules. They are **not** a reason to complicate or delay these two approved pricing journeys.

VAT is 10% of the combined monetary making/margin components in the confirmed examples, not 10% of metal base and not 10% of unapproved optional fees; legal/tax treatment remains provisional for live launch.

Preserve Phase 2 supplier gold/IRR contractual entitlement, procurement, custody, ledger and Wallet as existing single sources. Changing customer price components must not change supplier's right to its making charge or misclassify Didar additional components as supplier payable. Existing Didar seller-of-record and sandbox payment remain unchanged.

## 6. Required operator and customer UI

In **the existing Persian `/manage`**, add:
1. Merchant type selector MANUFACTURER / RETAILER (with safe unclassified legacy handling).
2. Named profile editor for each type with version history, exact percentages, effective dates and audit.
3. Per-Merchant profile assignment/switch, effective date, active state and preview quote for that Merchant's actual Offer with itemized monetary IRR breakdown.
4. Price component labels correctly distinguish `اجرت تولید` vs `اجرت کامل خرده‌فروش`, `اجرت بنکداری دیدار`, `اجرت خرده‌فروشی دیدار` **only for Manufacturer**, `هزینه عملیات فروش اعتباری دیدار` **only for Retailer**, `مالیات بر اجرت‌ها` and `مبلغ نهایی`.
5. Admin may manage classification and profiles; Merchant can view own commercial summary and authorized offer pricing, but cannot edit shared Didar charges or VAT.
6. PDP, cart, checkout, order summary use one consistent authoritative price and immutable breakdown, even for same Master Product sold by both merchant types.

## 7. Acceptance and test gates

- For identical 100g 750 and illustrative `m=12%`:
  - Type MANUFACTURER, `3%+7%`, `10%` VAT → **124.2g-equivalent / 8,073,000,000 IRR** at 65m IRR/g.
  - Type RETAILER, `3%+2.5%`, `10%` VAT → **119.25g-equivalent / 7,751,250,000 IRR** at 65m IRR/g.
- Test different retailer-set making values, manufacturer making variations, no margin compounding, zero if explicitly allowed, and rounding at fractional weights.
- Test no duplicate retail margin in Type RETAILER, no 2.5% credit-ops component on Type MANUFACTURER; no commission calculated as percentage of making itself.
- Test multiple reusable versions/profiles and effective assignments, supplier isolation/permissions, no overlapping effective assignments, stale quote detection, replay/concurrent purchases.
- Test one master with both merchant types and different offers, item UID reservation/order/return, preserved Rate and immutable pricing snapshots, supplier entitlement/journal unchanged except explicit approved contractual changes. Full existing Phase 1, Financial Core and taxonomy/label regression + browser/production builds.
- Legacy data unchanged and safe classification migration in populated and clean databases.

**Implementation contract:** one integrated PostgreSQL migration → pricing service → catalog/checkout API → actual Persian admin/merchant/customer UI → real regression/browser tests. Publish only verified implementation with exact commit SHA/test results. No Oracle, live finance, live Tahesab or real RFID dependencies. Updating this document is NOT software implementation.
