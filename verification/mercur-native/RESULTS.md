# Mercur-native recovery — final Chief Architect review evidence

Environment: disposable Linux/Chromium; actual Mercur 2.3.7 / Medusa 2.21.2, PostgreSQL 17, Redis, compiled API and production native Admin/Vendor/customer applications. Native recovery is verified for the journeys below. **STOP at Chief Architect review; CRM and Phases 5–9 have not started.** Broader domain authority convergence is not claimed.

| Check | Final result |
| --- | --- |
| Backend/workflow/auth/security/migrations/commerce/finance | **174 passed; 0 failed; 2,238 assertions** |
| Native Medusa HTTP suite | **1 passed** |
| Full production browser suite | **27 passed; 0 failed** |
| Native Admin / Vendor / API / Next builds and code generation | **Passed; final customer-only correction rebuilt Next** |
| Complete current source/output/platform receipt | **Verified — BUILD_RECEIPT.json** |
| Historical read-only clones, both source volumes | **Repeated native identity/ACL/lifecycle migrations; audited fingerprints unchanged** |
| Non-demo installer | **Fresh installer and populated replay passed; zero new users/products/orders/links/policies on fresh non-demo install** |

Actual commands/results: [QA_FINAL.log](QA_FINAL.log); [fresh no-demo installer](FRESH_NO_DEMO_INSTALL.log), run with `bun run local:test -- --no-demo-install-only`. Full production builds preceded the final focused customer-bootstrap fix; the changed Next output was rebuilt and the complete source/output/platform receipt verified before rerunning **all** backend, native HTTP and browser tests. The final suite uses disposable fresh database services and includes repeat/populated migration checks, real PostgreSQL restart, all existing gold/UID/ledger regressions and the additional native tests. No required test is skipped.

Actual authenticated native browser journeys:

1. Original native Admin login and one-time proof of its existing Didar account; real sidebar/breadcrumb navigation through product/offer, pricing, UID and protected CMS media preview. Native access controls reject restriction of the last usable administrator through the real form. Native wallet loads existing PostgreSQL balances. Original Vendor login and **actual native store selection**, supplier proof, own-only data/storefront draft, central approval of that same draft, vendor onboarding. Customer remains B2C with personal order history; all three are checked at 390px without overflow or browser runtime errors.
2. Native Admin creates/classifies/publishes one actual master, visits the existing native Product widget and deep-returns to that master. Real measured intake creates two permanent UIDs with optional RFID absent. Native print controls render Code 128/QR and customer resolvers reach current canonical PDPs.
3. Native non-owner staff keep their canonical customer role and selected-merchant grants. Actual native CMS editing persists an own-merchant draft; no global/rival scope or product/finance/customer menus are exposed. An original native Admin content operator has only its existing approved content capability. Direct API and bootstrap tests verify fresh RBAC, tenant isolation and bank/legal relation redaction.
4. Existing guarded management links hand off from a real Didar session to native Admin/Vendor login and actual seller selection. Product query references survive login, including Mercur Admin's pathname-only return. Operator wallet handoff is exercised; customers keep their own account/history/wallet. No bearer/password is transferred in a URL. Legacy fallback remains tested when a native connection is absent.
5. A deliberately interrupted customer session request preserves the valid credential, a real retry restores the account, and server revocation subsequently clears it. The original merchant registration → scoped PDP/cart → sandbox purchase/attribution and competitor-denial journey passes.

[Screenshots](screenshots) are actual authenticated production-browser captures, including Admin, Vendor, Customer, native access controls, staff/global-editor CMS, legacy handoff and mobile views. All financial/test identities and transactions are synthetic QA fixtures. QR round-trip tests decode the generated SVG matrix and verify quiet zones; physical paper/device scanning is not inferred.

Historical clone logs: [native source](historical-native-audit.log), [compose source](historical-compose-audit.log). Original source volumes were mounted **read-only** for copying and their original services were not started. Repeated additive migrations retain 7/15 products, 8 offers each, 2/3 orders, collection identities/memberships and original image bytes. New native link/policy tables remain empty. These old snapshots have no UID table; populated current regression separately verifies UID/RFID, immutable paid snapshots and balanced journals across replay/restart. No duplicate canonical commerce records are created by migration.

[Chief Architect review checkpoint and remaining gaps](../../docs/MERCUR_NATIVE_RECOVERY_REVIEW_CHECKPOINT.md): CORE-01 authority choices, dual-auth identity convergence, non-atomic Product projection, native Offer/order/commission/payout compatibility and native taxonomy/media convergence remain separate decisions. Production deployment, Mac/hardware, social crawler reachability, live providers/Tahesab and legal/regulatory signoff are unverified. No live transaction/outbound messaging was enabled. **Do not start CRM or Phases 5–9 without Chief Architect review and authorization.**
