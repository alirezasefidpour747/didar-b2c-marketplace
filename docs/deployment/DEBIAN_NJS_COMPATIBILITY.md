# Debian Nginx/njs compatibility and provisioning plan

Status: **IsolatedCompatibilityVerified** for the exact Debian candidates below;
**TARGET_CONFIG=BLOCKED**, **PUBLIC_HTTPS=NOT_VERIFIED**. This plan is prepared for
`03 — DIDAR Deployment & Runtime QA`. No owner-server package/configuration,
service, listener or deployment operation was performed.

## Discovery is separate from acceptance

Supplied discovery reports Debian amd64 `nginx=1.26.3-3+deb13u9`, no observed
installed/loaded HTTP JS module, Docker `26.1.5`, Compose `2.26.1`, separate
API/storefront namespaces and an HTTP upstream on host loopback port `13000`.
The API marker `993cb21f25a5926d85448e0d7e496e8f04cbb8ef` does not prove image
provenance: storefront source and both OCI labels remain unknown. Classify the
installed application as **UnidentifiedLegacyBundle**, not release `874447e`
and not a verified rollback bundle.

Actual attribution peers, namespace identities, active module path/build flags,
complete vhost routing, running-image provenance and independent Internet HTTPS
remain unverified. A certificate-file check does not verify the Internet service.
Never populate target trust lists from container/gateway addresses, or copy the
fixture's loopback peers, namespace arrangement or TLS settings into staging.

## Compatible official Debian package combination

| Package | Version | SHA-256 of `.deb` |
| --- | --- | --- |
| `nginx` | `1.26.3-3+deb13u9` | `29258fa0e2f4c9162a95eda2c36cf84ee8f57289a14c58fb7e6d3868c61a5db3` |
| `nginx-common` | `1.26.3-3+deb13u9` | `d0eab69fa763305d11bd623418118b61da1738aacd1390cd4465b7773289df1c` |
| `libnginx-mod-stream` | `1.26.3-3+deb13u9` | `31503877739cdb8f0423ad3b43ac36d73beb50d6a0d4ff05b190b377c5014d2a` |
| `libnginx-mod-http-js` | `0.8.9-1` | `2892f45cb35b3893f4d331d817ad88f5fece1934dc8b83acfe6eaa6d321a6e2c` |
| `njs` | `0.8.9-1` | `6a411db62c936cbd9d1edf913f3ae8db2b7cf86a7a71f6e162b43a4c8e6a179b` |

Architecture is `amd64`, except `nginx-common` (`all`). Nginx **provides
`nginx-abi-1.26.3-1`**. HTTP JS explicitly requires that virtual ABI,
`libnginx-mod-stream >=1.26.3, <1.26.3.1~`, `libc6 >=2.38`, and `libxml2 >=2.7.4`.
The stream package requires the same ABI. CLI `njs` additionally requires libedit,
PCRE2 and OpenSSL. Package provenance records retain the complete dependencies.

The exact extracted Nginx executable reports `1.26.3`, `--with-compat`, HTTP SSL
and real-IP support; loading this `.so` and executing through it succeeds. ABI
compatibility is supported by package contracts **and real module loading**.
No Nginx upgrade is required. Do not copy an Alpine/1.28.x module into Debian.

## Authenticated isolated reproduction

Requirements: Debian13 archive keyring, `sqv`, `curl`, `dpkg-deb`, Python3 and the
project's pinned Node. These commands only extract into a new directory:

```bash
python3 scripts/deployment/nginx/compat/fetch-debian.py work/debian-njs-packages
node scripts/deployment/nginx/compat/verify-debian.mjs \
  work/debian-njs-packages work/debian-njs-verification
node --test scripts/deployment/nginx/compat/compat.test.mjs \
  scripts/deployment/nginx/sign.test.mjs
```

The fetcher verifies signed `InRelease` using the Debian archive keyring, checks
security-index expiry, authenticates compressed `Packages.xz` size/SHA-256 against
signed metadata, and checks every package against its index and committed exact
version/hash. HTTPS verification and managed proxy/CA settings are preserved. It
fails if a pin disappears from a current signed index. Do not select a newer
version, disable signature/expiry checks or call historical evidence a fresh fetch;
review a new pin or separately authenticate retained artifacts. The CI helper
`scripts/ci/prepare-compat-context.sh` supplies isolated Debian tools rather than
assuming an Ubuntu runner's keyring includes Debian13 keys.

The verifier uses a separate Nginx prefix/configuration, ephemeral loopback
listeners and disposable test TLS CA. Both TLS hops verify CA and hostname. It
installs no host packages and runs no application database. Actual child process
close codes/signals are recorded; disposable TLS private keys are deleted.

Fresh isolated execution verifies 36 exact deterministic v1 CLI vectors, five
malformed peers and two distinct system-CSPRNG nonces; 38 real HTTPS cases include
32 raw proofs (empty, Persian UTF-8, invalid UTF-8/binary, and 1,200,000 bytes;
four auth paths; two distinct **actual source sockets**). The unchanged
`@didar/auth-network` verifies exact method/raw URI/raw body proofs. Spoofed
forwarding/proof headers cannot change the socket identity. Missing key and
real-IP rewrite return `503`, compressed body `415`, oversized body `413`, GET
`405`, and an encoded unexpected auth path `400`. Thirty-two HTTP nonces differ;
this is a capability observation, not a statistical entropy claim. Unit checks
retain private transport and HMAC/body/path/clock/forwarding protections.

### Bounded empty-body correction

The initial real HTTP execution exposed njs0.8.9's detached empty
`r.requestBuffer`: crypto hashing threw `TypeError: detached buffer`, and the
unchanged handler safely returned `503`. That failed run is retained. The bounded
correction substitutes a fresh empty Buffer **only when buffered length is zero**.
All nonempty raw bytes remain unchanged. The v1 payload/HMAC, socket, entropy,
size/temp-file and unsigned-fallback checks are unchanged. Real HTTPS empty proofs
now match the standard v1 empty-body proof. A unit test constructs a detached
zero-length buffer and verifies that proof and unchanged binary-body binding.

## Reproducible isolated CI images

```bash
python3 scripts/deployment/nginx/compat/fetch-debian.py work/debian-edge-context --runtime-context
docker build --platform linux/amd64 --build-arg SOURCE_SHA="$CANDIDATE_SHA" \
  --tag "$EDGE_IMAGE" work/debian-edge-context
python3 scripts/deployment/nginx/compat/fetch-debian.py work/docker26-context --daemon-context
docker build --platform linux/amd64 --tag "$DISPOSABLE_DAEMON_IMAGE" work/docker26-context
```

`runtime-pins.json` fixes 44 official Debian package versions/hashes, including
curl and its ELF libraries. The Dockerfile pins the Debian trixie-slim amd64
manifest `sha256:918311b7b6c4c6f68b232ba516584925f6c78ad82b6fd534b98979df6438e483`,
which supplies glibc/libgcc. Authenticated archives supply the other runtime files
without running service/package scripts. This CI image is not a Debian-host
installation. Signer/handler are packaged at `/opt/didar/nginx/`; full package
records are at `/opt/didar/debian-package-provenance.json`. No application source
or workspace symlink supplies application-runtime dependencies. After the base
pull, Docker builds use only the extracted payload. Record actual build/run exits
and image IDs in the artifact gate; this document does not replace that evidence.

`daemon-pins.json` fixes `docker.io`/`docker-cli=26.1.5+dfsg1-9+deb13u1`,
`docker-compose=2.26.1-4`, containerd `1.7.24~ds1-6+deb13u1`, runc
`1.1.15+ds1-2+b4`, iptables, OpenSSL CLI and runtime libraries. The extracted
executable reports **`Docker version 26.1.5+dfsg1, build 411e817`**. Upstream
Docker/Compose versions match discovery; target package revisions, kernel,
containerd and runc remain unobserved and are not claimed to match. The daemon
fixture copies Node24.19.0 from the project's pinned image. Run it only in an
explicitly owned disposable privileged CI container, with its own Unix socket
and `/var/lib/docker`; **never mount the host Docker socket**. Its nft alternatives
and `vfs` driver apply only to that fixture. Wrapper-only verification does not
establish application artifact acceptance. Retain/remove only its recorded owned
anonymous volume according to fixture cleanup guards.

## Host module provisioning/loading plan — not executed

`03` first collects sanitized package versions/architecture, `nginx -V`, active
module includes/load statements and resolved paths, service unit/drop-ins, relevant
vhost/TLS routes, real-IP/CDN/PROXY settings, actual socket peers, namespaces and
image identities. Do not publish raw configuration or service environment that
may contain secrets. Back up existing vhosts/configuration, certificates, stable
secrets, media and authoritative volumes. Require a verified compatible recovery
bundle; the unidentified running legacy bundle is insufficient.

For a future authorized host operation, review the package-manager simulation:

```bash
apt-get -s --no-remove --no-upgrade install \
  nginx=1.26.3-3+deb13u9 nginx-common=1.26.3-3+deb13u9 \
  libnginx-mod-stream=1.26.3-3+deb13u9 libnginx-mod-http-js=0.8.9-1
```

Stop on an Nginx upgrade/replacement, package removal, unrelated service changes,
ABI failure or unreviewed library changes. Host CLI `njs` is optional. Normal
Debian module maintainer scripts enable `modules-enabled` symlinks and queue an
`nginx-reload` dpkg trigger. Installation is therefore a controlled service
operation requiring validated configuration, backup and runtime authorization;
it is not read-only. Do not bypass host package scripts/protections to imitate
the CI image's extraction.

Preserve the existing module-loading mechanism and load HTTP JS **once**. The
package's `/usr/share/nginx/modules-available/mod-http-js.conf` contains
`load_module modules/ngx_http_js_module.so;`; its module payload defaults to
`/usr/lib/nginx/modules/ngx_http_js_module.so`. These are package references,
not verified active target paths. Confirm prefix/include/realpath and `nginx -t`;
do not finalize a host module path from this fixture. Preserve unrelated vhosts
and main/http configuration. The isolated template must not replace the owner's
`nginx.conf`, because it contains only the fixture vhost. Add reviewed DIDAR
main/http/server directives only after target configuration review.

## Secure secret loading and recovery

Reuse the matched bundle's stable `DIDAR_AUTH_NETWORK_KEY`; never create different
keys for edge/relay/API. Provision through the designated secret channel into a
root-owned mode-0600 environment file outside Git, archives, non-secret JSON,
logs and screenshots. Do not `source`, `eval`, print it or pass it on a command
line. With systemd, a reviewed drop-in may reference a root-owned
`EnvironmentFile=` containing a literal key assignment. Validate any necessary
systemd escaping and exact byte parity privately; this file is not a shell script.
Preserve the existing unit/drop-ins and unrelated environment.

Retain main-scope `env DIDAR_AUTH_NETWORK_KEY;` so workers inherit the master's
secret. HUP cannot import a newly changed environment from systemd. Initial
injection or rotation needs a reviewed coordinated master restart, health checks
and matched image/config/key recovery; do not promise a zero-impact reload or
restart unrelated services. Do not expose secrets in `systemctl show` output.

Validate the exact host binary/module/config with `nginx -t`, then separately
verify signed ingress/direct auth routes, relay TLS CA/SNI, private listeners and
customer/native dual-proof journeys in a disposable fixture before activation.
Updates/recovery coordinate the shared namespace, matched image pair,
signer/config, stable keys, database compatibility and media. Never recover by
disabling TLS verification, weakening peers, accepting unsigned private-Next auth
or treating unidentified images as known-good. Target configuration and independent
Internet HTTPS acceptance remain separate gates.
