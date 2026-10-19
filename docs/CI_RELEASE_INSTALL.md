# DIDAR release installation handoff

**New Nginx topology releases:** in this downloaded archive, follow
`install-kit/docs/deployment/PR31_R5_R6.md` and the matching
`install-kit/kit-manifest.json`. In a source checkout the guide is
`docs/deployment/PR31_R5_R6.md`. Use its matching `NGINX_INSTALL_WRAPPER.md` and protected operator bundle; do not
substitute the legacy root Compose or socket-mode wrapper. The legacy socket-mode
image verifier and root Compose do not certify Nginx/verified-relay topology.
`TARGET_CONFIG=BLOCKED` until verified03 discovery; no target installation is
authorized by this generic guide.

Recipient: **03 — DIDAR Deployment & Runtime QA**. This is a guided existing-server update, not permission for the development agent to access the owner's host. Do not reinstall Debian or reset existing databases/volumes.

## Obtain and verify the release

Use the **verify** job's `didar-release-<source SHA>-<run>-<attempt>` artifact from the authorized release run. The `candidate-*` artifact is NOT accepted for installation. GitHub sign-in/repository access may be required; the download expires after 30 days. Preserve a verified copy in the owner's release storage before expiry. Artifact ZIP digests are shown in the Actions summary; inside the extracted artifact:

```sh
sha256sum --check SHA256SUMS
docker load --input images.tar.gz
```

Read `release-manifest.json`. Require the exact accepted source SHA, `verification.build.status=PASS` and `verification.independent_artifacts.status=PASS`. Confirm both image IDs and `linux/amd64` match the target. This workflow does not certify ARM64. An image config ID is not a registry manifest digest.

If GHCR publication succeeds, obtain `registry-manifest.json` from the separate `registry-results-*` artifact. Use its `ghcr.io/...@sha256:...` references, not `latest` or an unpinned tag. Its accessibility fields distinguish authenticated pull success from anonymous access. A private package requires read access; package owners must deliberately configure public visibility if anonymous pulls are wanted. A failed registry job does not invalidate the already-verified archive download. No registry credentials belong in shell history, manifests or Compose files.

## Inspect and protect the existing Debian host

The runtime guide must first confirm host identity, architecture, Docker/Compose versions, disk/RAM, active release and image IDs, listeners, named volumes/mounts, database and media locations. Check the installed application rather than assuming the repository checkout is running. Retain the existing PostgreSQL/Redis services and unrelated applications unless a reviewed migration explicitly requires a change.

Before any migration/update, create and verify a consistent backup of database, media and necessary configuration. Record backup checksums, restore procedure, prior artifact IDs and current routing. Do not use `down -v`, delete volumes, run demo seeds or automatically initialize a new database over an existing installation. Review schema compatibility: reverting an image alone is not a rollback if its schema is incompatible. Rehearse restoration in a disposable environment where needed.

## Configure the reviewed package

For bundles containing `install-kit`, use only the matching protected composition and closed operator wrapper described in `install-kit/docs/deployment/NGINX_INSTALL_WRAPPER.md`. Assemble its manifest deterministically with the shipped `scripts/ci/operator-bundle.mjs` after actual artifact verification and independent review; provide explicitly inspected PostgreSQL/Redis identities. Do not manually retype file hashes, use root `compose.yaml`, pass arbitrary overrides, rebuild application images, or run the old socket wrapper as a substitute. The operation remains blocked until target discovery, backups, isolated restoration and the signed path are verified.

Legacy bundles without an installation kit retain their accepted source-matched socket-mode procedure in `AUTH_DEPLOYMENT_PACKAGING.md`; that background does not authorize Nginx/verified-relay installation. Do not use `compose up --build` to replace verified images. Preserve exact existing service/network/volume identities and stable secrets.

Required configuration is supplied securely at runtime: original database/cache origins, JWT secret, stable COOKIE_SECRET, shared server-only DIDAR_AUTH_NETWORK_KEY, exact DIDAR_AUTH_PROXY_PEERS, public CORS/file origins, and a read-only TLS certificate directory. Do not generate or rotate existing secrets incidentally. No secret is included in the release artifact.

The reviewed reference topology is one API plus storefront in its network namespace. Next listens privately on loopback; signed ingress serves the customer application; original API serves `/dashboard`, `/seller`, native APIs and media. Recreate storefront together with a replaced API namespace. Databases and Redis remain private.

**The reference Compose publishes application ports only on host loopback. It is not Internet routing by itself.** Inspect the server's domain/DNS, TLS terminator, reverse proxy and firewall. A plain proxy or Docker NAT before the socket-based signer can collapse client attribution. Resolve that topology against the approved trust model before exposing the new authentication path; do not trust an arbitrary forwarded header or expose private Next as a workaround. Public hostname, certificates and routing cannot be guessed by this generic runbook. Do not disable TLS validation to bypass a mismatch.

## Guided installation and verification

After preflight, backup and configuration acceptance, the runtime guide provides the exact environment-specific commands to load/pull images, apply the existing native/replayable DIDAR migration authority, start API and storefront and check health. Keep demo mode off. Stop on a failed migration or failed readiness and follow the recorded recovery plan; do not repeat destructive initialization.

Verify the actual image IDs/digests and source revision running after update. From a separate Internet connection, check HTTPS storefront, customer login/account, `/dashboard`, `/seller`, their assets, authorized API/media and role restrictions. Check logs and controlled service restart, and confirm internal services are not publicly exposed. Use designated test accounts and non-destructive fixtures; do not run QA seeds or quota-exhaustion probes against existing staging users.

The hosted application must work with the owner's personal computer off, without SSH tunnels, VPNs, localhost forwarding or a local development server. Report `STAGING_DEPLOYED` and `INTERNET_ACCESS_VERIFIED` only after those checks. This release workflow performs neither deployment nor live finance and does not establish `PRODUCTION_READY`.
