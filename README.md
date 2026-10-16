> Phase 2 financial sandbox implementation: [architecture and limits](docs/PHASE2_FINANCIAL_CORE.md), [one integrated Persian Mac UAT](docs/MAC_UAT_CHECKLIST.md), [actual gate evidence](verification/phase2/). Concrete Tahesab mapping remains BLOCKED_BY_SPEC; Mac/RFID acceptance is pending. No real financial operations.

> **Current workflow:** Codex Cloud development → verified GitHub `main` → one consolidated Mac acceptance on `localhost` after all feature phases. **No Oracle is required for development or testing.** Read [the unified Mac acceptance roadmap](docs/ROADMAP_TO_INTEGRATED_MAC_UAT.md), [Mac local-first workflow](docs/LOCAL_FIRST_MAC_WORKFLOW.md), [Phase 1 operations](docs/PHASE1_OPERATIONS.md), [authoritative Phase 1 scope](docs/PHASE1_UID_RFID_INTAKE.md), [local workflow verification](verification/local-first/README.md) and [Phase 1 evidence](verification/phase1/README.md). Phase 1 intake/UID/RFID, the financial sandbox and Merchant growth Phases 1–4 are implemented; scoped permissions remain enforced and all live providers remain disabled. CRM/growth Phases 5–9 are pending. Portable Playwright configuration and local commands are implemented; native Mac UAT remains **MAC_UAT_PENDING**.

# Didar Gold — دیدار گلد

Persian RTL gold marketplace generated with **`bun create mercur-app@2.3.7 create marketplace`**, official basic starter plus Next.js storefront. Original upstream starter is recorded in the first implementation commit and `MERCUR_STARTER.md`; this is an application, not a clone of the Mercur development repository.

## Local Mac development and acceptance

Use macOS (Intel or Apple Silicon), **Node 24**, **Bun 1.4.3**, Git, **FFmpeg/ffprobe with libx264** (`brew install ffmpeg`) and running **Docker Desktop**. Docker runs PostgreSQL 17/Redis 7; the API and Next.js run natively on your Mac. No Oracle account, remote server or payment credentials are required. Install dependencies natively; do not copy Linux/x64 `node_modules` to Apple Silicon.

```sh
git clone https://github.com/alirezasefidpour747/didar-b2c-marketplace.git
cd didar-b2c-marketplace
git switch main
bun run local:setup
bun run local:browser
bun run local:test
bun run local:dev
```

`local:setup` checks versions, local Docker context, configuration and port conflicts, installs the frozen lockfile, starts private loopback data services, applies additive migrations and builds native panels. It preserves existing environment files, passwords, volumes, UIDs and orders. A new PostgreSQL container uses named volume `didar-local-postgres`; an existing `didar-postgres` container retains its original volume, including older anonymous volumes. Local trust authentication is only for disposable synthetic data on this laptop.

`local:dev` starts both native servers on **127.0.0.1**, waits for functional readiness and stops both with **Ctrl+C**. Database containers/data remain. In another terminal run `bun run local:status`. Use `bun run local:stop` to stop the owned native servers from another terminal; it verifies the recorded process and preserves data services. Open `http://localhost:3000`, `/manage` and `/manage/operations` for human acceptance. Native Mercur `/dashboard` and `/seller` use separate framework authentication. Didar sandbox logins: `admin@didar.test`, `supplier@didar.test`, `customer@didar.test`; public test-only password **`DidarDemo2026!`**. No real customer/supplier information belongs in this database.

## Automated verification and release updates

Stop `local:dev` with Ctrl+C before setup, builds or tests. `bun run local:test` builds the panels/API/storefront, then runs workflow guards, all backend/migration tests, native HTTP integration and Playwright against **new disposable QA data services and random loopback app ports**. It does not read the persistent UAT database configuration. An optional `bun run local:test --reuse-build` retries verification only when a private receipt matches all application source inputs, complete relevant production outputs, Node version, OS and CPU; otherwise it refuses and requires a fresh build. QA containers and their anonymous test volumes are removed afterward; the owner's UAT volumes remain untouched. Test server logs are ignored under `.local/`.

Playwright uses its own platform-specific Chromium by default (`bun run local:browser` installs it). Optional `CHROMIUM_PATH` selects a specific executable. Only constrained Linux cloud runners should explicitly set `PLAYWRIGHT_NO_SANDBOX=1`; macOS does not require that override. Native macOS/Apple Silicon acceptance is **MAC_UAT_PENDING** until actually performed by the owner. Physical RFID integration is separately pending.

To take the next verified release, first stop the dev servers and inspect your working tree:

```sh
git status --short
git switch main
git pull --ff-only origin main
bun run local:setup
bun run local:test
bun run local:dev
```

Review local changes before pulling; never reset/discard them. Never remove the persistent PostgreSQL container/volume, run `docker compose down -v`, or prune volumes. A stopped `didar-postgres` container can be restarted by setup without changing data. See the [workflow/UAT checklist](docs/LOCAL_FIRST_MAC_WORKFLOW.md) and [environment diagnostics and preservation](ENVIRONMENT.md). GitHub `main` is the canonical verified delivery; Codex Cloud performs implementation and automated checks, then the owner performs Mac UAT on that exact SHA.

Advanced direct commands (`bun run test`, `bun run test:e2e`, `bun run db:setup`) use the configured host API/database and mutate fixtures there. Prefer `local:test` for repeatable isolation. Gold arithmetic, transaction races, supplier isolation and irreversible physical UID history remain covered by the existing suites.

## Domain and price contract

- One shared master catalog. Gold products are created using Mercur's `createProductsWorkflow`, with native product IDs linked in `didar_product.native_id`.
- `didar_supplier` and `didar_offer` extend the application for simple gold inventory. An offer is a supplier + shared product + exact integer milligram weight, with available quantity. Historical aggregate offers remain explicitly legacy. New intake creates individually measured permanent UIDs with optional EPCs and derived available quantities; no bins or multiple warehouses.
- Didar's gold commerce ledger is authoritative for gold stock, sessions, rate snapshots, reservations, orders and sandbox payments. These are custom PostgreSQL tables served by real Medusa API routes. They are **not mirrored into generic Mercur offers, Medusa carts/orders, commissions or payouts**; avoid creating competing stock records in native panels. Native panels remain available for the master catalog and further generic Mercur customization.
- Currency is **IRR (rial)** throughout. One gram = 1,000 mg. Rate = IRR per gram of 750-fineness (18K) gold.
- Gold-First pricing uses the agreed 750-equivalent base `weight_mg × purity / 750`. Making is a percentage of that base or an agreed fixed gold-equivalent weight; distribution and retail are independent, additive percentages of the same base. VAT applies only to the administrator-selected components and persists in IRR. For 100 g at 750, making 12%, distribution 3%, retail 7%, and VAT 10% on those three components, the total is the monetary value of **124.2 g** at the verified IRR/g rate, including IRR VAT equivalent to 2.2 g. BigInt rational arithmetic and explicit IRR rounding avoid floating-point money. Policies are versioned; old order JSON is never recalculated. Legacy fixed-IRR making terms remain explicitly labeled for review, using new additive global markups rather than the old compounded margin. The current rate source is manually managed and audited; no live market feed is claimed. See [full pricing and legacy contract](docs/PHASE1_OPERATIONS.md).

- Orders snapshot every component and rate. Checkout locks stock rows, validates rate and offer versions, rejects rates older than 24 hours, and reserves stock for 15 minutes. A customer idempotency key serializes checkout retries. Failed/expired payments restore stock once; paid orders retain the deduction. A cron job plus requests expire reservations.
- Approved suppliers read their own records by default. Independent admin grants can enable product requests, offer creation/editing, inventory/making-charge editing, intake drafts, RFID pairing and fulfillment updates. Verification/posting and master publication remain admin-only. Itemized quantity is derived from physical states; legacy aggregate adjustments remain explicitly separate. Admin manages catalog, suppliers, offers and pricing. Customers register, compare suppliers, maintain a local cart, enter delivery details, check out and view orders.
- Authentication uses scrypt hashes and expiring, opaque sessions hashed in the database. Browser tokens stay in session storage and are sent through a fixed-destination same-origin Next proxy. All writes are parameterized SQL. Gold order and stock actions are audited.

## Optional full Docker stack (advanced)

The existing `compose.yaml` and source `Dockerfile` remain available. They default to `staging` with demo identities disabled; they are **not** the default Mac UAT workflow. Do not run their API/storefront on ports 3000/9000 while native local servers use those ports. PostgreSQL/Redis remain unpublished in full Compose, and its named `postgres`/`uploads` volumes are separate from native local UAT data.

`node scripts/configure.mjs` preserves root Compose configuration. Source builds use `docker compose up -d --build`; prepared-image packaging reuses the verified same-architecture JS checkout; Phase 4 API images require Debian repository access to install FFmpeg. Never copy Linux prepared dependencies to macOS or another CPU architecture. HTTPS verification remains enabled for builds behind managed proxies; see `ENVIRONMENT.md`.

For an **already isolated** local/demo-enabled Compose stack only, `node scripts/test-compose.mjs [all|api|browser]` validates its local sandbox/loopback configuration and carries SQL fixture connections through local Docker exec streams. It requires no host-accessible bridge IP and publishes no database port. It intentionally tests that stack's own database and retains permanent test UID history; use `local:test` for disposable fixtures. The relay is verified in Linux Cloud; Docker Desktop/native Mac UAT is pending.

Legacy Oracle instructions remain archived in [deploy/oracle/README.md](deploy/oracle/README.md). No Oracle resources, SSH, DNS, hosted staging, credit card or external deployment are required or attempted for this workflow.

## Marketplace routes and operations

The storefront has independent home, catalog (`/products`), product detail, category and collection pages, plus `/cart`, `/checkout`, `/login`, `/account`, `/orders` and per-order tracking. Gold role panels live at `/manage/admin` and `/manage/supplier`; `/manage` selects the signed-in role and links to `/manage/operations` for physical intake, UID/RFID, counting, returns and permissions. These are the operational gold interfaces, distinct from native Mercur panel authentication.

Administrators manage shared product metadata, publication, hierarchical categories, collections, approved suppliers, product requests, exact-weight stock, pricing policies, payment states, per-line fulfillment and audited changes. Suppliers register pending approval, then read only their own assigned records; the eight explicit grants enable the corresponding operational writes. New physical intake captures measured units and percent/fixed gold-equivalent making terms, with admin verification/posting before sale. Customers compare offers, save a profile/address, pay through the sandbox and track delivery.

Product photographs are supplied through the administrator's upload form (PNG/JPEG/WebP, 768 KiB each, ten per product). Validated image bytes live in PostgreSQL; backups include them. Draft image previews require administrator or approved owning-supplier authentication. Samples intentionally have missing-photo placeholders rather than invented jewelry pictures.

A catalog price is available only while its manual rate is fresh (24 hours); rate and offer versions are checked again on the server. Confirmed checkout snapshots hold their quoted price for the 15-minute reservation. Sandbox payment initialization persists one attempt per order; owner-authenticated confirmations/callback simulations are idempotent, support cancellation and release failed/expired stock once. Live Iranian payment operations fail closed until an approved integration is implemented and authorized.

`DIDAR_ENVIRONMENT=local` is required for the public demo identities; staging rejects those identities even if old demo rows are present. `DIDAR_SEED_DEMO=true` also requires local, non-production seeding. The Next proxy bounds JSON while reading its stream, and routes private image bytes only from the configured backend. See [ENVIRONMENT.md](ENVIRONMENT.md), [REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md) and [DELIVERY.md](DELIVERY.md) for the full configuration and verification contract.

Panel builds use `bun run build:panels`, which generates temporary child-process authentication values for config discovery. Runtime secrets are still mandatory; no build credentials are stored in Docker ENV or source. This ensures native assets use `/dashboard` and `/seller` on clean builds without providing runtime secrets to the build context.

Issue #5 adds governed F01–F12 classification, collection approval and server-driven discovery over the existing product/UID model. See [classification and discovery implementation/API](docs/ISSUE5_CLASSIFICATION_AND_DISCOVERY.md) and the additional [Mac acceptance checks](docs/MAC_UAT_CHECKLIST.md). The storefront remains Persian; Arabic/French vocabulary awaits owner review.

Issue #6 merchant types and versioned pricing profiles extend the existing Gold-First engine. Open `/manage/pricing` for the Persian lifecycle and offer simulator; PDP/cart/checkout use the applied merchant profile and selected CASH/CREDIT rules. Read [implementation, API, calculations, preservation and acceptance](docs/MERCHANT_PRICING_IMPLEMENTATION.md). No merchant profile, tax rate or assignment is auto-activated by the migration.

Merchant growth Phase 2A/B/C implementation and verification: [merchant storefront, luxury foundation and sharing](docs/PHASE2_MERCHANT_STOREFRONT_SHARING.md). Owner Mac acceptance is deferred until all v3 feature phases are complete.

Merchant growth Phase 3: [assisted onboarding and safe WebP processing](docs/PHASE3_ONBOARDING_MEDIA.md), preserving existing image IDs, shared Product Masters, exact UID intake and merchant pricing profiles.

Merchant growth Phase 4: [PostgreSQL Visual CMS and bounded video](docs/PHASE4_VISUAL_CMS_IMPLEMENTATION.md). The same page renderer and live catalog power the Persian page builder, private previews and merchant/public pages; commercial media and owner Mac acceptance remain separate.
