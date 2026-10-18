# Issue 23 — independent access, privacy and HTTP threat assessment

Reviewer: `issue18_independent_acceptance` (independent of the implementation lane).
Assessment baseline: `41d880a5dd4c2462144f52b1591576882238d125`.
Status: independent baseline defects reproduced; selected native actual-target correction PASS at `fa03ac3e5a91ec393d57bae0ac7ee2a0aff05782`. Overall next dependent financial/customer packet remains BLOCKED by open authentication P1s and its contracts. This is not PRODUCTION_READY.

## Governing sources and inherited evidence

Read Issue 23 including comment 6245470196, PR 22 at `cf2fc25692ea6fe0d2e5c3a6c364f3e901195802`, Chief PR 20 final review 5561363686, AGENTS.md, native-panel architecture and version-matched Mercur documentation index. The actual accepted candidate supersedes c82 for this mission. Existing Issue 18 acceptance is inherited, including controlled 32-browser completion and unchanged source/output/test parity; unchanged suites have not been rerun for this assessment.

This report assesses enabled native Admin/Vendor and customer surfaces and their DIDAR adapters. It does not treat disabled live providers, cross-supplier resale, statutory invoice certification, distributed runtime or owner Mac/hardware evidence as new defects in a bounded local capability.

## Threat and trust boundaries inspected

Anonymous HTTP clients can call customer proxy and backend authentication. Customer/supplier bearer sessions and native user/member authentication are separate proofs, joined only by the server-maintained identity adapter. A selected native seller, browser-supplied supplier ID, store cookie or client role is not commercial authority. Supplier users/staff must not acquire another merchant's records, DIDAR acquisition cost, private media or customer personal data. Financial economic authority remains original immutable business events and balanced postings, with role/invoice projections derived from accepted snapshots.

Security applicability follows OWASP ASVS 5.0 topic families for authentication/session management, authorization, input/file validation, communication and configuration. This is a scoped source assessment, not complete ASVS certification; no unsupported individual control compliance is claimed.

## Findings and final disposition

| ID | Severity and affected enabled capability | Source evidence | Evidence status and proposed disposition |
| --- | --- | --- | --- |
| NATIVE-01 | P1: native Admin can mutate a linked DIDAR projection through a forged unrelated parent | `nativeProductGuard` only checks the URL parent. Installed Medusa variant DELETE and batch DELETE use the referenced variant ID without enforcing its product parent. | REPRODUCED: ordinary linked-parent DELETE409, forged valid unrelated-parent DELETE200 and actual linked variant soft deletion; same for batch second target. Canonical Product/Offer/UID/order/financial counts unchanged. Selected bounded batch corrected and independently verified at fa03ac3; see final receipt below. |
| SEC-01 | P1: a shared customer-proxy auth bucket permits unauthenticated denial of customer login/registration | `apps/storefront/src/app/api/didar/[action]/route.ts` constructs upstream headers without authenticated client-network attribution. `packages/api/src/didar/service.ts:153` keys persistent aggregate auth limit by `req.ip`, caps at 200/15 minutes and performs that check before credential validation. Distinct browsers routed through the same Next server normally reach Medusa from its shared address. | REPRODUCED on accepted production artifacts: 200 anonymous invalid-account attempts via Next return 401, then a separately valid customer returns 429 (200 before exhaustion). See SEC01 receipt below. Do not solve by trusting arbitrary caller X-Forwarded-For. Bound abuse while preserving legitimate distinct client access and explicit topology. |
| SEC-02 | P1: direct API auth throttling can be bypassed by spoofing the forwarded address | Pinned framework `packages/api/node_modules/@medusajs/framework/dist/http/express-loader.js` sets Express `trust proxy` to 1. Legacy limiter consumes `req.ip` with no application override; direct caller can supply varying rightmost X-Forwarded-For. | REPRODUCED: 21 requests with rotating spoofed XFF all return 401 and create 42 buckets; the same address returns 429 on attempt 21. Same bounded authentication trust boundary as SEC-01; production proxy/CDN topology is NOT_VERIFIED. |
| SEC-04 | P2: password input is trimmed instead of verified exactly as received | `service.ts` uses `text(b.password,128)`, whose return value is `trim()`, before registration hashing and credential verification. | SOURCE_CONFIRMED discrepancy with ASVS5.0.0 6.2.8; outside selected correction. No account-compromise claim. |
| SEC-03 | P2 / release prerequisite: no application-native auth throttle found | App `api/middlewares.ts` registers Admin/Vendor/DIDAR guards but none on `/auth/*`; pinned Medusa `api/auth/[actor_type]/[auth_provider]/route.js` directly calls authenticate. | Source inspection only. No brute-force exploitation or bounded latency/capacity experiment performed; target-host ingress controls NOT_VERIFIED. Do not imply account compromise. |

No P0 was established. NATIVE-01 was selected and corrected as one coherent batch. SEC01/02 are independently reproduced OPEN P1s, not fixed or implicitly accepted; they block their dependent enabled authentication/customer capability and release. The table separates executed evidence from source-only hypotheses.

## Inspected controls and practical limits

| Boundary | Inspected source behavior | Evidence status / limitation |
| --- | --- | --- |
| Canonical password/session lifecycle | `auth.ts` uses random salt + scrypt, timing-safe comparison and SHA-256 session-token lookup; `service.ts` issues random 32-byte tokens, 12-hour expiry, serializes five-session retention, deletes logout token. Demo identities require explicit local environment. | SOURCE_INSPECTED; Issue 18 identity/access evidence inherited. Password recovery/MFA policy and target deployment secrets not newly tested. |
| Native identity and authorization | `native.ts` validates actor type, active membership/selected seller and canonical linked identity, then ranks resolved native rights before invoking canonical services; WeakMap native context is server-only. `didar-permissions/service.ts` intersects explicit ACL with role and canonical grants and fails closed on absent ACL schema. | SOURCE_INSPECTED; existing RBAC/tenant tests inherited. Concurrent actor revocation already admitted in-flight mutations requires explicit transaction-boundary assessment; not yet asserted safe. |
| Suspended supplier | `requireUser` / `native.ts` deny commercial operations after supplier/native lifecycle suspension; narrowly allow own historical/invoice GET paths. `supplier-history.ts` excludes address/customer contact and scopes paid lines/balances to supplier. | SOURCE_INSPECTED and inherited acceptance, not new execution. |
| Private media/uploads | Product photos use strict canonical base64/magic/decoded dimensions, WebP normalization stripping EXIF, timeout and process concurrency cap; video uses private temporary directory, argument-array spawn (no shell), no network protocols, stream/duration/dimension/size limits and bounded processing. Serving checks current authorized owner or approved scoped public SQL visibility, not a client-supplied filename. | SOURCE_INSPECTED. Legacy Admin-only raw image intake has lower normalization guarantees; no confirmed exploit identified. Public native generic uploads and target storage ACL require authority reviewer assessment. |
| Financial responses | `financeRead` scopes supplier rows and removes cost/allocation/internal snapshots; procurement facts remove costs/commands; ledger only exposes own party balances; Tahesab supplier output strips complete payload and returns merchant statement; invoices check own actor plus current store-origin context. | SOURCE_INSPECTED; prior actual cost/role privacy evidence inherited. No blanket guarantee for all possible future snapshot keys. |
| Financial transaction boundary | Checkout/payment lock order, accepted-role checks and recognized events remain original authorities; write flows use shared financial lock, persistent commands and balanced journals. No separate payment/UID/ledger writer was introduced by this assessment. | Existing exact-unit/race/retry/fault evidence inherited. Provider calls inside transaction remain sandbox only; do not extend that evidence to live capture/reconciliation or multi-instance topology. |
| CORS / CSRF | Frontend uses explicit bearer auth for DIDAR writes; context cookies do not grant identity. Proxy rejects foreign Origin on cookie-context mutation operations. Pinned framework production/staging session cookies use Secure + SameSite=Lax (dependency patch already present); backend CORS comes from configured origins. | SOURCE_INSPECTED. Actual deployed origins, HTTPS, ingress trust and same-site hostile-subdomain threat NOT_VERIFIED. No new CSRF bypass established. |
| Output safety | Customer CSP disables objects/framing and limits connections; React templates escape content; no dangerous HTML/eval sink found in inspected app components. | Scoped search/source inspection only, not full XSS certification. Inline script policy remains broader than a nonce policy; P2 hardening opportunity, not an invented P1. |

## Historical baseline authentication execution

Read-only source retrieval and the authorized independent auth baseline probe executed. Run `baseline-20261018041106967` used a new owned loopback PostgreSQL17/Redis7 pair and copies of the accepted production API/Next outputs. Ordinary fresh migration/demo setup was executed, without full suites, native-QA seed, rebuild or dependency installation.

- [SEC01 real proxy lockout evidence](../../../verification/issue23/reviewer/runs/baseline-20261018041106967/SEC01-shared-proxy-lockout.json).
- [SEC02 real spoofed-address evidence](../../../verification/issue23/reviewer/runs/baseline-20261018041106967/SEC02-spoofed-forwarded-ip.json).
- [Original/copy source/output/test parity](../../../verification/issue23/reviewer/runs/baseline-20261018041106967/parity.json): accepted source5b6693, output636397, 50 tests ced148 unchanged.
- [Actual wrapper child close](../../../verification/issue23/reviewer/runs/baseline-20261018041106967/runner-observed-exit.json): exit0, no signal, independently observed; [runner result](../../../verification/issue23/reviewer/runs/baseline-20261018041106967/runner-result.json) means defects reproduced, not security PASS.
- [Owned cleanup](../../../verification/issue23/reviewer/runs/baseline-20261018041106967/cleanup.json): exact owned services/volumes/process groups removed and all10 preexisting containers preserved.

That historical authentication baseline executed no browsers, external providers or capacity experiment. Root subsequently selected the coherent NATIVE-01 correction; its independent affected verification and actual browser results are recorded below. The independent reviewer authored no application fix.

## Independent native authority baseline proof

Run `native-baseline-20261018041432786` independently corroborated the Core reviewer's source finding with real native Admin authentication, original native product-create HTTP and two destructive calls affecting only disposable derived projections. No canonical Product/Offer/UID/order/financial fact was changed.

- [Actual target and before/after PostgreSQL evidence](../../../verification/issue23/reviewer/runs/native-baseline-20261018041432786/NATIVE01-actual-variant-target.json).
- [Unchanged accepted source/output/test parity](../../../verification/issue23/reviewer/runs/native-baseline-20261018041432786/parity.json).
- [Actual independently observed wrapper exit0](../../../verification/issue23/reviewer/runs/native-baseline-20261018041432786/runner-observed-exit.json) and [owned cleanup/protected10](../../../verification/issue23/reviewer/runs/native-baseline-20261018041432786/cleanup.json).

Two earlier disposable fixture attempts (`native-baseline-20261018041251171` and `native-baseline-20261018041342338`) legitimately returned400 during unrelated-native-product setup, before target mutation. Those failures, actual exit1 and successful cleanup/parity are retained honestly. The successful fixture used the supported minimal title/status native Product DTO; no application validation or assertion was weakened.

NATIVE-01 is a confirmed failure of the existing projection mutation boundary. It does not prove canonical gold inventory/ledger corruption or unauthenticated access. The bounded correction should inspect the actual referenced variants/options/inventory targets rather than trusting a URL parent, retain native RBAC and preserve valid unrelated native workflows. Auth SEC01/02 remain separate confirmed exposure/availability findings; choosing one coherent batch must not relabel those as fixed.

## Final selected-correction acceptance

**PASS for the bounded direct native Product/option actual-target correction**, implementation candidate `fa03ac3e5a91ec393d57bae0ac7ee2a0aff05782` (parent accepted baseline `41d880a5dd4c2462144f52b1591576882238d125`). The independent reviewer authored no application code. Root implemented `native-product-guard.ts`, `native-product-targets.ts` and its middleware binding using original native read-query relationships and before-workflow rejection. It adds no commerce identity, projection writer, economic mutation, database authority or replacement panel.

Final affected run: **`correction-20261018042135715`**.

| Executed evidence | Actual result | Receipt |
| --- | --- | --- |
| Implementer's new persistent HTTP regression file, independently executed | 6 tests PASS, 0 failures, 23 Bun expect calls; actual process exit0 | [log](../../../verification/issue23/reviewer/runs/correction-20261018042135715/persistent-target-regressions.log), [actual exit](../../../verification/issue23/reviewer/runs/correction-20261018042135715/persistent-target-regressions-exit.json) |
| Separate reviewer-owned real native HTTP/PostgreSQL matrix | 23 named cases PASS; Node assertions were not counted as Bun assertions | [independent per-case/fingerprint receipt](../../../verification/issue23/reviewer/runs/correction-20261018042135715/independent-http-results.json) |
| Actual native Admin, native Vendor and B2C Customer browser smoke | Three authenticated journeys PASS, zero page errors; 1440px and390px screenshots for each | [browser receipt](../../../verification/issue23/reviewer/runs/correction-20261018042135715/independent-browser-smoke.json), [actual browser-process exit0](../../../verification/issue23/reviewer/runs/correction-20261018042135715/independent-browser-smoke-exit.json) |
| Final original and copied application/test/artifact parity | PASS; 51 test files including new persistent regression, original50 remain unchanged | [parity](../../../verification/issue23/reviewer/runs/correction-20261018042135715/parity.json) |
| Actual wrapper completion and exact owned cleanup | Wrapper exit0/no signal independently observed; six process groups empty; exact owned two containers/volumes removed; all10 preexisting containers preserved | [observed exit](../../../verification/issue23/reviewer/runs/correction-20261018042135715/runner-observed-exit.json), [cleanup](../../../verification/issue23/reviewer/runs/correction-20261018042135715/cleanup.json) |

The independent23 include protected URL and forged-parent single/batch deletion; mixed native/protected batches without partial changes; a protected target after25 unrelated variants; `body.id` selector redirection; an actual option shared by unrelated and DIDAR products plus option-value and association routes; three image/variant association directions; direct and mixed inventory links; unauthenticated401, READ_ONLY403, native member/Admin actor separation and foreign seller403; and positive unrelated native Product/variant update, inventory linking and variant deletion. Every denied mutation preserves recorded canonical Product/Offer/UID/order/financial fingerprints and protected native variant/option/value/image records. Synthetic shared-option/image references were set up only inside owned QA with explicit SQL; all attempted mutations were real native HTTP.

The browser journeys perform actual native sign-in and selected seller navigation to `/dashboard/didar` and `/seller/didar`, then customer sign-in/account and public canonical PDP. These are affected rendering/access smoke tests, not a fresh complete order/finance acceptance matrix. The original accepted economic tests remain inherited. Canonical editor-to-internal native projection workflow behavior is source-inspected and inherited, not freshly mutated in this matrix.

Production parity for this changed backend:

- Source SHA-256: `cb75fd84eee02112c1ed08963102247c9b2a4ce565595df8b35c57a6de6cf140`.
- Complete outputs SHA-256: `518792fe0780c430b55c78ef4cfc3fb194c15ca98ebc4922a903300f2634ba34`.
- All51 frozen test-source aggregate: `d5388273d68cf0670ed5c05c84b6d357f270add476eed790feb6120102ca4596`.
- All1790 initially copied compiled files stayed byte-identical; no runtime upload additions.
- Four independently executed reviewer source hashes are recorded and rechecked in final parity. Native Admin/Vendor and storefront artifacts were reused unchanged; backend was rebuilt by root before this independent run.

[Admin desktop](../../../verification/issue23/reviewer/runs/correction-20261018042135715/screenshots/native-admin-product-authority-1440.png), [Vendor mobile](../../../verification/issue23/reviewer/runs/correction-20261018042135715/screenshots/native-vendor-own-catalog-390.png), [Customer mobile](../../../verification/issue23/reviewer/runs/correction-20261018042135715/screenshots/customer-pdp-authority-390.png) were directly inspected by this reviewer. They show the actual RTL native panels/customer PDP; the existing seed's absent product photo remains an honest placeholder. All six images are indexed in the browser receipt.

The first correction run `correction-20261018042015145` passed the same6/23expect and23HTTP cases but its reviewer browser launcher used the wrong environment and selected an unavailable cached Chromium. It records actual wrapper1, parity/cleanupPASS and was not relabeled successful. The final harness passes the explicit owned system-Chromium options and independently observes the browser child process/group. No application change or test assertion weakening was required.

### Residual decision

Native import/import-confirm asynchronous writes, pending ProductChange confirmation, independent native price/inventory authorities and preexisting malformed cross-product image associations are not universally certified by this direct-route guard. Source hotspots are tracked by the separate Core reviewer; no unexecuted import exploit is labeled a reproduced P1 here. Newly applied authorization cannot retroactively cancel every admitted in-flight transaction without an explicit revocation contract.

OPEN SEC01/02 require their own bounded trustworthy authentication/ingress design and affected verification; silently trusting client XFF is not a correction. The selected fix PASS does not mean READY_FOR_NEXT_PACKET for dependent S1 or production acceptance. Existing business/ADR prerequisites, live legal/provider, distributed topology, owner Mac/hardware and rollout gates remain explicit. No unchanged full backend/tooling/Jest/G4/restore program was repeated, and no merge, owner change, provider call or Phase5 implementation occurred.

## Pinned applicable ASVS requirements

The reviewer retrieved the actual ASVS **v5.0.0** release chapters after runtime completion; [source URLs and Git blob hashes](../../../verification/issue23/reviewer/ASVS_SOURCE_PINS.json) pin the requirements. This is a scoped control mapping, not certification of an ASVS level or every requirement in those chapters.

| ASVS5.0.0 requirement | Applicable reviewed behavior | Disposition |
| --- | --- | --- |
| 8.2.1 explicit function permission;8.2.2 object authorization;8.3.1 trusted service enforcement | Direct native mutation resolves referenced variants, options/values and images to actual protected Product owners before workflows; native ACL is still enforced | Selected route subset PASS via independent23 actualHTTP cases and six persistent regressions at fa03ac3. Import/pending-change/other writers remain outside that bounded PASS. |
| 8.4.1 cross-tenant controls | Own selected merchant permission and foreign seller rejection | New selected-seller rejection PASS; wider private catalog/media/invoice cases inherited from accepted Issue18, not newly rerun. |
| 8.1.2 /8.2.3 field restrictions | Supplier financial response costs/internal allocation and customer/contact filtering | SOURCE_INSPECTED and inherited specific privacy tests. Complete future-field/global endpoint compliance NOT_VERIFIED. |
| 8.3.2 immediate authorization change | Fresh role/lifecycle checks exist, but already admitted in-flight transactions need an explicit revocation contract | NOT_VERIFIED for complete concurrency/revocation guarantee; no invented exploit severity. |
| 6.1.1 rate-limit design must prevent malicious lockout;6.3.1 implemented brute-force defenses | Shared proxy IP lockout and spoofable account/IP key | FAIL independently reproduced in SEC01/02; remain OPEN P1. |
| 6.1.3 /6.3.4 consistent authentication pathways | Native user/member and canonical customer/supplier sessions use distinct native/canonical handlers | Source-inspected path map; complete abuse-control parity NOT_VERIFIED (SEC03). |
| 6.2.8 password verified exactly as received | `service.ts` passes password through `text`, which trims whitespace before both registration hashing and login verification | Source-confirmed limited discrepancy, tracked P2 (SEC04); no authentication bypass/account compromise claimed and no change included in the selected batch. |
| 7.2.1 backend verification;7.2.3 reference-token entropy;7.3.2 absolute lifetime;7.4.1 logout invalidation | Canonical tokens are random32bytes, hashed-at-rest,12-hour database-validated references and explicitly deleted by logout | SOURCE_INSPECTED plus inherited sessions evidence, not a new whole-native/JWT/session-lifecycle certification. Timeout risk rationale, cross-auth-path termination and operator/session controls remain NOT_VERIFIED. |
| 5.2.1 processable size;5.2.2 type/content validation;5.2.6 decoded-pixel limit;5.3.2 trusted file paths | Canonical photo/video normalization, magic/decoded bounds, generated private paths and no arbitrary URL/file paths | SOURCE_INSPECTED plus inherited canonical media checks. No new saturation/AV proof or blanket native-generic/legacy-image compliance. |

No ASVS control gap was silently turned into a requirement to add future MFA, recovery, upload processing or financial features in this bounded correction. The release security profile and its remaining applicable controls require their own accepted scope and evidence.
