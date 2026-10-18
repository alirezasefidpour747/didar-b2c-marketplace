# CORE-04 — Issue 23 boundary reconciliation and bounded hardening

Status: assessment decision submitted for Chief Architect review; no economic-policy amendment or feature release.
Source baseline: `41d880a5dd4c2462144f52b1591576882238d125`, accepted by PR 20 review 5561363686 and Issue 23 comment 6245470196. PR 22 governing source: `cf2fc25692ea6fe0d2e5c3a6c364f3e901195802`.

## Historical contract and precedence

The original named five-layer agreement was **not recovered**. Search of tracked docs/AGENTS/README and the three earlier owner-pasted mission attachments found no exact five-layer contract. The attachments describe architecture constraints without naming that contract. PR 22 explicitly supplies a responsibility checklist rather than recovered layer names. We do not claim full historical five-layer compliance. Reconciliation against the actual original agreement remains NOT_VERIFIED; no invented folder scheme or renamed layers is introduced.

Map the PR 22 responsibility checklist, not presumed historical layer names, to installed mechanisms:

| Responsibility | Actual implementation / boundary |
| --- | --- |
| Presentation | Mercur Dashboard SDK Admin `/dashboard`, Vendor `/seller`; Next customer shop/account. Legacy management handoff remains a protected transition. |
| Transport/access | Native routes/auth-context, Mercur ACL narrowing, `native.ts`, canonical bearer session and customer proxy. Caller IDs identify targets, never prove ownership. |
| Application/workflows | Native Medusa/Mercur workflows for native entities/projections; DIDAR transaction-backed services orchestrate existing gold-specific commerce. Product projection outbox is a separate durable effect. |
| Domain | Original Product Master/Offer/exact UID/reservation, locked quote and agency/principal snapshots, immutable gold/rial events and balanced journals. Generic payout does not substitute for gold discharge. |
| Infrastructure/persistence | One PostgreSQL database with native and additive DIDAR records. Native persistence and DIDAR `pg` transactions have separate commit boundaries; local Redis/config/file adapter does not establish distributed module configuration. |

Existing request-aware DIDAR services and direct SQL are a compatibility boundary, not blanket compliance with the bundled recommendation to run mutations through native workflows. Native writes keep supported workflows. Historical gold semantics remain in their tested canonical transactions until approved, proven equivalence exists. Native workflow commits and a canonical DIDAR transaction are not globally atomic. The accepted outbox repairs descriptive Product projection forward; it does not prove future financial/provider/reward effects. A repository-pattern rewrite would not resolve the reproduced defect.

## Selected correction

One coherent P1 batch protects **actual native product mutation targets**, including variants, images, shared options and values, irrespective of the URL parent. Pinned Mercur/Medusa handlers pass child IDs directly to workflows. Independent baseline HTTP/PostgreSQL evidence established linked-variant single and batch deletion through an unrelated parent.

Use native Query to read native entity relationships, then consult original `didar_product.native_id`. Resolve every batch member before mutation, with explicit page sizes. Query failures propagate; no fail-open fallback. Protect standalone option/value editors and product-family routes. Preserve native reads, native auth/ACL, unrelated native CRUD and internal projection workflows. The optional variant-update `body.id` is also a real target in the pinned service and must be checked.

No database/schema, identity, inventory/financial authority or management UI is added. This does not certify arbitrary import confirmation, pending product-change execution or generic price-list pathways as safe DIDAR writers; unproved effects remain NOT_VERIFIED. It is an HTTP adapter, not a constraint against arbitrary trusted internal workflows/SQL. Existing malformed cross-product image associations need an inventory/recovery assessment; the corrected paths prevent reviewed new associations.

## Business invariants and continuation

Preserve ADR-BIZ-01/02 and ADR-CORE-02/03 authorities: agency versus principal, immutable snapshots and exact UID. Latest owner policy supersedes older PR 21 uncertainty: base fineness **750**; in-person customer-account approval primary, OTP auxiliary. Future confirmation binds customer/seller/immutable amount and purchase details/expiry/single use; changed amount needs fresh confirmation. No such future feature is implemented here.

Next existing vertical candidate: **S1 (F2 settlement/backed-wallet prerequisites)** from PR 21, after S0 contract/reuse reconciliation. S0 is usable preparatory work, not a delivered user-facing vertical slice. S1 implementation is BLOCKED until its dependent economic contracts and applicable open P1 auth findings pass. Published PROPOSED title/wallet additions are not accepted architecture by publication alone. Resale, CRM Phases 5–9, provider activation and rollout are not started.

See [Issue 23 handoff](../audits/issue23/READINESS_HANDOFF.md) for independent review/evidence. Chief review is the continuation checkpoint; no merge, owner-server change or issue closure.
