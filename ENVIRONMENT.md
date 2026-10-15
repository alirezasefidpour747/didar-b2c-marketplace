# Didar environment contract

Use the existing checkout with Node 24 and Bun 1.4.3. Install with `bun install --frozen-lockfile`. The official Mercur starter and exact package versions are recorded in `MERCUR_STARTER.md` and `bun.lock`. Do not copy installed dependencies or compiled outputs between x86_64 and ARM64.

## Configuration

Real configuration belongs in ignored environment files or the hosting secret manager. Never commit passwords, access tokens, private SSH keys, database backups, or `.env` files. The tracked `.env.template` files contain names and public local origins only. `scripts/cloud-env.mjs` generates private local API configuration; `scripts/configure.mjs` generates private root Compose configuration. Both preserve existing values. For a restored local API file that predates the environment guard, `cloud-env.mjs` appends `DIDAR_ENVIRONMENT=local` only when the variable is absent, preserving all existing bytes and explicit environment choices.

| Name | Purpose | Local development | Oracle staging |
| --- | --- | --- | --- |
| `DIDAR_ENVIRONMENT` | Controls sandbox/demo safety boundary | `local` explicitly | `staging` required |
| `NODE_ENV` | Framework build/runtime behavior | `development` | `production` runtime; migration runner uses `development` to load source |
| `DIDAR_SEED_DEMO` | Opts into public test identities | `true` only on isolated local test stack | `false` required |
| `DIDAR_PAYMENT_MODE` | Payment provider mode | `sandbox` | `sandbox`; no live provider enabled |
| `DATABASE_URL` | API PostgreSQL credentials | Ignored API `.env` | Derived inside Compose from generated database password |
| `DIDAR_DB_PASSWORD` | Compose PostgreSQL password | Generated root `.env` | Generated on destination only, at least 32 characters |
| `REDIS_URL` | Private Redis address | Local service | Private Compose service, no published port |
| `JWT_SECRET`, `COOKIE_SECRET` | Native framework authentication | Separate random generated values | Separate random values, at least 32 characters each |
| `STORE_CORS`, `ADMIN_CORS`, `VENDOR_CORS`, `AUTH_CORS` | Allowed application origins | Explicit loopback development origins | Derived from configured storefront/backend origins |
| `MERCUR_BACKEND_URL` | Native panel API origin at build time | Local API origin | Default private loopback origin; rebuild panels after changing |
| `STOREFRONT_URL` | Compose customer origin | Local storefront origin | Default private loopback origin |
| `MEDUSA_BACKEND_URL` | Server-only Next proxy destination | Local API origin | `http://api:9000` on private Docker network |
| `FILE_BACKEND_URL` | Native Mercur file URL prefix | Local API `/static` | Derived from backend origin |
| `DIDAR_API_IMAGE`, `DIDAR_STOREFRONT_IMAGE` | Optional exact application image selection | Default staging tags | Can select retained rollback tags without rebuilding |

`DIDAR_ENVIRONMENT` is deliberately independent of `NODE_ENV`: migration and seed commands need source-mode framework execution, which must never authorize demo users on a staging host. The Oracle destination configuration validator rejects local/demo-enabled configuration and group/world-readable secret files. Local loopback Compose integration tests must set `DIDAR_ENVIRONMENT=local` and opt into demo seeding explicitly; do not reuse those settings externally.

The internal Compose database URL uses `sslmode=disable` only for the private container network. It does not publish PostgreSQL or Redis ports. An external managed database requires verified TLS and its own supported credentials/configuration; none is provisioned by this project.

## Data and accounts

The Didar PostgreSQL tables are the authoritative gold ledger. Native Mercur stock, generic carts/orders, commissions and payouts must not be used as a second ledger for Didar gold. Product image bytes are stored in PostgreSQL with bounded uploads; database backups include those images. The separate `uploads` volume preserves native Mercur file-provider assets.

The migration service runs native Medusa migrations and the idempotent Didar schema/seed. Existing rows and passwords are preserved; there is no reset or destructive rebuild step. Sample product/supplier records demonstrate the sandbox and must be reviewed/disabled before real business operations. Public demo credentials are development fixtures, never staging operator accounts.

Create the first staging administrator with `scripts/create-account.ts`, passing its password over standard input. Never put passwords in argv or shell history. The command runs against the API container's own database environment:

```sh
docker compose exec -T api sh -c 'cd /app && bun scripts/create-account.ts admin@example.com "Operator" admin'
```

Supply the input through a secure local password prompt or password manager. Provision no generic shared password on staging. Suppliers can request onboarding through the application and an administrator controls activation; the account CLI can also provision a supplier against an existing approved supplier ID.

## Start, verify and preserve

For isolated development, follow the root README's install, local-service, schema and dev-server commands. For a clean source Docker build, use `docker compose up -d --build` after generating root configuration. For Oracle use the guarded scripts in `deploy/oracle/README.md`; their native ARM path does not use prepared x86 outputs.

The Compose project name is fixed as `didar-gold`; named PostgreSQL/uploads volumes survive container recreation. Do not use `docker compose down -v`, remove volumes, run schema reset tools, or expose demo ports publicly. Retain periodic backups outside the source checkout with private permissions. See [rollback instructions](deploy/oracle/ROLLBACK.md) for update recovery, backup boundaries and the explicit data-loss implications of restoring a database.

Only one API replica is supported by this MVP while the native starter uses process-local event/workflow providers. PostgreSQL transactions coordinate Didar checkout. A production rollout needs shared provider configuration, notification/payment/rate integrations, operational review, verified backups and TLS/access policies. Sandbox completion does not certify real-money or production readiness.
