> Phase 1 UID/RFID is implemented on `didar/phase1-intake-uid-rfid`. Start with [Phase 1 operations](docs/PHASE1_OPERATIONS.md), the [authoritative scope](docs/PHASE1_UID_RFID_INTAKE.md), and [verified delivery](DELIVERY.md). The existing Mercur marketplace is preserved. Supplier writes are read-only by default; `/manage/operations` provides intake, UID/EPC registry, counting, returns and delegated permissions. Phase 2 finance remains excluded.

# Didar Gold — دیدار گلد

Persian RTL gold marketplace generated with **`bun create mercur-app@2.3.7 create marketplace`**, official basic starter plus Next.js storefront. Original upstream starter is recorded in the first implementation commit and `MERCUR_STARTER.md`; this is an application, not a clone of the Mercur development repository.

## Development

Requires Node 24, Bun 1.4.3, Docker with Compose, PostgreSQL 17 and Redis 7.

```sh
bun install --frozen-lockfile
node scripts/cloud-env.mjs
bash scripts/cloud-services.sh
bun run db:setup
bun run dev:api
# Another terminal:
bun run dev:web
```

`cloud-env.mjs` generates ignored local environment files, preserves existing values (appending the local environment flag only when absent from restored files), and opts into **local sandbox demo accounts**. All three use the public development-only password `DidarDemo2026!`: `customer@didar.test`, `supplier@didar.test`, `admin@didar.test`. Never seed these on a public deployment. Native Mercur panels have separate Medusa authentication; Didar gold roles sign in through the Persian storefront.

The Persian storefront runs on port 3000, API on 9000. Native Mercur admin and seller panels are served under `/dashboard` and `/seller` on the API. Gold administration and supplier operations are in **مدیریت طلا** after signing in through the storefront. Each cloud task already has an isolated checkout: use it directly; don't create a worktree unless explicitly requested.

## Tests and builds

Start the API and seed local demo accounts first. Chromium is required for browser tests (`CHROMIUM_PATH` overrides `/usr/bin/chromium`).

```sh
bun run test
bun run test:e2e
bun run --cwd packages/api test:integration:http
bun run build:all
```

The HTTP suites use the actual server. Legacy fixtures are cleaned up; physical UID/history fixtures are permanently retained under unique IDs and their QA products/suppliers retired. They exercise database transactions, stock contention, role isolation, multi-supplier checkout, payment replay and expiration. Do not run the demo tests against a production database. Gold arithmetic is also tested independently against hand-calculated amounts.

## Domain and price contract

- One shared master catalog. Gold products are created using Mercur's `createProductsWorkflow`, with native product IDs linked in `didar_product.native_id`.
- `didar_supplier` and `didar_offer` extend the application for simple gold inventory. An offer is a supplier + shared product + exact integer milligram weight, with available quantity. Historical aggregate offers remain explicitly legacy. New intake creates individually measured permanent UIDs with optional EPCs and derived available quantities; no bins or multiple warehouses.
- Didar's gold commerce ledger is authoritative for gold stock, sessions, rate snapshots, reservations, orders and sandbox payments. These are custom PostgreSQL tables served by real Medusa API routes. They are **not mirrored into generic Mercur offers, Medusa carts/orders, commissions or payouts**; avoid creating competing stock records in native panels. Native panels remain available for the master catalog and further generic Mercur customization.
- Currency is **IRR (rial)** throughout. One gram = 1,000 mg. Rate = IRR per gram of 750-fineness (18K) gold.
- Gold-First pricing uses the agreed 750-equivalent base `weight_mg × purity / 750`. Making is a percentage of that base or an agreed fixed gold-equivalent weight; distribution and retail are independent, additive percentages of the same base. VAT applies only to the administrator-selected components and persists in IRR. For 100 g at 750, making 12%, distribution 3%, retail 7%, and VAT 10% on those three components, the total is the monetary value of **124.2 g** at the verified IRR/g rate, including IRR VAT equivalent to 2.2 g. BigInt rational arithmetic and explicit IRR rounding avoid floating-point money. Policies are versioned; old order JSON is never recalculated. Legacy fixed-IRR making terms remain explicitly labeled for review, using new additive global markups rather than the old compounded margin. The current rate source is manually managed and audited; no live market feed is claimed. See [full pricing and legacy contract](docs/PHASE1_OPERATIONS.md).

- Orders snapshot every component and rate. Checkout locks stock rows, validates rate and offer versions, rejects rates older than 24 hours, and reserves stock for 15 minutes. A customer idempotency key serializes checkout retries. Failed/expired payments restore stock once; paid orders retain the deduction. A cron job plus requests expire reservations.
- Approved suppliers read their own records by default. Independent admin grants can enable product requests, offer creation/editing, inventory/making-charge editing, intake drafts, RFID pairing and fulfillment updates. Verification/posting and master publication remain admin-only. Itemized quantity is derived from physical states; legacy aggregate adjustments remain explicitly separate. Admin manages catalog, suppliers, offers and pricing. Customers register, compare suppliers, maintain a local cart, enter delivery details, check out and view orders.
- Authentication uses scrypt hashes and expiring, opaque sessions hashed in the database. Browser tokens stay in session storage and are sent through a fixed-destination same-origin Next proxy. All writes are parameterized SQL. Gold order and stock actions are audited.

## Docker staging

```sh
node scripts/configure.mjs     # creates ignored .env with generated passwords; preserves existing values
# Set actual public origins in .env before a public build.
docker compose up -d --build
```

Compose includes password-protected PostgreSQL with persistent data, Redis, one-shot migration/seed, one API replica and a production Next server. Ports bind loopback; put a TLS reverse proxy in front for remote staging. Native panel API origin is baked at build time via `MERCUR_BACKEND_URL`. No demo users are created by default. `DIDAR_ENVIRONMENT=staging` and `DIDAR_SEED_DEMO=false` are the Compose defaults; destination validation refuses demo-enabled or insecure staging configuration. Set up real role accounts using `scripts/create-account.ts`; it accepts the password from standard input and never logs it. Example inside a container, with password supplied securely on stdin:

```sh
docker compose exec -T api sh -c 'cd /app && bun scripts/create-account.ts admin@example.com "Operator" admin'
```

For a supplier, append `supplier SUPPLIER_ID` rather than `admin`. Create the supplier through the admin interface first. Customer registration is public. This command creates an account, not a password reset. Never put passwords into shell command arguments or commit `.env` files.

Behind the Codex egress proxy, build with the injected public CA as a **BuildKit secret**, plus the existing proxy build args. TLS verification stays on:

```sh
docker build --build-arg HTTPS_PROXY --build-arg HTTP_PROXY --build-arg NO_PROXY \
  --secret id=cloud_ca,src="$NODE_EXTRA_CA_CERTS" --target api -t didar-gold-api:staging .
```

The cloud BuildKit resolver may also need the proxy hostname supplied via `--add-host` with its existing resolved address; this is environment-specific DNS configuration, not an Internet bypass. The CA is optional outside this managed proxy and is never copied into an image layer.

Sandbox payment is explicitly enabled with `DIDAR_PAYMENT_MODE=sandbox`. No real payment, live rate feed, identity verification, shipping label service, email, payout or refund provider is configured. Before Internet exposure: supply deployment access, TLS origin, real operator accounts and policies. Keep one API replica while using the starter's local event bus and in-memory native workflow locks; gold checkout itself uses PostgreSQL locks. A real-money launch needs payment-provider verification, rate-feed credentials and operational/security review.

When registries are unavailable but this checkout has installed dependencies, `scripts/build-prepared-images.sh` builds the current code and packages those prepared outputs into the same API/storefront image tags, without downloading dependencies. It excludes environment files and Git metadata from the packaging context. Run `docker compose up -d --no-build` afterward. The source-building `Dockerfile` remains the clean-machine path; the prepared path requires existing verified dependencies and the local Node/Bun base images.

`prepare-codegen-cache.mjs` seeds Mercur's officially supported fallback cache from the route manifest downloaded over verified HTTPS by CLI 2.3.7 on 2026-10-15. Its provenance is the CLI's default canary manifest endpoint, not a claim that a release-tagged manifest was downloaded. The tracked metadata snapshot keeps codegen working during GitHub HTTP 503 outages. Refresh it together with pinned Mercur package upgrades.

## Preferred external staging: Oracle Always Free

See [deploy/oracle/README.md](deploy/oracle/README.md) for the Ubuntu ARM64 Ampere A1 path, limited to 2 OCPUs / 12 GB RAM. Deployment scripts operate only on an existing eligible staging VM and never provision OCI resources. They perform native ARM builds; do not transfer this machine's x64 prepared outputs. Static dependency checks and live linux/arm64 image manifests pass. Native ARM build/runtime still needs access to an eligible VM; it has not been executed here.

For an isolated Linux loopback Compose test stack, explicitly enable local sandbox accounts and use the database-aware test helper:

```sh
DIDAR_ENVIRONMENT=local DIDAR_SEED_DEMO=true docker compose up -d --no-build
node scripts/test-compose.mjs
```

The helper refuses non-local runtime/public application ports and binds both HTTP and browser SQL fixtures to the API's private Compose database, without printing credentials or publishing PostgreSQL. `api` or `browser` can be supplied to select a suite. Never seed or run demo tests against staging/production. Ordinary host development uses `bun run test` and `bun run test:e2e` against the development database described above.

## Marketplace routes and operations

The storefront has independent home, catalog (`/products`), product detail, category and collection pages, plus `/cart`, `/checkout`, `/login`, `/account`, `/orders` and per-order tracking. Gold role panels live at `/manage/admin` and `/manage/supplier`; `/manage` selects the signed-in role and links to `/manage/operations` for physical intake, UID/RFID, counting, returns and permissions. These are the operational gold interfaces, distinct from native Mercur panel authentication.

Administrators manage shared product metadata, publication, hierarchical categories, collections, approved suppliers, product requests, exact-weight stock, pricing policies, payment states, per-line fulfillment and audited changes. Suppliers register pending approval, then read only their own assigned records; the eight explicit grants enable the corresponding operational writes. New physical intake captures measured units and percent/fixed gold-equivalent making terms, with admin verification/posting before sale. Customers compare offers, save a profile/address, pay through the sandbox and track delivery.

Product photographs are supplied through the administrator's upload form (PNG/JPEG/WebP, 768 KiB each, ten per product). Validated image bytes live in PostgreSQL; backups include them. Draft image previews require administrator or approved owning-supplier authentication. Samples intentionally have missing-photo placeholders rather than invented jewelry pictures.

A catalog price is available only while its manual rate is fresh (24 hours); rate and offer versions are checked again on the server. Confirmed checkout snapshots hold their quoted price for the 15-minute reservation. Sandbox payment initialization persists one attempt per order; owner-authenticated confirmations/callback simulations are idempotent, support cancellation and release failed/expired stock once. Live Iranian payment operations fail closed until an approved integration is implemented and authorized.

`DIDAR_ENVIRONMENT=local` is required for the public demo identities; staging rejects those identities even if old demo rows are present. `DIDAR_SEED_DEMO=true` also requires local, non-production seeding. The Next proxy bounds JSON while reading its stream, and routes private image bytes only from the configured backend. See [ENVIRONMENT.md](ENVIRONMENT.md), [REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md) and [DELIVERY.md](DELIVERY.md) for the full configuration and verification contract.

Panel builds use `bun run build:panels`, which generates temporary child-process authentication values for config discovery. Runtime secrets are still mandatory; no build credentials are stored in Docker ENV or source. This ensures native assets use `/dashboard` and `/seller` on clean builds without providing runtime secrets to the build context.
