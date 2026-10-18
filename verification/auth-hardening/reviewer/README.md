# Independent auth-hardening evidence

Nonimplementing reviewer; bounded SEC01/SEC02 from `2c634ffdb77d4683271b5b218ca0a606af74004a`. Tested app `fb9daec7a947f234e7931c63f62d70e92e273c76`. No application writes, rollout or unchanged full-suite rerun.

The sole run [auth-20261018055943718-62ed321f](runs/auth-20261018055943718-62ed321f/) completed successfully. [Independent final check](runs/auth-20261018055943718-62ed321f/INDEPENDENT_FINAL_CHECK.json), [completion](runs/auth-20261018055943718-62ed321f/COMPLETE.json), [launch manifests](runs/auth-20261018055943718-62ed321f/launch.json), [source/artifact parity](runs/auth-20261018055943718-62ed321f/parity.json), [cleanup](runs/auth-20261018055943718-62ed321f/cleanup.json).

- [Persistent affected tests](runs/auth-20261018055943718-62ed321f/persistent-affected-tests.log): 16 PASS, 299 assertions, actual close0.
- Independent [before restart](runs/auth-20261018055943718-62ed321f/http-before-results.json) 19 and [after restart](runs/auth-20261018055943718-62ed321f/http-after-results.json) four cases. Numeric raw case `status` fields are HTTP response codes; phase PASS/actual exit0 establish completed assertions.
- [Three real browser journeys](runs/auth-20261018055943718-62ed321f/browser-verdict.json), [actual browser close](runs/auth-20261018055943718-62ed321f/browser-exit.json), [actual wrapper close](runs/auth-20261018055943718-62ed321f/wrapper-exit.json), [actual supervisor close](runs/auth-20261018055943718-62ed321f/supervisor-exit.json): all0/no signal.
- [Native Admin desktop](runs/auth-20261018055943718-62ed321f/screenshots/native-admin-auth-1440.png), [mobile](runs/auth-20261018055943718-62ed321f/screenshots/native-admin-auth-390.png).
- [Native Vendor desktop](runs/auth-20261018055943718-62ed321f/screenshots/native-vendor-auth-1440.png), [mobile](runs/auth-20261018055943718-62ed321f/screenshots/native-vendor-auth-390.png).
- [Customer desktop](runs/auth-20261018055943718-62ed321f/screenshots/customer-signed-ingress-auth-1440.png), [mobile](runs/auth-20261018055943718-62ed321f/screenshots/customer-signed-ingress-auth-390.png).

Reproduction requires the frozen application outputs, dependencies, Docker cache, Node24.19/Bun1.4.3 and a suitable system Chromium. After independent source review, run from the repository with pinned PATH and `AUTH_REVIEW_CANDIDATE` equal to the intended frozen HEAD:

```sh
AUTH_REVIEW_CANDIDATE=fb9daec7a947f234e7931c63f62d70e92e273c76 \
node verification/auth-hardening/reviewer/launch.mjs --launch \
  tests/auth-hardening.test.ts tests/native-product-targets.test.ts
```

The launcher refuses a different HEAD or stale production receipt. A later evidence-only commit can use its actual HEAD when the application/test hashes still match. No build receipt is regenerated. The detached monitor/supervisor records real child closes, then requires parity and exact owned cleanup before writing completion. Ephemeral keys and native fixture tokens remain private runtime memory/scratch, not these receipts. The monitor's own exit is not an independently observed claim. Only new labeled loopback resources are eligible for cleanup; protected resources are preserved.
