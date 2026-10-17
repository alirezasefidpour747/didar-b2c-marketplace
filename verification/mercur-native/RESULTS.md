# Native Mercur recovery — primary implementation verification

Environment: disposable Linux/Chromium, Mercur 2.3.7 / Medusa 2.21.2, actual PostgreSQL 17, Redis, compiled API and production native Admin, Vendor and customer builds. Original stopped owner services/volumes/configuration were not used for writes. This is an engineering checkpoint, not completion of staff/cutover parity or Phases 5–9.

| Check | Result |
| --- | --- |
| Backend/workflow/auth/security/migration/commerce/financial regression | **166 passed; 2,107 assertions** |
| Native Medusa HTTP suite | **1 passed** |
| Production browser suite, including original 22 and 2 native panel journeys | **24 passed** |
| Admin / Vendor / API / Next production builds and code generation | **Passed** |
| Current source/output/platform receipt | **Verified; see BUILD_RECEIPT.json** |
| Historical populated upgrade on both available source-volume read-only clones | **Repeated additive migrations; original commerce/image fingerprints unchanged** |

Actual native journeys:

1. Standard native Admin login; real SDK sidebar and breadcrumbs; current product/offer, profile and UID views; edit a CMS draft using current approved media, persist it and display the actual protected image in private preview.
2. Standard native Vendor login **and native store selection**; one-time proof of the original Didar supplier identity; own-only products; save storefront to PostgreSQL; original native Admin approves/publishes that same draft; Vendor onboarding; ordinary customer login and personal order history. Each workspace is checked at 390px with no document overflow or browser runtime errors.
3. Native Admin creates a master through the real product form, completes Family→Category→Subcategory and publication, opens the existing linked native Product detail widget and returns to the exact master editor. Real measured physical intake yields two permanent UIDs without RFID; native printing renders Code 128 and QR, respects width controls, and the actual customer resolver reaches the current public canonical PDP.
4. Real HTTP auth boundaries reject anonymous, wrong actor type and legacy-token substitution. Explicit identity/seller links, fresh membership/link revocation, own-only ledger/procurement, cross-supplier denial and disallowed public checkout actions are exercised. Trusted-server permission tests prove native rights further restrict original Didar authority, including supplier approvals, global rate changes and refunds. Generic native master writes/batch deletion cannot diverge a linked gold record; uniform Vendor denials expose no private product existence.

[Screenshots](screenshots) are actual browser captures: Admin products/CMS/storefront approval/printing, Vendor products/storefront and customer history, plus 390px Admin/Vendor/customer. Images and transactions are synthetic QA fixtures; no real money/provider/customer outreach was executed. The QR decoder consumes the generated SVG matrix and verifies four-module quiet zones; paper/device readability is not inferred from Linux.

Historical source audits: [compose volume clone](historical-compose-audit.log), [native volume clone](historical-native-audit.log). The clones retain 7/15 products, 8 offers each, 2/3 historical orders, collection identities/links and original image bytes. These two historical snapshots have no UID table; the populated current disposable suite separately verifies exact UID/RFID, paid snapshots and immutable balanced journals across replay/restart. New native connection tables remain empty on historical upgrade; no identities or commerce are cloned by the migration.

Remaining code work: restricted native staff/content-operator delegation, pending-supplier parity, role-aware protected legacy redirects/deep-link continuity and customer-only navigation, followed by business Phases 5–9. Legacy entry points remain functional during that work. No production inspection, Mac UAT, real hardware, provider/accounting/legal signoff or full-roadmap completion is claimed.
