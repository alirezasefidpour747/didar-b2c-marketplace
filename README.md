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

`cloud-env.mjs` generates ignored local environment files, preserves existing files, and opts into **local sandbox demo accounts**. All three use the public development-only password `DidarDemo2026!`: `customer@didar.test`, `supplier@didar.test`, `admin@didar.test`. Never seed these on a public deployment. Native Mercur panels have separate Medusa authentication; Didar gold roles sign in through the Persian storefront.

The Persian storefront runs on port 3000, API on 9000. Native Mercur admin and seller panels are served under `/dashboard` and `/seller` on the API. Gold administration and supplier operations are in **مدیریت طلا** after signing in through the storefront. Each cloud task already has an isolated checkout: use it directly; don't create a worktree unless explicitly requested.

## Tests and builds

Start the API and seed local demo accounts first. Chromium is required for browser tests (`CHROMIUM_PATH` overrides `/usr/bin/chromium`).

```sh
bun run test
bun run test:e2e
bun run --cwd packages/api test:integration:http
bun run build:all
```

The HTTP suites use the actual server; test offers have unique IDs and are cleaned up. They exercise database transactions, stock contention, role isolation, multi-supplier checkout, payment replay and expiration. Do not run the demo tests against a production database. Gold arithmetic is also tested independently against hand-calculated amounts.

## Domain and price contract

- One shared master catalog. Gold products are created using Mercur's `createProductsWorkflow`, with native product IDs linked in `didar_product.native_id`.
- `didar_supplier` and `didar_offer` extend the application for simple gold inventory. An offer is a supplier + shared product + exact integer milligram weight, with available quantity. No individual-piece UID, bins, warehouses or advanced warehouse management.
- Didar's gold commerce ledger is authoritative for gold stock, sessions, rate snapshots, reservations, orders and sandbox payments. These are custom PostgreSQL tables served by real Medusa API routes. They are **not mirrored into generic Mercur offers, Medusa carts/orders, commissions or payouts**; avoid creating competing stock records in native panels. Native panels remain available for the master catalog and further generic Mercur customization.
- Currency is **IRR (rial)** throughout. One gram = 1,000 mg. Rate = IRR per gram of 750-fineness (18K) gold.
- Metal = ceil(weight_mg × purity × rate / 750,000). Margin = ceil((metal + labor) × margin_bps / 10,000). Tax = ceil((labor + margin) × tax_bps / 10,000). Tax never applies to gold principal. Total = metal + labor + margin + tax. Integer/BigInt arithmetic prevents floating point drift; configurable rates need business/legal approval before real trading.
- Orders snapshot every component and rate. Checkout locks stock rows, validates rate and offer versions, rejects rates older than 24 hours, and reserves stock for 15 minutes. A customer idempotency key serializes checkout retries. Failed/expired payments restore stock once; paid orders retain the deduction. A cron job plus requests expire reservations.
- Suppliers can create offers on shared products, edit their available quantity/labor/margin, and read only their order lines. Admin manages catalog, suppliers, offers and pricing. Customers register, compare suppliers, maintain a local cart, enter delivery details, check out and view orders.
- Authentication uses scrypt hashes and expiring, opaque sessions hashed in the database. Browser tokens stay in session storage and are sent through a fixed-destination same-origin Next proxy. All writes are parameterized SQL. Gold order and stock actions are audited.

## Docker staging

```sh
node scripts/configure.mjs     # creates ignored .env with generated passwords; preserves existing values
# Set actual public origins in .env before a public build.
docker compose up -d --build
```

Compose includes password-protected PostgreSQL with persistent data, Redis, one-shot migration/seed, one API replica and a production Next server. Ports bind loopback; put a TLS reverse proxy in front for remote staging. Native panel API origin is baked at build time via `MERCUR_BACKEND_URL`. No demo users are created by default. Set up real role accounts using `scripts/create-account.ts`; it accepts the password from standard input and never logs it. Example inside a container, with password supplied securely on stdin:

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

See [deploy/oracle/README.md](deploy/oracle/README.md) for the Ubuntu ARM64 Ampere A1 path, limited to 2 OCPUs / 12 GB RAM. Deployment scripts operate only on an existing eligible staging VM and never provision OCI resources. They perform native ARM builds; do not transfer this machine's x64 prepared outputs. Static dependency checks passed, while live image manifests and ARM execution remain externally blocked as documented.

For the local loopback Compose test stack, run the commerce suite **inside** the API container so its fixtures and API share the same database:

```sh
docker compose exec -T api bun test ./tests/pricing.test.ts ./tests/commerce.test.ts
bun run test:e2e
```

These tests require the explicitly opted-in local demo accounts. Do not seed or run demo commerce tests against a public staging/production database. The ordinary host `bun run test` command targets the development API and database described above.
