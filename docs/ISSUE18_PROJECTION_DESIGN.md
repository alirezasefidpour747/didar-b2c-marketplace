# Issue #18 G4 — revisioned Product projection recovery

DIDAR Product Master remains the source. Native Medusa Product is a one-way
catalogue projection, never a writer of stock, Offer, UID, order or finance.
Existing native IDs remain unchanged; historical rows are not backfilled.

## Installed reuse assessment and independent design review

Inspected Mercur 2.3.7 bundled `resources/best-practices/workflows.mdx` and
`platform/catalog/reference/workflows.mdx`, its actual
`workflows/product/workflows/create-products.js`, and Medusa 2.21.2
`core-flows/dist/product/steps/create-products.js`. Mercur forwards supplied IDs
into the supported Medusa create step, then adds options/variants/audit. The
native workflow compensation covers its own steps, not DIDAR's caller COMMIT.
A native workflow invocation alone cannot recover a caller transaction that
fails after the native workflow returned. No source-of-truth switch or new
workflow persistence provider is selected.

Before application edits, a disposable PostgreSQL/Redis prototype called the
original Mercur create workflow with an explicit Product ID and the original
Medusa update workflow against the same ID. Native count stayed one. The
separate Core reviewer reviewed the source-first outbox design and required
preserving published native reads (an always-draft alternative was rejected).
Implementation uses those native workflows, not SQL mutations of native tables.

## Commit and recovery contract

- A trigger assigns `prod_didar_` + MD5(master ID) on a NEW Product or the first
  relevant edit of an old unlinked row. Existing non-null native IDs are immutable
  and already unique in the original schema. Existing untouched records do not
  change. No new native row is written before the source commits.
- The same canonical transaction writes `didar_product_projection` revision and
  `(product_id,revision)` job. Rollback, including final COMMIT failure, rolls back
  source, identity, revision and job together. There is no native compensation
  needed for an uncommitted source. The previous best-effort inverse write race
  is removed; compensation failure cannot leave an untracked external mutation.
- Only after successful COMMIT does a best-effort hook flush this Product for
  immediate native UI parity. Hook failure cannot report a committed mutation
  as failed. A registered minute job and explicit Medusa operator script drain
  the same durable queue independently of the request process.
- Worker locks the canonical Product first and state second, reads latest source,
  supersedes old delivery revisions and keeps the source lock through native
  workflow and acknowledgement. Concurrent edits wait, then enqueue the next
  revision. SKIP LOCKED prevents duplicate active writers for the same master.
- Native writes retain `active && published && approved` status and original
  title/description/metadata. A claimed ID must be tagged DIDAR and, where the
  master marker exists, match the exact master. A foreign collision fails closed.
- Native success before process death is replayed at the same ID. No inverse
  delete/restoration races a newer source. The row lock drops on process death;
  unacknowledged jobs remain eligible without an expiring in-memory lease.
- Five forward failures produce observable FAILED status, code and attempt count;
  retry delay is exponential, capped at 300 seconds. Only a newer source revision
  or explicit latest-only reconciliation makes it eligible again. Error payloads
  and credentials are never persisted in error_code.
- PR #15 privacy remains in force. For tracked rows, native Store and Vendor
  reads additionally require source/ack/native metadata revision agreement.
  During lag or repair, these reads temporarily return no Product; canonical
  DIDAR B2C remains governed by its original current visibility rules. Historical
  untracked and independent native products retain their previous behavior.

A process death within Mercur create can commit the native Product before its
Standard variant. A reviewed disposable prototype verified repairing this narrow
partial state through the original `createProductVariantsWorkflow`, using a
stable variant ID, confirmed `__default__` option and `manage_inventory:false`.
Existing variants are untouched. Missing/incompatible placeholder options fail
closed for explicit investigation. A partial workflow can also lack its native
PRODUCT_ADD descriptive audit; DIDAR canonical actor audit remains intact, but
complete recovery of that native audit is an explicit residual gap. No audit
record is fabricated or blindly replayed.

No atomic transaction across independent native workflow and canonical stores is
claimed. This is durable convergence with a fail-closed read boundary.

## Operator visibility and repair

Use `medusa exec ./src/scripts/didar-product-projection.ts`. It emits batch
results and the latest 200 source/ack/status/attempt/error records. To requeue a
known failed latest revision, set `DIDAR_PROJECTION_RECONCILE_ID` explicitly for
that command. It does not rewrite historical source or reset native identity.
Normal scheduler batches process up to 20 eligible Products each minute.

## Verification and limitations

`tests/projection-durability.test.ts` uses actual disposable PostgreSQL for
final canonical COMMIT failure, transactional hook suppression, reordered latest
revisions, source lock/concurrent edits, bounded retry, terminal visibility,
latest-only repair and immutable links. Its injected write seam verifies queue
mechanics; it is not claimed as a native workflow/process-death proof.

Separate disposable native workflow proof actually SIGKILLs the process after
native commit and before acknowledgement, edits the canonical source, and starts
a fresh worker. Native count remains one and latest source/ack/native title
converge. Independent review reruns these scenarios in its own copied artifact
runtime and owns its evidence. Final acceptance must cite those actual results,
not this design description. Statutory/finance/rollout semantics are untouched.
