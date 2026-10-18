# Independent Issue 23 baseline and correction acceptance

All source baseline runs use accepted `41d880a5dd4c2462144f52b1591576882238d125` production artifacts and disposable loopback PostgreSQL17/Redis7 only. They preserve all10 prior containers, capture exact owned resources/process identities and actual child exits, and assert original/copy source5b6693/output636397 plus50 tests ced148 remain unchanged. No production build, full suite, live provider or owner resources were used.

- `runs/baseline-20261018041106967`: real API/Next shared-proxy lockout and spoofed XFF bypass reproduced. Wrapper actual exit0 means reproduction completed, not corrected security acceptance.
- `runs/native-baseline-20261018041432786`: valid native Admin proof; ordinary protected parent409; forged unrelated-parent single/batch variant deletion200 and actual linked target soft-delete in PostgreSQL. Canonical Product/Offer/UID/order/financial counts unchanged. Actual wrapper0, parity and cleanupPASS.
- `runs/native-baseline-20261018041251171` and `runs/native-baseline-20261018041342338`: preserved fixture diagnostics (invalid create DTO before target operations), wrapper1 and cleanup/parityPASS. Not application regressions or accepted proofs.

`common.mjs` is a new local copy of the earlier independent completion helpers with a distinct Issue23 ownership label. `baseline-runner.mjs` / `native-baseline-runner.mjs` copy frozen artifacts and start only required owned services; ordinary schema/demo/native-QA setup is not a regression suite. `probe.mjs` and `native-target-probe.mjs` contain the actual HTTP assertions and PostgreSQL corroboration. Launch scripts independently record the runner close event. No bearer tokens or real credentials are written to evidence; synthetic QA identities are the existing documented fixtures.

The preceding historical runs are baseline defect receipts. The final correction has separate independent affected-behavior acceptance below on its new exact source/artifact candidate. Existing Issue18 evidence is inherited and not overwritten.

## Corrected-candidate acceptance

Final run `correction-20261018042135715` tests `fa03ac3e5a91ec393d57bae0ac7ee2a0aff05782` (sourcecb75fd / outputs518792). [Actual runner exit0](runs/correction-20261018042135715/runner-observed-exit.json), [final parity](runs/correction-20261018042135715/parity.json) and [cleanup](runs/correction-20261018042135715/cleanup.json) PASS.

- [Six persistent regressions /23expect](runs/correction-20261018042135715/persistent-target-regressions.log).
- [23 independent real HTTP/PG cases](runs/correction-20261018042135715/independent-http-results.json).
- [Three actual authenticated browser journeys /six screenshots](runs/correction-20261018042135715/independent-browser-smoke.json), [actual browser child exit0](runs/correction-20261018042135715/independent-browser-smoke-exit.json).

The 51 root test-source files and four independent reviewer executable sources are captured/rechecked in parity. The browser process is independently observed and its entire process group is included in owned cleanup. First correction run `correction-20261018042015145` is preserved as a reviewer browser-environment diagnostic (HTTP checks passed, browser launch failed, wrapper1, cleanup/parityPASS).

The root receipt was not regenerated during independent execution; no source/output mutation occurred. Auth SEC01/02 remain OPEN, and direct-route correction is not universal importer/pending-change/native-price certification. Read the independent security report for the exact bounded PASS and overall dependent-packet BLOCKED disposition.
