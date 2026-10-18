# Pre-rollout integration closure — reconciled scope

## Source and governance

On 2026-10-17 the coordinator fetched `origin` and confirmed both local HEAD and
`origin/main` were `4e953c7cf62c327b92f4a461d776fc11c772a9fb`, with a clean
working tree before this assignment. `41089a7a0ac8084b74bb3a7f128f9a9ca038528b`
is the historical native-recovery comparison, not the current checkout.
The Issue #13 implementation is the delta between those points; it retains
the Phase 4 CMS. Changes for this assignment belong on a review branch/PR,
not an unreviewed direct push to main.

Current Issues [#7](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/7),
[#13](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/13) and
[#14](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/14),
including their comments, were retrieved through GitHub. Their older rollout
or autonomous phase-continuation language does not override the owner's latest
**NO ROLLOUT / STOP FOR CHIEF ARCHITECT REVIEW** assignment. Issue history is
preserved, and neither #13 nor #14 is closed by this package.

The last Issue #14 operator report describes a host at `993cb21`, prepared
`41089a7` images and an unexecuted rollout. Those are third-party reported facts,
not independently established current server state. The separate release
tooling commit `8fc47e5a0ce02f8398cfe804f3a26317d8c76259` was fetched for source
review only. No SSH, owner-server HTTP verification, rollout command, DNS,
proxy/firewall change or staging-content publication is part of this assignment.

## Execution boundaries

- Existing native Mercur Admin `/dashboard`, Vendor `/seller`, and B2C customer
  application remain the three application surfaces. No new Next management UI.
- Approved ADR-BIZ-01 governs eligible DIDAR-managed merchant launch without
  mandatory Vendor login. ADR-CORE-02 supplies the bounded authorization design;
  it does not authorize fundamental data/identity authority changes.
- ADR-CORE-01 remains draft. No ADR-CORE-03 exists in this checkout. Broader
  native commerce convergence, projection durability and cross-supplier retailer
  economics require explicit architecture decisions.
- Existing Product, Offer, UID/RFID, inventory/reservations, orders, customer,
  quote/pricing and financial history are preserved. Only disposable QA services
  receive synthetic writes; historical source volumes are read only.
- No business Phases 5–9, owner-server mutation, live finance or deployment.

## Separate investigations

Subagent tools are exposed by this Codex installation and were actually used.
Four bounded independent streams are assigned: authorization (A), CMS/native
UI (C), integration authority/economics (D/E), and isolated runtime readiness.
Each reviewer owns a separate audit file; application fixes belong to the
coordinator and require review by a different agent. Test resources use separate
disposable databases/ports; shared build artifacts are frozen or copied before
independent execution. Their reports distinguish newly executed tests from
review of `verification/issue13` developer receipts.

Bundled `@mercurjs/docs` 2.3.7 is available, including `llms.txt`, panel extension
conventions, selected-Seller Vendor APIs, product/variant visibility and native
permissions. Installed Medusa is 2.21.2. The original recovery mapping is
[retained](../MERCUR_NATIVE_RECOVERY_MAPPING.md); it is an extension mapping,
not evidence that DIDAR gold order/ledger writers have become native commerce.

**ROLLOUT_NOT_EXECUTED. Engineering verification is not Chief Architect acceptance.**
