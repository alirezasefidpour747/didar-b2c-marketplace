# DIDAR B2C — Integrated design for Phases 5–9

Version 1.0 — 2026-10-17
Status: CHIEF ARCHITECT DESIGN BASELINE FOR REVIEW. Design only; no feature delivery or execution/rollout release is implied.
Mission: extend the existing Mercur/Medusa marketplace, preserving native workspaces and the current gold transaction authority.
Execution prerequisite: Issue #18 consolidated acceptance, then a phase-specific Chief Architect release. Do not start Phases 5–9 from this document alone.

## 1. Source, scope and evidence

Inspected main: 4e953c7cf62c327b92f4a461d776fc11c772a9fb.
Additional dependencies are UNMERGED PR #15 (bounded corrections), PR #16 (approved agency policy), PR #17 (CORE-03) and Issue #18 (integration implementation). Rebase this design against their accepted final outputs before implementation; do not presume their proposed fields already exist.

Read: current master roadmap, medusa-config.ts, packages/api/package.json, auth.ts, storefront.ts and storefront-schema.sql, sharing.ts and share-schema.sql, content-schema.sql, native-access.ts, didar-permissions/service.ts, merchant-profiles.ts, finance.ts, finance-ledger.ts, commerce.ts and tahesab.ts, and PR #15 authority/review evidence.

Installed manifest: Mercur core 2.3.7 and Medusa 2.21.2. Current inspected native panels are genuine Mercur SDK extensions. Current customer sessions resolve didar_user; scoped storefront and grants use existing supplier/business IDs. Orders already freeze origin_supplier_id, storefront_snapshot, share_page_id and share_visit_id. CMS already supports DIDAR_CAMPAIGN and MERCHANT_CAMPAIGN kinds. Existing share visits are NOT a complete consent or new reward attribution engine.

Public primary sources consulted for capability boundaries:
- https://docs.medusajs.com/resources/commerce-modules/customer — Customer and CustomerGroup capabilities.
- https://docs.medusajs.com/resources/commerce-modules/promotion — promotions, rules, campaign dates/budgets and cart/order discounts.
- https://docs.mercurjs.com/learn/architecture — modules/links, hooks, typed APIs, panel extensions.
These public pages establish capabilities, not equivalence of the local DIDAR transaction path. Before each phase, consult node_modules/@mercurjs/docs/llms.txt and installed code/types; record exact exports, module registration, native behavior and proof. No unsupported API signatures are prescribed here.

No completed tenant-aware CRM/consent/acquisition/referral implementation was established by the inspected application. This is a scoped finding, not a claim that no native module or installable block can help. Pre-phase native capability checks must catch reusable functionality before new domain storage is created.

## 2. Architecture decisions and alternatives

| Concern | Native/current capability | Selected approach | Prohibited shortcut |
| --- | --- | --- | --- |
| Customer identity | Medusa Customer/CustomerGroup; current DIDAR user/session and native actor bridge | Keep current canonical customer and stable history. Use explicit existing/proven mapping for a native widget/group where needed. Add relationships, not another account | New CRM customer account, auto-merging by email, new login |
| Seller/team | Mercur Seller/Member lifecycle; current business grants and native ACL | Reuse selected-seller resolution, real actor/target audit, least privilege | New merchant identity system or owner-full bypass |
| CRM relationship | Current own-order data; native customer fields/groups | Extend only for scoped relationship, consent, notes/tasks and activity. Prefer native list/detail widgets when safe; no unrestricted native customer API for Vendor | Copy global customer table into each store |
| Content campaigns | Existing share/page/version/publication/media/context | Extend the same records with campaign governance and participation; one render/publish path | Second campaign page builder or duplicate share URLs |
| Discounts | Medusa Promotion + promotional Campaign | Prefer native rules/budget management with one tested adapter into current quote/order. Prove applicability before enablement | Native cart/order just to use a coupon; second tax/price engine |
| Acquisition | Existing onboarding/product request actor/audit facts | Add lead/assignment/milestone relations only for missing lifecycle; source activation from real approval/publication/payment | Self-reported sales or agent owns customer/supplier identity |
| Rewards | Native commission/payout and current DIDAR ledger | Reuse native only for an equivalent entitlement. Track provisional non-cash benefits separately; financial recognition uses the ONE existing ledger | Generic payout discharging gold; new cash/gold reward wallet |
| Analytics | Existing orders, events, journals, shared context | Rebuildable scoped projections/aggregates from canonical facts | Analytics table becomes financial truth |
| Background work | Medusa hooks/subscribers/jobs; current local event/locking runtime | Native extension seams; durable transaction record/inbox/replay for critical cross-domain effects | In-memory event alone guarantees a reward or consent update |
| Operator UI | apps/admin and apps/vendor SDK | Native routes/widgets/navigation with typed clients | New Next /manage as final panel or iframe shell |

Native-first means equivalent functionality is reused. It does not mean replacing gold weights/UID/reservation/ledger with generic records. No source-of-truth switch is authorized.

### 2.1 New lifecycle storage

Conceptual domains: CRM (relationship/consent/activity), marketing (campaign/attribution), acquisition (agent/business lead), rewards (program/entitlement). Prefer supported Medusa modules and explicit links for genuinely new lifecycle domains; reuse the existing DIDAR service/migration seam where it already owns the lifecycle. The pre-phase design records each choice and dependency. Do not rewrite the historical SQL core merely to uniform its style. Routes remain thin validation/auth adapters; domain logic stays in services/workflows.

Use native generated client/route types and native SDK extension zones. Direct edits to framework tables are not the default integration API.

## 3. Economic roles and privacy — controlling rules

Owner policy: DIDAR is sale/invoice/collection agent for third-party sellers and principal for its own direct sales (ADR-BIZ-02/CORE-03). Use accepted Issue #18 seller/mode/mandate snapshots. Never infer legal seller from origin_supplier_id or display branding.

Maintain four independent dimensions:
1. actual seller/principal and invoice responsibility;
2. physical supplier/UID/custodian;
3. storefront/campaign origin and curator;
4. entitled marketing/referral beneficiary.

A seller's transaction relationship permits only its authorized sale data. A curator does not acquire customer contacts or all upstream seller orders because its page generated a click. A physical supplier receives fulfillment data only where the order/contract authorizes it. Customer marketing access requires a separate explicit scope/channel/purpose basis.

Marketing opt-out suppresses marketing; it does not erase mandatory order/invoice history or block necessary transactional notices. Recording registration or purchase is not blanket consent.

Scope decisions derive from authenticated actor + current selected business + active canonical capability + native ACL narrowing + object's scope. Native ACL remains surface-scoped; canonical business suspension and grant revocation remain effective in both native and legacy boundaries.

## 4. Shared data contracts

Names below are proposed concepts; reuse existing tables/links with equivalent semantics. Every new relation requires an AS-IS/gap rationale and additive migration. Store IDs, not copied Product/Customer/Order objects.

| Concept | Essential keys/facts | Constraint/authority |
| --- | --- | --- |
| Customer relationship | customer_id, business_scope_id, provenance, transaction/contact visibility basis, first/last related fact | Unique customer + business scope; source order/registration references; no global contact discovery |
| Consent event | customer, scope DIDAR or merchant, channel, purpose, decision, notice version, proof, occurred_at, recorded_at | Append-only evidence and unique intent; current permission derived with explicit withdrawal precedence |
| Contact preference/suppression | customer/scope/channel/purpose, revision, suppression reason | Recheck at export/dispatch; global platform marketing suppression dominates scoped marketing permission |
| CRM note/task | relationship ID, scoped author, content/status/due date, revision | Private to authorized business; audit edits; never customer-global notes |
| Relationship activity | source_type/id/revision, relationship, minimal event summary | Rebuildable, unique source occurrence; no financial authority |
| Campaign | owner scope, governance state, content page/share references, schedule/timezone, participation policy | Links original page/version; no rival/global leakage |
| Campaign participation | campaign + business/eligible Offer scope, approval/version/revocation | Explicit grant; unpublished/private stock never promoted by default |
| Touch/attribution | opaque token digest, server-validated scope, campaign/share source, time, consent basis | No PII or bearer in URL; untrusted raw tracking never creates commission |
| Accepted order attribution | order/line, seller/store/campaign/touch/rule versions | Frozen when accepted; financial qualification waits for verified canonical facts |
| Business lead | business name/contact/evidence, source, owner assignment | Separate prospective business record, NOT a synthetic user/seller/customer |
| Agent assignment | existing actor, lead/merchant, acquisition/assistance role, effective interval | Single approved acquisition owner per defined interval; correction with reason/history |
| Milestone | assignment, kind, canonical source/id/revision | Unique source milestone; no reward from a claimed click/sale |
| Reward rule | program kind/scope/payer, basis, beneficiary, caps, windows, version, approvals | Immutable approved versions; inactive until configured |
| Reward entitlement | rule/source/order allocation, beneficiary, amount/instrument/benefit type, state | One entitlement per program/rule/beneficiary/source unit; append-only transitions/reversal |
| Audience snapshot | campaign + predicate version + relationship IDs + snapshot time | Snapshot is targeting evidence, not perpetual consent; revalidate current access |
| Operational job/inbox | source ID/revision, consumer, status/lease/retry | At-least-once delivery, idempotent effect; no false exactly-once claim |

Transactions/unique constraints enforce race safety. Money is integer IRR; gold uses existing fine-gold integer unit. JSON transports exact large values as strings. Do not use floating-point monetary percentages or silently mix grams and fine micrograms.

## 5. Shared event and recovery contract

Reuse current appendEvent/finance events, order/return records, approvals and media/content facts. No second authoritative sale/refund event.

Proposed adapter envelope: event_id, schema_version, source_type, source_id, source_revision, occurred_at, recorded_at, business_scope_ids, correlation/causation, minimal payload and payload fingerprint.

- Record durable domain effect/outbox in the SAME transaction as its DIDAR source fact where possible.
- Native hooks/events may notify workers; notifications do not replace durable source/reconciliation.
- Consumer inbox uniqueness (consumer, source event, revision); transactional read-update-write; bounded retries, owned leases, visible terminal errors.
- Suppression, current authorization, schedule and quote eligibility are enforced synchronously. A delayed worker cannot permit an expired campaign or withdrawn contact.
- A crashed sale consumer can replay from canonical facts. Refund arriving before delayed sale processing must converge to the correct net entitlement; never recreate a reversed reward.
- Store current projection and source checkpoint separately; run a bounded repair command/dry-run report. Repair never reissues payments or changes historical orders.
- Respect existing finance lock order. Any transaction spanning a new module and current pg client must document actual commit boundaries; compensate/reconcile across stores, not claim cross-service atomicity.
- Single API/worker configuration until actual distributed providers/locking are verified; Redis being present is not proof.

## 6. Phase 5 — CRM Lite

### Outcome
One customer account can buy from A and B. Each seller sees only its lawful own relationship/order information; DIDAR sees role-authorized central relationships. Each customer controls own marketing preferences.

### Vertical slices
5.1 Native Admin CRM and business-scoped Vendor CRM lists, masked search, pagination and relationship detail.
5.2 Source-linked relationships from explicit scoped registration/opt-in and accepted sale events; no contact relationship from anonymous view.
5.3 Notes, status, tags, tasks and source-derived activity. Basic segments: paid count, last related order, new/repeat and contact-permitted customers.
5.4 Customer preference center, channel/scope consent proof and withdrawal; exports separately permissioned, audited and expiring.
5.5 Privacy/admin retention request workflow, safe anonymization where permitted; protected invoice/financial facts preserved.

Do not create customers from a merchant's arbitrary phone/email import. Unknown contacts need an explicitly designed consented prospect path and cannot reveal whether a global account exists.

### UI/API contracts
Native Admin /dashboard/didar/crm and /crm/:relationshipId; native Vendor /seller/didar/crm and own detail; customer account preferences under the existing locale-aware account shell.
Admin /admin/didar/crm/*; Vendor /vendor/didar/crm/*; customer preferences via the existing authenticated DIDAR customer API convention, finalized in route inventory.
Capabilities: crm.read, crm.contact.read, crm.notes.edit, crm.tasks.edit, crm.export, crm.preferences.review (explicit; global authority never inherited from Vendor).
Admin on-behalf actions name target business and real staff actor. Grant changes affect direct API, list/count, exports and background jobs.

Responses project allowed profile/order fields; Vendor cannot pass arbitrary customer fields/relations. Reject guessed unrelated IDs uniformly. Exports are explicit-column datasets, row/byte bounded, short-lived and audited; download rechecks actor permission and invalidates on revocation. No exported raw global user table.

### Gate P5
Same customer buys A and B; independent native sessions see correct isolated orders/notes/contact fields. Curator C sees only permitted attribution aggregates without contact absent consent. Withdrawal immediately removes marketing audience/export eligibility, with mandatory own invoice retained. Server-side ID/count/search/export attacks fail. Restart/replay does not duplicate relationships.

## 7. Phase 6 — Governed campaigns

### Outcome
DIDAR or a merchant creates, reviews, schedules and shares a campaign using the existing Visual CMS and selected-product system, with verified conversion attribution.

### Selected reuse
didar_share_page/product/visit remain basic share identities; existing links and order share references remain valid. didar_content_page/version/publication remains layout and publication authority, including existing campaign kinds. New campaign records coordinate purpose/audience/participation/attribution; do not duplicate content blocks or publish state.

Campaign governance: draft → review → approved; publish/schedule uses existing content publication. Pause/expiry is a gate overlay, not an alternative renderer. Derive public visibility from campaign approval AND live CMS publication AND business/Offer/mandate/media eligibility. Editing creates a new version; no approved layout overwrite.

### Promotions vs marketing
A marketing campaign can be content-only. A Medusa promotional Campaign groups discounts/rules/budgets; it is not the existing editorial page.
Before enabling incentives, prove installed Promotion evaluation/rules/budget can operate with current DIDAR quote/order without native duplicate carts/orders or undisclosed discount.
Use native rules and linked promotion IDs when equivalent. Any unsupported gold pricing semantics requires an explicit adapter/gap record, not a copied general discount engine.
Initial content-only campaigns work independently; price-discount functionality remains disabled until adapter acceptance.

### Attribution and timing
Keep existing seven-day share-visit lifetime as compatibility behavior. New campaign attribution policy must be versioned and explicit; do not retroactively reclassify old share orders.
Proposed engineering baseline: latest valid same-scope first-party campaign touch before order acceptance within its configured window; automated previews/bots excluded from conversion qualification. Preserve acquisition owner and customer-referral attribution as separate dimensions.
Snapshot accepted attribution; a later visit, query parameter or payment callback cannot replace it. Order-line allocation uses actual role snapshot, not order origin alone.
No cross-device identity matching by fingerprint; report unattributed conversions honestly.

### Scope/public UX
Merchant campaign stays within validated merchant context through login, quote, checkout and history. Global campaign exposes only approved public participation; private modes require explicit consented eligibility and an authorized entry path, never a global leakage exception.
Unknown/unavailable items show truthful state; no rival replacement or duplicated UID.
Public routes extend existing /m/{handle} share/campaign routes and locale policy; old URLs remain. Resolve aliases to the SAME content/share ID. OpenGraph uses permitted current public/authorized preview metadata; no contact tokens/PII.
Manual copy/Web Share/WhatsApp/Telegram/SMS compose does not constitute an automatic send. No external sending is performed.

### UI/API
/dashboard/didar/campaigns; /seller/didar/campaigns. Extend /admin/didar/campaigns/* and /vendor/didar/campaigns/*; public reads use existing scoped content API.
Capabilities: campaign.read/edit/review/publish, campaign.audience, campaign.analytics; publication also requires underlying CMS rights and target authority. Vendor cannot global-publish through a campaign route.

### Gate P6
A campaign → registration → exact scoped purchase preserves seller/store/campaign facts; B/private Offer never appears. Global campaign opt-in/revocation and pause/expiry work at HTTP boundaries. CMS rollback, media revocation, link replay/bot visits and stale quote cases pass. Content-only requires no new promotion/cart. Discount proof, if included, preserves gold/tax/fee and one order/reservation/ledger.

## 8. Phase 7 — Agent acquisition and provisional rewards

### Outcome
DIDAR knows who sourced a business, who assisted onboarding/product upload, when activation happened, and what qualified reward may be owed under an approved rule.

### Model and authority
Marketing agent is an assignment/capability of an existing proven actor; do not widen didar_user.role for every endpoint or create a second person.
Separate lead lifecycle: recorded → assigned → contacted/visited → qualified → linked to registered business → approved → activated. Actual business approval/publication/payment source milestones control activation; a lead flag cannot grant selling rights.
Visits contain declared date/region/outcome and optional authorized evidence; no continuous GPS. Potential duplicate business leads enter reconciliation; do not auto-merge registered Sellers by phone/name.
Acquisition owner and assisting content uploader are different roles; effective assignment and corrections are audited. Historical attribution is frozen to its agreed interval.

### Reward basis
Agent reward may use approved milestone or share of eligible DIDAR recognized revenue, NEVER gold GMV, whole customer collection, supplier liability or refundable VAT.
Derive eligible DIDAR components from accepted mode/contract and financial journal source facts from Issue #18. Explicit account/component mapping excludes pass-through charges and other parties. Reports label recognized revenue vs estimated contribution margin; do not call an unconfigured estimate net profit.
A rule requiring cost-net revenue remains provisional/blocked until its cost allocation is defined; no guessed net amount.
No actual reward payable/payout without approved rule, hold window and finance action.

### Lifecycle
Candidate fact → pending hold → eligible → approved entitlement; partial/full reversal is an appended event. Approval is not cash payment. Rules and rates immutable/versioned; budgets/caps reserved under lock; competing workers cannot double accrue.
Agent may view own qualified metrics, not all customers, seller contracts, rival leads or full journals. Staff admin sees authorized team view. Own commission calculation cannot self-approve.

### UI/API
Native Admin /dashboard/didar/acquisition, /agents and /rewards; agent view is a permission-limited page INSIDE native Admin, without granting broad Admin rights. Vendor sees only explicitly permitted acquisition relationship, not other agent pipeline.
If current native actor bridge cannot represent that least-privilege role, extend its explicit grant resolution; do not give full Admin or create a new app.
Admin APIs under /admin/didar/acquisition/* and /rewards/*; field visits and assignments audited. Review native equivalent commission rules as reusable only if beneficiary/basis/scope match.

### Gate P7
Two agents encounter same lead; one approved acquisition assignment, another assistance attribution. Real publication/paid/refunded facts update metrics once. Replayed events, assignment corrections, worker restart and partial refund cannot double reward. Payer/rate/cap/hold absent means no award. Cross-agent reads/count/export denied. No money/gold issued.

## 9. Phase 8 — Customer referral

### Outcome
Existing customer invites a new customer to an approved merchant program; a genuinely qualified purchase creates one scoped benefit after the required hold, reversible on refund.

### Separation
CUSTOMER_REFERRAL is a different program, beneficiary and payer from AGENT_ACQUISITION. Shared token/event/entitlement infrastructure is reused. Never treat native seller commission as customer referral without equivalence.
Programs default OFF until merchant + DIDAR approval, explicit benefit/discount basis, caps, expiry, payer and refund rule.

### Qualification and privacy
Engineering baseline: new-to-that-merchant means no prior qualifying paid purchase with the ACTUAL program seller before invite acceptance; an existing global DIDAR customer may qualify if rule explicitly uses this definition. A "new-to-platform" rule must be separately chosen/versioned; no ambiguous label.
Opaque expiring invite references program/scope/referrer without exposing identity. Hash secrets at rest. Existing session explicitly accepts invitation; no global account disclosure or automatic contact upload.
One accepted referrer per customer+program/merchant eligibility period; explicit acceptance before first qualifying checkout; conflicting inviter/replay cannot overwrite. Not last-click affiliate hijacking.
Reject self-referral and same verified customer/beneficiary; flag suspicious duplicate/device/ring behavior for scoped review without claiming perfect fraud prevention.
Marketing permission is independent of referral acceptance; registration is not opt-in to unrelated outreach.

### Benefit and financial integration
Default implementation can compute pending entitlements with no real value issuance. A coupon is activated only under approved merchant/DIDAR rule and tested Medusa Promotion adapter from Phase 6.
Discount applies only to approved charge components and funding allocation. Do not discount gold principal, tax or supplier entitlement without explicit approved policy. New quote snapshots original base, discount/funder and final amount; refunds and settlement preserve exact rounding.
Coupon reserve/redeem is atomic with current reservation/payment lifecycle; expiry/cancel releases once; duplicate callback does not redeem again. Recheck budget, scope, beneficiary and current approval.
If native Promotion budget owns consumption, reference it as redemption authority; reward budget caps are an overall program envelope, not a second spend. Reconcile reservation/consumption under one explicit coordinator.
Non-coupon gifts/credit may remain pending for authorized manual fulfillment; do not create a cash/gold wallet or pretend pending credit is spendable money.
On refund before issue: reduce/reverse entitlement; after benefit redemption: record governed recoverable/offset exception for review, never fabricate a customer gold debt or silently alter old paid orders.
One sale may legitimately qualify agent and referral programs only when both rules explicitly allow stacking, their different payers/budgets and costs are approved; defaults deny implicit double reward.

### UI/API
Customer existing account /referrals and /benefits; public opaque invitation landing in the existing store context.
Vendor /seller/didar/referrals/programs and own results; Admin /dashboard/didar/referrals and governed approval/disputes.
Native API counterparts /admin/didar/referrals/* and /vendor/didar/referrals/*; authenticated customer API own invites/benefits/acceptance. Public token response includes only permitted campaign terms and scoped seller identity.

### Gate P8
Customer X invites Y to A; Y buys once; entitlement remains pending until hold and then becomes eligible under explicit rule. Buy from B gives no A reward; duplicate callback/event yields one benefit; self-referral and concurrent budget/redemption race denied. Refund/partial refund/redeemed-benefit exception is traceable. Contact identity not leaked to referrer or unrelated merchant. No cash/gold payout.

## 10. Phase 9 — Growth Center, advanced CRM and hardening

### Outcome
A nontechnical merchant can select an approved template, choose eligible products/audience, preview, publish/share and understand results inside native Vendor. DIDAR operates global campaigns and authorized aggregate reporting.

### Guided actions — same underlying services
- معرفی محصولات جدیدم → existing campaign + CMS template;
- ساخت صفحه ویژه → original content/share records;
- دعوت مشتری به معرفی → Phase 8 approved program;
- خبر دادن به مشتریان مجاز → permitted audience snapshot + manual share/export;
- دیدن نتیجه → scoped canonical analytics.
No new wizard-specific campaign/CRM database.

### Segments and communication
Extend Phase 5 predicates with validated fields: own paid recency/frequency, net spend after refunds, approved preferences, same-seller product interest where consented. Compile allowlisted predicates, never arbitrary SQL or global CustomerGroup membership as consent.
Preview masked count; snapshot contacts only with contact/export permission; do not expose rival aggregates.
Manual share/export first. Native Notification provider integration may be reused for a later approved connector; automated SMS/WhatsApp/Instagram remains OFF until provider credentials, consent, policies, limits and explicit activation. No outbound is sent while testing this design.
A queued dispatch rechecks consent, seller authority, campaign active state and budget at dispatch, retries and provider acknowledgement. In-flight provider acceptance cannot be recalled; show accurate boundary. Transactional notices use a separate purpose.
Opt-out applies to future marketing and queued unsent operations. Copy/share does not prove delivery.

### Analytics definitions
Metric dimensions: actual seller, physical supplier, store origin, campaign, acquisition agent, referrer, period. Do not sum these overlapping views as separate sales.
Paid GMV: frozen successful customer charge; refunds separate; net collected = paid - verified refunds.
DIDAR revenue: accepted ledger components attributable to DIDAR under agency/direct mode; no supplier pass-through/whole GMV.
Marketing cost: estimated entitlement / approved obligation / actually settled expense are separate columns.
Unique visits exclude known preview/bot events where known; never claim exact people. Conversion denominator and period/cohort explicit. Anonymous-to-known relation only with lawful first-party evidence.
Cohorts and repeat purchase use canonical seller relationships. A partial refund changes net value, not historical count of original events. Report currency/instrument separately.
Dashboard freshness/source checkpoint and reconciliation errors visible. Materialized views/indexes may be used; exact finance dashboard must reconcile to original journals, never overwrite them.

### UI/API
/seller/didar/growth; /dashboard/didar/growth with calendar, campaign/merchant/agent filters and exception queue. Shared scoped metrics endpoints; CSV/download governed by export capability.
Advanced CRM extends /crm screens; no duplicate customer service. Retention/delete/export requests retain protected financial/order records with explicit audit and permission.

### Gate P9
Nontechnical-user browser journey creates a campaign from template, reviews eligible audience and shares manually in few visible steps; UI contains no internal module jargon.
Admin global campaign and merchant own results reconcile to paid/refunded source lines, recognized revenue and approved marketing entitlements.
Cross-tenant red-team, mobile keyboard/RTL/accessibility, bounded queries/exports, queue restart/replay and source-vs-projection reconciliation pass. No automatic external send.

## 11. Cross-phase permission and workspace map

| Persona | Native workspace | Allowed scope | Explicit denied scope |
| --- | --- | --- | --- |
| Central CRM operator | Admin SDK | Approved relationships/fields and audit purpose | Financial approval or all exports merely from CRM role |
| Merchant CRM staff | Vendor SDK selected store | Own permitted relationship and tasks | Global customer directory/rival history |
| Content/campaign editor | Native Admin or Vendor | Approved target content/campaign edits | Contact export, rewards or finance by content role |
| DIDAR marketing agent | Restricted native Admin page | Assigned business leads and approved own metrics | Seller operational write, global customer/ledger access |
| Finance reviewer | Native Admin | Approved entitlement/financial actions under existing finance grants | Unrestricted content/contact harvesting |
| Customer/referrer | B2C account | Own preferences, invites, benefits and orders | Invitee contact/order details beyond lawful minimal status |
| DIDAR on-behalf operator | Native Admin | Explicit target + authorized action | Vendor impersonation/shared passwords |

Capabilities must be catalogued in the installed SDK with action-level view/edit/manage and canonical service checks. Additive grants and CHECK constraints are migrated in native and canonical paths together; new roles default deny. Native Admin full privileges are not a prerequisite for a marketing agent. Audit tracks real actor, target, source/intent and result without secrets.

## 12. Shared nonfunctional acceptance

- Backend pagination/filter/count before response, object-level checks, allowed relation fields, no ID enumeration/PII through OG/media/exports/logs.
- Mobile-first Persian RTL, semantic labels, keyboard/error/empty/loading states, exact locale money/weight. Preserve project fa/ar/en/fr requirement and directional typography; inspect actual current locale support before claiming all four languages. Current CMS schema CHECK(locale='fa') is a documented gap, not multilingual delivery. Propose additive locale handling and public URL compatibility, with 4 locales × 4 responsive test states where required; no silent demotion of scope.
- Use existing design tokens, navy/white/champagne and components. No new operator shell. Native runtime screenshots must show actual data and role navigation.
- Indexed scope+cursor search; bounded audience/export jobs; no unbounded CRM page joins with all ledger events.
- Persist UTC with explicit Asia/Tehran campaign calendar and displayed timezone; date-only campaign boundaries converted unambiguously; half-open intervals; server time controls eligibility.
- Migration fresh/populated/replay/restart/restore and original fingerprints; no blanket seed or deletion; a repair job cannot invent historic consent or rewards.
- Business storage retention purpose explicit; never log raw authorization/referral secret/customer address/notes. Retention periods are policy configuration and external production review, not guessed law.
- Secrets/providers are operator configuration; no live outbound, payout or external Tahesab default. No production readiness implied by Linux tests.
- When legal/provider details are missing, build inactive configurable rules and sandbox proof; independent CRM/content work continues.

## 13. Execution release and acceptance catalog

| Order | Phase deliverable | Review gate |
| --- | --- | --- |
| 0 | Accept Issue #18 integration/seller/financial facts | Chief Architect reconciles exact SHA, residuals, native and independent evidence |
| 1 | P5 CRM/consent/relationships | CRM isolation, customer preference, own sale history, export and replay proof |
| 2 | P6 campaigns + native Promotion compatibility trial | Original CMS/share continuity, attribution and eligibility; discount may stay disabled |
| 3 | P7 acquisition and provisional rewards | Distinct agent roles, revenue source, no GMV-based award, reversals/caps |
| 4 | P8 customer referral | New-customer rule, scoped invite, budget/hold, no duplicate redemption and privacy |
| 5 | P9 Growth Center and integrated hardening | Complete J01–J19 matrix, source reconciliation, native/mobile flows and independent review |
| 6 | Owner consolidated UAT / separately authorized rollout | Outside numbered development; no per-phase owner Mac gate |

For each phase, implementation coordinator + independent Core/reuse review + independent auth/PG/browser/runtime review. Separate reviewer from writer, isolate resources/worktrees, publish exact PR/SHA/commands and limitations.
The Chief Architect releases bounded implementation and reviews results; the owner need not specify every route/form/API. No perpetual new planning gate for routine choices.
Do not interpret old roadmap automatic-continuation text as lifting the current Issue #18 stop. After release, routine phase work progresses without owner Mac questions; genuine fundamental model changes remain explicit decisions.

J01 acquisition→P3/P7; J02 pricing→P1; J03 onboarding→P2/P3; J04 media→P3; J05 UID→existing/P3; J06 merchant scope→P2; J07 discovery→existing/P2; J08 price/CASH-C→P1/P2; J09 CRM→P5; J10 single share→P2C/P6; J11 curated share→P2C/P6; J12 global campaign→P6/P9; J13 agent→P7; J14 referral→P8; J15 guided growth→P9; J16 security/history→every phase; J17 luxury→P4; J18 CMS lifecycle→P4; J19 tenant-safe visual campaigns→P4/P6.

## 14. Deferred production policy does not block safe development

| Item | Safe implementation behavior |
| --- | --- |
| Agent percentages / cost-net revenue / hold windows | Inactive rule unless explicit approved values; clearly labeled synthetic QA values only |
| Referral benefit amount / discount funding / stacking | OFF until approved version; no gold-principal discount default |
| New-to-platform vs new-to-merchant | Explicit versioned definition; display it; no guessed universal rule |
| Tax/account chart / invoice statutory acceptance | Existing sandbox/provisional treatment; no regulatory submission |
| Automated messaging | OFF; manual copy/share or permitted export functional |
| Real wallet/cash/gold rewards | OFF; operational entitlements do not spend existing wallets |
| Native Promotion adapter not equivalent | Content-only campaigns and provisional rewards continue; record concrete gap and review extension |
| Native Customer linkage not proven | Current DIDAR identity remains; no parallel identity or email auto-match |
| Cross-party seller facts missing | Do not leak data or award on inferred origin; explicit blocked configuration |
| Deployment, commercial media, hardware | Separate acceptance; no changes under design-only request |

## 15. Completion claim

Design baseline covers Phases 5–9 and their shared integration contracts; it does not certify uninspected installed native APIs or implemented features.
A phase cannot be DONE with docs, API-only tests, Next /manage substitutes or a screenshot of an empty shell.
Required: accepted reuse mapping, additive data, services/API, actual native/customer UI, independent integration/security/recovery tests and honest source evidence.
No code/rollout or Phase 5 execution is authorized by publication of this design.
