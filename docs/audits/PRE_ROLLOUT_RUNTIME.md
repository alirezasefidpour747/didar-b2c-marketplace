# Pre-rollout runtime review

Date: 2026-10-17. Review baseline: `4e953c7cf62c327b92f4a461d776fc11c772a9fb`. This review executes disposable local Linux checks and inspects deployment source. It does not authorize or perform a staging rollout, owner-host changes, production payment, new data authority, or CRM development.

## Evidence boundaries

The managed executor reports a connected current environment with an enforced restricted HTTP policy, no VPN, and no configured runtime secrets/outbound identities. Docker Engine 28.4.0 is healthy on the explicit local Unix socket. Verification uses Node 24.19.0, pinned Bun 1.4.3, PostgreSQL 17, Redis 7, FFmpeg/ffprobe 7.1.5 with libx264, and Chromium. Existing configuration and original Docker volumes are retained.

| Check | Evidence and scope |
| --- | --- |
| Original historical volume upgrade | Independently executed against a disposable read-only copy of `didar-gold_postgres`: 7 products, 8 offers, 2 orders. Repeated additive schema upgrades preserve product/offer/order/paid-line/image/collection fingerprints. Native actor/seller/policy counts stay zero. |
| Second historical volume upgrade | Independently executed against a disposable read-only copy of the historical Compose volume: 15 products, 8 offers, 3 orders, same preserved fingerprints and no invented native links. |
| Historical UID scope | Both historical snapshots predate `didar_inventory_item`. Their successful audits do **not** prove populated UID preservation. A separate populated current-schema replay/restore check covers real synthetic exact-UID records. |
| Deployment tooling regression | Independently executed `python3 -m unittest discover -s deploy/oracle -p 'test_*.py'`: 23 tests pass. These use fake Docker or local fixtures; the ARM64 preflight success line is simulated, not an owner-host attestation. |
| Frozen dependency install | Independent clean manifest/workspace-manifest/lock copy: `bun install --frozen-lockfile` installs 2,004 packages successfully in 16.18 seconds with pinned Bun 1.4.3. No shared application dependency tree was changed. |
| Populated replay, restart and restore | Independently executed against the **final rebuilt application tree**, with build receipt verified before and after. One integrated UID/RFID/finance/sandbox-payment/refund test passes (127 assertions), nine real image/onboarding tests pass (152 assertions), and eight CMS tests pass (112 assertions), including actual normalized FFmpeg video. All **79 DIDAR tables** have identical complete row fingerprints after two non-demo migration replays, PostgreSQL restart, and actual `pg_dump -Fc` → `pg_restore --exit-on-error` into a second disposable PostgreSQL container. Populated counts: 11 products, 33 offers, 20 exact-UID items, 1 order/line, 18 finance events, 16 journals/54 postings, 24 media assets/72 variants, 1 video, 5 immutable CMS versions/5 publications. Actual native `/admin/uploads` bytes persist in the copied uploads directory, and the restored API serves those identical bytes, native panel HTML/JS/CSS, catalog, native login and bridged Admin product access. |
| Fresh non-demo installation | Independently executed against the same final production build, exit 0. Fresh schemas initially contain zero actors/seller mappings/policies/users/products/orders. The explicit first-Admin provisioner, non-demo replay, native Admin real HTTP/browser login and dual proof pass. Final counts are exactly 1 Admin, 1 bridge, 0 products, 0 orders and 0 demo users. No native QA/demo seed is invoked in this branch. |

The independently executed [portable runtime probe](../../verification/pre-rollout/probes/runtime-readiness.mjs) copies the built API and native panels into an isolated scratch directory before it starts. Native file uploads therefore cannot alter the shared production build receipt. Each container has a unique owned name and `didar.disposable-qa=true`; cleanup inspects ownership and removes only containers/anonymous volumes created by that invocation. It removes its private database archive, detailed hashes and copied application/uploads after completion. Historical source volumes are mounted read-only and never started directly.

The final populated replay/restore proof's combined fingerprint is `af56c0719249793c7734886690e3f66d21e8806703193b3cb34f3f9a0a1e4a90`. This proves the isolated fixture's before/after equality, not equality to any staging database. The earlier baseline-only restore run also passed and is superseded by this final run with CMS/video coverage.

After that populated restore proof, the only application change was adding `noindex,nofollow` metadata to the native Admin and Vendor HTML. The final source implementation is `3a6e98f68dd38af1ad0c915f88d40ba8201e4dba`; SQL and functional backend code were unchanged by those metadata lines. Both metadata changes were independently source-reviewed, and the final four-part build/receipt and complete regression run cover them. After the full regression completed, the independent runtime reviewer reran the non-demo bootstrap against those **exact rebuilt outputs**, exit 0, with successful native HTTP/browser dual proof and the same 1 Admin / 1 bridge / zero demo-commerce counts. The source/output receipt still verifies after this final run. The populated database restore is not misleadingly represented as a second execution after a metadata-only change.

Durable sanitized evidence: [runtime restore](../../verification/pre-rollout/RUNTIME_RESTORE.log), [fresh non-demo bootstrap](../../verification/pre-rollout/NO_DEMO_BOOTSTRAP.log), [frozen install](../../verification/pre-rollout/FROZEN_INSTALL.log), [historical native clone](../../verification/pre-rollout/HISTORICAL_NATIVE.log), [historical Compose clone](../../verification/pre-rollout/HISTORICAL_COMPOSE.log), and [deployment tooling tests](../../verification/pre-rollout/DEPLOY_TOOLING_TESTS.log). Private database archives, row data, credentials and complete Docker environments are excluded.

## Production build and origin contract

`bun run build:all` performs codegen, both original native panel TypeScript/Vite builds, the Medusa API build with bundled panel assets and SQL, and the Next production build. `scripts/local/build-receipt.mjs` verifies the source, complete artifact outputs, platform, architecture and Node version before `--reuse-build` can be used. The local acceptance runner starts the compiled backend and `next start`, rather than development servers.

For portable native panel assets, build with `MERCUR_BACKEND_URL=same-origin`. API runtime `ADMIN_CORS`, `VENDOR_CORS`, `AUTH_CORS`, and `FILE_BACKEND_URL` must still be actual allowed/public origins. A sentinel string is not a runtime URL. The original main `compose.yaml:28–38` deliberately uses a single `MERCUR_BACKEND_URL` for build origin and absolute runtime settings; setting that variable to the sentinel without a reviewed override produces invalid runtime CORS/file URLs. For that Compose file use an explicit absolute backend origin, or separate build and runtime values in the operator's reviewed kit. This is a deployment configuration constraint, not a reason to change identities, commerce authority, or the owner server in this task.

The native Admin/Vendor paths, entry JS/CSS, `/auth`, Admin/Vendor APIs, and uploaded assets are one routing contract. Native HTML success alone is insufficient. The B2C Next proxy must independently reach the same backend with correct runtime `MEDUSA_BACKEND_URL`; customer CMS media must remain readable under its existing public/context rules.

## Deployment source reconciliation

Inspected `8fc47e5a0ce02f8398cfe804f3a26317d8c76259:deploy/debian13/release-41089a7.sh` without executing it. The script pins the older `41089a7` revision, exact candidate and previous image IDs, an explicit existing Compose project and original volumes. It installs a domain-based restricted preview gateway covering native panels plus auth/API/static dependencies, retains the native bearer authorization header, captures a fresh stopped-writer database/uploads/config backup, runs non-demo migrations, checks actual image IDs and panel asset MIME, and updates the release symlink only after smoke checks. After migrations, failure stops applications for operator review; it does not force a destructive database downgrade/restore. Its final line explicitly leaves authenticated browser verification pending.

Issue #14's latest operator report says the active release was `993cb21`, public Nginx routed everything to Next, local native HTML worked, the old pinned candidate was built in isolation, and rollout had **not** executed. These are reported owner/operator findings, not fresh independent inspection from this executor. The script's old target must not silently become the final new source candidate. A future operator window must reconcile actual running images, selected reviewed revision, gateway/proxy configuration, authenticated all-three-workspace journeys, and approved published CMS content.

## Runtime limitations requiring explicit release decisions

- The current backend logs the local event bus and in-memory locking. A single API replica is the documented bounded configuration. Redis presence alone does not establish distributed event/workflow/locking configuration; horizontal operation needs separate reviewed provider setup and recovery acceptance.
- Native local-file uploads depend on a persistent uploads volume and matching private backup. DIDAR image/video bytes in PostgreSQL require the database backup. An archive-list check proves format only; the disposable restore drill verifies actual restored rows and file bytes separately.
- The first-Admin provisioning script creates native and DIDAR records through separate services; an interrupted run needs explicit state inspection. It does not silently delete partial accounts, auto-match identities, or create commerce data.
- Generic Vendor payments remain denied because the installed native `seller_payment` alias is not a verified DIDAR financial projection. DIDAR financial reports stay in the existing native extensions and original ledgers.
- No current owner-host access, deployed image attestation, Mac/hardware acceptance, real financial provider, commercial CMS content, production readiness, or Chief Architect approval is claimed by a local green suite.

## Commands

```sh
MERCUR_BACKEND_URL=same-origin bun run build:all
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test -- --reuse-build
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test -- --no-demo-install-only --reuse-build
node verification/pre-rollout/probes/runtime-readiness.mjs
python3 -m unittest discover -s deploy/oracle -p 'test_*.py'
```

Application publication remains a source-code checkpoint. Staging rollout and Chief Architect continuation are separate gates.
