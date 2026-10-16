# Existing Didar taxonomy reconciliation — 2026-10-16

This audit follows the new Issue #4 coordination comment and `B2C_PRODUCT_TAXONOMY_FACETS_SPEC.md`, owner revision `7f619456d697e76034323ab9e4416297a0739b48`. It does not assume archival B2B node counts or an installed five-family tree.

## Source and preservation method

Both existing PostgreSQL containers were stopped when inspected. They remain stopped. Their data volumes were mounted **read-only** into copy containers; each physical copy was started in a uniquely named disposable PostgreSQL container with `--network none` and no published ports. Read-only SQL audited the copy. Upgrade/repeat-migration checks ran **only against each throwaway copy**. Copies/containers were removed afterward. No original service was started, original volume written, owner configuration read for secrets or rewritten, or live financial operation performed.

Two preserved local snapshots were available; neither is claimed to be the owner's current production database:

| Snapshot | Products | Offers | Orders | Collections | Existing UID table |
| --- | ---: | ---: | ---: | ---: | --- |
| Compose `didar-gold_postgres` | 7 | 8 | 2 | 1 | Absent — predates Phase 1 schema |
| Native local PostgreSQL volume | 15 | 8 | 3 | 1 | Absent — predates Phase 1 schema |

The typed taxonomy is not already installed in either snapshot. Both contain the same five structural rows below. Additional masters retain their existing unpublished state; all seven/fifteen product IDs remain unchanged. The public seed IDs are `ring`, `necklace`, `bracelet`, `earring` in both snapshots.

## Actual existing tree and archival crosswalk

| Existing ID | Existing Persian name | Slug | Parent ID | Product / published count | Disposition | Proposed owner review |
| --- | --- | --- | --- | --- | --- | --- |
| `jewelry` | زیورآلات | `jewelry` | null | 0 / 0 | existing; legacy_alias | Candidate Family; keep ID/slug/code history. Confirm terminology against archival زیورآلات بدنی. |
| `ring` | انگشتر | `ring` | `jewelry` | 1 / 1 | existing; rename_candidate | Candidate Category corresponding to archive `rings`; stable existing ID/link must remain. No approved actual leaf is known. |
| `necklace` | گردنبند | `necklace` | `jewelry` | 1 / 1 | existing; rename_candidate | Candidate Category corresponding to `necklaces`; no automatic leaf assignment. |
| `bracelet` | دستبند | `bracelet` | `jewelry` | 1 / 1 | existing; rename_candidate | Candidate Category corresponding to `bracelets`; actual clasp/charm/etc. subtype needs owner confirmation. |
| `earring` | گوشواره | `earring` | `jewelry` | 1 / 1 | existing; rename_candidate | Candidate Category corresponding to `earrings`; actual subtype needs owner confirmation. |
| None | Accessories / sets / bullion families and archived leaves | None loaded | None | 0 | new_candidate / deferred | Not seeded or approved from archive names alone. |
| None | Symbolic family | None loaded | None | 0 | deferred | Reserved per specification; no invented children. |
| Existing masters assigned directly to the four children | — | — | — | 4 public masters | conflict | Existing two-level assignments do not constitute a full Family/Category/Subcategory path. Preserve publication/bookmarks as review exceptions; require explicit classification before customer QR or re-publication. |

No rename, rank assignment, mass reparent, product/category re-key, product duplication or synthetic production SKU was performed. Existing categories acquire a stable `legacy.<hash-of-existing-id>` code and `kind=legacy`; an admin must explicitly approve the ranks/leaf mapping using the existing category and product editors. New local-demo nodes are explicitly opted-in test data, separate from this preservation audit.

## Verified migration on each copy

The copies received the additive Phase 1 prerequisite and the shared taxonomy migration twice. Each retained **four public masters**, registered **four pending classification reviews**, and had **zero strictly classified masters**. No public product was automatically hidden. Original-field fingerprints for product identity/classification/publication, offer ownership/weight/quantity/terms, historical orders and paid-line price snapshots were identical before and after. No UIDs were invented for aggregate legacy stock. Because these two snapshots had no UID table, actual UID immutability is independently covered by the full current Phase 1/2 PostgreSQL regression suite, not claimed from these older copies.

| Fingerprint | Compose copy before = after | Native copy before = after |
| --- | --- | --- |
| Products | `0735f62bbaa3171c7300fc4e6624a676` | `84f4a1943317832f6370f3b8821d9ee5` |
| Offers | `7824938fe12a66a0360d95f965c6532e` | `7824938fe12a66a0360d95f965c6532e` |
| Orders | `3e322e0f71fdfbaf72d5cdc97f81e2a6` | `d62224a188ab6ccc3c6164c4f1a1affc` |
| Paid lines | `23257b8f047ed42627f7647ee69bbb48` | `1a8c01ee3e6967b69e9961a2a974d123` |

## Remediation and separate acceptance

Admins can inspect `manage.taxonomy_review` and the Persian legacy warning, explicitly rank/reconcile existing nodes, add the confirmed active leaf, and reclassify the existing master. Saving an approved full path records reviewer/time and resolves that master's review. The old `/products/{id}` bookmark then redirects to the canonical `/fa/products/{family}/{category}/{subcategory}/{slug}-{stable-key}`. Existing UIDs/offers/master IDs remain the same. A legacy exception never authorizes new publication or re-publication after delisting, and customer QR remains blocked until the full path and verified HTTPS public origin exist.

Issue #4 implements this shared structural core and UID journey. At that Issue #4 baseline, Issue #5 retained separate pending acceptance for F01–F12 vocabulary, governed facet assignments, server facet search/counts/pagination, collection governance and additional locale vocabulary approval. The Issue #4 section alone does not claim those wider features; the Issue #5 replay evidence follows below. Production/Mac/printer/camera hardware was not tested.

## Issue #5 additive facet/collection replay — 2026-10-16

Starting from verified Issue #4 baseline `a75adcaf4058233cae0678bf77df78803cb67bad`, the same two stopped snapshots were copied again using read-only source mounts into uniquely labelled, network-isolated disposable PostgreSQL volumes. The Phase 1/shared-taxonomy prerequisites and new `facets-schema.sql` were applied on the copies; the new migration and canonical code seed were repeated. Original services remained stopped and original volumes were not written. This extends the existing reconciliation; it does not reapprove any archival taxonomy or change its crosswalk.

Both copies retained the product/offer/order/paid-line fingerprints above, preserved four public legacy masters and one public legacy collection, and acquired exactly 12 facet definitions / 113 values / **zero product assignments**. Existing collection identity/name/slug and membership fingerprints remained identical:

| Original fields | Compose copy before = after | Native copy before = after |
| --- | --- | --- |
| Collection identity/name/slug | `e104fac39f51ae40837764131c7d6127` | `e104fac39f51ae40837764131c7d6127` |
| Existing master memberships | `791d1eeb89348cec38658e3172148fd2` | `791d1eeb89348cec38658e3172148fd2` |

Disposition: F01–F12 are `new_candidate` controlled vocabulary with supplied fa/en labels; ar/fr are `deferred` pending owner review. Existing collections are `existing / legacy_alias`, retain their IDs/slugs/memberships and receive deterministic immutable codes, with untyped legacy-public status preserved. No existing master receives inferred lifestyle, tier, heritage or marketing claims. The acceptance fixtures are disposable QA data only. Neither historical snapshot contains exact UID or Phase 2 financial tables; current exact UID, financial and paid-order preservation is separately exercised by the full current PostgreSQL regression suite. These copies are not asserted to be the current production database.
