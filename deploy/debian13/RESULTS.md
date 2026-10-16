# Fixed-commit staging verification

Date: 2026-10-16. Application commit: **`00447d39ffa64881c35813b5242b95fd356c84bb`**.
Repository: `alirezasefidpour747/didar-b2c-marketplace`; owner-selected `main` commit, title `feat: deliver isolated merchant storefronts and curated sharing (#7)`.
Review branch: `staging/debian13-phase2-00447d3`, based directly on that commit. No application-feature changes or merges into `main` are part of this task.

## Tests actually run in this task

Runner: Debian 13 x86_64, 5 visible CPUs, approximately 17 GiB RAM; Node 24.19.0, Bun 1.4.3, PostgreSQL 17, Redis 7 and installed Chromium. This is not an emulation of the target's exact 4-vCPU/8-GB hardware.

| Check | Actual result |
|---|---|
| Fixed checkout identity | Exact SHA verified; application paths unchanged against the pin |
| Frozen dependency install | Passed, Bun 1.4.3; `bun.lock` unchanged |
| Route generation, admin/vendor panels, API, Next production build | Passed |
| Backend/workflow/migration/finance/security/merchant storefront tests | **143 passed**, zero failed; final run 1,771 assertions |
| Native Medusa HTTP integration | **1 passed** |
| Production browser suite | **20 passed**, 1.9 minutes, real Chromium |
| Native Node 20.19.2 launcher check | Reproduced explicit refusal: `Use Node 24 for the verified local workflow` |
| Deployment helper on host-equivalent Node/npm | Node 20.19.2 / npm 9.2.0 verified; helper syntax and configuration tests passed |
| Deployment script/config tests | **7 passed**, using Node 20.19.2 and mocked Docker commands |
| Fresh container API image build | Passed from clean `git archive` of the fixed SHA; frozen install of 2,004 packages, all builds passed |
| Fresh standalone storefront image build | Passed using the same freshly compiled base |
| Compose validation and shell/Node syntax | Passed |
| Live local staging containers | API, storefront, PostgreSQL and Redis healthy under the proposed service memory/CPU caps |
| Staging identity boundary | Empty demo-free catalog/users; separate operator provisioning/login passed; demo identity rejected even with a legacy database row |
| Container functional smoke | Direct API health/catalog, proxied catalog, homepage, manage and native panel entry points passed |
| Container migration replay | User/password hashes, manual rate, private configuration and native upload bytes unchanged |
| Real backup and restore | PostgreSQL custom archive restored successfully into a separate disposable database; user/rate fingerprints matched |
| Data-service restart | PostgreSQL/Redis restart retained data; API reconnected and proxied catalog recovered; all four containers subsequently healthy |

Commands used on the fixed application checkout (Bun was installed in a task-local tools directory and prepended to PATH):

```bash
bun install --frozen-lockfile
PLAYWRIGHT_NO_SANDBOX=1 node scripts/local.mjs test
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 node scripts/local.mjs test --reuse-build
```

The first command sequence built the application and passed all 143 backend and the HTTP integration tests, then the browser stage failed because Playwright's default downloaded Chromium was absent. That was a runner prerequisite issue, not an application assertion failure. The retry explicitly selected the installed system Chromium. `--reuse-build` verified the repository's source/output/platform receipt, then used a new disposable QA database and passed the entire 143 + 1 + 20 sequence. No application code was changed to obtain the pass. The test suite's generated changes to tracked historical screenshots were restored to the pinned versions.

Fresh image build commands used a clean source archive with the deployment Dockerfile under `.staging/` and the managed runner's public CA mounted for dependency downloads:

```bash
docker build --secret id=cloud_ca,src=/etc/ssl/certs/ca-certificates.crt \
  --build-arg MERCUR_BACKEND_URL=http://localhost:19000 --target api \
  -f .staging/Dockerfile -t didar-staging-api:00447d3-test .
docker build --secret id=cloud_ca,src=/etc/ssl/certs/ca-certificates.crt \
  --build-arg MERCUR_BACKEND_URL=http://localhost:19000 --target storefront \
  -f .staging/Dockerfile -t didar-staging-storefront:00447d3-test .
```

The seven mocked deployment tests cover private/non-replacing configuration creation, unsafe configuration refusal without disclosure, public-readable config refusal, full-SHA enforcement, two repeat deployments, build failure before downtime, and migration failure retaining the old pointer/backup and leaving apps stopped. They verify command ordering and stable stack names; they do **not** prove Docker, remote SSH or production data preservation.

The separate live container smoke used project `didar-staging-review`, new volumes, the exact deployment Compose file and newly built images. It did not use any pre-existing Cloud database or production data. Its check driver, logs and JSON are included in the evidence archive. Existing stopped application containers/data services were not restarted or reconfigured. The same-SHA replay preserved populated operator/demo-boundary fixtures, rate and native upload bytes; the larger disposable application suites additionally exercise historical order, inventory and financial preservation. Runtime memory limits were verified at 2 GiB API, 768 MiB storefront, 1 GiB PostgreSQL and 256 MiB Redis, with CPU limits totaling 3.25. These limits are not a target-hardware load test.

## Bugs and operational findings — reported, not fixed in application code

1. **Node 20 native-workflow incompatibility.** The package engine advertises `node >=20`, but `scripts/local/runtime.mjs` explicitly requires major version 24. Reproduction on actual Node 20.19.2: `node scripts/local.mjs test` exits 1 with the message above. This check establishes the launcher restriction; it is not a comprehensive claim that every API route fails on Node 20. The deployment uses an isolated Node 24 container runtime, preserving the host's supplied Node/npm.
2. **Large native panel bundles.** Vite reports the existing admin entry bundle around 7.3 MB before gzip (around 1.8 MB gzip) and chunks above its 500-kB warning threshold. Builds pass, but slow-network panel performance needs separate evaluation. No optimization was made here.
3. **Existing framework persistence limitation.** Runtime logs report a local event bus and in-memory locking/workflow defaults. This staging layout deliberately runs one API instance. Multi-instance reliability, durable framework work queues and production hardening are outside this task.

No reproducible application assertion failure remained in the executed backend, HTTP or browser suites. Passing these tests does not establish that no other bugs exist. Build output also includes a non-blocking existing Next `<img>` lint warning; seed startup can report codegen warnings, while the explicit build codegen step succeeds.

## Checks still requiring access to 82.115.24.51

No SSH credentials or server access were supplied/configured. No connection, package install, upload, deployment, firewall/DNS change, production modification or Codex installation was performed on that server.

- Confirm the Debian version, x86_64 architecture, 4 vCPU/8 GB/100 GB allocation, free disk and absence of port conflicts.
- Install/verify Debian Docker Engine + Compose v2, registry/Git reachability, actual image builds and resource headroom on that hardware.
- Run the provided initial deployment and repeat the exact-SHA updater there; check private config bytes, data fingerprints, persistent uploads and backups before/after.
- Verify the operator account, laptop SSH tunnel, actual desktop/mobile browser behavior and intended staging business workflows.
- Reboot the VM and verify automatic service recovery; perform an operator-controlled backup restore drill into a separate staging database.
- Physical RFID/printer/phone behavior and public label/QR origins remain unverified. Real payment/provider operations and production are excluded.

The complete update script has been exercised with mocked Docker, not as an unattended real-server deployment. Live local container checks are reported separately in `container-results.json`; they exercise the same staging Compose configuration using only newly created disposable local volumes.

## Evidence files

The downloadable evidence archive contains this task's initial/full retry logs, fresh image-build logs, deployment tests, Node 20 refusal, container check logs/results and the container-check driver. It excludes environment files, tokens, passwords, databases and upload backups. Historical `verification/` files committed by earlier tasks are not counted as tests run here.
