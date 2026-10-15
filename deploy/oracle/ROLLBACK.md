# Staging update and rollback

These operations are for the independently marked Oracle Always Free staging host only. Never run them against production. No command provisions or purchases infrastructure. Continue using the existing PostgreSQL and upload volumes.

## Before an update

`deploy-on-vm.sh` runs the read-only preflight and registry checks, validates secure destination configuration, then invokes `backup.sh` when an existing PostgreSQL container is present. A failed backup stops the update before any migration. It creates a private directory under `~/didar-staging/backups/` containing:

- `database.dump`: PostgreSQL custom-format archive, checked with `pg_restore --list`; includes Didar product image bytes and all commerce records.
- `images.txt`: retained `didar-gold-api:rollback-TIMESTAMP` and `didar-gold-storefront:rollback-TIMESTAMP` tags identifying the actual currently running image IDs.
- `native-uploads/`: native Mercur local-file assets copied separately.
- `DEPLOYED_COMMIT`: the previous release commit, when a previous `current` release exists.

A successful archive-list check verifies format, not a full restore. Perform periodic restore drills into a separate disposable database before relying on backups for production. Backups contain personal data and password hashes: keep mode 0700/0600, restrict access, retain only within available free-tier storage, and never publish them as source artifacts. Destination runtime secrets remain in `~/didar-staging/shared/.env`; retain a secure separate copy through the operator's secret manager.

SSH deployment uploads committed source to a fresh `releases/COMMIT` directory, shares destination-only `.env`, and updates `current` only after readiness passes. A failed release is preserved for inspection. Re-running the same commit through `deploy-ssh.sh` refuses an existing release directory; inspect it and run `deploy-on-vm.sh` from that directory once the specific failure is resolved. Do not delete releases or volumes to retry.

## Revert application code while retaining data

Use this only after reviewing compatibility between the previous code and current schema. Additive migrations usually preserve compatibility; never assume a downgrade is safe after a schema-changing release. Stop customer/supplier/admin writes while assessing a failed update.

1. Read the selected backup's `images.txt` and `DEPLOYED_COMMIT`. Confirm both retained images are present with `docker image inspect IMAGE_TAG`. Choose an existing previously successful source release.
2. From that previous release directory, set the exact retained image tags:

   ```sh
   export DIDAR_API_IMAGE=didar-gold-api:rollback-TIMESTAMP
   export DIDAR_STOREFRONT_IMAGE=didar-gold-storefront:rollback-TIMESTAMP
   docker compose -f compose.yaml -f deploy/oracle/compose.arm64.yaml up -d --no-build --no-deps api storefront
   ```

   Replace `TIMESTAMP` with the actual suffix recorded in the backup; the placeholder is not a valid retained image. `--no-deps` deliberately avoids rerunning migration/seed during rollback. PostgreSQL, Redis and their volumes remain intact.
3. Inspect service health/logs and verify catalog, authentication and a sandbox checkout. Keep the site unavailable to other users until these checks succeed. Update the `current` symlink to the selected verified release. Record the chosen commit, image IDs, reason and time in the deployment log.

The application rollback path does not restore the database. If new code wrote data incompatible with old code, prefer fixing forward; otherwise a data restore needs explicit operator approval and a planned maintenance window.

## Database recovery requires a deliberate decision

Restoring an earlier snapshot removes every order, inventory change, registration and payment update made after that snapshot. First capture a fresh emergency backup, stop API/storefront writers and retain the failed deployment's data for reconciliation. Inspect the target archive and confirm the intended staging database and lost-write interval with the operator before restoring.

Use PostgreSQL 17 `pg_restore` into a new disposable database first; verify table counts, image data, order totals, stock consistency and authentication there. Switch to the restored database only after that validation and the explicit recovery approval. Do not automate `--clean` against the existing database, drop volumes, or use `down -v`. Native file assets may also need restoring from the matching private uploads snapshot. No destructive database restore has been performed by these repository scripts.
