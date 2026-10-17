# Mercur-native recovery checkpoint

**Issue #13 correction:** [native permissions / managed merchant launch](ISSUE13_NATIVE_AUTHORIZATION.md) now bounds native owner/supplier rights, denies unsupported generic payment access, preserves DIDAR financial reporting, adds lawful own-history and proves clean first-Admin bootstrap. Consult its matrix and [current evidence](../verification/issue13/RESULTS.md); older recovery details below are subordinate to this bounded correction. Stop for Chief Architect review after verified publication.

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
3. For a native Admin with no connection yet, open `/dashboard/didar/connect`; that authenticated connection route does not require product access. Sign into the original native Vendor. Complete Mercur's **store selector**, then prove ownership of the correct existing Didar supplier account. No new supplier, identity or financial account is created by connection.
4. Native shop/share links use the customer origin from the configured storefront CORS origin. Customer `/m/{handle}`, canonical PDP, `/i/{uid}`, cart and order history remain in Next.

`native-qa-seed.ts` is an explicitly disposable/local-only test fixture provisioner. It refuses normal owner/production databases and is not part of `db:setup`.

## Verification and remaining work

The primary authenticated Admin/Vendor/Customer journeys and existing regressions are verified in Linux; final counts and actual screenshots are in [the receipt](../verification/mercur-native/RESULTS.md). The fixture uses real native services, native login, native store selection, the compiled production API, PostgreSQL and production panel/storefront builds.

The follow-up adds a native Mercur `permissions` resolver and catalog keys for content, onboarding, storefront and sharing. Existing customer-role merchant staff retain that role, receive only their current selected-merchant grants and cannot enumerate another merchant through lists, counts, previews or generic native customer/finance endpoints. Global content operators have only the content capability. Unconnected native users cannot access global commerce. The authenticated connection route remains available without product access. Supplier pending/inactive status has an own-account notice and restricted onboarding status.

Native connections now include audited activation and narrowing policy controls. A policy cannot grant an absent Didar capability. The last usable central administrator cannot be disabled or restricted out of user management. Native bootstrap/seller DTOs strip bank and legal relations per seller and current rights, including explicitly requested relation fields; owning A grants no access to B's secrets.

Legacy `/manage/**` entry points remain in source. A signed-in account with an active existing native connection hands off to the appropriate protected native feature; accounts without a ready connection retain the original guarded page. Native login and Vendor store selection remain authoritative. Only validated relative feature paths and bounded identifier parameters survive the handoff; no credentials or bearer tokens enter URLs. Product references and CMS preview versions remain intact. The public/customer header no longer has internal management tabs; eligible operators have one external native-workspace entry. Personal customer history and wallet remain B2C.

Set **`DIDAR_PANEL_ORIGIN`** in the Next runtime to the browser-reachable native backend origin, e.g. `https://market.example.com` (origin only; native paths stay `/dashboard` and `/seller`). A loopback backend is supported automatically for local development. Private Docker service names are never substituted as public panel links. When no safe public panel origin is configured, legacy pages stay available rather than redirecting to an unreachable hostname.

Native Seller suspension/deletion or inactive mapping blocks new global/scoped visibility, quotes and checkout for that mapped supplier. Legacy unmapped suppliers retain their existing behavior. This adapter does not rewrite historical orders, inventory, prices or journals. Native migrations run before the demo-only branch, including installations with demo seeding disabled.

Remaining CRM, campaigns, agent/referral rewards and Growth Center are still pending and must use these native panels.

This checkpoint does not claim production was inspected, original owner credentials were changed, Mac/physical hardware was tested, live messaging/payments/Tahesab were enabled, or the entire roadmap was completed. Owner Mac acceptance remains after feature completion.

## Relationship to the concurrent core audit

This recovery incorporates documentation main `bdf4b81`, including the source-backed audit and **proposed, unapproved** CORE-01 alternatives. It repairs the audited installer, missing native resolver, staff/multi-store isolation and transition defects without selecting a new catalog/customer/order/financial authority. Existing Didar writers and economic snapshots remain authoritative for their current behavior; native suspension adds a restrictive sale-eligibility check. This is not an approval of native cart/order splitting, customer-account conversion, a second reservation engine or monetary payout against gold obligations. Product projection crash-atomicity and the broader convergence choices remain separate architecture work; this delivery does not claim to solve them.

## Mandatory stopping point

The owner's later instruction requires publishing the verified native recovery and then stopping for **Chief Architect review**. CRM and business Phases 5–9 are paused and must not start until the final implementation has been reviewed and continuation authorized. See [the review checkpoint](MERCUR_NATIVE_RECOVERY_REVIEW_CHECKPOINT.md) for resolved defects and remaining architecture decisions. Linked Admin/Vendor order and wallet entry points use the native handoff too; genuine customer history/wallet stay in B2C.

The installer regression can also be run independently with `bun run local:test -- --no-demo-install-only`. It creates its own fresh disposable services, runs the real no-demo `db:setup`, requires native identity/ACL tables to exist, asserts zero Didar users/products/orders/link/policy records, and cleans up only its own services. It does not read or alter the owner's UAT configuration/volumes. Standard full QA additionally exercises a populated no-demo replay.
