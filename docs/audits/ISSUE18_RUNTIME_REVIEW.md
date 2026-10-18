# Issue #18 — Independent isolated runtime review

Scope: ADR-CORE-03 section 10, using only owned disposable loopback services and
copied production artifacts. The reviewer owns this report and the new
[`runtime-readiness.mjs`](../../verification/issue18/probes/runtime-readiness.mjs)
probe; the reviewer does not implement the application feature being reviewed.
PR #15 evidence and probes remain unchanged.

## Evidence status

The managed executor reports a connected current environment with an enforced
restricted HTTP policy and no VPN or configured secret/outbound-identity bindings.
Docker 28.4.0 is healthy on the explicit local Unix socket. Proxy/CA trust is
preserved. No credential values or inherited environment dump was inspected.

| Check | Independently executed evidence |
| --- | --- |
| Frozen dependencies | PASS: clean copied workspace/package manifests and `bun.lock`, Bun 1.4.3 `bun install --frozen-lockfile`, 2,004 packages, exit 0. The shared dependency tree was untouched. See [log](../../verification/issue18/FROZEN_INSTALL.log). |
| Historical original volume, final SQL | PASS: read-only clone of `didar-gold_postgres`, all original columns of all 16 original DIDAR tables unchanged after two ordered SQL schema replays; 7 Products, 8 Offers, 2 orders and 2 lines. New mandate/role/document/native links/projection records remain zero. |
| Historical Compose volume, final SQL | PASS: same independently executed audit on the historical Compose volume, 16 original tables, 15 Products, 8 Offers, 3 orders and 3 lines. Both source volumes remain stopped and unmodified. |
| Clean non-demo schema, new agency/projection tables | PASS: final artifact run; 27 identity/business/financial/role/curation/projection tables all zero, including native `seller`/`member`, financial contracts/reviews, exact stock and postings. |
| Populated old/new table and invoice-number sequence preservation | PASS: all 89 DIDAR tables (previous 79 plus 10 additive tables) have identical complete row hashes after two non-demo installer replays, restart and actual restore. All DIDAR sequence states, including invoice numbering, are unchanged. |
| PostgreSQL/Redis restart, actual dump/restore, auth/native-file persistence | PASS: real owned Redis restart/PONG and PostgreSQL restart; `pg_dump -Fc` / `pg_restore --exit-on-error` into a second owned PostgreSQL container; identical served native upload bytes; native HTML/JS/CSS, catalog, fresh native login and bridged Admin access work after restore. Latest source/job/native-metadata acknowledgements match for all 24 tracked Products before baseline and after restore. |

The new independent probe first runs a real no-demo installation with agency mode
empty. It asserts zero canonical identities, suppliers, Product/Offer/UID/order,
financial-event/journal/posting, native links and new sale/projection records.
Only after that proof does it explicitly enable local sandbox fixtures.

Both final historical audits ran the 21 current ordered schema files with SHA-256
`0eb893b866d469e1bea0c390563a8d036f853857651af7dbd475418c2b110781`.
The original-column aggregate fingerprints are respectively
`ad2a30b8ac5cba021afe39058ed52908ca3ae6b125f3a881a7c5ee4297aabaa4` and
`44bb46c0aaaada9272d75f140305e30674cddcb86bc068623326477ee46cba8e`.
Neither historical source contains an exact-UID table. These successes therefore
do not substitute for current populated UID preservation. See the final
[native-volume log](../../verification/issue18/HISTORICAL_NATIVE.log),
[Compose-volume log](../../verification/issue18/HISTORICAL_COMPOSE.log) and
[owned-clone probe](../../verification/issue18/probes/historical-readonly.mjs).

It copies the production API and bundled native panels into a private scratch
directory before starting them. Actual native uploads therefore cannot modify
shared production artifacts or their build receipt. Each service has a unique
owned name and `didar.disposable-qa=true`; cleanup verifies ownership. The probe
does not acquire or alter the shared `.local/dev.json` lock.

The populated proof uses real HTTP/PostgreSQL finance, agency, image and FFmpeg
video/CMS scenarios. Complete row hashes for every DIDAR table and state of every
DIDAR sequence are compared after migration replay, PostgreSQL restart and actual
`pg_dump -Fc` / `pg_restore --exit-on-error`. This separately covers populated
current exact-UID records; historical snapshots without an UID table do not.

## Final executed release proof

Reviewed application source: `7b31849bb61255d5dc009c7e24a51051f12154b2`.
Evidence-only commits may follow; application source and outputs are identified by
the exact initial/final-equal receipt:

- Source: `5b6693e7fa0d079a4f8aca9097e0783361ee361e548d0f9d190ab65ff6bb10bc`.
- Outputs: `63639704924cb668d955b6b09ec7b17da048950c0b0d03f6ff78174315704e0b`.
- Populated complete-table fingerprint: `77fd71b822a8dc0b909f092adc43210833402ac5d1a84d2ee4ef80aaf7d28256`.

| Independent command within the isolated runtime | Result |
| --- | --- |
| Existing integrated exact-UID/RFID/payment/settlement/refund scenario | 1 pass, 127 assertions |
| Agency allocation plus independently authored HTTP acceptance suite | 19 pass, 681 assertions: 9 allocation tests and a separate execution of the other reviewer's 10 HTTP tests |
| Real image decoding/onboarding/permission cases | 9 pass, 152 assertions |
| Selected CMS eleven-block/version/publication/media/video cases | 8 pass, 112 assertions |

These are reruns on this reviewer's separate database and copied production API,
not extra unique cases to add to the coordinator's or another reviewer's totals.
All commands and the final probe exited zero. The four production builds and full
browser suite belong to the coordinator/other reviewer; this report verifies their
frozen build receipt and independently exercises the runtime scope above.

The final fixture contains 24 Products, 43 Offers, **36 exact-UID items**, 13 orders
and lines, 49 financial events, 45 journals/188 postings, 25 media assets/75 variants,
one actual normalized video, five immutable CMS versions/publications, 13 mandates,
12 frozen roles and nine invoice/credit documents. Projection state comprises
24 tracked Products/29 revision jobs; all 24 latest revisions are `DONE`, their
source/projected revisions and native metadata agree, with zero mismatches.

Durable final evidence: [sanitized runtime log](../../verification/issue18/RUNTIME_RESTORE.log)
and [structured receipt](../../verification/issue18/RUNTIME_RECEIPT.json). Earlier
failure/intermediate logs under private `work/` are not substituted for this final
run. The first failure was a reviewer fixture attempting an overlapping profile
assignment; the test owner corrected it to the supported audited `switch` API.
Later runs during application corrections were treated as diagnostics and rerun
against the final frozen artifact.

## Runtime contract and limits

The version-matched Mercur deployment guide calls for persistent PostgreSQL,
Redis-backed production event/workflow/locking providers, durable file storage,
and server/worker operation. The installed application configuration is the
authority for what is actually configured; merely setting `REDIS_URL` does not
prove distributed provider readiness. The bounded current release stays at one
API replica until those providers and multi-instance recovery are reviewed.
The current configuration does not wire `MEDUSA_WORKER_MODE` into
`projectConfig.workerMode`; this proof uses the current single shared API process
and the explicit supported projection CLI. It does not certify a separate
server/worker topology. Pending projection jobs are drained through that worker,
with latest revisions required to be `DONE`, before any restore fingerprint.

The probe captures the initial source/output build receipt before copying the
artifact, verifies the current build again at completion, and requires the exact
initial and final receipts to match. Simply checking the latest receipt twice
would permit a coordinator rebuild during a run to mislabel an older copied API.
Diagnostic runs during source corrections are excluded from final release proof.

Native `/dashboard` and `/seller` HTML, entry JS/CSS, `/auth`, corresponding APIs
and native `/static` uploads form one origin/routing contract. Build native panels
with `MERCUR_BACKEND_URL=same-origin`; runtime CORS and `FILE_BACKEND_URL` must
remain real URLs. The existing Compose file's shared build/runtime variable
cannot be blindly set to this sentinel.

DIDAR media bytes in PostgreSQL and native local-file uploads require separate
persistent backup coverage. Database restore alone does not prove native file
durability. The new probe restores the database into a second owned container and
copies the original native upload directory, then verifies identical served bytes
and fresh native login/bridged access.

No owner host, server configuration, DNS/proxy/firewall, staging content, live
financial provider or rollout is accessed or changed. No CRM phase is started.
Historical source volumes may only be read through read-only clone mounts.
`ROLLOUT_NOT_EXECUTED` remains controlling.
