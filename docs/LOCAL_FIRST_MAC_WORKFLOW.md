# Didar Gold — Codex Cloud Development, Mac Local Testing (No Oracle)

## Status and ownership

This is the authoritative **local-first development and user-acceptance workflow** for Didar. It changes the testing/deployment workflow, not the business domain or the verified Phase 1 implementation. Oracle is **not** a dependency for development, testing, or acceptance. The owner uses a macOS laptop to run and evaluate the software; Codex Cloud does implementation and automated verification and publishes reviewable commits to GitHub. No hosted staging or live payment/accounting is authorized by this workflow.

Repository: `https://github.com/alirezasefidpour747/didar-b2c-marketplace`. The default branch `main` contains merged Phase 1 intake, UID/RFID and Gold-First marketplace implementation. The authoritative functional documents are `docs/PHASE1_UID_RFID_INTAKE.md` and `docs/PHASE1_OPERATIONS.md`. All supplier obligations, procurement, wallet, general ledger, settlement and Tahesab posting remain Phase 2. Physical RFID device verification remains pending.

## Workflow and acceptance gates

1. **Codex Cloud development.** Fetch latest `main`, read the existing functional scope and this document. Implement the requested vertical slice in the existing Mercur/Medusa/Next/Bun/PostgreSQL system. Do not replace the app, duplicate gold stock ledgers or invent financial functions. Use one task branch for significant unverified code, not a branch for each conversation or documentation change; keep GitHub `main` the single reference for owner-ready code. Merge only after test evidence and review. When editing documentation alone, update the existing file on `main` as authorized.
2. **Cloud verification.** Run current backend, migration, integration, browser, build and security tests in a local sandbox. Record tests, exact commit, known limitations, screenshots where helpful and changes to configuration. Do not claim a local Mac or physical RFID device was tested from a Linux Codex environment.
3. **Publish for the owner.** Merge the verified implementation into `main`; communicate the actual commit SHA, changed screens, expected user actions and a short manual acceptance checklist. Do not leave successful development stranded in a feature branch.
4. **Mac local verification.** Owner updates local `main` with `git pull --ff-only`, runs PostgreSQL/Redis in local Docker and the API/Next servers on the Mac. Owner performs human acceptance in a browser; Codex receives feedback/screenshots/log snippets for another cycle.
5. **Bug loop.** Identify reproduction steps, expected vs actual, screen, redacted logs and Git commit. Fix in Codex, rerun regressions, merge and repeat Mac acceptance. Never erase the local database to conceal a migration/inventory defect.

## Option A — Recommended Mac dev workflow (native app + Docker data services)

Prerequisites: macOS (including Apple Silicon), working Docker Desktop, Git, Node 24 and **Bun 1.4.3**. Keep Docker Desktop running. A first install needs network access and disk space. Use only synthetic QA/demo merchandise and local sandbox payments. Don't use a real merchant database or credentials.

Implemented first-time checkout in macOS Terminal:

```bash
git clone https://github.com/alirezasefidpour747/didar-b2c-marketplace.git
cd didar-b2c-marketplace
git switch main
bun run local:setup
bun run local:browser
bun run local:test
bun run local:dev
```

Setup checks Node 24/Bun 1.4.3, local Docker context/daemon, loopback configuration and occupied ports, then installs frozen dependencies, starts PostgreSQL/Redis, applies additive migrations, generates official Mercur routes and builds both native panels. Existing files/secrets, database volumes, individual UIDs and orders are preserved. A fresh database uses named volume `didar-local-postgres`; legacy `didar-postgres` containers keep their existing volume. Data service ports bind 127.0.0.1 only, for native Mac access, with trust authentication restricted to synthetic local data. No Linux bridge address is used.

`local:dev` starts both native API/Next processes on 127.0.0.1, verifies health/catalog and stops them together on Ctrl+C. In another terminal use `bun run local:status` or `bun run local:stop` (only the recognized owned native dev process is signaled; data is retained). Open `http://localhost:3000`; admin/supplier UI is under `/manage`, physical intake/UID/RFID under `/manage/operations`. Native Mercur `/dashboard` and `/seller` use separate authentication. Didar disposable logins are `admin@didar.test`, `supplier@didar.test`, `customer@didar.test`, password `DidarDemo2026!`. Existing custom passwords are never reset.

For a later verified release, stop dev servers, then:

```bash
git status --short
git switch main
git pull --ff-only origin main
bun run local:setup
bun run local:test
bun run local:dev
```

Review any local changes before pulling; do not discard them. **Never** remove persistent PostgreSQL volumes/containers, run `git reset --hard`, `docker compose down -v` or `docker volume prune`. Local setup applies additive migrations. See [ENVIRONMENT.md](../ENVIRONMENT.md) for private local backups and diagnostics. No Oracle account, SSH, hosted staging or production deployment is part of acceptance.

## Automated verification on Mac — implemented commands

`bun run local:browser` installs Playwright Chromium for the native platform. With `CHROMIUM_PATH` unset, the configuration lets Playwright choose its managed browser. An explicit path remains supported. `PLAYWRIGHT_NO_SANDBOX=1` is an optional constrained Linux Cloud override, not a Mac default.

Stop `local:dev` before building/testing shared outputs. `bun run local:test` runs the complete production build, local-workflow regression guards, all backend/migration suites, native Medusa HTTP integration and the complete Playwright suite. It creates independent uniquely named PostgreSQL/Redis containers and random loopback ports, with synthetic seed data and disposable accounts. It does not read the UAT database configuration or reuse its data. On completion/failure it removes only its own disposable QA containers and anonymous test volumes; persistent UAT volumes are untouched. Server logs stay ignored under `.local/`. A guarded optional `bun run local:test --reuse-build` is available for rerunning runtime/tests against an unchanged successful production build: source, output and platform receipts must match; default tests still build afresh. Initial install/build/browser download needs network access and sufficient disk space.

Advanced direct commands (`bun run test`, `bun run test:e2e`, `bun run build:all`) remain available, but the direct suites use the configured API/database and retain permanent QA UID history. Prefer `local:test` for repeatable test isolation.

The optional `scripts/test-compose.mjs` helper now uses a loopback TCP relay over local Docker exec streams; Compose DNS/database access happen inside the API network. It never reads bridge IPs or publishes PostgreSQL. It refuses remote Docker contexts, non-local/non-demo/non-sandbox runtime, publicly bound app ports and a published database port. It tests that explicitly selected isolated Compose database; it is not the default Mac command. The existing production-style full Compose stack defaults to staging/no demo users and must not compete with native servers for 3000/9000. Actual Docker Desktop/Apple Silicon runtime verification remains **MAC_UAT_PENDING**; Linux relay tests do not establish native Mac execution.

## Manual UAT — Phase 1

- Sign in as admin. Define/approve/publish a shared master product; verify category, image, attributes and multi-supplier offer behavior.
- Register/approve a supplier; verify its portal sees **only its own** offers, receipts and stock, read-only by default. Test grant, revoke and server-side denial.
- Create one synthetic intake invoice for a supplier with lines: **5 pieces totaling 135.000 g**, **2 pieces totaling 127.000 g**, **12 pieces totaling 117.000 g**. Enter individual **real test weights**, not evenly fabricated weights, and check quantity/weight totals. Deliberately leave one line inconsistent: posting must be refused until corrected or an explicitly authorized exception applies.
- Assign 19 unique UIDs. Bind unique hexadecimal EPCs, test lookup by UID and EPC, reject duplicate active EPC, test approved tag replacement preserving UID.
- Post verified stock and inspect supplier item records. Test selling/reserving the exact available UID, sandbox payment, order tracking and fulfillment. Test failure/expiry releasing the **same** reserved item.
- Test a physical return and admin quarantine/restock. Run an RFID count session: repeated reads of the same EPC count once; unknown/missing and sold/absent items are reported without mutating stock.
- Verify Gold-First pricing (100 g, 750, supplier making 12%, distribution 3%, retail 7%, VAT 10% on making+distribution+retail equals the monetary value of 124.2 g at the configured rate); confirm component labels and IRR VAT.
- If a real HID RFID reader is available, check keyboard-wedge entry into the scan input. Actual hardware RF reading and chip writing require **separate** real-device validation; simulation is not proof.

These manual steps are UAT, not production or statutory financial acceptance. Tahesab is not called from Phase 1.

## Implementation and acceptance status

The portable commands, environment/service/port diagnostics, data preservation guards, disposable automated-test workflow and browser configuration are implemented. See [README.md](../README.md) for the short command path and [DELIVERY.md](../DELIVERY.md) for actual Cloud results and published commit evidence.

**MAC_UAT_PENDING** until the owner runs the commands and manual checklist on a real Mac, including Apple Silicon. Record `git rev-parse HEAD`, Mac/CPU, tool versions, test results, the manual journey, stop/restart persistence and any redacted failure logs. Physical HID/RF reading, tag writing and scale measurements remain separate hardware checks. Linux software tests establish neither native Mac success nor physical-device verification.

Use one reviewed/tested task branch, then merge verified source into canonical `main`. Future bug reports should include the exact commit, screen, reproduction steps, expected/actual result and redacted logs. No Phase 2 financial features or external infrastructure are needed for this workflow.
