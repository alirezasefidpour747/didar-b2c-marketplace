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

First-time checkout in macOS Terminal:

```bash
git clone https://github.com/alirezasefidpour747/didar-b2c-marketplace.git
cd didar-b2c-marketplace
git switch main
bun install --frozen-lockfile
node scripts/cloud-env.mjs
bash scripts/cloud-services.sh
bun run db:setup
```

`cloud-env.mjs` creates ignored local configuration, including `DIDAR_ENVIRONMENT=local`, a private local database URL and `DIDAR_PAYMENT_MODE=sandbox`. It **preserves existing files**, so review local nonsecret settings after switching environments. `cloud-services.sh` starts local `didar-postgres` and `didar-redis` containers, bound only to localhost; the development PostgreSQL instance uses trust authentication and must never be exposed to the network. Do not use real customer or supplier data here.

Start the API in Terminal A (leave running):

```bash
cd didar-b2c-marketplace
bun run dev:api
```

Start the Next storefront in Terminal B (leave running):

```bash
cd didar-b2c-marketplace
bun run dev:web
```

Navigate to `http://localhost:3000`. Admin gold UI: `http://localhost:3000/manage`; intake/UID/RFID UI: `http://localhost:3000/manage/operations`. API default: `http://localhost:9000`. Use the local-only demo login documented in `README.md` for a disposable demo database, or provision distinct local accounts. Native Mercur panels at the API origin use separate authentication.

For subsequent verified releases (assuming the working tree is clean):

```bash
git status --short
git switch main
git pull --ff-only origin main
bun install --frozen-lockfile
bash scripts/cloud-services.sh
bun run db:setup
```

Restart the two dev servers if needed. **Do not** run `git reset --hard` or overwrite local edits; if `git status --short` reports changes, review them before pulling. Database volumes persist; do not use `docker compose down -v` or `docker volume prune`.

## Automated verification on Mac — current commands and known blockers

With the local API healthy, `bun run test` runs the compiled/backend suite (the root test task waits for the API); `bun run build:all` verifies panels/API/storefront build. Browser suite is `bun run test:e2e`, **but** the current `playwright.config.ts` hardcodes `/usr/bin/chromium` unless `CHROMIUM_PATH` is set. That Linux path is not valid by default on macOS. Codex must make the config use Playwright-managed Chromium when `CHROMIUM_PATH` is unset, and honor an explicitly supplied `CHROMIUM_PATH`. After that change, run:

```bash
bunx playwright install chromium
bun run test
bun run test:e2e
bun run build:all
```

Before this config fix, the E2E command may fail to launch Chromium on Mac even when the application works; do not confuse a missing browser executable with a failed business workflow.

The `node scripts/test-compose.mjs` helper currently introspects private **Linux Docker bridge container addresses**, so it is **not** a reliable generic macOS Docker Desktop runner. Do **not** recommend it as the default Mac test command until Codex replaces it with a cross-platform, secure test technique that does not publish the database or reuse production data. Option A above intentionally uses host-side app servers and the documented host test suite instead.

`compose.yaml` builds a full production-style Docker stack with isolated PostgreSQL, Redis, API and storefront. It defaults to `staging` and disables demo users; do not blindly run Compose with local tests expecting demo logins. Do not run the native-host workflow and full Compose API/storefront simultaneously on ports 3000/9000. Codex may provide a simple Mac-compatible, explicitly `local` Compose UAT alternative after validating architecture-specific image builds.

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

## Next Codex work item — Make Mac acceptance easy and repeatable

Implement, document and **test** Mac-compatible scripts (suggested `bun run local:setup`, `bun run local:dev`, `bun run local:test`, `bun run local:status`, or equivalent) that keep PostgreSQL/Redis private, preserve existing local data and allow the owner to run the complete Phase 1 stack with very few commands. Detect macOS and Apple Silicon. Use actual supported pinned versions. Make Playwright browser installation/config portable. Address Docker Desktop vs Linux bridge behavior without exposing PostgreSQL or hardcoding private IPs. Add preflight diagnostics for port conflicts, missing Docker/Bun/Node, unhealthy services and misconfigured `DIDAR_ENVIRONMENT`. Keep demo accounts/sandbox enabled **only** for isolated `local`; fail closed otherwise. Preserve all existing tests, UI flows and business rules.

Replace the stale 'Oracle preferred staging' framing in active README/ENVIRONMENT entry points with local-first acceptance guidance, while leaving legacy Oracle deployment documentation archived/optional rather than deleting history. No Oracle VM, account, credit card, OCI credentials, remote deployment or DNS is required for acceptance. Never deploy or move real funds.

**Completion:** a fresh Mac developer can clone, install, start, test, open `localhost:3000`, exercise intake/UID/RFID, stop/restart while retaining local data, and pull a later verified `main` safely. If actual native macOS execution is unavailable to Codex, label it `MAC_UAT_PENDING` and provide exact owner steps instead of claiming it passed.
