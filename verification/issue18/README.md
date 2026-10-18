# Issue #18 — review evidence

This directory contains actual local sandbox engineering evidence, not rollout or
legal accounting certification. Read the consolidated
[Persian Chief Architect handoff](../../docs/audits/ISSUE18_CHIEF_ARCHITECT_HANDOFF_FA.md),
[independent acceptance](../../docs/audits/ISSUE18_INDEPENDENT_ACCEPTANCE.md),
[Core review](../../docs/audits/ISSUE18_CORE_REUSE_REVIEW.md) and
[runtime review](../../docs/audits/ISSUE18_RUNTIME_REVIEW.md).

## Provenance

The final executable application commit is
`7b31849bb61255d5dc009c7e24a51051f12154b2`; subsequent commits add reviewer tests
and evidence only. The release PR/Issue comment records the final delivery SHA.
`PRODUCTION_BUILD_RECEIPT.json` identifies all four built production applications.
The independently copied initial/final receipt must match it. Test source is
fingerprinted separately because test-only changes do not alter application
artifacts. `INDEPENDENT_SUPPLEMENTAL_TEST_ADDITION.json` proves that the original
ten HTTP cases were preserved when a four-scenario principal-paid-fee case was
added. The final source manifest, not a stale diagnostic manifest, identifies the
executed eleven-case suite.

## Evidence streams

| Evidence | Responsibility and scope |
| --- | --- |
| `PRODUCTION_BUILDS.log`, `PRODUCTION_BUILD_RECEIPT.json` | Coordinator; native Admin/Vendor, API and production Next builds |
| `INDEPENDENT_*` | Separate acceptance reviewer; real HTTP/PostgreSQL/Redis, financial and native/customer browsers; exact commands and suite counts in its report |
| `INDEPENDENT_FINAL_VALIDATION.json`, `INDEPENDENT_OWNED_CLEANUP.json` | Post-reconnection final source/artifact parity and exact owned cleanup. Outer harness exit is unknown after the executor interruption; no exit-0 is invented. |
| `SCREENSHOT_INDEX.md`, `SCREENSHOT_SHA256.json`, `screenshots/` | Eighteen actual final-run authenticated native/customer and public CMS desktop/mobile images |
| `core/G4_RECEIPT.json`, `core/G4_INDEPENDENT.log`, individual fault logs | Separate Core reviewer; nine real fault/recovery checks, including process death and actual native database failures |
| `core/G4_FINAL_COMPONENT_PARITY.json` | Final unchanged-component provenance; not a rerun of unrelated later API/UI corrections |
| `RUNTIME_RESTORE.log`, `RUNTIME_RECEIPT.json` | Separate runtime reviewer; fresh non-demo, all populated table/sequence hashes, restart, actual dump/restore and native asset/auth persistence |
| `HISTORICAL_NATIVE.log`, `HISTORICAL_COMPOSE.log` | Read-only original-volume clones and twice-applied current SQL; historical sources contain no UID table |
| `FROZEN_INSTALL.log` | Clean copied manifests, frozen Bun lockfile, separate dependency installation |
| `probes/` | Reviewer-owned executable copy/isolation/fault/restore harnesses |

Diagnostic logs are named `*DIAGNOSTIC*` and retain the actual failed attempts.
They are not passing acceptance receipts. Runtime selected-suite repeats are
reported separately and are not added as invented unique tests. Core's nine
checks are not represented as additional Jest cases.

All database/services were local, disposable and owned by the respective run.
Logs omit environment secrets and live credentials. Screenshots show synthetic
acceptance data. Original owner hosts, production databases and historical source
volumes were not mutated. **ROLLOUT_NOT_EXECUTED**; no merge or issue closure.
