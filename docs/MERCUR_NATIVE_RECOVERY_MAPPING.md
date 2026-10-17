# Native panel recovery mapping

Native recovery implementation against owner baseline `dfcc604`; primary role journeys are implemented. See the implementation handoff and verification receipt for actual completed checks and remaining staff/cutover parity.

Mercur 2.3.7's installed `panel-extensions/{overview,create-page,widgets,custom-fields}.mdx`, API conventions, frontend patterns and store team model were inspected alongside the actual shipped authentication middleware and extension target declarations. Actual paths already agree with the owner: Admin `/dashboard`, Vendor `/seller`. Historical AGENTS path labels were reversed; no route reset was necessary.

All rows use the existing PostgreSQL/domain/API. The React components are extracted, single-source, into `packages/didar-ui/src`; legacy Next files re-export them during parity verification. Native file-based SDK routes run within the real Mercur shell. No iframe, alternate shell or second financial engine is introduced.

| Legacy feature | Admin native extension | Vendor native extension | Existing service / authorization |
| --- | --- | --- | --- |
| `/manage`, `/manage/admin`, `/manage/supplier`: Product Master, taxonomy, supplier offer, collections, classification F01–F12, proposals, legacy images and approvals | `/dashboard/didar`; linked native Products list/detail widget and product general custom-field display | `/seller/didar` (own offers, requests, permitted suggestions) | `catalog.ts`, `facets.ts`, `taxonomy.ts`, `manage`, `classification`; existing native Product `native_id`, supplier grants |
| `/manage/pricing`: profile versions, merchant assignments, cash/credit preview | `/dashboard/didar/pricing` | `/seller/didar/pricing` (approved assignment read-only) | `merchant-profiles.ts`; existing pricing locks/immutable snapshots |
| `/manage/operations`: intake headers/lines, measured pieces, permanent UID, optional RFID pairing/counts, labels, fulfillment, physical returns, grants | `/dashboard/didar/operations` | `/seller/didar/operations` (existing supplier grants) | `phase1.ts`, `labels.ts`, permissions; exact-unit existing stock |
| `/manage/finance`: contract proposals/approval, entitled gold/rial, reconciliation | `/dashboard/didar/finance` | `/seller/didar/finance` (own account/proposals) | `finance.ts`; existing append-only financial core |
| `/manage/treasury`: procurement, purchase approval, allocation, transfer/handover, settlement, reversals | `/dashboard/didar/treasury` | `/seller/didar/treasury` (own requests/results; central purchase/approval blocked) | `finance-procurement.ts`; admin-only operations |
| `/manage/ledger`: balanced journal, trial balance, close | `/dashboard/didar/ledger` | `/seller/didar/ledger` (own postings only) | `finance-ledger.ts`; central journal control remains admin-only |
| `/wallet`: customer's wallet and operator sandbox controls | `/dashboard/didar/wallet` | `/seller/didar/wallet` where authorized | `finance-wallet.ts`; customer personal wallet stays B2C |
| `/manage/tahesab`: merchant mappings, outbox, mock receipts/reconciliation | `/dashboard/didar/tahesab` | `/seller/didar/tahesab` own records | `tahesab.ts`; mock/dry-run only |
| `/manage/acceptance`: sandbox accounting checkpoints | `/dashboard/didar/acceptance` | `/seller/didar/acceptance` (own diagnostics) | `finance-uat.ts`; central checkpoints remain admin-only |
| `/manage/storefront`: stable handle, visibility, approval, invites, scoped staff | `/dashboard/didar/storefront` | `/seller/didar/storefront` own store | `storefront.ts`; merchant membership/owner and admin approvals |
| `/manage/sharing`: selected 10–20 products and single-product link, own metrics | `/dashboard/didar/sharing` | `/seller/didar/sharing` | `sharing.ts`; own approved products/attribution |
| `/manage/onboarding`: join existing or request new master, making terms, safe WebP upload, receipts/review | `/dashboard/didar/onboarding` | `/seller/didar/onboarding` | `onboarding.ts`, `media.ts`; actual creator/uploader/assistant/reviewer retained |
| `/manage/pages`, `/manage/pages/preview/{version}`: all 11 blocks, private preview, media, templates, review, schedule, pause/rollback/history | `/dashboard/didar/pages`, `/dashboard/didar/pages/preview/{version}` | `/seller/didar/pages`, `/seller/didar/pages/preview/{version}` | existing `content*.ts`, media pipeline; content owner/grants, current referenced offers |
| Public `/m/{handle}`, PDP, `/i/{uid}`, shared page, account/cart/orders, published CMS | stay in Next customer app | merchant public links point to customer origin, not panel origin | existing context/checkout/history; native generic cart/order/payout does not replace gold-sale journals |
| New explicit native account/seller connections | `/dashboard/didar/connections` | one-time dual-proof connection inside native panel | `native-schema.sql`, `native.ts`; no email matching, password copying or commercial record cloning |

## Identity and financial adapter boundary

Native `user`/`member` authentication remains standard Medusa/Mercur. `didar_native_actor` links authenticated actor IDs one-to-one to existing Didar user IDs, with dual authenticated proof. `didar_native_seller` is an administrator-approved one-to-one link from an existing native seller to an existing Didar supplier. The native core checks member/seller context; the adapter additionally rechecks fresh membership, actor existence, active link and current Didar supplier approval. Private server-only request associations select the existing domain actor; arbitrary headers cannot assert a Didar role. Each request still executes original object ownership/permission checks. Native RBAC rights are an additional restriction.

No automatic production account or seller provisioning occurs. The dedicated QA seed is guarded by local + disposable database assertions and uses native services/workflows. Deployment operators authenticate existing native accounts and confirm existing Didar account ownership; Admin explicitly links native seller IDs to the correct existing supplier.

Native Medusa orders, generic inventory quantities and generic payouts are not semantically equivalent to physical measured pieces, gold/IRR liabilities, frozen priced invoices and append-only balanced journals. They remain separate native capabilities; Didar gold operations use the established service behind native extensions. No mirror orders or invented inventory are created. Generic native product update/delete and batch mutations of a linked gold master are guarded: use the native Didar editor, whose established workflow writes the canonical record and native projection together.

## Cutover gate

Legacy routes are retained until each replacement passes authenticated functional parity. Redirects must send only the appropriate role to the correct native protected route and preserve deep IDs; native authentication still applies. No implementation here claims production was inspected. Native staff delegation and later CRM/campaign/reward capabilities require their own verified default-deny grants; linking a seller does not authorize every account sharing its email or store.
