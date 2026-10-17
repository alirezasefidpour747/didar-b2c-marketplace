# Mercur-native recovery checkpoint

Owner architecture baseline: `dfcc604` (2026-10-17). Native Admin is `/dashboard`, Vendor `/seller`, and the Next app remains the customer/public application. This checkpoint implements original-panel integration; it does not declare growth Phases 5–9 complete.

## Delivered implementation

- Real SDK file routes, sidebar groups, breadcrumbs, built-in Product list/detail widgets and a product general custom-field display in both original apps. Persian controls run in the native authenticated shell. A shared React package replaces duplicated management components; legacy Next entry points re-export the same code during parity verification.
- Existing product/classification/collection approvals, supplier offers, effective gold pricing profiles, onboarding/media, exact intake/UID/RFID/labels/returns, fulfillment, contracts/procurement, journals/wallet/mock Tahesab, storefront/sharing and eleven-block Visual CMS use the existing services and PostgreSQL. [Every entry point is mapped](MERCUR_NATIVE_RECOVERY_MAPPING.md).
- Native `user` and `member` tokens remain native. Explicit actor links require proof of both the authenticated native identity and the existing Didar account. Seller/supplier links require central approval. No email-based impersonation, copied credentials, mirrored order/inventory records or financial reimplementation.
- Requests recheck actual native actor existence, fresh seller membership, active links and Didar approval before executing the original domain authorization. Revocation takes effect without waiting for a cached native membership. Additional native permission restrictions cannot be bypassed through another `manage` mutation kind.
- Native Product detail opens the exact Didar master. Generic native Admin writes/deletes/batch changes to linked masters are guarded. Seller product requests and edits use the governed Didar extension; uniform generic-Vendor mutation denials do not disclose another merchant's private product existence. Existing Didar workflows still update the native Product projection.
- The native client requires an absolute backend URL. `MERCUR_BACKEND_URL=same-origin` resolves that URL at runtime for both the Mercur SDK and host extensions, without patching installed packages. Explicit configured backend URLs remain supported. Native bases remain `/dashboard/` and `/seller/`.
- Artifact-only API builds now include the additive SQL/vocabulary resources, not just compiled JS and panel assets. No original database or configuration is reset.
- Existing UID and resolver payloads remain permanent. QR rendering retains four module widths of quiet zone. Automated round-trip checks decode the generated SVG matrix and validate quiet-zone geometry; native printing is exercised in Chromium. Physical paper/phone readability remains external acceptance.

## Operator connection and migration

Run the existing additive `bun run db:setup` against the operator's intended database after the normal backup/review procedure; do not reset volumes. In an artifact-only installation use the bundled compiled `src/scripts/didar-seed.js` with the Medusa CLI after native migrations. No native production/demo accounts are automatically created.

1. Sign into the original native Admin using the existing Medusa account. On a Didar extension, prove ownership of the existing Didar administrator account once.
2. Use **اتصال فروشگاه بومی** to link the existing native Seller ID to the correct existing Didar Supplier. The original native Stores and the Didar supplier remain the same underlying records; the link is audited.
3. Sign into the original native Vendor. Complete Mercur's **store selector**, then prove ownership of the correct existing Didar supplier account. No new supplier, identity or financial account is created by connection.
4. Native shop/share links use the customer origin from the configured storefront CORS origin. Customer `/m/{handle}`, canonical PDP, `/i/{uid}`, cart and order history remain in Next.

`native-qa-seed.ts` is an explicitly disposable/local-only test fixture provisioner. It refuses normal owner/production databases and is not part of `db:setup`.

## Verification and remaining work

The primary authenticated Admin/Vendor/Customer journeys and existing regressions are verified in Linux; final counts and actual screenshots are in [the receipt](../verification/mercur-native/RESULTS.md). The fixture uses real native services, native login, native store selection, the compiled production API, PostgreSQL and production panel/storefront builds.

Legacy `/manage` has deliberately not been deleted or silently redirected. Complete restricted staff/content-operator native delegation and protected deep-link cutover before retiring those entry points. Pending/inactive supplier experience and least-privilege native staff are migration parity gates, not claims of completed work. Customer-only navigation cleanup accompanies that cutover. Remaining CRM, campaigns, agent/referral rewards and Growth Center are still pending and must use these native panels.

This checkpoint does not claim production was inspected, original owner credentials were changed, Mac/physical hardware was tested, live messaging/payments/Tahesab were enabled, or the entire roadmap was completed. Owner Mac acceptance remains after feature completion.
