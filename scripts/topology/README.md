# Disposable Nginx/Docker topology acceptance

These are developer-owned isolated tests, not commands for the owner's server.
They do not merge, publish images, deploy, seed an existing database, or access
any target endpoint. Do not run multiple capacity-heavy stacks concurrently.

`nginx-pilot.mjs` starts actual pinned Nginx/njs HTTPS, two actual Docker client
sockets and a test-only host TLS verifier. It checks v1 interoperability, actual
source preservation, caller-header stripping, binary bodies, raw query bytes,
all four auth paths, limits, encoded aliases and reload. A successful result is
`PASS_TRANSPORT_ONLY`: it explicitly proves no PostgreSQL/native application
acceptance. Generated TLS/config files are disposable, not target certificates.

```sh
node scripts/topology/nginx-pilot.mjs /absolute/new/evidence-directory
```

`stack.mjs` provisions a separate bridge and freshly owned PostgreSQL/Redis,
candidate API and packaged frontend, actual Nginx TLS, and real client containers.
This private disposable runtime sets both `NO_PROXY` and `no_proxy` to its exact
observed local destinations. It preserves the executor's managed proxy for
public-network commands. CA and hostname verification stay enabled. This fixture
setting is not an owner-server proxy policy or an external-egress bypass.
It copies self-contained runtime files into the containers; application source
or dependency binds are not used. The accepted API base image's OCI label is
retained and distinguished from explicitly hashed candidate source/compiled
overlays. This is candidate runtime verification, not a new published image.

Supply a private JSON input with these explicit fields:

```
source_sha api_image frontend_base_image postgres_image redis_image nginx_image
portable_frontend repository output_dir
```

`source_sha` is an exact forty-character candidate Git revision. Image fields
must identify the reviewed local immutable image/digest. `nginx_image` is pinned
by registry digest. `portable_frontend` is a complete, clean-source package made
by the accepted package generator; its `PACKAGING.json` remains unchanged.
`api_patch_files`, when supplied, lists only reviewed relative source/compiled
files required for the candidate. All copied API patch bytes are hashed.

```sh
node scripts/topology/stack.mjs /absolute/private/runtime-input.json
```

The stack discovers actual Docker IPs and the assigned loopback host port. It
freezes the exact Nginx peer before auth starts. Public authority, CORS, media
URLs and fixed proxy Host include the actual port. Nginx-to-relay TLS verifies
the ephemeral QA CA and certificate name. Native API and Next remain loopback
listeners in the application namespace. Nginx, the owned PostgreSQL and Redis
receive ephemeral host-loopback-only test ports. The unchanged media restart
suite runs on the host and requires its own labelled database and a fresh
compiled host API. Docker authority stays on the runner; the application never
receives the Docker socket. These additional database/cache mappings are test
fixtures only; the candidate deployment composition does not publish them. None of these addresses are a guessed target configuration.

`application.mjs` can also attach to a stack owned by this runner using its
temporary private runtime JSON. It checks real PostgreSQL counters, 201-account
spray versus an unrelated actual client, forwarded-header rotation, trusted and
untrusted relay senders, HMAC mutations, replay after 401/429, concurrent replay
and account admission, direct registration, native canonical dual-proof linking,
foreign-seller denial, routes and listener isolation. Failed independent cases
remain in `cases.json`; the aggregate runner exits nonzero.

The stack separately invokes actual Admin/Vendor/Customer browser journeys on
the same Nginx origin, the existing real upload/publication/private/range media
integration suite, Nginx reload, and frontend stop/start. Existing CI remains a
separate mandatory gate: these targeted tests do not replace all four builds,
all32 browser cases, backend/native regressions, or actual GitHub no-demo.

`lifecycle.mjs` runs before owned-stack cleanup. It deliberately crashes the
original relay child and observes its original PID1 supervisor exit1, then
recovers the same untouched package. It stops the frontend before restarting
the same API container, requires changed process PID/start time and confirms
the frontend shares the current API namespace. It records the actual namespace
inode; a retained inode is not falsely reported as namespace recreation. It checks a still-fresh consumed proof, existing
session, owned upload-volume bytes and database fingerprints after recovery.
A mismatched test-only signer key is applied only to the owned generated Nginx
config; auth must fail closed. Exact original config bytes and stable key
version are restored and verified. It never rotates production secrets or claims host reboot.

After these fast process-restart gates, the parent runner separately stops and
removes only its exact owned frontend/API containers, then creates new IDs from
the same artifact bytes and rejoins a new actual shared namespace. It preserves
all PostgreSQL/Redis/media volumes, credentials,16-table fingerprints including
nonce/counter rows before new auth, existing session and uploaded bytes. It
inspects the new fixed upstream IP and changes only that literal Nginx upstream
address; exact sender allowlists and TLS CA/name/key stay unchanged. New
container IDs and a changed namespace inode are required in this separate gate.
A long artifact recreation is not presented as a still-fresh30-second replay;
that property is checked by the separate fast process-restart gate.

For managed cloud Chromium, use the existing supported environment overrides:

```sh
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 node scripts/topology/stack.mjs /absolute/private/runtime-input.json
```

This selects the actual available system browser; it does not suppress test
failures. Each verification child exit remains explicit. Independent media and
lifecycle checks continue if a browser/test child exits1, while aggregate status
remains FAIL. Unexpected spawn/timeout/signal failures also fail the runner.

`process.mjs` records actual child `close` exit/signal, timeout and spawn error.
The receipts omit secret-bearing arguments/input. HTTP responses containing
tokens stay in process memory; case evidence records statuses/counts rather
than tokens/passwords/assertions. QA environment files and TLS keys are mode0600
and removed with exact temporary-directory ownership at cleanup.

Cleanup inspects exact created IDs, names and labels before removal, then checks
the captured preexisting container IDs remain. Do not run another independent
QA cleanup against the same Docker daemon during the snapshot interval: its
legitimate removal of its own preexisting ephemeral containers is a preservation
guard failure, not permission to relax the guard. No prune, volume-wide deletion,
daemon restart or storage-driver change is performed.

Retain failed-run evidence and actual exits. `NOT_EXECUTED`, host reboot, IPv6
when disabled, compatible-bundle recovery, owner discovery and public Internet
TLS must not be promoted to PASS by these tests. A complete task handoff must
include those separate gates or their explicit unresolved blockers.
