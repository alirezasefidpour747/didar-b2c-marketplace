# Issue #18 — route and authority matrix

This is the bounded extension of the preserved PR #15 authority map, not a migration to a second commerce writer. Installed Mercur 2.3.7 / Medusa 2.21.2 remains unchanged. Read with `ISSUE18_CORE_REUSE_REVIEW.md` and the implementation/test receipts.

| Capability | Native or customer UI | HTTP boundary | Authority / authorization |
|---|---|---|---|
| Mandate version, approval, revocation | Admin `/dashboard/didar/agency` | `/admin/didar/agency` GET/POST | Original native User and canonical Admin bridge, `payments:view`/`edit`; immutable mandate/review/revocation linked to existing financial contract |
| Own mandate status | Vendor `/seller/didar/agency` | `/vendor/didar/agency` GET | Current native Member, selected Seller, canonical business, `didar.finance:view`; own minimal projection, no Vendor approval |
| Curation agreement, approval, revocation | Same native Admin page | `/admin/didar/curation` GET/POST | Admin and payments capability; exact original B Offer, A attribution only; existing actor audit |
| Own curation agreements | Same native Vendor page | `/vendor/didar/curation` GET | Only A/B agreements involving selected business; no competitor finances or customer rights |
| Actual seller and zero-fee curator disclosure | Existing B2C quote/checkout and order page | Existing `/didar/catalog`, `/quote`, `/checkout`, `/orders` | Current approved mandate/agreement in original quote key and immutable order/role facts |
| Own immutable invoice/credit | Customer `/orders/{id}/invoice`, `/m/{handle}/orders/{id}/invoice` | `/didar/invoice?order_id=...` through existing Next proxy | Original customer identity and order ownership; immutable documents referencing existing events; no internal costs/contracts |
| Historical seller invoice | Vendor `/seller/didar/invoices?order_id=...`, own history link | `/vendor/didar/invoice` | `didar.history:view`, active native actor and own actual agency principal; commercial suspension does not erase lawful history |
| Admin invoice lookup | Native Admin agency page | `/admin/didar/invoice` | Canonical Admin and native `orders:view`; no customer or upstream identity substitution |
| Verified collection and recognition | Existing customer payment flow / native finance | Existing payment/finance APIs | Original payment provider sandbox, order lock, shared pricing lock, offer/items lock and financial-domain lock; original appendEvent/projectEvent and unique intents |
| GOLD_UG / IRR settlement and reversal | Existing native Admin/Vendor finance | Existing treasury/wallet/ledger/returns APIs | Original obligations and instruments; role allocation supplements, never replaces, physical supplier dimension |
| Product native projection | Existing Admin Product Master | Existing product mutation + durable worker | Canonical source + revision/job atomic transaction; stable native ID; supported native descriptive Product/variant workflows; no new Offer/stock/order writer |
| Projection observation/reconciliation | Existing backend operator command | `medusa exec ./src/scripts/didar-product-projection.ts` | Explicit local operator command, latest failed revision only; not a public endpoint |

Existing API aliases remain compatibility adapters with the original canonical authorization. No new Next Admin/Vendor workspace is added. Native SDK routes reuse the authenticated Mercur shell/sidebar; the Next application remains the public/customer product. Commercial eligibility and native ACL are separate checks. Revoking a Member or bridge denies even historical native access; suspending commerce preserves only authorized historical reads.

SQL visibility/count/media and original storefront contexts share the approved curation predicate. Legacy orders/snapshots/events are neither rewritten nor inferred into the new role schema. Native Seller/Member authentication is reused, but native monetary order splitting/commission/payout cannot safely become a second writer for exact gold UID obligations.
