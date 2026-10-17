# Mercur-native recovery — Chief Architect review checkpoint

Scope: the original Mercur 2.3.7 / Medusa 2.21.2 Admin `/dashboard`, Vendor `/seller`, and Next B2C/customer application. This is a bounded native-panel recovery, not a selection of the unapproved CORE-01 alternatives.

**Owner instruction, 2026-10-17:** finish this recovery, resolve browser failures, run the full regression suite, publish verified code, then **STOP**. CRM and business Phases 5–9 must not start until the Chief Architect reviews the final implementation and authorizes continuation. No CRM/campaign/agent/referral/Growth Center feature implementation is included in this recovery.

## Implemented fixes under review

- Original native SDK routes/navigation/breadcrumbs, Product list/detail widgets and custom-field display use existing Didar services and PostgreSQL; full feature mapping is in `MERCUR_NATIVE_RECOVERY_MAPPING.md`.
- Native identity/ACL/lifecycle migrations run on the no-demo installer path. New tables contain links/policies, not copied identities or commerce. Fresh and populated replay are tested.
- Configured native permission resolver fails closed; unconnected native users have no global customer/product/finance authority. Customer-role merchant staff and global content operators retain their canonical role and receive only existing explicit grants. Native policies can narrow those grants, never manufacture domain authority.
- Selected-merchant authorization is applied to actual query scopes, lists, previews and mutations, including members with legitimate access to multiple merchants. Fresh membership/grant revocation takes effect server-side.
- Native account links and narrowing policies have audited central controls, including a last-usable-administrator guard. Pending suppliers receive an own-account status without inventory/finance access.
- Bank/legal fields in native bootstrap and seller responses are filtered independently for each seller, including requested relation fields. A role at A cannot reveal B's bank details.
- Native Seller suspension/deletion/inactive mapping blocks new mapped gold visibility/quotes/checkout. Historical paid orders, stock, prices, contracts and journals are not rewritten; unmapped legacy suppliers retain their behavior.
- Old `/manage/**` paths and operator orders/wallet paths remain guarded and hand off to their connected native workspace. Native sign-in/store selection remain authoritative. Valid deep references survive without credential URLs. Missing connection/public origin keeps the working legacy fallback. B2C navigation contains no internal management tabs; customer history/wallet remain customer features.
- Child content/connection routes do not inherit the product permission of the parent landing route. Feature routes and APIs enforce their own capabilities. Vendor uses the supported shared dashboard permission component.

## Evidence

Final counts, build receipt, actual screenshots and both historical read-only-clone audit logs are recorded in `verification/mercur-native/RESULTS.md`. This checkpoint must be read together with that final verification record, not earlier failed intermediate runs. QA uses production builds, actual native authentication and store selection, real PostgreSQL/Redis, sandbox finance and synthetic fixtures. Source owner volumes are mounted read-only only for cloning; original services/configuration are not reset.

## Remaining architecture decisions and external acceptance

1. **One authority per domain/field:** CORE-01 remains proposed, not approved. Native Product/Seller/conventional Offer/cart/order/customer concepts and the existing gold-domain models are not claimed to be unified by panel integration. Exact writer/reader/economic-party mappings require Chief Architect review before broader convergence.
2. **Product projection durability:** existing Didar SQL and native Product workflows do not share a crash-atomic transaction. Generic native writes to linked masters are guarded; durable outbox/reconciliation and crash injection remain separate architecture work.
3. **Identity convergence:** explicit dual-auth proof/linking is the current preserving adapter, not a completed migration to one native customer identity/authentication system. No email auto-merge, password conversion or second commerce identity is introduced here.
4. **Native commerce compatibility:** no conversion to native Offer/order splitting/commission/payout semantics has been approved or implemented for exact gold/UID settlements. Generic native records are not evidence that they contain the existing gold-order history. Gold/IRR liabilities cannot be discharged through a conventional monetary payout.
5. **Catalog/media convergence:** native taxonomy/attributes and File/Media provider adoption need field mapping, preserved IDs/URLs and verified privacy/provenance semantics. Existing governed taxonomy/media/CMS stay functional through native extensions.
6. **Deployment and external acceptance:** GitHub publication and disposable Linux/Chromium verification do not attest a deployed owner server, public social crawlers, Mac/hardware/physical paper scanning, live provider/Tahesab compatibility, legal seller-of-record or regulatory approval. Live financial transactions/outbound messaging remain off.

**Review outcome: PENDING. Do not continue business Phase 5 or Phases 6–9 without Chief Architect authorization.**

Customer regression discovered during final recovery QA: a navigation-aborted session bootstrap could delete an otherwise valid newly registered customer's credential. Bootstrap now clears only the exact credential explicitly rejected by a completed server session response. Older or interrupted requests cannot erase a new session. The full merchant registration → scoped cart → sandbox purchase regression and an explicit interrupted-request/retry test verify the preserving behavior.
