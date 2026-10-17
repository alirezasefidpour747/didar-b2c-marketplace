# Work #02 — Independent Mercur / Medusa Core Delta Audit

**Review assignment:** [Chief Architect checkpoint, Issue #7 comment 6231727909](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/7#issuecomment-6231727909).  
**Baseline:** `0aeec24d2292fb3e60848ac2deaa68b76a478ded`, reviewed in PR #8.  
**Target:** `41089a7a0ac8084b74bb3a7f128f9a9ca038528b`.  
**Role:** 02 — Mercur / Medusa Core Architect.  
**Date:** 2026-10-17.  
**Status:** Independent technical evidence for Chief Architect review. No architecture decision, release acceptance, implementation authorization or issue closure.

## Result

The target fixes the original F01 installer ordering mechanism, registers an actual Mercur permissions resolver, adds selected-supplier checks, filters native bank/legal bootstrap responses, gates new mapped gold sales on native Seller status, and introduces protected native handoff. These are material implementation changes, not documentation-only claims. The original native Admin/Vendor shells remain in use. [E01–E09]

The independent review nevertheless does **not support an unqualified claim that all access paths fail closed or all native recovery gaps are resolved**. The resolver deliberately grants full vendor catalog rights to an unlinked store owner; its linked-supplier branch does not read native Seller status or DIDAR supplier approval. Native narrowing policies do not govern the legacy DIDAR-token API path. Lifecycle restrictions also need a separate disposition for read-only historical access. These boundaries require explicit Chief Architect review and additional real HTTP coverage; no cross-tenant HTTP exploit or production incident is claimed here. [E02–E05, E10–E13]

F02/F05/F06 remain open. No broad authority migration, native commerce conversion or completed durable Product projection was found. ADR-CORE-01 remains expressly DRAFT. No new regression was independently proven; residual permissiveness must not be mislabeled as a regression without showing a previously stronger behavior. [E14–E16]

## Method and evidence limits

- Read the exact assigned checkpoint and compared the pinned source revisions. The delta comprises 87 changed paths, including PR #8's merged audit, a draft ADR, implementation, tests and verification artifacts.
- Reused the previously inspected official Mercur 2.3.7 release source and published package artifacts. `bun.lock` is byte-identical to the original audit. Medusa remains 2.21.2; dependency drift does not explain the changes.
- Independently executed **12 in-memory probe scenarios** against actual target source functions using Node 24.19.0 type stripping and VM evaluation. Probed permission resolution, non-demo installer orchestration, per-seller response redaction and return-path validation. Imports/dependencies were replaced with explicit in-memory doubles. SQL was captured or answered by doubles; no SQL reached a database. The reproducible harness and complete output are in [the probe appendix](mercur-medusa-core-delta-probes-41089a7.md).
- Independently compared 10 pinned lockfile/gold/stock/finance/payment/accounting source files byte-for-byte with the baseline; all are unchanged. This establishes absence of source changes in those files, not database preservation or exhaustive absence of indirect behavioral changes.
- Did **not** install packages, start application services/containers, create or mutate a database, change infrastructure, contact deployed staging, run browser/application regression suites, or exercise live credentials/providers. No Docker, PostgreSQL CLI or Bun executable is available in this review environment. The dedicated Runtime QA assignment was not performed by this role.
- Existing Linux/SQL/browser evidence is reviewed and attributed to the implementation receipt, not represented as independently rerun. The independent probes cannot certify middleware ordering, SQL execution, whole-application HTTP behavior, compiled UI, production artifact validity or deployment state.

## F01–F12 disposition

“Resolved” below is limited to the identified source mechanism. “Partial” means a material improvement exists but residual behavior or required evidence remains. “Open” means the original concern/decision remains applicable. No row authorizes remediation.

| Finding | Disposition at target | Independent basis and remaining limit |
| --- | --- | --- |
| **F01 — Non-demo native schema installer** | **Resolved — source mechanism; database rerun pending** | Native identity, ACL and lifecycle SQL execute before the demo-only return. Actual seed orchestration probes with demo disabled in local/development and staging/production each capture all required SQL and no DIDAR user insert. New no-demo test mode exercises `db:setup` on a fresh disposable DB; supplied log ends with zero actors/sellers/policies/users/products/orders. No independent PostgreSQL migration run here; do not equate this disposition with closure of Issue #9. [E01, E17] |
| **F02 — Parallel commerce stacks** | **Open** | Gold checkout/order authority remains DIDAR; generic native Offer/cart/order capabilities remain available. Resolver defaults can still permit native generic commerce. No unified ownership policy approved. [E02, E14, E15] |
| **F03 — Staff and multi-store bridge** | **Partial** | Customer-role staff and global content operators can connect without changing their canonical role. Selected supplier is attached server-side and added to content/onboarding/storefront/me scopes; fresh native membership is re-read. Current one-to-one actor link remains, but one customer staff identity can work across grants in multiple sellers. A supplier-role identity still binds to one supplier. Pending native generic paths and legacy alternatives remain review boundaries. [E03, E05, E06, E10] |
| **F04 — Configured least privilege** | **Partial** | Module `permissions` is now registered; admin without a bridge resolves to `{}`, staff get derived feature rights, revoked links resolve to `{}`, ACLs narrow derived rights, missing tables throw. However, unlinked owners get `full()`, linked suppliers get `full()` without lifecycle checks, and legacy APIs bypass the native ACL by design. This is narrower than a framework-wide default grant-all, but not universal default-deny across actors/surfaces. [E02–E05, E11] |
| **F05 — Product projection crash consistency** | **Open** | Only the public offer eligibility query changed in `catalog.ts`; the independently committed native Product write plus local compensation remain. No durable projection outbox, crash recovery or failure-injection evidence added. [E14] |
| **F06 — Structural catalog duplication** | **Open** | No consolidation of Product/category/attribute/collection/ProductChange/Offer authority. Product guard remains, SDK integration is preserved, draft ADR documents alternatives. [E14–E16] |
| **F07 — Seller lifecycle authorities** | **Partial** | New SQL function denies mapped inactive/missing/deleted/non-open native sellers; unlinked legacy suppliers retain prior behavior. Public offers and shared scope assertions consult it. DIDAR approval remains independently checked by existing paths. Supplied test covers native suspension, global catalog/quote and paid-order row fingerprint. Full state matrix, real checkout and historical read accessibility are not fully established. [E07, E08, E12, E18] |
| **F08 — Legacy Next management** | **Partial** | Client layouts protect the transition, validated handoff preserves approved path/query references, original native login/store selection remain authoritative, and internal tabs become one workspace link. Missing linkage/origin retains fallback. Underlying DIDAR-token authority remains live; no global native ACL enforcement follows merely from these redirects. Historical deep links and role coverage still require interpretation beyond the sampled journeys. [E09, E11, E13, E19] |
| **F09 — Module/workflow conventions** | **Partial** | A genuine Medusa permissions module is now used. Gold services still own raw SQL transactions, no custom workflow/module-link migration of gold services was introduced, and projection durability remains separate. No evidence supports claiming the entire backend now follows native workflow/event semantics. [E02, E14, E20] |
| **F10 — Live financial integrations** | **Open** | Sandbox-only payment selection, local finance mutation gate, manual rate source and Tahesab `BLOCKED_BY_SPEC` remain. Relevant provider/finance sources are unchanged. [E20] |
| **F11 — Media/CMS persistence** | **Open** | Native File and governed PostgreSQL media/CMS byte stores continue to coexist. No storage/provider or privacy-provenance authority migration. New response redaction addresses Seller financial fields, not this storage question. [E16, E20] |
| **F12 — Deployment/version evidence** | **Open — separate specialist assignment** | Build/source hashes and QA receipts are supplied; no independent target artifact reconstruction or deployed SHA confirmation in this review. Work #03 remains responsible for staging. [E17, E21] |

Summary: **1 resolved source mechanism, 5 partial, 6 open, 0 proven regressions**. This count is a finding classification, not a release decision.

## Independent safety observations

### D01 — Unlinked native owners retain broad generic rights

**Priority: High review attention. Confirmed function behavior; no HTTP exploit asserted.**

`PermissionsService.resolvePermissions()` checks native membership, then, when there is no DIDAR link, executes `native.is_owner ? full() : { store: 'view' }`. The independent unbound-owner probe returns Products/Orders `manage` and Payments `edit` from a representative native permission catalog. An unbound Admin, in contrast, returns no rights. [E02]

The normal Mercur vendor middleware validates selected membership and resolves permissions; native order-list middleware requires `orders:view` and applies seller scope. It does not call DIDAR `linked()` or its approval checks. Thus a generic native route is a distinct path from the stricter `/vendor/didar/*` routes. This is a source-supported authorization gap against a blanket “unconnected identities have no commerce privileges” claim, not proof of cross-merchant data exposure. Native store ownership may be intended to carry native rights; that exception must be explicitly scoped and accepted or remediated by the Chief Architect. [E10]

**Missing evidence:** real unbound native owner of an already mapped Seller requesting generic native orders/customers/offers/inventory and DIDAR routes. Current “unconnected” test uses a native **Admin user**, not this owner case. Require expected rights per path rather than infer all unbound actors are denied. [E18]

### D02 — Linked supplier native rights do not depend on commercial lifecycle

**Priority: High review attention. Confirmed resolver omission plus native route trace.**

For a supplier link, the resolver checks active native seller mapping but does not read `didar_supplier.active/status` or `seller.status`. Its native membership query filters deletion, not status. `full()` therefore remains available for a linked supplier even when the business supplier is pending/inactive or the native Seller is non-open. The in-memory probe confirms the branch has no such state input; it does not substitute for a real database test. [E02]

`nativeHandler.linked()` separately blocks most DIDAR actions for those states. The supplied pending-supplier test only checks DIDAR manage/inventory/ledger denial, while generic native routes use the resolver. Consequently “pending suppliers see status only” is established for selected DIDAR endpoints, not every native panel/API surface. The native generic data set may be empty; emptiness is not an access-denial guarantee. [E03, E10, E18]

**Missing evidence:** status×surface matrix for pending, inactive, rejected, suspended, terminated and deleted records, covering generic reads/writes and DIDAR endpoints, with populated native fixtures. No recommendation here grants or removes historical-read privileges.

### D03 — Native ACL/revocation does not govern legacy DIDAR-token authority

**Priority: High boundary clarification. Verified source path; not an anonymous bypass.**

`/didar/manage` continues to dispatch directly to `service.handler`. With an original DIDAR token, `sessionUser()` reads `didar_session` and `didar_user`, without consulting `didar_native_actor` or `didar_native_acl`. Gold-domain role/grant checks still apply. Setting a native Admin bridge or ACL to disabled/read-only therefore narrows that native actor path; it does not revoke the person's original DIDAR Admin session or make it read-only. [E11]

The legacy layout is client-side handoff and deliberately retains fallback. `workspace()` tests active links but does not evaluate the ACL; a disabled native policy can still produce a ready handoff hint, then native access is denied. Possession of an original DIDAR credential may still allow using the fallback API. This is consistent with retaining two authorities temporarily, but must not be presented as universal per-person revocation or a server-side closure of legacy operations. [E13]

**Chief Architect question:** is native policy deliberately surface-only during transition, or must it constrain equivalent legacy writes? Resolve the boundary and then request the corresponding tests. This review does not independently choose a unified identity model or disable working legacy access.

### D04 — Lifecycle gating is about new sale eligibility; historical read policy remains incomplete

**Priority: Medium; evidence/behavior distinction.**

Source-derived lifecycle truth table for `didar_native_saleable_supplier`:

| Mapping/native state | Function result |
| --- | --- |
| No mapping | true; legacy compatibility |
| Active mapping, existing non-deleted Seller, status open | true |
| Inactive mapping | false |
| Mapping to missing or soft-deleted Seller | false |
| Native pending_approval / suspended / terminated | false |

The function is read-only SQL. It does not rewrite orders, reservations or journals. DIDAR supplier approval is enforced separately in catalog/quote/checkout. New public offer selection and `assertOfferScope()` now apply this native check; both quote and checkout use the shared assertion. Native scheduled closure dates are not part of this new predicate and should not be assumed covered. [E07, E08]

The stored paid-order fingerprint in the supplied test demonstrates retention of those rows for that QA scenario, not continued access to every historical URL or all financial/UID rows. A suspended Seller is denied `/vendor/didar/orders` by `linked()`. A customer order query with merchant context calls `storeScope()`, whose store eligibility check now rejects that Seller; global customer history is a distinct path. Also, the native onboarding exception allows GET for a non-open Seller, while `onboarding.ts`'s reduced pending response only checks DIDAR supplier active/approval; an approved DIDAR supplier under native suspension can reach the fuller onboarding read path. [E03, E08, E12]

**Missing evidence:** real checkout denial for each lifecycle state; global versus scoped paid-history read behavior; supplier status-only versus suspended read policy; no mutation of UID/paid snapshots/financial balances. Treat “data preserved” and “read access preserved” as separate acceptance claims.

### D05 — First-Admin bootstrap is explicit, not automatic

**Priority: Medium operational acceptance gap.**

A fresh no-demo installation intentionally has zero DIDAR users and native links. The native resolver supplies no global permissions to an unbound native User, but `connect` bypasses capability checks and requires both an authenticated native User and proof of an existing DIDAR admin or content operator. This avoids a permanent bootstrap privilege bypass. Operator DIDAR provisioning exists in `scripts/create-account.ts`; a native account must also be provisioned through its supported path. [E01–E04, E22]

The QA fixture directly inserts the initial Admin link after creating native credentials. Other browser checks exercise a dual-proof connection, but the fresh no-demo log only checks empty counts. This review cannot certify the complete production first-admin provisioning/login/connection sequence. Require an explicit no-demo bootstrap scenario without weakening default rights or using QA/demo identities. The last-usable-admin guard protects its own access-management action and is valuable; it is not evidence about every possible native account lifecycle or external operator change. [E04, E17, E18]

### D06 — Positive checks independently confirmed

- Permission registration names the module `permissions`, matching Mercur's resolver contract; four DIDAR feature rights are registered instead of widening Product rights for staff. Revoked bridge and narrowing ACL branches returned the expected smaller maps in probes. Missing-table handling throws rather than silently grants. [E02]
- Selected-supplier scoping is injected from trusted native membership/mapping, not accepted from client JSON. Content access, onboarding, store reads and merchant-access mutations now reject other supplier scopes. Global operator authority is suppressed when acting inside a selected vendor scope. [E03, E05, E06]
- Actual `nativeVendorPrivacy` was exercised with mixed A/B memberships: A-authorized bank/legal data remained; B fields were removed. The middleware evaluates each membership's permissions, avoiding an A-rights→B-response shortcut. This confirms the function's listed JSON shapes, not arbitrary HTTP serialization or all possible future shapes. [E05]
- Actual `safeNativeReturn` accepted four bounded feature/reference inputs and rejected seven external-origin/path-escape/credential/duplicate-query/hash inputs. No bearer/password transfer is present in the handoff construction. The existing native login and store selection remain the authentication authority. [E09]
- Native and DIDAR schemas, exact UID reservation implementation, finance event/journal source, payment provider and concrete accounting boundary retain their baseline contents for the 10 files independently compared. No new broad authority conversion is hidden in this delta. [E14–E16, E20]

## Receipt reconciliation

| Claim | Supplied evidence | Independent disposition |
| --- | --- | --- |
| Backend tests/assertions | `QA_FINAL.log`: 174 passed, 0 failed, **2238** assertions; `RESULTS.md`: 174 / **2,238** | The two target repository receipts agree. The earlier handoff's 2,235 differs by 3. Record **2,238 as implementation-reported**; no independent backend run confirms either count. |
| Native HTTP / browsers | 1 native HTTP; 27 passed browsers | Receipt includes new staff/global editor, protected handoff and interrupted customer-session scenarios. Reviewed source coverage; not independently run. |
| Fresh no-demo | Fresh `db:setup` with demo=false and zero checked counts; log ends `FRESH_NON_DEMO_INSTALL_VERIFIED` | Appropriate regression entry point is added. Independent in-memory installer orchestration passes; actual SQL/compiled artifact rerun remains pending. |
| Historical data | Two clone logs and retained fingerprints/counts | Attributed evidence, no original database inspection. Does not prove all lifecycle/history access combinations. |
| Build receipt | Platform Linux/x64, Node 24.19.0, source/output digests | Digest record is not a deployed SHA or independently reconstructed artifact. |

The fresh installer log also reports **Local Event Bus** and **in-memory locking**. That is evidence about the recorded QA invocation, not an inspection of staging. Redis URL configuration alone must not be interpreted as proof that all native durable/distributed providers were used. This remains within F09/deployment governance; this report does not change provider configuration. [E17, E21]

## Recommendations to the Chief Architect — no implementation authorization

1. Accept the F01 source correction as independently corroborated, while retaining a distinct actual non-demo database/bootstrap verification requirement before issue closure.
2. Review D01–D03 with the implementer before interpreting the recovery as universally fail-closed. Require real HTTP tests for unbound owners, lifecycle-restricted suppliers and native-policy versus legacy-token behavior.
3. Define expected historical-read behavior and lifecycle state matrix without rewriting prior orders or broadening commerce authority; then assess D04 coverage.
4. Retain the last-admin guard, dual-proof linking, per-seller redaction and bounded handoff. Extend evidence to a complete clean non-demo first-admin scenario and failed/disabled-link handoff states.
5. Keep F02/F05/F06 and the relevant draft ADR choices open. No native Offer/cart/order migration, identity conversion, media move or gold-journal change is approved by these findings.
6. Reconcile this report with Work #03's separate deployed-runtime evidence. The Chief Architect retains the release and next-phase decision. CRM and Phases 5–9 are not started or authorized by this PR.

## Pinned evidence register

All E links below point to the requested target, except explicitly pinned official Mercur sources. Evidence is source/receipt evidence unless the in-memory probe scope is stated.

### E01

- [packages/api/src/scripts/didar-seed.ts:114](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/scripts/didar-seed.ts#L114)
- [packages/api/src/scripts/didar-seed.ts:134](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/scripts/didar-seed.ts#L134)
- [scripts/local/test.mjs:65](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/scripts/local/test.mjs#L65)

### E02

- [packages/api/medusa-config.ts:46](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/medusa-config.ts#L46)
- [packages/api/src/modules/didar-permissions/index.ts:21](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/modules/didar-permissions/index.ts#L21)
- [packages/api/src/modules/didar-permissions/service.ts:10](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/modules/didar-permissions/service.ts#L10)
- [packages/api/src/modules/didar-permissions/service.ts:71](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/modules/didar-permissions/service.ts#L71)
- [packages/api/src/modules/didar-permissions/service.ts:73](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/modules/didar-permissions/service.ts#L73)

### E03

- [packages/api/src/didar/native.ts:65](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/native.ts#L65)
- [packages/api/src/didar/native.ts:95](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/native.ts#L95)
- [packages/api/src/didar/native.ts:139](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/native.ts#L139)

### E04

- [packages/api/src/didar/native-access.ts:42](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/native-access.ts#L42)
- [packages/api/src/didar/native-access.ts:97](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/native-access.ts#L97)

### E05

- [packages/api/src/didar/native-vendor-privacy.ts:5](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/native-vendor-privacy.ts#L5)
- [packages/api/src/api/middlewares.ts:15](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/api/middlewares.ts#L15)
- [packages/api/src/didar/content-permissions.ts:10](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/content-permissions.ts#L10)

### E06

- [packages/api/src/didar/storefront.ts:15](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/storefront.ts#L15)
- [packages/api/src/didar/storefront.ts:180](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/storefront.ts#L180)
- [packages/api/src/didar/onboarding.ts:19](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/onboarding.ts#L19)
- [packages/api/src/didar/service.ts:130](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/service.ts#L130)

### E07

- [packages/api/src/didar/native-lifecycle-schema.sql:2](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/native-lifecycle-schema.sql#L2)

### E08

- [packages/api/src/didar/catalog.ts:81](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/catalog.ts#L81)
- [packages/api/src/didar/storefront.ts:40](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/storefront.ts#L40)
- [packages/api/src/didar/storefront.ts:98](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/storefront.ts#L98)
- [packages/api/src/didar/merchant-quote.ts:53](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/merchant-quote.ts#L53)
- [packages/api/src/didar/service.ts:313](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/service.ts#L313)

### E09

- [packages/didar-ui/src/native-handoff.tsx:5](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/didar-ui/src/native-handoff.tsx#L5)
- [packages/didar-ui/src/native-handoff.tsx:43](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/didar-ui/src/native-handoff.tsx#L43)
- [apps/storefront/src/components/didar/legacy-workspace.tsx:6](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/apps/storefront/src/components/didar/legacy-workspace.tsx#L6)
- [apps/admin/src/main.tsx:15](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/apps/admin/src/main.tsx#L15)
- [apps/vendor/src/main.tsx:15](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/apps/vendor/src/main.tsx#L15)

### E10

- [packages/core/src/api/vendor/middlewares.ts:122](https://github.com/mercurjs/mercur/blob/57fa9cf7de35829ce493a3ace29deb4f36d0838b/packages/core/src/api/vendor/middlewares.ts#L122)
- [packages/core/src/api/utils/ensure-seller-middleware.ts:14](https://github.com/mercurjs/mercur/blob/57fa9cf7de35829ce493a3ace29deb4f36d0838b/packages/core/src/api/utils/ensure-seller-middleware.ts#L14)
- [packages/core/src/api/vendor/orders/middlewares.ts:49](https://github.com/mercurjs/mercur/blob/57fa9cf7de35829ce493a3ace29deb4f36d0838b/packages/core/src/api/vendor/orders/middlewares.ts#L49)
- [packages/core/src/api/vendor/orders/route.ts:14](https://github.com/mercurjs/mercur/blob/57fa9cf7de35829ce493a3ace29deb4f36d0838b/packages/core/src/api/vendor/orders/route.ts#L14)
- [packages/core/src/api/vendor/offers/middlewares.ts:35](https://github.com/mercurjs/mercur/blob/57fa9cf7de35829ce493a3ace29deb4f36d0838b/packages/core/src/api/vendor/offers/middlewares.ts#L35)

### E11

- [packages/api/src/api/didar/manage/route.ts:3](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/api/didar/manage/route.ts#L3)
- [packages/api/src/didar/auth.ts:24](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/auth.ts#L24)
- [packages/api/src/didar/service.ts:449](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/service.ts#L449)
- [packages/api/src/didar/catalog.ts:505](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/catalog.ts#L505)

### E12

- [packages/api/src/didar/service.ts:409](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/service.ts#L409)
- [packages/api/src/didar/onboarding.ts:29](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/onboarding.ts#L29)
- [packages/api/src/didar/onboarding.ts:58](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/onboarding.ts#L58)

### E13

- [packages/api/src/didar/workspace.ts:4](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/workspace.ts#L4)
- [apps/storefront/src/app/api/didar/[action]/route.ts:203](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/apps/storefront/src/app/api/didar/[action]/route.ts#L203)
- [apps/storefront/src/components/didar/legacy-workspace.tsx:39](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/apps/storefront/src/components/didar/legacy-workspace.tsx#L39)

### E14

- [packages/api/src/didar/catalog.ts:361](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/catalog.ts#L361)
- [packages/api/src/didar/catalog.ts:455](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/catalog.ts#L455)
- [packages/api/src/didar/native-product-guard.ts:4](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/native-product-guard.ts#L4)

### E15

- [DECISIONS.md:27](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/DECISIONS.md#L27)
- [packages/api/src/didar/service.ts:364](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/service.ts#L364)

### E16

- [docs/adr/ADR-CORE-01-DRAFT-domain-and-data-authority.md:5](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/docs/adr/ADR-CORE-01-DRAFT-domain-and-data-authority.md#L5)
- [docs/MERCUR_NATIVE_RECOVERY_REVIEW_CHECKPOINT.md:23](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/docs/MERCUR_NATIVE_RECOVERY_REVIEW_CHECKPOINT.md#L23)

### E17

- [verification/mercur-native/RESULTS.md:7](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/verification/mercur-native/RESULTS.md#L7)
- [verification/mercur-native/QA_FINAL.log:6](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/verification/mercur-native/QA_FINAL.log#L6)
- [verification/mercur-native/FRESH_NO_DEMO_INSTALL.log:721](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/verification/mercur-native/FRESH_NO_DEMO_INSTALL.log#L721)
- [verification/mercur-native/FRESH_NO_DEMO_INSTALL.log:656](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/verification/mercur-native/FRESH_NO_DEMO_INSTALL.log#L656)
- [verification/mercur-native/historical-native-audit.log:1](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/verification/mercur-native/historical-native-audit.log#L1)
- [verification/mercur-native/historical-compose-audit.log:1](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/verification/mercur-native/historical-compose-audit.log#L1)

### E18

- [tests/native-panels.test.ts:646](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/tests/native-panels.test.ts#L646)
- [tests/native-panels.test.ts:713](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/tests/native-panels.test.ts#L713)
- [tests/native-panels.test.ts:732](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/tests/native-panels.test.ts#L732)
- [packages/api/src/scripts/native-qa-seed.ts:40](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/scripts/native-qa-seed.ts#L40)
- [tests/native-panels.test.ts:369](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/tests/native-panels.test.ts#L369)

### E19

- [tests/browser/native-panels.spec.ts:506](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/tests/browser/native-panels.spec.ts#L506)
- [apps/storefront/src/components/didar/store.tsx:162](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/apps/storefront/src/components/didar/store.tsx#L162)
- [apps/storefront/src/components/didar/store.tsx:304](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/apps/storefront/src/components/didar/store.tsx#L304)

### E20

- [packages/api/src/didar/db.ts:2](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/db.ts#L2)
- [packages/api/src/didar/finance.ts:38](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/finance.ts#L38)
- [packages/api/src/didar/payment-provider.ts:79](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/payment-provider.ts#L79)
- [packages/api/src/didar/tahesab-contract.ts:99](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/tahesab-contract.ts#L99)
- [packages/api/src/didar/rate-source.ts:7](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/rate-source.ts#L7)
- [packages/api/src/didar/onboarding-schema.sql:13](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/didar/onboarding-schema.sql#L13)

### E21

- [verification/mercur-native/BUILD_RECEIPT.json:1](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/verification/mercur-native/BUILD_RECEIPT.json#L1)
- [scripts/local/build-receipt.mjs:18](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/scripts/local/build-receipt.mjs#L18)

### E22

- [scripts/create-account.ts:1](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/scripts/create-account.ts#L1)
- [packages/api/src/scripts/native-qa-seed.ts:13](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/src/scripts/native-qa-seed.ts#L13)

