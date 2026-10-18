# Issue 18 — controlled browser completion only

Chief review anchor: PR20 `c82f1968616f8c38072d215d54403012a8c9fadc`,
review5561219454 and Issue18 comment6245051012. All prior acceptance, G4,
restore, screenshots and the honest null outer-harness receipt remain unchanged.

This new independent reviewer wrapper runs the same **32 production browsers**.
It does not run unchanged backend, tooling, native HTTP Jest, G4, restore suites,
install dependencies, rebuild the application, merge, deploy or alter owner data.
The existing Linux/x64 Node24.19.0 source/output receipt is mandatory:
`5b6693e7fa0d079a4f8aca9097e0783361ee361e548d0f9d190ab65ff6bb10bc` /
`63639704924cb668d955b6b09ec7b17da048950c0b0d03f6ff78174315704e0b`.
All 50 frozen test-source files must match aggregate
`ced148cd5776a6d6394f40c60a42f1eeff7c232ad3abb7044a2933deeec98d3a`.

## Review and launch

Read all new source before launching. From the original repository with its
verified existing production builds, Node24 and Bun1.4.3 in PATH:

```sh
PATH=/workspace/tooling/node_modules/.bin:$PATH node verification/issue18/completion/launch.mjs --launch
```

The reviewed c82 head, or its evidence-only descendants modifying exclusively
this completion directory, are accepted. The actual candidate and review anchor
are recorded separately. Application/test/build parity is still mandatory.

The launcher detaches a monitor into a separate process session with file-backed
stdio and unrefs it. The monitor independently waits for a supervisor; that
supervisor independently waits for the actual runner wrapper. The wrapper waits
for the actual Node Playwright CLI close event. Package script `test:e2e` is just
`playwright test`; invoking its pinned CLI directly avoids confusing an outer
Bun process status with the browser command status. Cases/configuration are
unchanged. Discovery and observed test identities are recorded independently,
compared with the actual prior accepted32 log, and every case must pass without
skip/retry. The custom reporter never claims an OS exit code.

Receipts use write/fsync/atomic rename plus fsync of the parent directory; the
append-only event/result logs fsync each observed event. Inspect a detached run:

```sh
node verification/issue18/completion/status.mjs verification/issue18/completion/runs/EXACT_RUN_ID
```

`browser-exit.json` records the actual Playwright child close code/signal.
`wrapper-exit.json` is independently observed by the supervisor.
`supervisor-exit.json` is independently observed by the monitor.
`COMPLETE.json` is written only after both observed exits are zero/no-signal,
all32 actual results pass, final parity passes and owned cleanup passes. A monitor's
own exit is not independently observed and is never represented as such.
A summary line or a process that disappeared cannot establish an exit code.

## Exact owned runtime and prerequisites

The runner copies existing production outputs and unchanged application/test
source into a new private `work/` directory; existing dependency trees are only
read through symlinks. It creates only new named, run-ID-labeled PostgreSQL17 /
Redis7 containers on random127.0.0.1 ports, recording exact IDs and new anonymous
volume IDs before use. Every preexisting container, state and mounted volume is
protected. No prune, name-prefix cleanup or existing UAT volume is used.

Only normal fresh schema/demo setup and the existing guarded native-QA seed run.
The new QA bootstrap then reproduces the original suites' **fixture boundary**:
it conditionally removes existing synthetic native actor bridges for `demo-admin`,
`demo-supplier` and `native-staff-canonical`, and clears only the disposable
authentication window. In the completed fresh run only the seeded Admin link
existed and was removed; supplier/staff links were absent.
This is necessary because a pre-linked demo Admin correctly triggers native login
handoff from legacy transition URLs. The unchanged native browser cases prove
both real accounts and recreate links themselves. The content-editor link,
default native ACLs, four demo masters/eight legacy offers of quantity10, inventory
and all economic facts are preserved. No financial fact/mandate/approval is added
by this bootstrap. Other media, financial and commercial fixtures are created by
the unchanged browser cases themselves.

The original complete build receipt must still verify at the end. Every initial
file of the copied compiled outputs must remain byte-identical; new native static
upload bytes may be recorded separately only under the actual local upload path,
with executable additions rejected. Copied application source and all50 tests
are checked again. A post-runtime copy with uploads is not mislabeled as having
an unchanged complete output hash.

Cleanup verifies process boot/start identity and process groups, exact container
ID/name/run labels and anonymous volume IDs. Only those owned resources are
removed. Every preexisting container/state/volume is checked unchanged, and owned
container/volume/live-process absence is checked. Any stage failure yields a
nonzero wrapper and no PASS completion marker.

If observers are genuinely lost, `recover.mjs EXACT_RUN_DIR --cleanup-only`
refuses to race live observer/wrapper identities, can remove only registered owned
resources, and writes an UNKNOWN/failed recovery-cleanup receipt. It cannot invent
browser or wrapper success or recreate an unavailable exit status.

No live-finance, statutory/Tahesab, distributed-runtime, owner Mac/hardware,
cross-supplier resale, rollout or CRM acceptance is added by this receipt.

## Executed completion

Run `20261018032347950-3b5f7ebe` passed all32 unchanged production-browser cases.
The [summary](SUMMARY.md) links the complete evidence and residual boundaries.
Actual observations are recorded in the [browser log](runs/20261018032347950-3b5f7ebe/browser.log),
[browser exit](runs/20261018032347950-3b5f7ebe/browser-exit.json),
[independently observed wrapper exit](runs/20261018032347950-3b5f7ebe/wrapper-exit.json),
[independently observed supervisor exit](runs/20261018032347950-3b5f7ebe/supervisor-exit.json)
and final [completion marker](runs/20261018032347950-3b5f7ebe/COMPLETE.json).
Final parity and exact owned cleanup passed; the Core reviewer and coordinator
independently verified the receipts. Final Chief Architect acceptance remains pending.
