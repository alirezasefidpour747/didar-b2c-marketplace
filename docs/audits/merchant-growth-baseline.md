# Merchant growth extension audit

Inspected GitHub main `3bfb982fca143ea1695df059c952b45119fefbf7` (2026-10-16). Issue #6 implementation remains `84e1c1b`; the intervening commits change owner roadmap documents only. No Phase 0 replay, reset or reseeding is required.

The official Mercur seller/team, shared master catalog and offer documentation was read. Didar's existing integration projects governed product changes through official workflows, keeps one shared native Product, and uses the established `didar_supplier`, `didar_user`, session, Offer and finance services for its additional gold-specific contracts. Extend those established services instead of introducing a second shop engine.

| Boundary | Existing source | Extension |
|---|---|---|
| Identity | `auth.ts`, `didar_user`, bearer sessions | Reuse identity; additive per-merchant membership for limited capabilities |
| Merchant | `didar_supplier`, approval, persisted supplier permissions | Stable storefront handle/configuration; no new supplier IDs |
| Shared product | `didar_product`, linked native Product, approved taxonomy/facets | Reference original ID; publication gate unchanged |
| Offer / exact stock | `didar_offer`, intake, `didar_inventory_item`, reservation | Server restrict eligible supplier joins; no inventory copy |
| Pricing | `pricing.ts`, versioned `merchant-profiles.ts`, quote keys | Same effective profile in global and scoped journeys |
| Checkout / finance | `service.ts`, `commerce.ts`, contract snapshots, journals | Immutable originating-store snapshot; original accounting service |
| Catalog / metadata | `catalog.ts`, discovery, product-link, image route | Global visibility and merchant access in backend, not client filtering |
| Browser proxy | Next `/api/didar/[action]` | HttpOnly first-party opaque context; caller headers cannot replace cookie |
| Sharing | Existing product/collection sources | Ordered references and extensible share-page identifiers, no second Product |
| Media | Existing small PostgreSQL image blobs/routes | Additive approved originals/variants in Phase 3; historical IDs remain |

Threat model: an attacker may change query strings, product/offer IDs, body supplier IDs, expected-store headers and routes, copy opaque contexts, replay checkout, revoke invitations, switch tabs, or request images/UID/SSR metadata directly. A handle is a routing hint, never an authorization grant. Invite-only access requires the authenticated customer's current, unexpired grant on each scoped read. Global discovery must omit hidden offers even on otherwise-public shared masters. Quotes must reject mixed/rival offers, not silently choose a competitor. Central identity does not grant marketing consent or CRM access.

Preservation boundary: all original PostgreSQL containers/volumes remain untouched. QA creates only labelled disposable data services. Additive migrations default original merchants to their prior public marketplace behavior, preserve historical order pricing and finance, and introduce nullable origin fields without rewriting accepted orders. Live payments/Tahesab remain disabled.
