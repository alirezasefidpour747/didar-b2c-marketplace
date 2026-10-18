> **Owner-directed governing addendum — 2026-10-18:** Architecture compliance and Production Readiness are continuous, independent workstreams. Feature test success does not certify either. Read [Continuous Architecture and Production Readiness](CONTINUOUS_ARCHITECTURE_AND_PRODUCTION_READINESS.md) before executing this historical plan. Any wording below that postpones technical architecture/security/reliability work until all features are finished is superseded. Consolidated owner Mac UAT remains preserved.
>
> **Immediate order:** freeze new feature scope → close the outstanding bounded Issue #18 receipt; start a read-only baseline now → implement confirmed relevant P0/P1 corrections on the accepted integration candidate → resume one existing feature packet with continuous readiness checks → separately accept staging/production release gates. No automatic merge, rollout or owner-server mutation. Maximum two active implementation lanes: one feature packet and one bounded hardening packet. New ideas enter backlog rather than expanding the current packet.

> **Issue #23 execution checkpoint:** accepted integration baseline is `41d880a5dd4c2462144f52b1591576882238d125` (PR #20 final bounded acceptance), not moving main. The isolated native-target hardening candidate and all inherited/new evidence are recorded in [Issue 23 readiness handoff](audits/issue23/READINESS_HANDOFF.md) and [CORE-04 boundary reconciliation](adr/ADR-CORE-04-issue23-boundary-reconciliation.md). The next existing vertical candidate is PR #21 S1 after S0 contracts/native reuse; enabled S1 is **BLOCKED** by dependent economic decisions and confirmed open auth P1 findings. S0 is usable preparatory work, not a completed feature or automatic continuation authorization. Use the per-packet architecture/operational gates in that handoff. Original five-layer contract remains NOT_VERIFIED. No merge, rollout or CRM Phase 5–9 start; stop for Chief Architect review.

# DIDAR B2C — Execution Strategy v3: All Features First, Owner Mac Acceptance Afterwards

**Date:** 2026-10-16 | **Status:** Owner-confirmed roadmap sequencing, NOT software implementation.
**Supersedes:** `EXECUTION_STRATEGY_V2_BUILD_FIRST.md` only where previous documents treated an owner Mac test as a numbered development phase or postponed all Visual CMS implementation until after CRM.
**Applies to:** `docs/ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md` (Master Issue #7) and `docs/PHASE4_LUXURY_VISUAL_CMS.md`.

## Owner's hard boundary

**No dedicated MacBook UAT phase in the development roadmap.** The owner wants Codex to **finish implementation of all agreed features first**, then run one separate comprehensive acceptance/testing program on their Mac. The Mac check is a *post-feature owner activity*, not Phase 9, not an engineering merge gate during development, and not a reason for Codex to stop after every phase to request hands-on testing. The owner has additional requirements to provide later; this roadmap remains amendable.

**Not a waiver of technical tests:** every engineering phase still gets actual Database → Backend → API → connected Persian RTL Frontend → automated unit/integration/Playwright/security/build validation on the environments available to Codex. Codex reports honest evidence and ships to GitHub `main`. Linux success does not falsely claim Mac compatibility or physical printer/phone approval.

**Not a customer-research requirement:** owner has already tested initial Merchant onboarding desirability; external customer/retailer usability evaluation and business performance tests occur **after implementation of all features**, not as an engineering dependency.

## Final proposed development phases — 10 total (0 through 9)

| New phase | Owner-approved product domain | Prior roadmap |
| --- | --- | --- |
| **0** | Foundation/architecture/role/DB/tenant security audit | old Phase 0 |
| **1** | Manufacturer/Retailer Merchant Pricing Profiles (verified software, reuse) | old Phase 1 |
| **2** | Merchant storefront, tenant isolation, premium navy-white design foundation, simple 10–20 item share links; subdivided **2A/2B/2C** | old Phase 2 |
| **3** | Assisted Merchant onboarding and safe product photo/WebP media processing | old Phase 3 |
| **4** | **FULL Luxury Visual CMS**: video hero, image/video slider, editorial Mosaic, split media/story, dynamic Product/Collection, PostgreSQL Page Builder, preview/publish/rollback | moved up from old Phase 10 |
| **5** | Didar Central + Merchant-scoped **CRM Lite**: one customer identity, own relationship/purchase history/notes/consent | old Phase 4 |
| **6** | Merchant campaigns and Didar global campaigns, curated share-page enhancements, attribution | old Phase 5 |
| **7** | Didar Marketing Agent acquisition/activation Affiliate and provisional reward rules | old Phase 6 |
| **8** | Merchant customer-to-customer Referral and optional controlled rewards | old Phase 7 |
| **9** | Merchant Growth Center, CRM enhancements/segmentation, analytics, campaign tools and operational hardening | old Phase 8 |

**No 'Phase 10' and no numbered Mac-test phase** in the current executable development roadmap. The **owner's post-completion Mac tests** and later real-user/business assessments are separate acceptance activities, scheduled when all code features are ready. Old documents and evidence of earlier Phase 9/10 can remain as historical references but are **not authoritative instructions** after v3.

## Why Visual CMS belongs before CRM

Phase 2 establishes secure Merchant Context, true buyer checkout and first navy/white UI.
Phase 3 supplies the media ingestion and optimization that an operational CMS needs.
**Phase 4** can now build one coherent visual editor, design tokens, responsive video/slider/Mosaic blocks and reusable public/merchant pages. It does **not** depend on CRM or Campaign Management to deliver real Didar home and merchant collection/product pages.
Phase 5/6 then **reuse Phase 4 page blocks** for CRM-related presentation, Merchant campaigns and platform campaigns without rebuilding a second page renderer. To avoid inventing unimplemented campaign data, the CMS provides an extension/adapter point for Phase 6 rather than treating the future Campaign Engine as already available.

This avoids building customer/merchant campaign experiences twice, while permitting user-provided real branded images/video to be assigned later.

## Ordering criteria

Prioritize features by: **(1) value to Merchant/buyer, (2) risk of incorrect price, leaked customer/tenant data, payment or history damage, (3) technical dependencies and reuse**, not by desire for complex features or a premature field pilot. Every agreed capability stays in scope. The earliest working merchant buyer journey is still delivered in Phase 2; Visual CMS comes once Phase 3 media is ready. Do not enlarge the initial CRM into a costly generic PIM/CRM rewrite.

## Technical gates during coding

1. Review current main, history, existing migrations, UID/Offer/quote/finance/campaign entities, avoid duplicate features and preserve original data.
2. Implement safe additive database rules, authorized services/API, actual Persian RTL UI and connected browser customer journeys.
3. Repeat migrations on fresh/populated fixtures, rerun relevant backend, Playwright, security/isolation, pricing, UID, finance and build regressions.
4. Commit/merge reviewed and verified code into `main`, record real commands/test counts/SHA and blockers in `PROGRESS.md`/`DELIVERY.md`. Do not require owner to open local app or complete Mac UAT in between features.
5. Continue autonomously to next safe phase, only pause for genuinely destructive, legal, sensitive, external-provider actions or owner approvals.

## After all engineering phases are complete

**Separate from roadmap:**
- Owner runs full Mac local application review (existing `docs/MAC_UAT_CHECKLIST.md` may serve as a runbook updated at the end, but no feature depends on owner running it early). Includes native browser/mobile UI, scanned printed labels with authorized public origin, actual hardware if available and thorough Merchant/CRM/campaign/pricing/finance sandbox walkthrough.
- Then, if desired, controlled real Merchant/customer usability and KPI validation. Any issues become the next change backlog, not unimplemented roadmap features claimed as already tested.
- Financial/legal/accounting/real payment/provider authorizations remain separately required before any live transaction. Completing development does not waive them.

**Codex execution override:** Start with pending Phase 2A/2B/2C; then 3 → 4 (Visual CMS) → 5 (CRM Lite) → 6 (Campaigns) → 7 (Agent Affiliate) → 8 (Customer Referral) → 9 (Growth Center). **Do not schedule or request Mac UAT as Phase 9, nor defer CMS until after CRM.** Deliver verified source code before requesting the owner's integrated Mac test.
