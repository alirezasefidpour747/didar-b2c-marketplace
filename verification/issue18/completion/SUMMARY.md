# Issue 18 — controlled browser completion receipt

**PASS for the Chief Architect's narrow completion-evidence action.**
The same32 production-browser cases passed in a new owned disposable runtime,
with actual browser, wrapper and supervisor exit-zero observations, final parity,
automatic owned cleanup and a durable completion marker. Final bounded acceptance
and any merge-sequence decision remain with the Chief Architect.

Review anchor: PR20 `c82f1968616f8c38072d215d54403012a8c9fadc`,
[Chief review5561219454](https://github.com/alirezasefidpour747/didar-b2c-marketplace/pull/20#pullrequestreview-5561219454),
[Issue18 instruction6245051012](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/18#issuecomment-6245051012).
This run tested that unchanged candidate. Publication of the append-only evidence
commit and its exact final SHA belongs to the coordinating agent after review.

## Observed completion

Run ID: `20261018032347950-3b5f7ebe`.
All receipts below are in [the unique run directory](runs/20261018032347950-3b5f7ebe/).

| Observation | Actual result | Durable receipt |
| --- | --- | --- |
| Browser selection | Same32 file/line/title identities as prior accepted log; unchanged source/config | [selection](runs/20261018032347950-3b5f7ebe/browser-selection.json) |
| Production browsers | **32 passed, zero skips/retries,3.4minutes** | [actual log](runs/20261018032347950-3b5f7ebe/browser.log), [per-case end](runs/20261018032347950-3b5f7ebe/browser-reporter-end.json) |
| Actual Playwright CLI close | Exit0, signalnull; child2922 observed by runner2024 | [browser exit](runs/20261018032347950-3b5f7ebe/browser-exit.json) |
| Actual runner-wrapper close | Exit0, signalnull; runner2024 independently observed by supervisor2017 | [wrapper exit](runs/20261018032347950-3b5f7ebe/wrapper-exit.json) |
| Actual supervisor close | Exit0, signalnull; supervisor2017 independently observed by detached monitor2010 | [supervisor exit](runs/20261018032347950-3b5f7ebe/supervisor-exit.json) |
| Final parity | PASS for original application, copied source/output,50 tests and eight frozen harness-source files | [parity](runs/20261018032347950-3b5f7ebe/parity.json) |
| Automatic owned cleanup | PASS: exact2 new containers/two anonymous volumes removed; six tracked process groups have no live members; all10 preexisting containers/state/mounted volumes preserved | [cleanup](runs/20261018032347950-3b5f7ebe/cleanup.json) |
| Durable completion | PASS, written after every stage and both independent wrapper/supervisor exit observations | [COMPLETE](runs/20261018032347950-3b5f7ebe/COMPLETE.json) |

The monitor's own exit is not independently observed and is not claimed. Browser
success is established by actual child close plus all32 observed per-case results,
not inferred from a summary line. Atomic fsynced receipts and the append-only
[event log](runs/20261018032347950-3b5f7ebe/events.jsonl) preserve the observation order.

## Unchanged provenance

- Application implementation: `7b31849bb61255d5dc009c7e24a51051f12154b2`.
- Tested candidate/review anchor: `c82f1968616f8c38072d215d54403012a8c9fadc`.
- Frozen test source: `010c66a5d55554e6e3fffd834851827630958b1d`.
- Original and copied source SHA-256: `5b6693e7fa0d079a4f8aca9097e0783361ee361e548d0f9d190ab65ff6bb10bc`.
- Original and copied complete output SHA-256: `63639704924cb668d955b6b09ec7b17da048950c0b0d03f6ff78174315704e0b`.
- All50 frozen test-file aggregate SHA-256: `ced148cd5776a6d6394f40c60a42f1eeff7c232ad3abb7044a2933deeec98d3a`.
- Frozen eight-file harness-source aggregate SHA-256: `7f7b9e8d070fa0ca4c436b6e6d2f9b3fbbf7ee07a6c318896a49198c610cc043`.
- All1789 initial compiled files remained byte-identical, aggregate `dedca43b0347b1b98d44c64f73838714d8a6fe4e2a49ca3f79575a688a70c90a`; no runtime upload additions occurred.
- Runtime: Linux/x64, Node24.19.0, existing Bun1.4.3 and pinned Playwright; native Admin/Vendor and Next use the verified production outputs.

The original build receipt was verified before copying and again after execution.
It was not regenerated. No application, existing test, old report, screenshot,
prior log or null-harness receipt was changed. Only this new completion directory
was added. No unchanged backend/tooling/native-HTTP-Jest/G4/restore suite ran;
their prior independently accepted evidence remains valid and separate.

## Fresh QA prerequisites and resource boundary

The ordinary fresh schema/demo setup and existing guarded native-QA seed created
four demo masters/eight legacy offers, each quantity10. The bootstrap conditionally
removed existing synthetic actor links for the original suites' exact IDs
`demo-admin`, `demo-supplier` and `native-staff-canonical`. Only the seeded Admin
link existed and was removed; supplier/staff links were absent. The editor link
and default ACLs were preserved. Actual
fresh state was zero explicit native ACLs, orders, financial events, mandates,
S1 storefront and S1 merchant-home page. No invented financial fixture or extra
grant was needed; the unchanged browser cases created their own business/media
fixtures and proved actual native dual-account links.
See [bootstrap](runs/20261018032347950-3b5f7ebe/bootstrap.json).

All new services used random127.0.0.1 ports and exact run-ID labels. Cleanup
verified recorded PID boot/start identities, exact container IDs and anonymous
volume IDs; no prefix cleanup, prune or old UAT volume was used. All10 preexisting
containers, states and mounted volumes were retained unchanged. Generated browser
screenshots/videos stay in the owned scratch directory; the previously reviewed18
screenshots remain unchanged rather than duplicated in this evidence commit.

The launcher, supervisor, monitor, runner, reporter and recovery/status sources
are documented in [README](README.md). Both coordinator and separate Core reviewer
approved their executable hashes before launch. Both independently verified the
final receipts after execution: [Core final review](CORE_COMPLETION_REVIEW.md) and
[coordinator final check](COORDINATOR_FINAL_CHECK.json).

## Remaining decision boundary

This closes only the previously outstanding controlled-runner evidence action.
It is not whole-roadmap acceptance, legal/tax/Tahesab or live-capture/refund
certification, distributed-operation certification, owner Mac/hardware acceptance,
actual A-reseller/B-upstream economics or arbitrary-partner discharge. Existing
B-principal/A-curator semantics and other reviewed limitations remain explicit.
No rollout, owner-server change, merge, issue closure or CRM Phase5–9 implementation
was performed or authorized by this receipt.
