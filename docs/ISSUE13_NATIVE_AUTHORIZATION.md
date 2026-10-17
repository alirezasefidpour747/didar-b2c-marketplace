# Issue #13 — bounded native authorization and managed merchant launch

Implementation follows the owner-approved business policy [ADR-BIZ-01](adr/ADR-BIZ-01-APPROVED-managed-merchant-progressive-delegation.md) and the bounded technical design [ADR-CORE-02](adr/ADR-CORE-02-PROPOSED-native-permissions-managed-merchant.md), as expressly authorized in [Issue #13](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/13). Baseline: `5fab026`. Mercur 2.3.7 / Medusa 2.21.2. This does not change the status of the broader proposed technical ADRs.

## Effective authority

The installed Mercur permission resolver and native membership/store selector remain authoritative for the panel surface. Canonical DIDAR services remain authoritative for commercial actions and data. No new identity, role, management-mode table, inventory source, payment engine or duplicated commerce records were introduced. Existing additive database migrations and populated migration replays remain required; no new schema is needed for this correction.

| Actor/state | Native generic routes | Native DIDAR routes | Canonical legacy token |
| --- | --- | --- | --- |
| Unlinked member, owner or staff | Own authenticated bootstrap/status/store selection; `store:view` only. Products, offers, orders, payments, customers and payouts denied. Bank/legal relations redacted. | Existing dual-proof connection, no commerce. | Existing independently authorized canonical identity only. |
| Linked, active approved same-supplier owner, selected current membership and open mapped Seller | Published/own native catalog and own offers/orders read only. Generic payments are denied because the shipped list references an unavailable `seller_payment` alias; original DIDAR financial reports remain available through `didar.finance`. No payout-account, customer or store-edit rights. Generic commerce mutations denied. | Minimum scoped reads. Existing canonical supplier ownership supplies own non-gold storefront/share/content/onboarding authority. Gold writes require specific existing `didar_supplier_permission` grants and canonical action checks. | Same existing supplier authority, with fresh business status and gold-grant checks; never gains rights from native ownership. |
| Linked customer-role merchant staff | Bootstrap only; no generic finance/customer/product access. | Only active existing merchant capabilities for selected eligible store. No role promotion. | Same current merchant grants, checked by canonical services. Revocation applies immediately. |
| Pending, rejected, inactive, suspended or terminated business | No commerce rights. | Own status; linked supplier's explicit history read only. | No commercial supplier writes or finance/stock editor access. Legacy GET manage returns own status only with empty products/permissions. Explicit own history and own profile remain available. |
| Deleted native Seller/member, revoked actor link, disabled native ACL | No native privileged rights. | No native private history after native relationship revocation/deletion. | Canonical history still requires its own supplier identity. Native ACL is deliberately surface scoped, not a global account ban. |
| Authorized central DIDAR Admin | Existing native permission catalogue, narrowed by native ACL and existing gold projection guards. | Can act on behalf of validated target merchant through original Admin extensions. | Existing independently authorized canonical Admin role; native ACL does not silently revoke this separate surface. |

`didar.catalog`, `didar.inventory`, `didar.orders` and `didar.finance` distinguish governed DIDAR actions from generic Mercur writers. For example, `CREATE_OWN_INTAKE` permits the canonical intake workflow; it never grants generic native offer inventory mutation. Existing canonical supplier-owner non-gold rights are preserved. Staff delegation continues to use `didar_merchant_member`, not native `is_owner` or role spoofing. The native ACL can narrow these capabilities, never manufacture one.

Generic Product reads retain the native list workflow, with an explicit allowlist of eligible DIDAR-linked canonical public/own masters applied after native validation and before native counting/pagination. Detail, variant and preview URLs deny another store's private master with the same 404 as an absent product. Unmapped native-only masters are not exposed to gold Vendors before approved canonical linkage; central Admin authority is unchanged. This is a visibility adapter, not a new Product authority.

Unsupported generic Vendor mutations are denied, including offer inventory, order actions, payment capture/refund, payouts, generic store/team changes and price edits. The existing product guard preserves its uniform no-existence-probe response. Bootstrap registration, own member profile, invite acceptance and selection retain Mercur validation/authentication. A permissions-disabled runtime fallback now fails closed for commerce instead of inheriting Mercur's optional all-rights fallback.

The supported Medusa error-handler extension normalizes a verified deleted/revoked selected membership to 403 when Mercur dereferences a missing Seller before its resolver. Other framework errors retain their original handling.

Fresh membership, canonical link, selected Seller, commercial state and grants are resolved per request. Business suspension checks also apply in canonical `requireUser`, `authorize`, `merchantAccess`, offer editing and pending-order payment. Native ACL changes alone leave commercial eligibility untouched. Existing `storeAllowed`, `assertOfferScope`, `didar_native_saleable_supplier` and checkout remain the sale authority.

## DIDAR-managed launch and handover

The native Admin's existing storefront, sharing, product/intake and approval extensions operate on existing validated supplier/store/offer records. The merchant need not create a native Member or log into Vendor to launch an eligible same-supplier storefront. The original approval, real available UID, price/profile, quote, context, customer and sandbox payment checks still apply.

Storefront and sharing audit details now explicitly record the real canonical actor, target merchant and on-behalf-of status. Grant-change audit records include the target user, capability and activation state. No vendor credentials, sessions or impersonation are used. Assisted handover uses the same store handle and record IDs; changing staff capabilities neither clones history nor changes business eligibility. Supplier-owner baseline rights remain existing canonical business policy, not a new blanket native-owner grant.

## Explicit historical read

`GET /didar/history` and `GET /vendor/didar/history`, native route `/seller/didar/history`, expose only the authenticated supplier's business status, up to 200 paid own order lines with exact UID/weight/status, and its posted ledger account/instrument balances. No customer address, customer identifier, banking detail, payment authority, other tenant line, stock editor or new financial command is exposed. Customers retain their existing personal global `/orders` history and original stored merchant snapshots; an inactive merchant's public shopping context is not a route for new sales. Non-GET supplier-history commands are denied. Reads are audited with actor, target and surface. This path does not expire orders, release reservations, rebuild projections or settle balances. Commercial suspension preserves it; revoked native identity/membership does not preserve native access.

## Clean first Admin setup

On an initialized database with no DIDAR Admin, explicitly provide `DIDAR_BOOTSTRAP_EMAIL`, `DIDAR_BOOTSTRAP_PASSWORD` and `NATIVE_BOOTSTRAP_PASSWORD` through the operator's secret environment. Passwords must be distinct and at least 16 characters. Run:

```sh
bun run --cwd packages/api medusa exec ./src/scripts/provision-first-admin.ts
```

The script uses the original DIDAR password/session authority and native Medusa User/Auth services, refuses an existing DIDAR Admin or matching native account, creates no bridge or commerce, and does not install demo identities. Sign in at `/dashboard`, open `/dashboard/didar/connect` and prove the separately supplied DIDAR credential. Generic rights stay denied before proof. This is a one-time setup flow, not account recovery or email-based identity merging. If external native provisioning fails partway, inspect the error and native account state; no automatic deletion or account matching is attempted.

Disposable verification: `bun run local:test -- --no-demo-install-only --reuse-build` now checks empty migrations, provisions the real first operator through this supported script, replays migrations, starts compiled apps, signs into the native UI, completes dual proof, checks generic HTTP permissions before/after proof, and confirms one Admin/bridge with zero demo users/products/orders. It does not call `native-qa-seed.ts`.

## Delivery boundary

See [C01–C10 evidence](../verification/issue13/RESULTS.md). All verification is disposable local Linux, PostgreSQL 17 and Redis 7; source volumes are read-only cloned for historical checks. No owner staging mutation, server/DNS/proxy change, live provider or real transaction is authorized or performed.

Cross-supplier retailer resale remains unresolved and disabled: current scoped checkout requires `didar_storefront.supplier_id = didar_offer.supplier_id`. Seller-of-record, physical custody, invoice/settlement parties and CRM attribution need a separately approved ADR-CORE-01/03 design. Native-vs-DIDAR commerce authority convergence and identity/session consolidation are also outside this patch. Chief Architect review and independent delta verification remain required. CRM and Phases 5–9 remain HOLD; no staging deployment.
