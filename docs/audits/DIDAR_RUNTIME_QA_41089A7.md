# DIDAR Deployment & Runtime QA — Chief Architect checkpoint 41089a7

## 1. Executive summary

**Outcome: staging runtime acceptance is blocked; deployment of the reviewed release is unverified.** On 2026-10-17, direct inspection of the actual staging site found that both original native-panel entry URLs render the customer application's “page not found” screen. Public B2C navigation works through catalog, empty cart, empty checkout and the anonymous account gate. No authenticated business journey was completed.

Assignment authority: [Issue #7, Chief Architect checkpoint](https://github.com/alirezasefidpour747/didar-b2c-marketplace/issues/7#issuecomment-6231727909), specialist **03 — DIDAR Deployment & Runtime QA** only. Reviewed source: **`41089a7a0ac8084b74bb3a7f128f9a9ca038528b`**. GitHub `main` independently resolved to that exact SHA during this review. This report does not perform specialist 02's F01–F12 delta audit or accept an architecture.

Read-only live-browser observations were made around **08:30–08:32 UTC on 2026-10-17**. The SSH attempt at 08:30 UTC failed with `Network is unreachable` before authentication. Consequently the exact running SHA and host/container internals remain unknown. The findings below do not identify an old commit as the current deployment.

## 2. Server topology and inspection boundary

| Layer | Current evidence | Confidence / limitation |
| --- | --- | --- |
| Public staging | `https://darlingbebe.shop` renders over HTTPS in the inspection browser | Direct browser observation; no certificate expiry/renewal inspection |
| Public native entry routes | Both native entry URLs show customer branding/navigation and not-found content | Direct observation; HTTP response codes not captured |
| Customer app | Persian B2C shell, sandbox banner, catalog facets and anonymous account gate render | Direct observation; not an authenticated acceptance test |
| Reverse proxy / upstream routing | Native routes are not serving the expected native interface publicly | Active proxy configuration and upstream identity uninspected; root cause unknown |
| Host, Docker, PostgreSQL, Redis | No current direct inspection | SSH network failure; no health conclusions |
| Historical host | Earlier owner-provided evidence described Debian 13 and loopback application ports 13000 / 19000 | Historical only; not current topology verification |

No DNS, certificates, firewall, networking, containers, configuration, data or application code were changed. No accounts, orders, payments or test fixtures were created.

## 3. Actual application URLs and smoke results

| Application / check | Exact URL | Observed result | Assessment |
| --- | --- | --- | --- |
| Native Mercur Admin entry | https://darlingbebe.shop/dashboard | Customer shell and Persian heading `صفحه پیدا نشد` (“page not found”); catalog return link | **Fail: native entry unavailable at tested URL** |
| Native Mercur Vendor entry | https://darlingbebe.shop/seller | Same customer shell and not-found heading; no native login/store selector | **Fail: native entry unavailable at tested URL** |
| B2C home | https://darlingbebe.shop/ | Branded Persian home, catalog controls and explicit sandbox/no-real-payment notice | Basic public rendering passes |
| B2C catalog | https://darlingbebe.shop/products | Navigated using the header catalog link; settled to `۰ محصول` and `محصولی پیدا نشد`; facets and discovery links present | Shell/navigation pass; purchasable-item journey blocked |
| B2C cart | https://darlingbebe.shop/cart | Navigated using header cart link; empty-cart message and catalog link | Empty-state smoke passes |
| B2C checkout | https://darlingbebe.shop/checkout | Settled from loading to empty-cart message and catalog link | Empty-state smoke passes; no submission |
| B2C customer account | https://darlingbebe.shop/account | Navigated using footer account link; sign-in-required heading and login link | Anonymous UI guard observed; server authorization not proven |
| B2C login | https://darlingbebe.shop/login | Email/password fields, sign-in and membership buttons, sandbox notice | Public form renders; no credential entered/submitted |

Native login, native sidebar, Admin extensions, Vendor store selection and native deep-route navigation could not be exercised because the original entry routes did not expose those applications. This is a **public routing/runtime failure**, not proof that panel source or assets are absent inside a container.

Catalog zero results establish only that this anonymous session saw no public products. They do not establish database emptiness, missing migration, failed connectivity or loss of existing products. PDP, scoped merchant cart, authenticated order history and sandbox purchase were not verified.

## 4. GitHub main versus deployed SHA

| Version reference | Evidence | Meaning |
| --- | --- | --- |
| Required review target | `41089a7a0ac8084b74bb3a7f128f9a9ca038528b` | Fixed source baseline for this report |
| GitHub `main` fetched during review | `41089a7a0ac8084b74bb3a7f128f9a9ca038528b` | Matches requested source baseline at inspection time |
| Actual running backend SHA | **Unknown** | No host, image-label or runtime receipt available |
| Actual running storefront SHA | **Unknown** | Public branding/navigation cannot identify a Git commit |
| Actual running native-panel build SHA | **Unknown** | Native applications not reached at public entry URLs |
| Last owner-reported healthy staging commit in prior conversation | `00447d39ffa64881c35813b5242b95fd356c84bb` | Historical deployment output only; not fresh proof of current version |

**Current/outdated verdict: indeterminate.** The public native interfaces fail the checkpoint smoke, regardless of which SHA is deployed. Neither the observed customer navigation nor the source publication proves that the server runs `41089a7`. Backend/frontend version mismatch, schema currency and asset currency cannot be determined.

A read-only SSH request attempted to resolve the staging `current` release path:

```sh
readlink -f /srv/didar-staging/current
```

The SSH connection failed before this command could run. No host filesystem or deployment process was modified. A host checkout HEAD alone would also be insufficient: the release and image/build receipts must be correlated with the running containers and served assets.

## 5. Pinned source expectation versus runtime

The reviewed [Medusa configuration](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/packages/api/medusa-config.ts) registers the original admin-ui module at `/dashboard` and vendor-ui module at `/seller`. These are backend-served native workspaces, as required by the [owner's panel directive](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/docs/MERCUR_NATIVE_PANEL_ARCHITECTURE.md).

The pinned [Admin](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/apps/admin/vite.config.ts) and [Vendor](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/apps/vendor/vite.config.ts) build configurations accept a public backend origin or the explicit `same-origin` mode. The API file provider uses `FILE_BACKEND_URL` with a localhost fallback. These are deployment inputs to verify against actual builds; their values on staging were not read.

The observed public native routes do not meet that source-defined deployment contract. Possible explanations include proxy selection, an older release, absent native artifacts or backend serving configuration. None is established without inspecting the active deployment. No proxy rewrite or rebuild was attempted.

## 6. Independent findings

| ID | Priority | Finding | Required evidence / correction |
| --- | --- | --- | --- |
| RT-01 | High | Original Admin URL displays customer not-found UI | Inspect active route/upstream and native artifact serving read-only; submit a concrete correction for authorization; then verify genuine native login and extension navigation |
| RT-02 | High | Original Vendor URL displays customer not-found UI | Same investigation; verify genuine Vendor login, store selection and scoped workspace after an approved correction |
| RT-03 | High evidence gap | Deployed SHA cannot be attested; source release is not deployment proof | Capture sanitized current release receipt, running container image IDs/revision metadata and served build identity for each app |
| RT-04 | Medium acceptance gap | Anonymous catalog has no visible products | Determine intended public staging fixture availability read-only; do not seed or publish products under this assignment |
| RT-05 | Unverified | Migrations, DB/Redis health, startup logs, asset completeness and frontend/backend alignment | Read-only host evidence required; successful anonymous pages alone do not certify these |

RT-01/02 repeat the earlier public-route concern recorded in [PR #10](https://github.com/alirezasefidpour747/didar-b2c-marketplace/pull/10), now checked again against the Chief Architect's new pinned release assignment. They are not a claimed regression introduced by `41089a7`: the actual running version remains unknown. This report is separate from that earlier broad deployment inventory.

## 7. Security and operational risks

The observed UI explicitly labels this environment as sandbox with no real payments. This is a UI observation, not independent verification of payment-provider settings.

Until native route availability and genuine authentication are verified, central operators and merchants cannot be accepted as having usable native staging workspaces. Unknown version/schema alignment also prevents safe release acceptance. No tenant leak or authentication bypass was demonstrated by this anonymous smoke; authenticated authorization, revocation and cross-tenant isolation remain untested here.

Do not publish raw environment files, Docker inspection environment arrays, complete request headers, database contents or unsanitized application logs to resolve these gaps. Record only sanitized revision, health, route and error evidence. No credentials, personal records or financial account details are included in this report.

## 8. Recommended corrections and verification sequence

1. Obtain read-only host access through an available authorized channel and identify the active release path, running container/image revisions, health status and backend/storefront build receipts. Do not infer runtime identity from the repository checkout alone.
2. Inspect the active reverse-proxy location selection for native panels, their assets and backend requests. Check backend-local native entry responses and native build artifact presence. Record whether the public request reaches the intended service.
3. Verify public backend-origin settings in both native builds, CORS/cookie origin compatibility and media URLs without exposing secrets. Verify schema migration completion, PostgreSQL/Redis readiness and relevant startup errors read-only.
4. Present any required routing/build/deployment correction to the owner for explicit authorization. This assignment does not authorize implementing it.
5. After an approved correction, repeat original Admin/Vendor entry smoke and use authorized staging test accounts for genuine login, native navigation, Vendor store selection and protected deep links. Capture sanitized desktop/mobile evidence.
6. Exercise a product/customer journey only within separately authorized non-destructive staging test scope and with an intended public test item. Do not enable live finance or create/alter staging records merely to fill this report.

These steps are evidence collection and operational recommendations, not selection of domain authority or native commerce migration.

## 9. Evidence and verification limitations

Evidence collected independently in this review:

- GitHub `main` commit metadata, pinned repository instructions, native panel configuration and review handoff.
- Fresh direct browser DOM/accessibility observations of every URL in section 3.
- Desktop visual inspection of the live catalog: styled navy/white shell, rendered controls and zero visible public products. No authenticated screenshot set or mobile capture was collected.
- A failed read-only SSH connectivity attempt, before authentication or remote execution.

The pinned [release receipt](https://github.com/alirezasefidpour747/didar-b2c-marketplace/blob/41089a7a0ac8084b74bb3a7f128f9a9ca038528b/verification/mercur-native/RESULTS.md) reports **174 backend tests / 2,238 assertions, 1 native HTTP test and 27 production-browser tests**, production builds and installer/historical-clone checks in disposable Linux/Chromium. These are **repository-reported results, not tests independently rerun by this specialist and not staging evidence**. The Chief Architect's distinction between the earlier 2,235 handoff and the 2,238 repository receipt is retained; no independent assertion-count resolution is claimed.

No authorized application test sessions were available. The review did not inspect authenticated customer, Admin or Vendor data, execute purchases, mutate sessions through credential submission, test physical hardware, inspect Mac UAT, or contact live providers. HTTP status codes, TLS expiry, current host resource usage, container logs, active proxy configuration, PostgreSQL/Redis health, installed migrations and exact runtime revisions remain unverified.

## 10. Items requiring Chief Architect / owner action

- Review RT-01–RT-05 together with specialist 02's independent delta audit before any release acceptance.
- Arrange an authorized read-only host evidence channel to close the deployed-SHA gap.
- Authorize any concrete runtime correction separately after its cause and proposed change are established.
- Decide staging acceptance only after all three actual workspaces and their version alignment are evidenced.

**No architecture acceptance or continuation authorization is issued here.** ADR-CORE-01 remains DRAFT. CRM/business Phases 5–9 remain held under the referenced checkpoint. This documentation-only review does not close Issue #9 or Issue #7.
