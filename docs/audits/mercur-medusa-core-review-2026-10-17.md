# Mercur / Medusa core audit — Chief Architect review guide

Date: 2026-10-17  
Status: Technical recommendations for review. No implementation authorization.  
Audited source: `0aeec24d2292fb3e60848ac2deaa68b76a478ded`  
Native references: Mercur 2.3.7 and Medusa 2.21.2.

[Read the complete evidence-backed audit](mercur-medusa-core-as-is-2026-10-17.md).

## Deliverables and navigation

| Requested assessment | Location in complete audit |
| --- | --- |
| AS-IS applications, API paths, persistence and data authority | Section A |
| Native capability vs DIDAR implementation, duplication and genuine gaps | Section B |
| Keep / Configure / Extend / Refactor / Replace recommendations and trade-offs | Section C |
| Duplicate implementations, violations and integrity risks | Section D, findings F01–F12 |
| Recovery sequence preserving data, code and working behavior | Section E, packages R0–R7 |
| Unresolved architecture decisions and proposed ADR queue | Section F |
| Pinned source paths, line anchors and inspected symbols | Evidence register D01–D35, N01–N15, M01–M02 |

## Priority review items

1. **F01: Installer defect.** Normal non-demo setup exits before applying native identity-link tables. Existing native tests construct the tables separately. Review a narrowly scoped fix and installer-path tests as a subsequent task; this PR changes no installer.
2. **F03/F04: Identity and authorization.** The current bridge does not fully represent delegated staff or native multi-store membership. Fine-grained native rights remain conditional on an actual permissions resolver, which is not configured in the inspected application config.
3. **F05: Product projection consistency.** DIDAR SQL and native workflows do not share one transaction. Local compensation is insufficient evidence of crash-safe synchronization.
4. **F02/F06/F07: Competing generic authorities.** Native and DIDAR catalog, seller and commerce systems coexist. Native panel embedding is real, but does not unify commerce data.
5. **F08/F10/F12: Cutover and release boundaries.** Staff/pending-state/deep-link parity, real providers and deployed-runtime verification remain separate acceptance gates.

## Decisions awaiting architectural review

| Proposed ADR | Decision to resolve |
| --- | --- |
| CORE-01 | One authority per domain/field, economic seller, value units and mapping policy |
| CORE-02 | Native identity, scoped membership and permission convergence versus temporary dual-auth exception |
| CORE-03 | Native Offer/cart/order workflows with existing gold services versus a bounded custom gold-commerce exception |
| CORE-04 | Native catalog/category/attribute structures with governed extensions versus retained DIDAR structures |
| CORE-05 | Durable projection/reconciliation and versioned migration strategy |
| CORE-06 | Media persistence and provider adoption while preserving approvals, privacy and historical URLs |

These identifiers are **proposed queue labels**, not accepted ADRs. The full audit records alternatives and review questions. It does not choose or approve a fundamental architecture change.

## Preservation and implementation boundary

Preserve product/offer/customer identities, historical URLs, UID/RFID and measured weights, reservations, paid price/contract/store snapshots, immutable financial events/journals, media and existing business functions. No bulk migration, duplicate reservation engine, mirrored financial transactions, framework replacement or deletion is authorized.

Merging this documentation PR records findings and recommendations only. Any later implementation must follow Chief Architect reconciliation and owner approval where required by project governance.

## Verification boundary

The audit independently checked pinned source, published package versions and lockfile archive integrity, installer control flow and evidence anchors. Prior regression/browser results are attributed to repository receipts.

No application/runtime test suite was independently rerun; no live database, staging deployment, hardware or production provider was inspected. The audit remains anchored to the stated SHA if application code changes later.
