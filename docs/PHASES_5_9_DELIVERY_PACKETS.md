# Phases 5–9 — Delivery packets and acceptance checklist

Design authority: PHASES_5_9_INTEGRATED_DESIGN.md, version 1.0.
Status: design-only companion. Issue #18 stop remains. These are future bounded assignments, not a command to start them now.

## Common start packet — mandatory once per phase

1. Reconcile accepted source SHA and local changes; inspect all implemented scope to avoid duplication.
2. Produce a short Native/Current/Gap/Reuse map with installed version-matched code/doc references and actual SDK targets.
3. List additive schema, typed APIs, native Admin/Vendor/customer screens, event adapters, migration and preservation checks.
4. Record security/economic edge cases and distinguish genuine fundamental decisions from routine implementation choices.
5. Coordinate implementation and independent Core/auth/runtime reviewers. No self-approval; isolated resources and nonconflicting writes.
6. Execute complete vertical slices and current meaningful regressions. Publish actual source SHA, commands, screenshots and explicit external limits.
7. Chief Architect reviews the complete accepted scope and releases the next phase. No owner Mac gate between phases. No automatic deployment.

## Packet P5 — CRM Lite

Reuse:
- current didar_user/session/explicit native bridge and existing customer/account;
- current Seller business scope/grants and native ACL narrowing;
- accepted order sale-role facts, original paid/refund histories;
- native Customer/CustomerGroup/list-detail widgets where compatible, without copying identity.

Add only missing:
- source-backed merchant-customer relationship;
- immutable consent evidence/current suppression;
- private relationship notes/tasks/activity;
- safe audience/segment predicates and bounded audited exports.

Real native screens:
- Admin central CRM + relationship/detail + permissions;
- Vendor own CRM + notes/tasks;
- B2C own channel/scope preference center.

Proof:
[ ] One customer, A and B purchases, exact own-history isolation.
[ ] A curator has no automatic seller contact relationship.
[ ] Contact permission separate from notes/content/finance.
[ ] Anonymous visit does not create contact access.
[ ] Unsubscribe takes effect on search/audience/export and queued operations.
[ ] Export result revoked before download is inaccessible; URLs/metadata leak no PII.
[ ] No global customer enumeration by phone/email/ID/count/fields.
[ ] Own invoice retained after marketing opt-out.
[ ] Replay/restart does not duplicate relationships/consent events.

Release result: P5_VERIFIED or explicit PARTIAL/BLOCKED. No rewards/payouts needed.

## Packet P6 — Campaigns and Promotion compatibility

Reuse:
- existing share IDs/URLs/order references, typed Visual CMS blocks/publication/media;
- merchant context/invites and accepted sale role;
- native Promotion rules/campaign budgets only after a disposable current-quote proof.

Add only missing:
- campaign governance and business participation;
- minimal privacy-aware touch/attribution and source-derived analytics;
- governed audience relation to Phase 5.

Real native screens:
- Admin global campaign review/calendar/participation;
- Vendor own campaign editor/share/results using existing CMS;
- B2C same scoped campaign renderer/checkout.

Proof:
[ ] Original single-product and 10–20-product links continue working with same records.
[ ] A campaign preserves scope through login and purchase; B never appears.
[ ] Pause/expiry/participation revocation enforced in APIs/quote/media, not only scheduler.
[ ] Global campaigns exclude unapproved unlisted/invite-only Offers.
[ ] Private previews/OG/media never disclose draft or customer information.
[ ] Accepted attribution is immutable and not replaced by later touches.
[ ] Bots/replay cannot qualify conversion/reward.
[ ] Native Promotion trial creates no second cart/order/reservation.
[ ] Any discount has explicit beneficiary/funder/base/tax/refund and budget behavior.
[ ] If discount adapter is blocked, content campaign still fully works and reports the limitation.

Release result: content campaign P6_VERIFIED; discount subgate separately stated, never fake coupon delivery.

## Packet P7 — Agent acquisition

Reuse:
- current native actor, onboarding requests, business approval, product publication facts;
- Phase 6 attribution primitives;
- accepted journal-derived DIDAR consideration;
- current append-only financial authority only if actual monetary recognition is approved.

Add only missing:
- prospective-business lead and distinct acquisition/assistance assignment;
- source-backed milestones and private agent dashboard;
- inactive-by-default rules and append-only provisional entitlement transitions.

Proof:
[ ] Two agents with overlapping leads cannot both become the same effective acquiring owner.
[ ] Sourcing and upload assistance remain distinct attributions.
[ ] Agent sees own permitted pipeline, no global customers/contracts/ledger.
[ ] Limited native Admin agent role has no general Admin rights.
[ ] Real approval/publication/sale facts drive milestones; self-reported totals do not.
[ ] Reward basis excludes gross collection, gold principal, tax and third-party payable.
[ ] Rule changes do not retroactively alter frozen entitlements.
[ ] Caps/hold/refunds/replay and out-of-order events cannot double award.
[ ] Approval of provisional reward does not automatically issue money or gold.

Release result: P7_VERIFIED for tracking/provisional calculation with explicit approved QA rules; real payout OFF.

## Packet P8 — Customer referral

Reuse:
- same canonical customer, merchant relationship and consent boundaries;
- accepted campaign context/order facts;
- shared provisional-entitlement infrastructure with separate program kind/payer;
- accepted native Promotion adapter if coupon issuance is included.

Add only missing:
- approved merchant referral program/version;
- opaque invitation, explicit acceptance and immutable source attribution;
- benefit lifecycle, budget/hold, fraud review and refund recovery.

Proof:
[ ] New-to-merchant and new-to-platform labels have exact versioned meanings.
[ ] X refers Y to A; Y buying B does not qualify A.
[ ] Existing global account is not disclosed through token acceptance.
[ ] Referrer sees no invitee phone/address/order details.
[ ] Self-referral and conflicting/refreshed token takeover denied.
[ ] One qualified purchase/event produces one scoped entitlement despite callback replay.
[ ] Concurrent acceptance/budget/redemption races pass.
[ ] Refund before issuance reverses; after redemption creates explicit governed exception.
[ ] Seller liabilities/tax/gold principal unchanged by unapproved discount.
[ ] Agent and referral stacking occurs only under explicit approved funded rules.
[ ] No real cash/gold/wallet issuance.

Release result: P8_VERIFIED with pending benefits or approved tested coupon scope; external rewards remain OFF.

## Packet P9 — Growth Center and final integrated hardening

Reuse:
- Phase 5 customer relations/segments/preferences;
- Phase 6 campaign/CMS/share;
- Phase 7/8 attribution and entitlements;
- canonical order/refund/financial records and existing permissions.

Add only missing:
- guided native UI, extended validated predicates, audience snapshots;
- scoped rebuildable analytics/read models and operational exception queue;
- bounded safe jobs; provider adapters remain inactive until separately approved.

Proof:
[ ] Merchant completes template→eligible items→preview→publish/share→results in native Vendor.
[ ] Admin global calendar and campaign participation use same services/IDs.
[ ] Segment preview/export respects latest consent/access.
[ ] Marketing copy/share is not falsely counted as provider delivery.
[ ] Paid GMV/refunds/net collection/DIDAR revenue/estimated and booked marketing costs separate.
[ ] Reconcile metrics per seller/store/campaign without double-counting overlapping dimensions.
[ ] Late/refunded events and worker restart converge to source truth.
[ ] Mobile RTL/keyboard/accessibility, all required locales and native menus tested; actual locale gaps explicit.
[ ] Current 19 journeys J01–J19 rerun, including CMS/UID/pricing/checkout/finance history.
[ ] Fresh/no-demo and populated replay/restart/restore preserve original fingerprints.
[ ] No staging/server change or automatic external message.

Release result: P9_VERIFIED and consolidated engineering acceptance candidate.
Owner consolidated hands-on UAT and any rollout remain separately scheduled/authorized.

## Decision and defaults register

Fixed by existing owner decisions:
- reuse-first native Admin/Vendor, one customer/product/UID/order/financial authority;
- agency sales for third-party actual sellers; DIDAR principal only for own sales;
- managed launch without mandatory merchant Vendor self-service;
- Visual CMS BEFORE CRM, exactly Phases 0–9, no intermediate Mac test gate;
- rollout excluded from the current integration closure.

Require configured approved values before value issuance/provider activation:
- reward amounts, hold windows, discount funding/stacking, tax/account treatment;
- cost-net revenue mapping if that reward basis is selected;
- automated provider credentials and consent/policy contract;
- any fundamental identity/commerce authority migration.

Safe engineering defaults:
- no configured approved reward rule → no accrual/issuance;
- no consent/current access → no marketing contact/export;
- no valid seller/participation/mandate → no scoped promotion/new transaction;
- no native adapter equivalence → record gap, keep independent content/CRM useful;
- no approved deployment window → ROLLOUT_NOT_EXECUTED.

A documentation PR does not deliver any checkbox above. Every PASS must link an independently reviewable real result; do not fabricate total test counts or assume green baseline tests cover new behavior.
