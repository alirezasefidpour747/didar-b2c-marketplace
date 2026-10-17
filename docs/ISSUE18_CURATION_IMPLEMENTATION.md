# Issue #18 — bounded cross-store curation

Authority: ADR-BIZ-02 and ADR-CORE-03 §7, copied without alteration from PR #17 head `aaedd0d81806a20317f2505678a79e7b9a2ba1a2`. Branch starts at preserved PR #15 head `efbdfcdf8a2ab7f3e397f2d67672328ebcf36254`; neither that PR nor the documentation PRs is automatically merged.

## Implemented authority

An approved, versioned, expiring agreement permits store A to present one original Offer of B. B must have the current approved AGENCY mandate and approved original financial contract. B remains actual seller, physical supplier and payee. A receives presentation attribution only and an explicit zero curator fee. This does not create an A Offer, copy a UID, transfer ownership, create an upstream purchase or grant access to B's financial records or customers.

`didar_curation_agreement`, `didar_curation_review` and `didar_curation_revocation` are additive and append-only. Versions are unique per A/Offer. The latest request governs; pending, rejected, revoked, expired and future-effective requests do not fall back to older approval. Both businesses and native Seller links must remain commercially eligible. The original Admin actor and reason are audited. Vendor reads include only agreements involving its own business and omit internal reason/actor economics. Only a canonical Admin can mutate; native requests additionally require `payments:edit`. The native Vendor route requires `didar.finance:view` and cannot approve itself.

API: `GET /admin/didar/curation` and scoped `/vendor/didar/curation`; Admin `POST` operations `request`, `review`, `revoke`. Requests specify `store_supplier_id`, `seller_supplier_id`, `offer_id`, `effective_at`, `expires_at`, `reason`; approval/revocation specifies `agreement_id` and reason. There is no client-selected actual seller or fee.

## One visibility and stock boundary

`didar_curated_offer` validates the exact offer and current agreement/mandate/contract. `didar_scoped_offer` retains original own-store/global rules and adds only that approved case. The existing `didar_visible_product` and media predicate now use this authority, so catalog selection, facet counts, PDP resolver, preview images, product CMS blocks and sharing cannot fall back to other offers. Global NULL scope never derives public visibility from a curation agreement. An approved PRODUCT asset of B may appear for its exact curated product inside A's validated scope; B's editorial assets and unrelated products remain private. Existing SHARED_MASTER behavior remains intact. Revocation is checked on each read; responses are not publicly cached.

The original server-backed storefront context remains required. Quote and checkout call the same `assertOfferScope`; their quote key includes immutable agreement identity/version and actual seller. Order breakdown and sale-role snapshots retain the attribution. Payment rechecks the agreement before provider initialization and again under the existing financial lock before recognition. Curation changes serialize with financial acceptance using the existing financial-domain lock. Pricing changes serialize using the existing shared pricing lock. Existing offer/item locks and reservation uniqueness are unchanged: A and B compete for the same physical UID.

The SQL predicate is also disabled on every pooled connection unless all of `DIDAR_AGENCY_MODE=sandbox`, `DIDAR_ENVIRONMENT=local`, `DIDAR_PAYMENT_MODE=sandbox` are explicit. A per-connection startup option carries the fail-closed SQL flag; it is not a mutable client/session header. Default/non-demo migrations create zero agreements or approvals. An opted-in configuration cannot fall back to legacy commerce when disabled.

## Native and customer screens

The Mercur Admin agency SDK route contains connected request/review/revoke controls. Vendor sees its scoped read-only agreements. Existing customer checkout and pending-order views disclose B as actual seller and A as curator only, with zero additional curator fee. The actual seller can read its own invoice through the native history permission, including commercial suspension; attribution grants A no invoice or customer access.

## Explicit limits

A as actual reseller of B stock is denied. No approved upstream title/entitlement/settlement architecture or contract is inferred from generic agency approval. Permanent UID resolution continues to respect original global/private stock rules; knowing a private UID does not become a global publication grant. No live financial transaction, rollout, owner-server change, CRM work, automatic merge or statutory invoice certification is included. Independent test reports and final receipts, rather than this implementation description, establish what actually passed.
