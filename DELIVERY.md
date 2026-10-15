# Didar Gold delivery

Repository: https://github.com/alirezasefidpour747/didar-b2c-marketplace

Baseline: `c71e31354ce9e34c65b5919fc75ccd38d73fee49`. Continued the existing official Mercur 2.3.7 / Medusa application; no new starter, reset, framework clone or discarded source.

**Software MVP complete and locally verified. External Oracle staging pending. Production launch pending.**

Verified feature milestones: `0d1804903b129ec0ea5505cff8592ee563743b5b` (gold ledger/backend), `618b962` (routed interfaces), `e368d8b2b42e7285ea9b3247e2b9db992a23cdfd` (acceptance and guarded builds). These were normally pushed to main. The final delivery/evidence commit and exact remote SHA are reported in the handoff; `git rev-parse HEAD` identifies this checkout's complete delivery.

## Capabilities

- Shared native-linked master catalog with category/subcategory hierarchy, collections, names/descriptions/reference/type/purity/weight range, admin editing and publication/activation. Search and exact/range weight filters, independent product/detail/category/collection pages.
- Multiple operator-uploaded PNG/JPEG/WebP images, gallery, alt text/order/removal and private draft previews. Bounded validated bytes persist in PostgreSQL. Sample products honestly show missing-photo placeholders; no invented jewelry photographs.
- Supplier signup pending administrator approval, activation/deactivation, shared-product requests and idempotent admin approval/rejection. Multiple exact integer-milligram stock groups, quantities, fixed/percentage making fees, terms and active offers. Supplier ownership is enforced server-side.
- BigInt/integer IRR pricing: manual rate/source interface, making charge, configured margin/tax, per-piece fees and upward rounding step. Coherent catalog snapshots, fresh-rate/version checks, 15-minute committed reservation and immutable order pricing inputs/components. Parameters are demonstration policies requiring commercial/legal approval before real trading.
- Persian RTL responsive storefront with reusable components, centralized locale foundation, meaningful route navigation, cart, checkout, authentication, saved profile/address, order history and detailed payment/fulfillment tracking. Unavailable/stale cart lines are surfaced; checkout intent survives retries/reload.
- Atomic PostgreSQL reservations, concurrent purchase protection and checkout idempotency. One sandbox payment attempt per order; initialize/confirm/authenticated callback simulations support success, failure, cancellation, replay and expiration. Failed/expired stock is restored once. Iranian-rial adapter boundary deliberately refuses live operations.
- Gold admin/supplier interfaces manage catalog, supplier approvals, pricing, available inventory, payment states and audited operations. Checkout allocates each line to the selected supplier; paid allocations progress through preparation, dispatch with carrier/tracking and delivery. Suppliers cannot access others' inventory/order lines or perform admin delivery confirmation.
- Explicit local-only demo identities, opaque hashed expiring sessions, persistent login/IP limits, session cap, authorization/input checks, bounded streaming proxy uploads, security headers and safe SQL errors. Actual secrets stay outside Git/build contexts. Build-only panel config values are random and temporary; runtime secret enforcement remains required.

Didar is the customer-facing seller/payment collector. The `didar_*` ledger alone owns gold stock/reservations/orders/payments/fulfillment. Native master products are mirrors; no generic Mercur stock/order/commission/payout flow is created or synchronized. SQL inspection after gold workflows found zero native orders, native offers and native stock levels. No physical UID, warehouse system, split payment, commission, payout, B2B settlement or ERP was added.

## Current-run verification

| Check | Result / evidence |
| --- | --- |
| Pricing/inventory/security + real HTTP/database commerce suites | **36 passed, 0 failed, 210 assertions**; includes all eight prior commerce tests |
| Chromium/Playwright production storefront acceptance | **7 passed, 0 failed**: six browser workflows plus bounded chunked-upload HTTP test |
| Native Medusa actual-process HTTP health test | **1 passed** |
| Environment/Oracle/SSH/backup safety tests | **23 passed**; mocked/local temporary-file tests, no real cloud operation |
| API TypeScript and storefront TypeScript/lint | Passed |
| Mercur route codegen, native admin/vendor, backend and Next production builds | Passed; all 17 storefront routes built |
| Native panel asset subpaths without runtime build secrets | Correct `/dashboard/assets` and `/seller/assets`; no config fallback warning |
| Source Docker API and standalone storefront images | Built from fresh frozen dependencies/current source; amd64 |
| Full Compose regression and restart | **36 backend tests/210 assertions +7 Playwright checks passed again** against the actual container database; all four services healthy after restart, catalog persisted;68 application/build source files match committed inputs |
| Secure provisioning/native dashboards | Password via stdin, authenticated admin login and fixture cleanup passed; both native panel HTML and assets200 |
| Default Compose configuration | API/storefront catalog requests passed, all four services healthy, demo login rejected with401, no runtime secrets baked into image ENV |
| ARM64 availability | All four official image manifests and locked native-artifact integrity/selector audit pass; native ARM execution still pending |
| Secret review | Current source and complete Git history reviewed; six ignored actual secret values compared in memory with zero source/history matches; no private keys or actual tokens found |

Durable logs and genuine desktop/mobile screenshots are in [verification/2026-10-15](verification/2026-10-15/README.md). The operational browser test creates a category, subcategory, collection, product and two images, approves a supplier, enters two exact weights, finds the product through collection/category pages, pays once, checks one order/payment/stock deduction and allocation, then tracks admin fulfillment through delivery as the customer. Separate tests cover failed/expired payment, stock concurrency/release, forged callbacks, supplier isolation/deactivation, product request approval/retry, profile persistence and 390px layout without horizontal overflow.

Earlier development-server reload interruptions, a message selector defect and real mobile intrinsic-width overflow were diagnosed and fixed; the results above are completed final runs, not those interrupted attempts. Native panel builds needed temporary config-discovery values on clean builds; a child-process helper fixed asset bases while retaining required runtime secrets. Local VFS storage also required removing disposable migration/build artifacts; source, original bundle and database volumes were preserved.

The API image is about 2.14 GB; storefront about 506 MB. The storefront image promotes the standalone output compiled in the fresh source API build, avoiding a duplicate full rebuild while source documentation changed. No host-installed dependency fallback was used for this clean build. Standard source Dockerfile/Compose targets remain the clean-machine deployment path; release directories are immutable during Oracle builds.

## Entry points and local commands

No external application URL exists. The private local storefront uses port 3000 and API port 9000. Customer paths include `/products`, `/products/ID`, `/categories/SLUG`, `/collections/SLUG`, `/cart`, `/checkout`, `/login`, `/account`, `/orders` and `/orders/ID`. Gold operational dashboards are `/manage/admin` and `/manage/supplier`. Native Mercur panels are `/dashboard` and `/seller` on the API and use separate native authentication.

Use Node 24, Bun 1.4.3, PostgreSQL 17, Redis 7 and Chromium. From the existing checkout:

```sh
export PATH=/workspace/tooling/node_modules/.bin:$PATH
export XDG_CONFIG_HOME=/workspace/.config
export NODE_USE_ENV_PROXY=1
# Only if dependencies are missing:
bun install --frozen-lockfile
node scripts/cloud-env.mjs
bash scripts/cloud-services.sh
bun run db:setup
bun run dev:api
# Separate persistent terminal:
bun run dev:web
# With the development services running:
bun run test
bun run test:e2e
bun run --cwd packages/api test:integration:http
# Stop this task's Next dev server before building the same .next directory:
bun run build:all
```

For ordinary clean Linux Docker execution:

```sh
node scripts/configure.mjs
docker compose up -d --build
```

Ports bind loopback, PostgreSQL/Redis stay private and volumes persist. Managed proxy builds may need the documented injected CA BuildKit secret and existing proxy build arguments; TLS/integrity verification stays enabled. See README for exact commands.

For an explicitly isolated local Compose test stack after building images:

```sh
DIDAR_ENVIRONMENT=local DIDAR_SEED_DEMO=true docker compose up -d --no-build
node scripts/test-compose.mjs
```

The helper checks local sandbox runtime and loopback bindings, then binds HTTP/browser fixtures to the API's private Linux Docker database without printing credentials or exposing a database port. `api` or `browser` selects one suite. Never run these demo tests on staging/production. If the memory/disk-constrained VFS sandbox cannot briefly hold two API filesystem copies, stop/remove only the task's API container before its test-mode recreation; retain every named volume. Do not run Next dev/build concurrently against the same output directory.

## Accounts and operation

Only isolated local opt-in seeding creates `customer@didar.test`, `supplier@didar.test`, `admin@didar.test` with public fixture password `DidarDemo2026!`. Staging rejects those identities even when old rows exist. Demo seeding requires explicit local and non-production source mode. Do not expose this local demo stack publicly.

Provision a genuine staging administrator with a securely supplied password over stdin:

```sh
docker compose exec -T api sh -c 'cd /app && bun scripts/create-account.ts admin@example.com "Operator" admin'
```

No password belongs in argv, source, chat or shell history. Suppliers can sign up pending approval; the CLI also supports an existing supplier ID. See [ENVIRONMENT.md](ENVIRONMENT.md) for full variable/account/setup requirements and [DECISIONS.md](DECISIONS.md) for the authoritative ledger and inventory contract.

## External staging and production

**External staging pending:** no existing authorized Oracle VM address, confirmed available/account-eligible Always Free capacity, verified host key or usable staging SSH key was supplied. The target remains Ubuntu ARM64 Ampere A1, at most 2 OCPUs / 12 GB; no Oracle provisioning, paid resource, production deployment or didargold.ir modification occurred.

Manifest availability is verified, but a native ARM dependency install/build, migrations/runtime and complete acceptance on the actual eligible VM remain unverified. Use [Oracle instructions](deploy/oracle/README.md), [ARM evidence](deploy/oracle/ARM64_VERIFICATION.md) and [rollback guide](deploy/oracle/ROLLBACK.md). Guards require an independent staging-only marker, strict host-key checking and read-only shape/resource checks; only committed source transfers to a fresh release with destination-only secrets. Updates preserve database/upload volumes and verify a private pre-migration backup. A full restore drill has not been performed; no destructive restore was attempted.

**Production launch pending:** live payment verification/credentials and explicit authorization, approved commercial/tax/rate policies, real catalog photographs/content, genuine operator accounts, TLS/access/backups/monitoring and applicable legal/operational review. No real charges, external rate feed, automated shipping labels, email/password recovery, refunds or supplier payouts are activated. Fulfillment/tracking and rate control are manual. Only one API replica is supported with the starter's process-local native event/workflow providers; gold transactions themselves use PostgreSQL locks. Recent order lists are bounded to 100 records per response. English translations are not enabled.

## Source preservation and environment reuse

All feature milestones are committed and normally pushed; no force push or history replacement. The original `/workspace/didar-gold-delivery.bundle` remains unchanged and verifies complete baseline history, SHA-256 `b4a438fc7735cb4e41592278d079c1d8903c439abbbea4dd7b77fd341bd47d28`. A separate final completion bundle is provided in the handoff; it does not overwrite the original.

The existing install script was retained. Updated `start_skill` instructions were saved to the environment review draft with local safety boundaries, workflows, test/database separation and pending native ARM access. Saving did not publish a new environment version; review/save/publish through environment settings when desired. The restored original workspace was used throughout.

[REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md) maps every requirement across all 14 mission sections to implementation, current evidence and remaining actions. Locally implemented MVP requirements are verified; actual Oracle ARM execution and external production-provider/legal prerequisites remain explicitly blocked by external dependencies. No production-readiness claim follows solely from passing sandbox tests.
