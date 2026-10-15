# Oracle Always Free ARM64 staging

Target an **existing, eligible Ubuntu ARM64 VM.Standard.A1.Flex** staging VM: recommended **2 OCPUs / 12 GB RAM**, never above either limit. No production target is allowed. These scripts do not provision instances, modify OCI resources, create paid databases, use Railway, buy domains, or configure load balancers.

## Verified and pending

- The source lockfile contains integrity-pinned ARM64 GNU/Linux artifacts for SWC 1.11.31, Next SWC 15.5.24, Sharp/libvips, esbuild, Rollup, the resolver and Turbo. `check-dependencies.py` also audits Linux/ARM-applicable hard-dependency architecture restrictions. Static audit passed.
- Eight guard tests passed: the requested A1 limits are accepted; production, unmarked hosts, x64 hosts, other shapes, >2 OCPUs, >12 GB RAM and unconfirmed eligibility are rejected. These are mocked policy tests, not tests on an Oracle VM.
- The current machine is x86_64. Local Compose integration/E2E testing passed on x86_64, including production Next/Medusa containers. No ARM emulator or Oracle VM was used.
- Live manifest queries for **node:24-bookworm-slim**, **oven/bun:1.4.3**, **postgres:17-alpine**, and **redis:7-alpine** all failed with registry HTTP 503. Current-tag ARM image availability and a complete native ARM build/runtime are therefore **not yet verified**. `verify-images.sh` requires a linux/arm64 descriptor for every image and fails closed on missing metadata.
- Oracle capacity, VM address and SSH access are not available in this session. No remote deployment or provisioning was performed. These external prerequisites do not block the working local MVP.

## External steps — free-tier capacity only

1. In Oracle Console, confirm an Always Free eligible Ampere A1 VM is available in the eligible region and within your **remaining account-wide** free allowance. Use Ubuntu ARM64, 2 OCPUs and 12 GB memory. A 50 GB boot volume must also fit the remaining free storage allowance. Do not select paid shapes, exceed quota, add paid storage/backups, buy a domain, add a load balancer or choose a paid fallback when capacity is unavailable. The repository does not create any of these resources.
2. Ensure Docker Engine with Compose v2, Python 3, `tar`, and at least 20 GiB free build disk exist on the VM. Use the normal Ubuntu Docker installation procedure. Only SSH ingress is needed for the default deployment; application/database ports remain private. Confirm the VM is a dedicated staging host. Through the trusted console, create `/etc/didar-staging-only` containing exactly `didar-staging-only`; the deployment script never creates this marker and refuses unmarked hosts before uploading source. Verify its SSH host fingerprint through a trusted Oracle Console channel and add it to `known_hosts`.
3. From a machine with source code and authorized SSH access, export `OCI_STAGING_HOST` (IP/DNS), `OCI_STAGING_SSH_KEY` (path to an existing secure key outside the source checkout), and `OCI_ALWAYS_FREE_CONFIRMED=yes` **after checking eligibility and account quota**. Never send key contents in chat. Run:

   ```sh
   bash deploy/oracle/deploy-ssh.sh
   ```

   Or copy the source without `.env`, `.git`, `node_modules`, `.next`, `.medusa`, or `dist`, then run on the VM:

   ```sh
   DIDAR_DEPLOY_ENV=staging OCI_ALWAYS_FREE_CONFIRMED=yes bash deploy/oracle/deploy-on-vm.sh
   ```

4. The script checks read-only Oracle instance metadata, rejects unsupported hosts/limits, verifies all official image manifests, generates destination-only runtime secrets, performs **native ARM64 source builds**, checks final image architectures, runs Compose migrations/seeding and makes functional API/storefront requests. It builds targets sequentially; runtime limits total less than 2 CPUs and 6 GB RAM. The one-shot migration runs before the API and has a separate build/migration memory budget. No paid cloud service is required.
5. The deployment creates no demo accounts by default. Provision a gold administrator securely with `scripts/create-account.ts` using password input on stdin; see the root README. Customers can register normally; create supplier records through the gold admin interface and provision supplier accounts with their IDs.
6. Access the private staging site from your own machine using a verified SSH tunnel:

   ```sh
   ssh -i "$OCI_STAGING_SSH_KEY" -o StrictHostKeyChecking=yes \
     -L 3000:127.0.0.1:3000 -L 9000:127.0.0.1:9000 "ubuntu@$OCI_STAGING_HOST"
   ```

   This avoids requiring a paid domain, public load balancer or publicly exposed app/database ports. Configure public TLS separately only if a staging domain and access policy are supplied. Do not expose public demo credentials.

## Important architecture rule

Never ship this machine's x64 prepared images, `node_modules`, or compiled standalone output to A1. The native ARM source build selects the correct optional artifacts from the frozen lockfile. `compose.arm64.yaml` pins all four application services and migration to linux/arm64. The SSH upload sends committed HEAD through git archive, excluding untracked credentials and machine-specific dependencies/outputs. Commit intended source changes before deploying.

The source Docker build may need registries to recover from HTTP 503. The prepared-image fallback is for an already-built checkout on the **same architecture**, not cross-architecture deployment. Native manifest checks and functional readiness checks must succeed before reporting Oracle ARM staging as verified.

Local validation of deployment guards/configuration:

```sh
python3 deploy/oracle/check-dependencies.py
python3 -m unittest discover -s deploy/oracle -p 'test_*.py'
docker compose -f compose.yaml -f deploy/oracle/compose.arm64.yaml config --quiet
```
