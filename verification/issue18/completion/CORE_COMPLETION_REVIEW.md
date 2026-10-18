# Independent Core follow-up: controlled browser completion

Scope is limited to Chief Architect Issue #18 comment [6245051012](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/18#issuecomment-6245051012) and PR #20 review [5561219454](https://github.com/alirezasefidpour747/didar-b2c-marketplace/pull/20#pullrequestreview-5561219454), both read in full. Baseline is `c82f1968616f8c38072d215d54403012a8c9fadc`. This separate Core agent reviews the new completion runner and receipts; it does not implement that runner or alter application/existing test source.

## Bootstrap review

The normal disposable native seed creates an Admin bridge. `workspace.ts` reports a valid bridge as `ready:true`, causing legacy management navigation to require native login. Original `tests/native-panels.test.ts` afterAll deletes links for `demo-admin`, `demo-supplier` and `native-staff-canonical`; native-policy and pre-rollout authorization cleanup remove subsets. Reproducing exactly that unconnected synthetic boundary in the newly owned QA database is valid preparation, not an authorization bypass. The original native browser journeys must still prove and reconnect the existing actors.

Preserve the seeded content-editor bridge, native member/store associations, staff content grants and default ACL. Do not manufacture broad native policies, supplier commercial grants, S1 storefront approval or S1 home drafts. Fresh explicit demo catalog/stock plus native QA identity services are sufficient prerequisites from source inspection. Existing browser cases create their own positive financial facts, physical intake, governed roles and actual approved media. The initial reconciliation screen checks error counts without requiring fabricated finance events. No unchanged backend, tooling, native Jest, G4 or restore suite should be rerun for this completion action.

## Status

Concrete new runner source, observed browser exit, exact test/artifact parity, owned cleanup and independently observed wrapper completion remain subject to the follow-up review recorded below. No completion approval is asserted by this preparatory note.

## Pre-launch source review

Reviewed the eight new executable files (`bootstrap`, `common`, `launch`, `observer`, `recover`, `reporter`, `runner`, `status`) plus README. Independent syntax checks pass for all eight. The original four-output build receipt still verifies, and the 50-file test manifest independently recomputes to `ced148cd5776a6d6394f40c60a42f1eeff7c232ad3abb7044a2933deeec98d3a`. Reviewed executable harness aggregate: `7f7b9e8d070fa0ca4c436b6e6d2f9b3fbbf7ee07a6c318896a49198c610cc043`.

Pre-launch corrections were confined to this new harness: reject a nonzero/signal child before a PASS completion marker; explicitly compare the recomputed test aggregate; accept the exact owned scratch root when checking orphan process cwd; fix the new script syntax; inspect only Docker metadata needed for ownership, never original container environments. These were source findings before any browser execution, not application defects or changes to existing assertions.

The runner observes actual Playwright CLI close separately from reporter results, then records final original/copied source/output/test/harness parity and owned cleanup. A separate supervisor observes the runner's exit, and a detached monitor observes that supervisor before writing completion. Reporter summaries or intended exit codes do not substitute for observed close events. The monitor's own exit is explicitly not claimed. Recovery cleanup refuses live observers and cannot produce completion success.

Resource cleanup checks PID boot/start identity and process groups, exact new container ID/name/run labels and its new anonymous volume IDs; all preexisting container/state/mounted-volume metadata is preserved. Existing data/configuration and original stopped resources are outside its deletion set. The source is approved for the authorized same-32 run; observed receipts and post-run parity still require independent review. No application or existing test file was changed, and no unchanged acceptance suite was executed for this review.

## Final observed completion review — PASS

Run: [`20261018032347950-3b5f7ebe`](runs/20261018032347950-3b5f7ebe/). The same **32** browser identities from the earlier accepted log completed **32 passed (3.4m)**, without retry, skip or altered assertions. Independently compared discovery identities, actual reporter identities and all 32 individual result records; these are repeat observations of the same cases, not 32 additional unique tests.

Actual status chain is now recorded rather than inferred:

- [`browser-exit.json`](runs/20261018032347950-3b5f7ebe/browser-exit.json): Playwright CLI child close **code 0 / signal null**, observed by the runner.
- [`wrapper-exit.json`](runs/20261018032347950-3b5f7ebe/wrapper-exit.json): runner wrapper **exit 0 / signal null**, independently observed by the supervisor.
- [`supervisor-exit.json`](runs/20261018032347950-3b5f7ebe/supervisor-exit.json): supervisor **exit 0 / signal null**, independently observed by the detached monitor.
- [`COMPLETE.json`](runs/20261018032347950-3b5f7ebe/COMPLETE.json): PASS written after those observations, final parity and owned cleanup. Checked observer/child PID linkage, run IDs and timestamp ordering. Monitor self-exit remains explicitly unclaimed; it is not substituted for any required wrapper status.

Independently recomputed all **50** original and copied test-source hashes (`ced148…98d3a`) and all **eight** frozen executable harness hashes (`7f7b9e…cc043`). Original production build receipt still verifies exactly at source `5b6693…10bc` / outputs `636397…e0b`. All **1,789** initial copied compiled files retain matching manifest/bytes, with **zero** runtime artifact additions. No existing application, test, original harness or prior evidence path differs from the review anchor.

Independently queried local Docker metadata after completion: all **10** protected preexisting containers retain their exact IDs, names, stopped states and mounted-volume IDs. Both newly registered run containers are absent; their exact recorded anonymous volumes return “no such volume” from the functioning local Docker service. All registered owned process groups have zero live members. This confirms [`cleanup.json`](runs/20261018032347950-3b5f7ebe/cleanup.json), rather than merely trusting its PASS field. No original volume or owner-server configuration was used or removed.

**The narrow controlled-run evidence action has passed independent Core review.** No backend/tooling/native Jest/G4/restore suite was repeated; earlier verified evidence remains valid and unchanged. The old receipt's unknown exit remains honestly preserved as history; it is not rewritten to zero. This new receipt supplies the missing independently observed completion chain. Chief Architect final bounded acceptance and merge-sequence decisions remain pending; no automatic merge, issue closure, rollout, live financial action or Phase 5 implementation is authorized by this note.
