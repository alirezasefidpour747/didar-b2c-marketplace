# DIDAR B2C — MERCUR-FIRST PANEL ARCHITECTURE (Owner Correction)

**Date:** 2026-10-17
**Status:** OWNER'S EXPLICIT NON-NEGOTIABLE ARCHITECTURE DIRECTIVE / NOT IMPLEMENTED BY THIS DOCUMENT
**Precedence:** This document supersedes earlier roadmap text or UI tasks wherever they encouraged building an independent replacement admin/vendor panel inside the Next.js storefront. It does not waive existing approved Didar commerce/UID/financial invariants.

## 0. Correct the architectural mistake

DIDAR is a **customized Mercur 2.3.7 marketplace on Medusa v2**, not a from-scratch Next.js dashboard project. The existing monorepo has:
- `packages/api`: Medusa backend enhanced by `@mercurjs/core`, Didar domain services/APIs, Medusa native linked Products, and historical gold/UID/finance ledger.
- `apps/admin`: **the original Mercur Admin Dashboard**. The production backend path is **`/dashboard`** as configured in `packages/api/medusa-config.ts` (not `/seller`).
- `apps/vendor`: **the original Mercur Vendor Dashboard**. The production backend path is **`/seller`** as configured in `packages/api/medusa-config.ts` (not `/dashboard`).
- `apps/storefront`: Next.js **customer B2C storefront and customer account**, including merchant-scoped public shops `/m/{handle}`; this is **not** the canonical Didar operator/merchant back office.

Inspect real code at freshest `main` before claiming anything is completed. Existing `apps/admin/src/main.tsx` and `apps/vendor/src/main.tsx` only bootstrap `@mercurjs/admin`/`@mercurjs/vendor`; there were no substantive Didar `src/routes`, `src/widgets`, `src/custom-fields` or `_navigation.ts` extensions at this directive's authoring. Meanwhile `apps/storefront/src/app/manage/**` and `apps/storefront/src/components/didar/manage.tsx` accumulated much Didar operator UI using customer-store nav. **That architecture must be corrected, not copied into another independent panel.**

## 1. Exactly three user-facing workspace products

### A. Didar Central Admin — Extend `apps/admin`, not a new standalone admin

Use original Mercur Admin authentication, responsive shell, native navigation and admin capability model. Extend with DIDAR-specific pages/widgets/forms/navigation for central dashboard, Merchant network/approvals/roles, Product Master and offers (reuse native linked Mercur Products), taxonomy/F01–F12, media/CMS, gold-first Merchant pricing profiles, exact UID/RFID inventory, physical intake, fulfillment, money/gold ledgers, treasury, compliance/audit, CRM, campaigns, Agent attribution, referrals and growth KPIs. **"Full central control" is subject to explicit owner-role RBAC and audit, not bypass-all unrestricted access to private secrets.**

### B. Merchant / Vendor Workspace — Extend `apps/vendor`, not `/manage` in customer Next.js

Use native Mercur Vendor shell, authenticated Seller/Merchant identity and scoping, sidebar and existing seller lifecycle. Add DIDAR business extensions: registration/onboarding, DIDAR-approved commercial type + effective pricing assignment read-only, own product request/join existing Product Master, own offers and making terms, media/WebP assets, authorized own store setup `/m/{handle}`, selected-share pages, own eligible orders, tenant-limited CRM, merchant campaigns/analytics, own referral rewards and staff permissions. Didar-only centrally approved price/tax/legal settings cannot be edited by Merchants. For each merchant panel API and data query **enforce ownership server-side**; do not grant visibility merely by hiding tabs.

### C. Customer-facing B2C Storefront + Account — Remain in `apps/storefront`

Keep one Didar customer identity, browse/collections/taxonomy/facets, published luxury Page Builder renderer, approved Merchant mini-sites, cart and quotes, checkout, order/invoice/delivery/return history and personal account. The customer app **does not show internal admin/vendor navigation**. Maintain merchant context through signed/validated existing mechanisms. Do not create duplicate seller/admin workspaces in this customer app.

## 2. Use Mercur Dashboard SDK, native models and extensions — not a fork of UI from scratch

Prioritize the version-matched bundled official docs:
- `node_modules/@mercurjs/docs/llms.txt` and `node_modules/@mercurjs/docs/content/**/*.mdx`.
- `apps/admin/src/README.md`, `apps/vendor/src/README.md`.
- `apps/admin/src/extension-targets.d.ts` and `apps/vendor/src/extension-targets.d.ts`.
- `@mercurjs/dashboard-sdk` routes, built-in page widgets, `custom-fields`, `_navigation.ts`, `defineNavigationConfig`, typed zones and approved client APIs.

Create actual extensions under `apps/admin/src/routes`, `apps/admin/src/widgets`, `apps/admin/src/custom-fields`, `apps/admin/src/_navigation.ts`; parallel real extensions under `apps/vendor/src/...`. Start with the *existing Mercur UI* and preserve built-in products, sellers, orders and dashboard conventions. **Do not overlay another unconnected custom shell**, iframe Next.js `/manage`, bypass auth with proxy headers, or create a second customer/seller/merchant identity.

Reuse native Mercur/Medusa modules/workflows where domain-equivalent and supported; map DIDAR extensions to authentic data. The existing Didar-specific physical UIDs, immutable weight/quote/order snapshots and gold/IRR accounting are not equivalent to a generic SKU/cart/order/payout; do **not** migrate them into native flows blindly or allow both representations to become separate competing systems. Before any native integration, perform a concrete entity/workflow/permission mapping with the existing historical schema and tests; use adapters/linked records where the value semantics require them.

## 3. Recovery plan: no restart, no history loss

**Do not reset DB, discard existing migration tables, reimplement Product Master/UID/ledger/pricing/media/CMS, or replace working backend.**

1. **Baseline audit:** verify current code, dashboards' actual built routes, Mercur and Didar auth integration, native Product/Seller links and Didar's order/finance domain. Show screenshots of **actual** `/dashboard`, `/seller`, B2C `/account`, and problematic Next `/manage` with authentic role sessions. Distinguish deployed server vs local build/commit. If unable to reach production, do not claim it was examined.
2. **Mapping matrix:** for every existing Next `/manage/**` feature, choose native Mercur Admin extension, native Mercur Vendor extension, or genuine consumer feature; identify backing service/API, native SDK extension point, old URL to preserve, RBAC, test. Make this file factual and verified against bundled docs. Flag native order/commerce features that are NOT interchangeable with current Didar settlement model.
3. **Deliver actual central Admin extensions** in original `apps/admin`, starting with working dashboard/navigation, Merchant admin approval/onboarding, Product Core/classification, approved profile pricing, media/CMS, operations/UID and finances. Extend existing Mercur list/detail screens rather than duplicate if available. Original operational controls must remain available throughout migration.
4. **Deliver actual Vendor extensions** in original `apps/vendor`, starting with native Seller role context, own dashboard, own Product/Offer/onboarding, media, store configuration and own sharing, then orders and later CRM/campaign/rewards. No cross-merchant disclosure, not even through API fetch or counts.
5. **Customer account cleanup** in `apps/storefront`: dedicated customer account navigation and history; remove internal admin/vendor nav from public shell once replacement routes exist and are verified.
6. **Cutover, not destructive deletion:** add non-breaking redirects from old `/manage/**` operator UI to appropriate authenticated Mercur Admin or Vendor page **only after** parity tests. Preserve deep links, saved draft/product/financial references and auth-guarded fallbacks. Do not break existing sandbox financial workflows or old URLs during transition.
7. **Engineering tests:** original Mercur admin/vendor builds and panels; working browser Chromium journeys for all THREE workspaces, login/access control, right sidebar/menu, Admin product approval, Vendor owns offer/image, customer sees approved product/merchant scoped offer and sandbox checkout, price/UID/ledger invariants; fresh and upgraded DB; screenshot and accessibility coverage.
8. Keep the v3 functional feature roadmap (Phases 0–9) and Visual CMS Phase 4 intact; **Mercur native panel integration is an overarching acceptance gate** for every remaining phase, not a reason to discard implemented backend/code or add a Mac-owner UAT development phase.

## 4. Non-negotiable delivery evidence

A phase is **NOT complete** if it merely adds `/manage` Next tabs, an unlinked mock, an API without an actual native Admin/Vendor screen, or a passing browser journey that never enters the real Mercur panels. Require:
- Actual working `/dashboard` extension in `apps/admin` and `/seller` extension in `apps/vendor` as applicable.
- Native shell sidebar, breadcrumbs, role-limited menus and connected real data.
- Server-side auth and tenant isolation, not a client-only filter.
- No duplicated products, offers, customer identities, UID/reservations, prices or ledgers; explicit auditable mapping/adapter when native concepts differ.
- Genuine production panel builds, Medusa API backend, database migration tests and browser screenshots of all three contexts.
- Actual final SHA and route matrix, honest residual gaps and GitHub Issue #7 updated.
- Owner-run Mac acceptance only **after** all feature code is complete, per the owner's v3 choice.

## 5. Codex priority directive

**HALT expansion of the independent Next `/manage` dashboard as the final admin/vendor experience.** Complete a source-grounded Mercur-first recovery and implement authentic Admin and Vendor panel extensions before marking later CRM/Campaign/Agent/Referral/Growth modules as delivered. Existing screens may be temporarily reused in a transition but cannot be claimed to satisfy the owner's requirement for native Mercur workspaces. Continue safe backend/domain work only when no competing implementation is created. Never represent a documentation change as implementation.
