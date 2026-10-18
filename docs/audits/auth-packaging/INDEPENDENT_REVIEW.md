# Independent auth deployment-packaging review

Status: **PASS for bounded packaged-authentication acceptance; STOP for Chief Architect review.** Frozen packaging source `9846b5042e90d06d14d00b5fefdf67ebba455ec0` and the actual immutable images below passed after the preserved diagnostics. Reviewer implements no application or packaging files.

Authorized baseline: `d9b55b3856d6e52ba86db517430572c2d46761e0`. Preserve accepted PR24 native target guards and PR25 Policy A/authentication semantics. No owner deployment/configuration, main/merge, live finance, S1 or Phase5 work.

## Baseline defects and required closure

At the authorized baseline, Docker storefront entrypoints started only `apps/storefront/server.js`; catalog health can pass while canonical customer authentication rejects absent ingress proofs. Source/prebuilt storefront images omit the actual first-hop process contract. Next standalone tracing is not evidence that the server-only signer package and new ingress entrypoint are present and resolvable. Baseline Compose provided neither signing key nor explicit proxy-peer policy/private-Next topology. The prepared script modifies standalone outputs in place and repeated `cp -r` risks nested static/public directories; packaging must be deterministic and must not include environment/credential files.

A self-contained package must include the actual unchanged PR25 ingress, standalone Next output/static/public files, required workspace signer dependency and a supervised lifecycle. Private Next must bind loopback; exposing its port must not become the documented authentication entrypoint. A child startup/early-exit failure must stop its sibling and cause an observed nonzero supervisor exit. Signals must terminate both children; a catalog-only healthcheck cannot certify customer auth.

## Proposed bounded topology

Shared API/storefront network namespace is acceptable as an explicit single-host, single-API reference package: API owns published ports, storefront joins `network_mode: service:api`, private Next binds `127.0.0.1:3001`, and unchanged TLS ingress binds `0.0.0.0:3000`. Next→API uses genuine loopback and exact `127.0.0.1` permission to assert metadata. This avoids treating an arbitrary Docker bridge address/CIDR or caller XFF as a customer identity. It is not a general distributed topology or a target-host certification.

Public ingress still requires certificate/key; no downgrade of PR25's public TLS rule is acceptable. Compose must require server-only signing key, explicit trusted peer and certificate provisioning, publish no private Next port, and keep secrets out of image layers/contexts. Dependency symlinks may resolve internally within the image; none may reach the source workspace or host dependencies.

## Independent verification plan

After exact source/image freeze, use new owned labeled PostgreSQL17/Redis7/API/storefront resources only. Protect all ten preexisting containers/volumes/states. Capture image IDs/digests, source/build context manifests, container commands/mounts/network bindings and internal resolved dependency paths. No source or dependency bind mounts are acceptable for application runtime; ephemeral QA TLS mounts and explicit test-only tooling are distinguished.

Execute affected auth and PR24 HTTP/PostgreSQL checks inside the actual API image sharing the frontend network namespace. Real loopback source binding then remains genuine source evidence rather than Docker-published-port NAT collapse. The existing auth test's request helper needs HTTPS transport selection only; quota/security assertions must remain unchanged. Use an ephemeral QA CA through process-scoped Node trust, not disabled certificate verification. Browser uses the actual packaged TLS frontend and original native API paths, with explicit QA-only certificate treatment; capture native Admin, native Vendor and customer authenticated journeys/screenshots.

Verify missing configuration/TLS/child failure behavior, private port exposure, helper availability, original auth spoof/replay/concurrency/persistence/victim-access policy, native tenant guards and PR24 actual-target denials/ordinary CRUD. Record real child/browser/test/wrapper closes and retain failures. Verify original source/image artifact parity plus exact owned cleanup and protected resources before acceptance. Do not rerun unchanged broad Issue18/financial suites or describe source-workspace symlink execution as packaged acceptance.

## Diagnostic attempt 1 — real dependency omission

Run `package-20261018073024528-22e6459c`, source `6cd8cf464e43fcc73392d0e120b1934194a15c81`, API image `sha256:8e4222a011e3f27562334fced272d951784a53663213fd77518529413924f4ae`, storefront `sha256:b72a502d746acef0326ca96a1a51d31447ccf889f58edaca2796dd976922a9ed`. The image-contained native migration failed with `Cannot find module '../providers/verification/token'` from pinned Medusa Auth. The prepared tar filter `--exclude=verification` also removed the actual nested native dependency directory, not only root reviewer evidence. This is a genuine packaging defect; no authentication implementation change is required to correct it. Root is changing that filter to the root-only `./verification` exclusion and rebuilding exact new artifacts.

Schema/test child close1, API seed container exit1, runner1 and supervisor1 were observed. Persistent auth/PR24, independent HTTP, lifecycle and browser stages were NOT_EXECUTED. Raw failure logs/receipts remain immutable. Cleanup passed: all three owned containers, two anonymous volumes, owned network and ephemeral TLS files removed; ten protected containers/volumes/states preserved. Source/build/reviewer parity for this diagnostic attempt passed. No successful acceptance or browser evidence is inferred from this failed attempt.

## Diagnostic attempt 2 — reviewer transport fixture mismatch

Run `package-20261018073925940-16c3ef9d` used corrected source `909fed440806f2032ebd6cd14bc3f560a28b9f41` and new immutable images. Native migration reached its connection verification but timed out after ten seconds. This was not another missing-dependency defect: the reviewer supplied `pg:5432` without the reference Compose's existing `?sslmode=disable`. Pinned Medusa `loadDatabaseConfig` defaults nonlocalhost hosts to TLS; owned PostgreSQL had no TLS. The first framework connection succeeded, while its derived module connection retried unsupported SSL. No application change or timeout increase was made.

Separate owned image diagnostic `driver-20261018074630015-a62dbe5f` demonstrated native plain pg SELECT1=1; inferred SSL `{rejectUnauthorized:false}` and native error `The server does not support SSL connections`; SDK plain query reached the explicit eight-second diagnostic bound; adding the existing Compose parameter selected SSLfalse and SDK SELECT1=1. Actual probe/wrapper exits0 and exact cleanup passed. Its first tool attempt failed before querying because the reviewer requested a transitive package directly; corrected to original `@medusajs/framework/utils`, with both source versions, actual exit1 then0 and cleanup receipts retained.

Attempt2 schema/container/runner/supervisor exits1, later stages NOT_EXECUTED, cleanup/protected10 parity PASS. All eight script bytes for attempts1/2 were separately snapshotted and verified against their launch manifests. The next reviewer-only fixture change adds the existing Compose SSL-disable parameter; security assertions and frozen application/images stay unchanged.

## Historical candidate for diagnostic attempt 3

Source `909fed440806f2032ebd6cd14bc3f560a28b9f41`; API `sha256:5f260813c4df50dce73134954ec1741fde3a08f2f5c9b3022543f5d8a2b16166`; storefront `sha256:9c8836a8c2c0217d327cf07329f0f1f861cd4927f610678b73866c7a4fd12120`. This retains `6cd8cf4` packaging changes and fixes only the confirmed root-level tar exclusion. Application/authentication source and compiled outputs remain inherited unchanged. The third primary run is `package-20261018074841200-82d25449`; all eight reviewer executables were frozen again after the QA URL correction.

Source review covers the original three Docker paths, fresh package builder/manifest verification, supervised standalone entrypoint, private loopback binding and shared-namespace Compose reference. This was a conditional source assessment; attempt3 below found and corrected an actual packaging dependency-context defect. Source Docker full compile is not newly executed by the reviewer; actual prepared-image packaging and application runtime are the required fresh evidence. Root's separate gitless-builder exercise must be cited distinctly from a full source image build.

## Diagnostic attempt 3 — contained dependency links must retain resolution context

Run `package-20261018074841200-82d25449` passed actual image-contained schema/demo and native QA seeding after the reviewer fixture matched Compose. Private Next then exited1: `Cannot find module 'styled-jsx/package.json'`. The standalone tree's original relative `next` link resolves into its contained Bun `.bun/next.../node_modules/next` location, whose parent has the required dependency siblings. Dereferencing it into `apps/storefront/node_modules/next` relocates the module and breaks Node resolution. The correct bounded repair preserves only relative artifact-contained links, hashes their link text and rejects every external/dangling target; no source-workspace link or global NODE_PATH workaround is accepted.

Supervisor correctly logged private-child1 and shutdown failure1. The frozen reviewer readiness loop reached its bounded180s timeout; tests/browser remained NOT_EXECUTED. Cleanup removed the runtime containers, volumes, network and ephemeral TLS and preserved ten protected resources. Root began correcting three packaging source/doc files after the immutable image failure, before the reviewer finally completed. Consequently the third raw parity receipt is correctly FAIL. `PARITY_DIAGNOSIS.json` distinguishes those changed packaging paths from the still-unchanged52 actual test files and eight reviewer scripts. No continuous packaging-source freeze is claimed for that failed run; images had no workspace mounts and remained immutable.

A separate fresh network-none old-image reproduction `standalone-repro-20261018075848776-196c89dd` retained actual new raw stderr and structured lifecycle events: docker start-a1, container1, expected failure reproduced, outer wrapper0, exact cleanup/protected10 PASS. It is not mislabeled as the original attempt3 raw log; that original error is separately recorded as an actual tool observation.

The next frozen candidate `9846b50` changes only packaging link handling/verification and platform matching. The reviewer preserved the full third script snapshot, replaced the zero-link oracle with strict contained-relative-link/manifest validation and link-map hash parity, and made exited-container readiness fail immediately. Authentication, RBAC, tenant and PR24 behavior assertions remain unchanged.

## Final independent packaged acceptance

Frozen packaging source: `9846b5042e90d06d14d00b5fefdf67ebba455ec0`. Actual API image `sha256:98753972be374eede0b5daf13fcc49ceb74993bafb9393a87faba56de62e6d57`; storefront `sha256:e9c423deab03f4a71d8b1d4f99ae44cf2ea55974ff7e955bd41733970a9b9936`. No source/dependency bind or workspace-external link was used by either application. Only ephemeral QA TLS certificates were mounted read-only. Reviewer HTTP tooling was copied into `/tmp`; host Playwright was solely the browser test client.

Accepted run [`package-20261018080328338-54401542`](../../../verification/auth-packaging/reviewer/runs/package-20261018080328338-54401542/COMPLETE.json):

| Fresh check | Actual result |
| --- | --- |
| Native/schema/demo migration and native QA seed | Both child/container0; fresh owned PostgreSQL17/Redis7 |
| Persistent auth10 + unchanged PR24 guard6 | 16 pass, 0 fail, 299 expect calls; child0 |
| Independent actual HTTP/PostgreSQL | 19 before +4 after real API/frontend restart; both child0 |
| Native Admin, native Vendor, B2C customer browsers | 3 authenticated journeys, 6 actual1440/390 screenshots, zero pageerrors; child0 |
| Missing signer key/public TLS, invalid upstream, same private/public port | All4 correctly fail container1, preserved lifecycle receipts |
| Actual private binding | Only127.0.0.1:3001; eth0 connection ECONNREFUSED; missing private auth proof403 |
| Unexpected private Next termination | Next handled SIGTERM and closed0; PID1 recognized unexpected exit, stopped ingress and exited1; same image/container recovered |
| Controlled stop | PID1/Next0; ingress actual SIGTERM, not invented exit0; API/Redis/PostgreSQL0 |
| App bytes and dependency paths | All185753 API files/10715 internal links and3660 frontend files/140 relative internal links identical pre/post; zero external links |
| Frozen source/tool parity | All52 actual test files,16 packaging/dependency sources and8 reviewer executables unchanged |
| Owned cleanup | All10 temporary containers,2 anonymous volumes, network, ephemeral TLS removed; all recorded process groups gone; protected10 containers/volumes/states unchanged |
| Independently observed browser/runner/supervisor closes | 0/0/0, no signal/spawn error; actual monitor self-exit not claimed |

All23 independent cases actually ran: actual socket attribution vs header rotation; per-network/account quotas; shared-Next client separation; unrelated legitimate/victim access; customer and pending supplier registration without privilege escalation; missing/tampered/stale/future/path/body/method/peer proof failures; nonce replay including across restart while age7669ms remained fresh; atomic concurrency; genuine PostgreSQL work/advisory-lock limits/release; canonical native Admin/Vendor authority and tenant denial; PR24 protected actual-target denials and unrelated native CRUD. Canonical fixture fingerprints remained unchanged, with empty history explicitly not presented as populated historical restore evidence. Auth-only operational counters were deliberately reset at a documented independent-fixture boundary after the persistent test suite; persistence checks then performed actual process restarts without that reset.

The frontend manifest matches all3799 file/link entries, source9846 and content SHA256 `2163dc0d9191b65475ebf1172fc624b4613bfaca71f5dad5d305fa87f57fce18`. Its exact physical auth module hash is `bf566fa44d8e9e8f421d7031f9e8a3a0cb67b7f885098c67a25811fff678db18`. Manifest140 relative links all resolve inside the artifact. This permits necessary Bun package context while rejecting host/workspace links.

A separate [read-only image provenance run](../../../verification/auth-packaging/reviewer/provenance/runs/provenance-20261018081109674-2709dec2/RESULT.json), `network=none` and no mounts, computed all395 explicit source inputs and complete compiled output digests directly in the tested API image. Source `ea2239fcacbbbc80b2495388267d82d90f8edc33e2424b68fb692eef5186de05` and outputs `ea1943ce90637868e9fceffd03477f5e4840834cf63beb747520659602547d37` match the inherited accepted receipt exactly. Actual image Node24.22.0 is separately recorded from builder24.19.0. Image child0, externally observed wrapper0, no-volume transient cleanup and protected10 preservation all passed. This is fresh artifact comparison, not a new application compiler run.

[Machine-readable final review](../../../verification/auth-packaging/reviewer/FINAL_REVIEW.json) pins the source/images, all receipt paths/hashes, all6 screenshot hashes/dimensions and exact limitations. Reviewer visually inspected actual Admin1440, Vendor390 and Customer390 captures. Actual native shell navigation, Persian content and mobile product layout render; synthetic seed products legitimately have image placeholders. This auth/browser smoke does not claim new exhaustive commerce/UI acceptance.

## Final source/configuration and handoff verdict

Independent read-only source review **PASS**, with no must-fix remaining within the authorized packaging boundary: all existing Docker paths use the fresh contained package and supervisor; required physical signer/unchanged ingress are present; private Next is actual loopback; TLS/key/port/upstream prerequisites fail closed; shared-namespace metadata trust matches explicit PolicyA without inventing external client attribution. No application/authentication implementation was written by this reviewer. Root's final Persian handoff was read and its runtime/provenance/limits checked against the exact receipts; factual approval is recorded in the machine verdict.

No target rollout certification is granted. Fresh evidence covers prepared Linux/x64 images only. Full source Docker compilation, independently pruned API package, Mac/ARM64, external NAT/CDN/routing/TLS/DNS/firewall, owner secrets/configuration, scale/load/SLO, populated historical restore and broad unchanged financial/commerce suites remain inherited or not executed. QA browser certificate exception is scoped to disposable QA; Node probes/health verify the explicit QA CA. Initial readiness polls1 followed by0 and the inherited native startup `Codegen failed` warning are retained; neither is mislabeled as a fresh successful codegen/compile. Registry publication/bit-for-bit future rebuild is not claimed. The ten protected resources remain intact; no main push/merge, owner changes, rollout, live provider actions, S1 or Phase5/CRM were performed. Stop for Chief Architect review.
