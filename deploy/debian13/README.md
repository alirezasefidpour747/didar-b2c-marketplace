# Debian 13 x86_64 staging — fixed Phase 2 release

Application repository: `https://github.com/alirezasefidpour747/didar-b2c-marketplace.git`

**Application commit: `00447d39ffa64881c35813b5242b95fd356c84bb`** — `feat: deliver isolated merchant storefronts and curated sharing (#7)`.
This is the owner's explicit Phase 2 pin. Never replace it with `main`, `HEAD`, a short hash or an automatic branch update. Phase 3 belongs to another task.

Target: Debian 13, x86_64, 4 vCPU, 8 GB RAM, 100 GB disk; staging host `82.115.24.51`. No commands in this package connect to production, install Codex, or merge application branches. All new repository files are confined to `deploy/debian13/` on the separate review branch `staging/debian13-phase2-00447d3`.

## Runtime and access

The supplied Node **20.19.2** and npm **9.2.0** stay installed. They are sufficient to run this package's configuration helper, but the repository's native local-workflow launcher explicitly requires Node 24. The staging images therefore carry **Node 24.19.0 + Bun 1.4.3**; npm is not used to install application dependencies. PostgreSQL 17 and Redis 7 run in their own containers. Docker Engine and Compose v2 are the additional server prerequisites.

This is one API process with its existing shared/in-memory framework providers, one storefront, one PostgreSQL and one Redis. Do not scale the API horizontally. Payments remain sandbox-only; public demo accounts and demo seeding are disabled. A fresh staging database has no operator login until explicitly provisioned below, and its catalog starts empty. The existing idempotent seed supplies application schema/vocabulary and an initial synthetic gold rate, not a production import. An operator must maintain the manual rate; quotes expire when that rate is older than 24 hours.

Services bind **127.0.0.1:13000** (storefront) and **127.0.0.1:19000** (API/native panels). PostgreSQL and Redis publish no host ports. Access uses an SSH tunnel, so no domain, public HTTP endpoint, firewall changes, or reverse proxy is needed. Browser origins are deliberately `http://localhost:13000` and `http://localhost:19000`; use these exact names. Direct `http://82.115.24.51:13000` is not enabled.

Runtime service limits total 3.25 CPUs and 4 GiB memory. Builds are serialized, with the Node build heap capped at 3 GiB. This is a staging allocation, not a throughput or peak-RAM guarantee. Keep at least 20 GiB free before an update; backups and old releases are retained and need operator-managed capacity planning.

## 1. Transfer the deployment kit

Download `didar-staging-kit.tar.gz` from this task's outputs. On your laptop, set your existing authorized SSH login; no key contents are required by this package:

```bash
export STAGING_SSH_USER='YOUR_EXISTING_SSH_LOGIN'
scp didar-staging-kit.tar.gz "$STAGING_SSH_USER@82.115.24.51:/tmp/didar-staging-kit.tar.gz"
ssh "$STAGING_SSH_USER@82.115.24.51"
```

All commands in sections 2–6 run **on that staging server**, as its sudo-capable operator. Use an authorized checkout credential if the repository is private; the kit contains no GitHub credential.

## 2. Read-only checks, then install Docker

```bash
cat /etc/os-release
uname -m
nproc
free -h
df -h /
node --version                  # supplied host version: v20.19.2
npm --version                   # supplied host version: 9.2.0
git --version
curl --version
```

Confirm this is the intended dedicated staging host. The Debian 13 main archive supplies Compose v2 as the package **`docker-compose`**, alongside `docker.io` (the archive metadata inspected for this task lists Compose 2.26.1-4). If Docker/Compose are already installed, keep that installation and verify `docker compose version` instead of installing competing packages.

For a host without Docker:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates docker.io docker-compose util-linux
sudo systemctl enable --now docker
sudo usermod -aG docker "$(id -un)"
```

Log out and reconnect once to acquire the new Docker group. Then:

```bash
docker info --format '{{.ServerVersion}}'
docker compose version          # must be v2; 2.26.1 or later
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" /srv/didar-staging
mkdir -p /srv/didar-staging/deploy
tar -xzf /tmp/didar-staging-kit.tar.gz -C /srv/didar-staging/deploy
chmod 0700 /srv/didar-staging/deploy/update.sh /srv/didar-staging/deploy/stack.sh
```

The kit contains deployment tooling only. It does not contain an application checkout, database, uploaded files, passwords or `node_modules`.

## 3. Clone and verify the fixed application commit

Initial installation only; do not clone over an existing repository:

```bash
git clone --no-checkout https://github.com/alirezasefidpour747/didar-b2c-marketplace.git /srv/didar-staging/repository
git -C /srv/didar-staging/repository fetch origin 00447d39ffa64881c35813b5242b95fd356c84bb
git -C /srv/didar-staging/repository show -s --format='%H %s' 00447d39ffa64881c35813b5242b95fd356c84bb
test "$(git -C /srv/didar-staging/repository rev-parse '00447d39ffa64881c35813b5242b95fd356c84bb^{commit}')" = 00447d39ffa64881c35813b5242b95fd356c84bb
```

Cloning may download other Git objects; only a `git archive` of the exact SHA enters each release/build context. The source repository is never checked out or reset, and ignored Cloud environment files are never copied.

## 4. Configure, build, migrate and run

```bash
node /srv/didar-staging/deploy/init-env.mjs
bash /srv/didar-staging/deploy/update.sh 00447d39ffa64881c35813b5242b95fd356c84bb
bash /srv/didar-staging/deploy/stack.sh ps
cat /srv/didar-staging/current/DEPLOYED_COMMIT
curl --fail http://127.0.0.1:19000/health
curl --fail http://127.0.0.1:13000/api/didar/catalog
```

`init-env.mjs` creates `/srv/didar-staging/shared/staging.env` once, mode 0600, with independent random database/JWT/cookie secrets. Repeats validate and preserve its exact bytes. Never copy an old local/demo `.env` here or change the database password after the volume has initialized. The Compose environment fixes staging/demo/payment flags; it does not accept a production target.

The update script performs these exact stages: lock; validate configuration/disk; fetch explicit SHA; archive into a new release; build API then storefront with frozen `bun.lock`; ensure private data services; stop staging apps; back up PostgreSQL, native uploads and configuration; run framework migrations and the existing additive application seed; start apps; check API health, direct/proxied catalog JSON and the homepage; atomically change `current` only after success. Each release retains its own image tags and deployment Compose files.

No `git pull`, development-branch merge, database reset, volume removal, image/volume prune or automatic backup cleanup occurs. Docker restart policies bring the four services back after a server reboot. There is a staging maintenance window while backup, migrations and readiness checks run.

## 5. Provision a separate staging administrator

Use your staging operator's email and name, not `admin@didar.test` or another public demo identity. The password is read from stdin and never passed in command arguments:

```bash
read -r -p 'Staging administrator email: ' STAGING_ADMIN_EMAIL
read -r -p 'Staging administrator display name: ' STAGING_ADMIN_NAME
read -r -s -p 'New staging password (12–128 characters): ' STAGING_ADMIN_PASSWORD
printf '\n'
printf '%s' "$STAGING_ADMIN_PASSWORD" | bash /srv/didar-staging/deploy/stack.sh exec -T api bun /app/scripts/create-account.ts "$STAGING_ADMIN_EMAIL" "$STAGING_ADMIN_NAME" admin
unset STAGING_ADMIN_PASSWORD
```

Provisioning is a one-time account creation, not an idempotent update step. Re-running it with the same email will hit the unique constraint. A failed command should be inspected before retrying. The gold operator account is separate from native Medusa/Mercur dashboard authentication.

## 6. Open staging and inspect it

In a **separate laptop terminal**:

```bash
ssh -o ExitOnForwardFailure=yes -N \
  -L 13000:127.0.0.1:13000 -L 19000:127.0.0.1:19000 \
  "$STAGING_SSH_USER@82.115.24.51"
```

Open `http://localhost:13000`, `http://localhost:13000/manage`, and `http://localhost:13000/manage/operations`. Native panel entry points are `http://localhost:19000/dashboard` and `/seller`. Keep the tunnel open. A verified public label/QR origin is intentionally not configured; do not claim public QR acceptance for these localhost URLs.

On the server:

```bash
bash /srv/didar-staging/deploy/stack.sh logs --tail=100 api storefront
docker stats --no-stream
ss -ltn | rg ':(13000|19000|5432|6379)\b' || true
df -h /srv/didar-staging
du -sh /srv/didar-staging/backups /srv/didar-staging/releases
```

`rg` is optional; if not installed, use `ss -ltn` and inspect the same ports. Do not print or paste `docker compose config` without `--quiet`, full container environments, or the private environment file: they contain credentials.

## Repeatable update

For this task, repeat **the same tested SHA**:

```bash
bash /srv/didar-staging/deploy/update.sh 00447d39ffa64881c35813b5242b95fd356c84bb
```

The script always requires a full SHA and never follows `main`. Future releases require a separately tested, explicitly chosen SHA; none is authorized for this deployment. Persistent volumes are `didar-staging-phase2_postgres`, `didar-staging-phase2_redis` and `didar-staging-phase2_uploads`, independent of release directories. Product image bytes in the Didar application live in PostgreSQL; native file-provider assets live in the uploads volume. Configuration lives under `shared/`, outside every release. Each update retains a private backup under `backups/TIMESTAMP-PID/`.

Backups contain sensitive data/configuration. Keep copies in an operator-controlled backup destination. Database archive listing is checked automatically; that is not a restore drill. Redis AOF stays in its persistent volume but is not part of the PostgreSQL/upload backup archive.

## Failures and rollback

A build failure occurs before app downtime. A failure after apps stop leaves staging apps stopped, the previous `current` pointer unchanged, and backups retained. If migrations partly applied, do not blindly launch an older application against the changed database. A failed initial install has no `current`; inspect the printed release directory and its Compose configuration.

After confirming the database schema is compatible with the previous app, select that retained release explicitly (replace the path with the one recorded in the relevant backup's `previous-release` file):

```bash
PREVIOUS_RELEASE='/srv/didar-staging/releases/EXACT_PREVIOUS_RELEASE_DIRECTORY'
test -f "$PREVIOUS_RELEASE/DEPLOYED_COMMIT"
docker compose --project-name didar-staging-phase2 --project-directory "$PREVIOUS_RELEASE" \
  --env-file /srv/didar-staging/shared/staging.env --env-file "$PREVIOUS_RELEASE/.staging/images.env" \
  -f "$PREVIOUS_RELEASE/.staging/compose.yaml" up -d --wait --wait-timeout 300 api storefront
curl --fail http://127.0.0.1:13000/api/didar/catalog
ln -s "$PREVIOUS_RELEASE" /srv/didar-staging/current.rollback
mv -Tf /srv/didar-staging/current.rollback /srv/didar-staging/current
```

If schema rollback is required, preserve the failed database and restore the chosen archive into a **separate staging database** for verification first. This package deliberately performs no destructive database restore. Never use `docker compose down -v`, `docker volume rm`, `docker system prune`, or delete `shared/` as an update/rollback method. Do not run the application fixture/E2E suites against this persistent staging database; they mutate business data. Use the repository's disposable `local:test` workflow in a separate test checkout with Node 24/Bun instead.

## Verification boundaries

See `RESULTS.md` and attached logs for this task's actual results on the pinned SHA. Historical verification files in the application repository are not evidence of this staging task. Required server-only checks include package installation, image pulls/builds, resource headroom on 4 vCPU/8 GB, SSH tunnel access, operator provisioning, manual browser acceptance, reboot recovery, and a private backup restore drill. No login or deployment to `82.115.24.51` has been performed by this task.
