# Pre-rollout integration closure — evidence receipt

Baseline: `4e953c7cf62c327b92f4a461d776fc11c772a9fb`.
Reviewed application/test commit: `3a6e98f68dd38af1ad0c915f88d40ba8201e4dba`.
Historical comparison: `41089a7a0ac8084b74bb3a7f128f9a9ca038528b`.
The final published PR/commit is identified in the Persian handoff and GitHub
checkpoint. The [build receipt](BUILD_RECEIPT.json) binds the application source,
all four production outputs, Node, architecture and platform.

**ROLLOUT_NOT_EXECUTED. Chief Architect acceptance remains pending.**
The full architecture package remains **BLOCKED_PENDING_DECISION** for Product
projection durability and cross-supplier economic-party semantics. No authority
switch, CRM Phases 5–9, staging content or owner-server change is included.

## Independently executed verification

| Reviewer / command | Result and boundary |
| --- | --- |
| Coordinator: `MERCUR_BACKEND_URL=same-origin bun run build:all` | All four production builds pass: native Admin, native Vendor, compiled Medusa API and Next customer. [Log](BUILD.log). |
| Coordinator: `bun run local:test -- --reuse-build` with Linux Chromium | **190 backend tests / 2,613 assertions, 1 additional native HTTP test, 29 production browser tests, zero failures**. Full original commerce/UID/finance/classification/media/tenant regressions and both new suites pass on the exact application commit. [Complete log](FULL_REGRESSION.log). |
| Authorization reviewer: real disposable PostgreSQL 17 / Redis 7, compiled API; native-panels + native-policy + pre-rollout-authorization | **29 PASS, 563 assertions, zero failures**: original 22/481 plus new 7/82. [Final log](AUTHORIZATION_REVIEW.log), [baseline reproductions](AUTHORIZATION_BASELINE_REPRO.log), [independent audit](../../docs/audits/PRE_ROLLOUT_AUTHORIZATION.md). |
| CMS reviewer: production Chromium, native Admin/Vendor and customer, `pre-rollout-cms.spec.ts` | **1 comprehensive case PASS, 24.9s**, on exact application commit above: actual native eleven-block publication/preview, scheduling/rollback/pause, 1440px/390px, protected media failures, real tenant denial, live product blocks and both native noindex metadata assertions. [Log](CMS_INDEPENDENT.log), [screenshots](screenshots). |
| Runtime reviewer: `node verification/pre-rollout/probes/runtime-readiness.mjs` | 18 fixture tests / 391 assertions pass, followed by full-row fingerprints of **79 DIDAR tables** across two non-demo migration replays, real PostgreSQL restart, actual `pg_dump -Fc` and restoration into a second owned PostgreSQL container. Native upload bytes, panel HTML/JS/CSS MIME and restored native authentication/bridge access pass. [Log](RUNTIME_RESTORE.log). |
| Runtime reviewer: `bun run local:test -- --no-demo-install-only --reuse-build` | Real clean first-Admin provisioning, native browser login + dual proof and HTTP authorization pass; **one canonical Admin, one bridge, zero demo users/products/orders** after replay. [Log](NO_DEMO_BOOTSTRAP.log). |
| Runtime reviewer: isolated `bun install --frozen-lockfile` | 2,004 packages installed with pinned Bun 1.4.3 in a separate manifest/lock copy; shared dependencies untouched. [Log](FROZEN_INSTALL.log). |
| Runtime reviewer: two historical read-only clone audits | 7 products/8 offers/2 orders and 15 products/8 offers/3 orders preserved, including audited old image bytes and commerce/collection fingerprints. [Native](HISTORICAL_NATIVE.log), [Compose](HISTORICAL_COMPOSE.log). **Neither old snapshot has a UID table.** |
| Runtime reviewer: local deployment-tooling unit tests | 23 pass using fake command infrastructure, with no deployment/provider access. [Log](DEPLOY_TOOLING_TESTS.log). |
| D/E reviewer: isolated extracted actual Product save function, injected SQL failure | Reproduced old compensation defect; current fix passes all eight active/published/approved combinations. [Pinned baseline](PROJECTION_BASELINE.log), [fixed review](PROJECTION_REVIEW.log), [portable probes](probes). These use explicit SQL/native doubles, not real HTTP/PG; the separate authorization regression also tests the actual HTTP/PG failure path. |

The portable restore probe records 11 products, 33 offers, **20 measured UID
items**, one paid/refunded order and line, 18 finance events, 16 journals and 54
postings, 24 media assets/72 variants, one actual FFmpeg video, five immutable CMS
versions and five publications. Private dumps and per-row snapshots are not
published and are removed from owned temporary resources.

## Bounded defects and preserved authorities

| Defect | Correction / proof |
| --- | --- |
| Separate native Vendor variant endpoint disclosed private or unmapped masters and counts | Reuses the original native GET after appending canonical allowed Product IDs; tests private/public results, fields, OR filters and pagination. |
| Deactivated native Member retained commerce access with an existing bearer | Fresh native membership checks require installed `member.is_active`; five generic/DIDAR reads deny immediately, and reactivation restores legitimate reads. This is native-surface revocation, not a claim of globally merged credentials. |
| Native public Store API exposed a DIDAR-private published projection | Original native list/detail handlers are narrowed for DIDAR-linked private or tagged orphan projections. Genuine canonical-public and untagged native-only products retain original native behavior. No writer is added. |
| Product compensation could publish an unapproved original after canonical write failure | Restored native status now uses the same three approval flags as forward projection. Real fixture-scoped PostgreSQL trigger failure returns an error, keeps the canonical fingerprint and restores native draft/title. **Crash-atomicity is not solved by this predicate fix.** |
| Image fetch/decode failure lacked terminal fallback; a changed private source/context could reuse old bytes | Request state is keyed by source and actual auth header values; cancellation suppresses stale results, object URLs are revoked, and fetch/decode errors produce an accessible Persian placeholder. CMS browser evidence distinguishes actual network responses from lazy-image test timing. |
| Original native shell lacked private-preview search-index metadata | Both original panel HTML entries carry `noindex,nofollow`; actual authenticated Admin/Vendor browser journeys assert it. This is indexing hygiene, not a replacement for authentication. |

All fixes stay in the existing native modules/adapters and shared UI. DIDAR
Product/Offer/UID/reservation/order/customer/pricing/ledger histories retain
their current writers. There are no new migrations or business tables; existing
additive migrations are replayed and verified. Native same-supplier managed
launch, progressive grants, commercial suspension versus editor disablement,
lawful historical reads and legacy enforcement remain covered by real native
HTTP/browser regressions.

## Reports and decision boundary

- [Persian consolidated handoff](../../docs/audits/PRE_ROLLOUT_HANDOFF_FA.md).
- [Reconciliation and NO-ROLLOUT precedence](../../docs/audits/PRE_ROLLOUT_RECONCILIATION.md).
- [Native capability / authority / reuse matrix, projection and economic alternatives](../../docs/audits/PRE_ROLLOUT_AUTHORITY_MATRIX.md).
- [Independent authorization](../../docs/audits/PRE_ROLLOUT_AUTHORIZATION.md), [CMS/native UI](../../docs/audits/PRE_ROLLOUT_CMS_UI.md), [runtime](../../docs/audits/PRE_ROLLOUT_RUNTIME.md).

Original Issue #13 receipts are historical developer evidence; the reviewer
results above were newly executed by separate agents. Local Linux verification
does not attest the owner server, current deployed SHA, public proxy, licensed
commercial CMS content, Mac/hardware, legal/tax approval or live financial
providers. The older pinned rollout script was inspected only and was not run.
Issues #13/#14 stay open. Stop for Chief Architect review.
