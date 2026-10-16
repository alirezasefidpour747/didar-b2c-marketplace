# Didar local-first environment contract

Codex Cloud develops/verifies; GitHub `main` is the verified release; the owner performs native Mac UAT. Follow [LOCAL_FIRST_MAC_WORKFLOW.md](docs/LOCAL_FIRST_MAC_WORKFLOW.md). **MAC_UAT_PENDING**: Linux Cloud does not prove native macOS/Apple Silicon or physical reader operation. No Oracle, remote SSH, hosted staging or production access is needed.

## Tools and commands

Use Node **24**, Bun **1.4.3**, Git, Docker Desktop (Mac) or local Docker Engine (Cloud). PostgreSQL **17-alpine** and Redis **7-alpine** images select their native architecture. Dependencies install with the existing `bun.lock` using `--frozen-lockfile`; never transfer `node_modules` or prepared artifacts between OS/CPU architectures. No new packages or framework version changes are introduced.

- `bun run local:setup`: preflight; preserve/create private local config; frozen install; persistent data service startup; additive database migrations; official Mercur codegen; both native panel builds.
- `bun run local:browser`: install Playwright-managed Chromium for the host OS/CPU. No browser path is assumed. Optional `CHROMIUM_PATH` is honored; `PLAYWRIGHT_NO_SANDBOX=1` is an explicit constrained Linux runner override.
- `bun run local:dev`: run API and Next natively, both bound to 127.0.0.1. Functional readiness checks require API health and a valid storefront catalog response. Ctrl+C stops only these owned processes, retaining data services and volumes.
- `bun run local:stop`: verify and signal only the recorded native dev wrapper; stop both owned servers and preserve data. It refuses setup/test sessions or an unrecognized/reused PID. No Docker/network access is needed for shutdown.
- `bun run local:status`: platform/tool diagnostics, private data readiness, API health/catalog and Next proxy checks. Returns nonzero for missing/unhealthy components and withholds configuration secrets.
- `bun run local:test`: independent disposable QA PostgreSQL/Redis, random loopback HTTP ports, additive migrations/seed, complete production builds, backend/migration/workflow guards, native Medusa HTTP health and Playwright. It never reads or connects to the persistent UAT database. Removes only the invocation's uniquely named QA containers and their anonymous volumes. Ignored logs: `.local/test-api.log`, `.local/test-web.log`.

Optional `bun run local:test --reuse-build` skips compilation only after verifying a locally recorded successful-build receipt against application source/lockfile/configuration inputs, production output contents, Node version, OS and CPU. Changed/missing/damaged or cross-platform builds are refused. Default `local:test` always rebuilds. Startup readiness allows up to five minutes for cold Mercur loading while continuing functional probes; a timeout remains a failure, with private server logs retained.

Stop native dev servers before setup/test/build because they share source/build outputs. The wrapper refuses to build over its own active dev session; manually launched servers must also be stopped by their owner. Existing unrelated ports/processes are never killed. If a container pull/build fails, repair the prerequisite and rerun; do not reset data.

The legacy `scripts/cloud-env.mjs`/`cloud-services.sh` entry points delegate to the same portable guards/services. Shell helpers use no `rg`, GNU-specific network utilities or Linux bridge addresses. The standard native helper supports the documented localhost `postgres`/`didar` defaults and Redis DB0. Custom local service settings are preserved and refused by that helper rather than silently connected to the wrong data service.

## Local configuration and safety boundary

Ignored `packages/api/.env` and `apps/storefront/.env.local` contain runtime configuration. A fresh setup creates files mode0600 with independent random JWT/cookie secrets. Existing bytes/passwords are retained. An older file receives a missing `DIDAR_ENVIRONMENT=local` only after its database, Redis, payment and CORS settings demonstrate a local sandbox. Explicit staging/production or remote targets are refused, including inherited shell overrides (Bun also auto-loads a root `.env`, which may belong to the optional full Compose workflow). Keep the datasets/configurations separate; do not change a staging file to local merely to bypass a guard. When deliberately using the validated native configuration without Bun root-dotenv loading, the equivalent entry point is `node scripts/local.mjs setup|dev|status|test`. Review the named variable yourself when diagnostics reject it; no secret value is printed or auto-replaced. Older Mercur templates may still include `https://docs.medusajs.com` in `STORE_CORS`; local tooling now refuses that remote origin. For native local use, set only `STORE_CORS=http://localhost:3000` (or supply that explicit shell override), preserving database credentials and all other existing values.

| Setting | Native local UAT |
|---|---|
| `DIDAR_ENVIRONMENT` | Explicit `local` required |
| `DIDAR_PAYMENT_MODE` | Explicit `sandbox` required |
| `DIDAR_SEED_DEMO` | `true` for disposable local demo identities; `false` retains distinct local identities |
| `DATABASE_URL` | `postgres://postgres@localhost:5432/didar` (synthetic local trust-auth data only) |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_SECRET`, `COOKIE_SECRET` | Independent generated values, at least 32 characters |
| `STORE_CORS` | `http://localhost:3000` |
| Admin/vendor/auth CORS | Explicit loopback origins only |
| `MEDUSA_BACKEND_URL` | Server-only storefront destination `http://localhost:9000` |

Do not use real customer records, merchant credentials or live payments. The native data ports are published **only to 127.0.0.1** because the native Mac servers need them; they are not reachable from the LAN. Full Compose keeps data ports entirely unpublished. Local Docker context/Unix socket is required; remote Docker/SSH/TCP contexts are refused. Treat every account as a disposable test identity. Existing custom passwords/accounts are never reset by migrations.

## Persistence and recovery

The authoritative `didar_*` ledger owns inventory, UIDs, prices, reservations, orders and fulfillment. The native Mercur framework stays intact and does not become a duplicate gold ledger. Phase 1 migrations remain additive and repeatable; no historical weights or UIDs are fabricated. Supplier permissions, Gold-First policies and immutable price snapshots are unchanged.

Fresh native services are `didar-postgres` using named volume `didar-local-postgres`, and `didar-redis`. An existing PostgreSQL container, including its older anonymous volume, is **reused unchanged**. Redis is disposable cache. Dev shutdown and later setup/start retain the same database. Never remove the persistent PostgreSQL container or volume, use `docker compose down -v`, prune volumes, or restore an older backup to hide a failed migration. The QA runner's `docker rm -fv` applies only to containers it just created, never these persistent services.

Before an important local update, stop dev writes and make a private backup outside Git:

```sh
mkdir -p "$HOME/DidarBackups"
umask 077
docker exec didar-postgres pg_dump -U postgres -Fc didar > "$HOME/DidarBackups/didar-$(date +%Y%m%d-%H%M%S).dump"
```

Check command success and retain the file privately. Restoring changes history and is not part of normal setup/update. Native uploaded product image bytes live in PostgreSQL. Native file-provider assets under `packages/api/static`/`.medusa/server/static` are ignored local files; retain them and back them up separately if used. Full Compose has distinct named `postgres`/`uploads` volumes and its original project name `didar-gold`; no migration between these local datasets is implicit.

## Diagnostics and cloud verification

- Missing/closed Docker Desktop: start it, then rerun setup/status. Select the local desktop context. No VM/SSH credentials are requested.
- Port 5432/6379 already used by another service: stop that service yourself or use your existing matching custom workflow. The helper never replaces it.
- Port 3000/9000 occupied: stop the full Compose app services or the other native servers first. Keep their databases/volumes. `local:test` uses random ports and independent data.
- Refused `DIDAR_ENVIRONMENT`, payment, database or CORS: review that local variable or inherited shell override; never relabel staging/production data as local to bypass the guard.
- Missing browser: `bun run local:browser`. On Mac leave `CHROMIUM_PATH` unset unless deliberately choosing another executable. In this Linux cloud use the available system browser with `CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1`.
- Interrupted QA: the runner prints the uniquely named disposable QA container if cleanup fails. Inspect `docker ps -a --filter label=didar.disposable-qa=true`; remove only confirmed abandoned QA containers. Do not prune volumes globally.

Cloud uses the existing checkout, Node/Bun and local services. A read-only home may need `XDG_CONFIG_HOME=/workspace/.config` and writable `DOCKER_CONFIG=/workspace/.docker-didar-phase1`. Source Docker builds preserve HTTPS verification: supply the managed public CA only via the optional BuildKit `cloud_ca` secret, and existing proxy build args when required. No actual secrets belong in build contexts. Prepared images exclude environment files, keys, backups, bundles and `.local` logs; their architecture is not portable.

The optional full-Compose regression helper now relays PostgreSQL TCP streams through local Docker exec, using Compose DNS from inside the API network. It checks explicit local/demo/sandbox runtime, loopback app bindings, the shared private PostgreSQL service and absence of a published database port. Credentials stay in memory/child environment, not argv or logs. This exercises that explicitly selected Compose database; it is not the default disposable Mac test path.

Legacy Oracle material in `deploy/oracle` is archived/optional and is not an acceptance dependency. Physical RFID/scale/chip encoding, live gateway and Phase 2 finance are outside the verified local software boundary.
