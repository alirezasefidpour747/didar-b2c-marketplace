# Phase 1 verification evidence

Application code revision: `ba85987bbdcf63a96a868a1c5572b15c3cfec0f6`. Final changes after that revision are documentation, evidence and stronger browser navigation assertions; application source is unchanged.

- `backend-tests.log`: 52 tests / 507 assertions against compiled API (separate host development database).
- `compose-backend-tests.log`: all 52 / 507 against the actual container database through the guarded helper.
- `compose-browser-final.log`: all 8 Playwright checks passed in one final Docker run. The preceding attempt's single mobile navigation failure prompted an explicit URL wait and level-one product heading assertion; no application behavior was bypassed.
- `mobile-cold-restart.log`, `persistence-*.json`: cold restart browser check plus identical 29-unit UID/state checksum.
- `container-source-match.json`: 119 application/build-input and compiled service files match packaged API source; `container-stock-invariants.json` records zero cache mismatches and zero physical items linked to legacy offers.
- `image-*-env-check.json`, `runtime-secret-comparison.json`: runtime env files excluded; six actual runtime values do not appear in reviewed source/build files. Documented local demo defaults and unauthenticated local URLs are distinct from deployment secrets.
- `build.log` and `api-build-final.log`: official route types, both native panels, API, Next. The final API rebuild includes scoped-count redaction.
- `docker-*-build.log` and `docker-api-final-layer.log`: prepared artifacts use installed locked dependencies; the final API layer includes the rebuilt isolation fix and source revision label. These local images are **amd64**, not verified ARM releases.
- `compose-up.log`, `compose-final-status.json`, `compose-restart.log`: four healthy local services, persistent volumes, loopback application ports. Slow VFS container copying/removal dominated local startup; no database reset or storage-driver change occurred.
- `medusa-health.log`: native HTTP health passed. `deployment-guards.log`: 23 local/mocked safety checks; no cloud provisioning. `arm64-static.log`: artifact/selector compatibility, not native execution.
- `github-source-check.json`: independently downloaded public GitHub source matches the local SHA-256 at the published code commit.
- `pr-web-state.json`: public GitHub data confirms PR #1 was already merged by the owner as a one-commit specification change. `pr-create.log` records the exact API Forbidden blocker to creating the successor draft. No implementation was merged.
- `recovery-bundles.sha256`: the original delivery/MVP bundles are preserved; the source milestone bundle was verified to contain complete Git history. The final handoff bundle includes this evidence commit too.

RFID screenshots show explicitly simulated/text-reader input and synthetic QA inventory. No physical reader, RF performance, chip encoding or real scale verification is claimed. No runtime credential values, database dumps or ignored environment files are included here.
