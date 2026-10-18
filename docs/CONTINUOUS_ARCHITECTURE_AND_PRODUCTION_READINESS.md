# Continuous Architecture and Production Readiness
Owner-directed governing addendum — 2026-10-18

## Decision and precedence
Functional test success does not establish complete architecture compliance or production readiness. Architecture review and production engineering are independent, continuous roadmap workstreams.

This addendum overrides any reading of ROADMAP_B2C_MERCHANT_GROWTH_CRM_CAMPAIGNS.md or EXECUTION_STRATEGY_V3_BUILD_FIRST.md that postpones technical architecture, security, reliability, or operational work until all features are complete. Preserve the owner's consolidated Mac acceptance preference: no mandatory owner Mac UAT after each phase. Technical verification continues throughout development.

Status: governing proposal published for review; no merge, deployment, or production certification is implied.

## Immediate execution order
1. Freeze new feature scope. Do not expand Issue #18, PR #20, or reopen its entire unchanged test program. Obtain its outstanding controlled browser-process exit/parity/cleanup receipt and assess the exact candidate SHA.
2. Start the baseline architecture/runtime assessment now, read-only against PR #20 candidate c82f1968616f8c38072d215d54403012a8c9fadc and relevant documented requirements. Identify source drift before using results for a newer candidate. This assessment does not need to wait for feature completion.
3. After bounded acceptance of #18 and identification of the integration base, implement a small, coherent batch of confirmed P0/P1 defects in an isolated branch. Deliver code, meaningful checks, independent review, and a traceable evidence report. Do not turn the first batch into a rewrite or an attempt to finish every future feature.
4. Resume the next existing vertical feature packet when that packet's prerequisites and relevant critical/major defects are resolved. Continue readiness work alongside it.
5. Before any staging or production rollout, separately accept the release-specific deployment gate. Existing rollout authorization limits remain in force.

Published issue or PR creation does not start a Codex execution session automatically.

## Three separate acceptance columns
Every delivery must report:
| Axis | Required conclusion |
| --- | --- |
| Functional | Which user behavior works, on which SHA, with which evidence and limitations |
| Architecture | Native reuse, data authority, dependency boundaries, isolation, and any explicitly accepted exception |
| Production readiness | Operational/security evidence for the enabled capability and target environment; unresolved prerequisites |

Use PASS, FAIL, NOT_VERIFIED, NOT_APPLICABLE, or BLOCKED with reasons. Unknown evidence cannot be recorded as PASS. A sandbox feature can pass its development gate while live payment or production deployment remains blocked. Neither test counts nor passing builds certify the entire platform.

## Architecture baseline
The exact historical five-layer agreement must be located or explicitly reconciled in an ADR before claiming full compliance. The following is a responsibility checklist, not a claim that the original five layer names have been recovered:
| Responsibility | Boundary to assess |
| --- | --- |
| Presentation | Native Admin/Vendor and customer surfaces consume authorized contracts; no independent commerce decisions |
| Transport and access | Input validation, authenticated actor/tenant context, response filtering; no trust in browser-supplied commercial authority |
| Application and workflows | Use cases, orchestration, authorization enforcement, transaction and retry boundaries |
| Domain | Commercial policy, agency versus own-account sale, ownership, pricing and financial invariants |
| Infrastructure and persistence | Database, queues, locks, provider adapters, media, external calls, and operational configuration |

Map these responsibilities to the actual pinned Medusa/Mercur extension mechanisms. Native framework conventions take precedence over an arbitrary new folder scheme. Assess request-aware service/agency paths and direct SQL hotspots; refactor only confirmed boundary defects with affected-behavior tests. Do not mandate a wholesale repository-pattern or microservices rewrite.

Medusa/Mercur remain the commerce foundation. Record authority for Product, UID, inventory, order, payment, identity, invoice, and ledger. Reuse and extend native modules/workflows/panels; do not create competing sources of truth. Product projections remain derived, repairable and access-controlled. Review actual native workflow failure paths, including audit completeness.

Business invariants already supplied by the owner:
- DIDAR acts as agent for another seller, issues invoices on that seller's behalf, collects funds and settles net of its entitlement. DIDAR is principal when it itself sells.
- Equivalent gold base fineness is 750.
- For in-person purchase confirmation, customer-account approval is primary; OTP is auxiliary. Seller records amount and invoice reference. Bind confirmation to the customer, seller, immutable purchase details, expiry and single-use semantics. A changed amount requires a new confirmation.
These policies require implementation evidence; documentation alone is not implementation or legal acceptance.

## Baseline assessment and bounded corrections
For each topic, distinguish inspected behavior from hypothesis. A checklist item is not proof of a defect.

| Topic | Evidence and correction scope |
| --- | --- |
| Access and privacy | Native and legacy authorization parity; tenant/store isolation; suspended membership; private catalog/media; financial response filtering; session/token lifecycle |
| Security | Threat model and pinned applicable OWASP ASVS requirements; input/output safety, uploads, CSRF where applicable, CORS, secret handling, abuse/rate limits, dependency and secret scans with actual results |
| Transaction integrity | Idempotency under retries and concurrent requests; durable outbox/replay; compensation; no duplicate allocation, capture, invoice, reward or ledger posting |
| Financial correctness | Agency/principal snapshots, balanced entries, receivable/payable and commission reconciliation, refund/reversal handling; no live wallet funding/withdrawal or external settlement until their own contracts and evidence pass |
| Runtime | Document supported topology; verify worker/queue/lock configuration actually used. Current isolated single-instance evidence does not prove distributed execution. Multi-instance use needs its own concurrency/failure proof |
| Data and recovery | Migration compatibility, restart/replay and restore; database sequences and identity preservation; media and database consistency; backup schedule, retention, access and restore drill |
| Observability | Correlation IDs, redacted logs, health/readiness, retry/terminal-job visibility, financial invariant and failed-provider alerts, actionable operator runbooks |
| Delivery | Reproducible pinned builds, immutable candidate identification, CI results, migration/rollback rehearsal and explicit source-to-artifact parity |
| Capacity | Representative bounded load tests, database locks/timeouts, pool/resource limits and backpressure for the intended topology; no unmeasured scalability claim |

Record intended SLOs, capacity, RPO and RTO and obtain business acceptance before production readiness is declared. Do not invent target values or claim the current isolated restore proves live-server backup compliance. Real provider credentials, external financial calls, owner-server mutations and distributed rollout remain outside this task's authorization.

## Severity and scope control
- P0: confirmed critical access exposure, loss/corruption or financial-integrity failure. Stop affected work and fix first.
- P1: confirmed major defect that blocks the next enabled capability or target release. Fix before that capability proceeds.
- P2/P3: tracked with impact, owner and disposition; schedule deliberately.
- NOT_VERIFIED: gather evidence; do not label as safe or automatically convert every unknown into a critical defect.

Future capability gaps such as an intentionally disabled external provider do not block unrelated isolated CRM development. They do block enabling that provider. Fundamental ownership/financial model changes require their ADR and business decision before implementation.

At most two active implementation lanes: one accepted feature packet and one bounded foundation/hardening packet. During the initial #18 closure, the second lane starts with read-only assessment. New ideas go to backlog with dependencies; they do not enlarge the active packet. A reviewer must distinguish remaining defects from newly requested features.

## Roadmap integration
| Point | Feature path | Architecture/readiness path |
| --- | --- | --- |
| Now | Close bounded #18 receipt; preserve existing safety fixes | Baseline assessment on pinned candidate |
| Next | Existing S0/S1 financial and authority prerequisites; select one usable vertical slice | First confirmed P0/P1 correction batch and integration verification |
| Following packets | Existing F3/F4 ownership and offer path, F1 incremental purchase, and phases 5–9 according to their dependency contracts | Per-packet boundary, privacy, transaction and operational checks |
| Campaigns and in-person F5 | Approved eligibility and reward ledger; account approval primary, OTP auxiliary | Concurrency, replay, incentive reversal, abuse and privacy evidence |
| Staging/release | Consolidated native Admin/Vendor/customer acceptance | Exact artifact/config proof, rollback/restore, observability, supported-topology and provider readiness |

Existing design packets remain the feature source; this document adds gates rather than silently renumbering phases or declaring their code complete. Do not add more feature-design packages before delivering the selected vertical slice unless an unresolved decision actually blocks it.

## Required receipt
For each reviewed requirement provide requirement/source → code path → exact SHA → test/evidence → status → limitation → responsible reviewer. Attach defect severity, affected capability, correction and verification. Distinguish source review, tests actually executed, inherited evidence, and target-host checks not performed.

Baseline completion requires an authority/dependency matrix, prioritized findings, one bounded implemented correction batch where confirmed defects exist, independent review, and the decision READY_FOR_NEXT_PACKET or BLOCKED with exact reasons. If no correction is justified, explicitly report that evidence rather than manufacture changes.

Production readiness requires a separate target-release decision after all applicable release gates pass. Do not use READY_FOR_NEXT_PACKET as PRODUCTION_READY. No automatic merge, issue closure, rollout, owner-server mutation or start of unrelated phases is authorized by this document.
