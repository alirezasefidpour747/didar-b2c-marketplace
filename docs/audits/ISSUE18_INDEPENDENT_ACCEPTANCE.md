# Issue #18 — independent acceptance

This report belongs to the independent acceptance agent. That agent does not
implement the application. The implementation and independent execution results
must remain distinguishable. Execution below uses separately copied production artifacts and disposable
PostgreSQL 17 / Redis 7 services. No application implementation was written by
this reviewer.

## Authority and native reuse review

Read `AGENTS.md`, `MERCUR_NATIVE_PANEL_ARCHITECTURE.md`, the full approved
ADR-CORE-03 and owner policy ADR-BIZ-02. Read the installed Mercur 2.3.7 bundled
commission, payout, order-group and panel-extension documentation. Native SDK
routes, authentication and scoped grants are reusable. Native monetary payout
and split native orders do not establish equivalence with the existing exact UID
reservation or fine-gold discharge. Tests therefore inspect the original DIDAR
order, reservation, event and balanced multi-instrument posting authorities.

No rollout, owner-server changes, source-of-truth migration, CRM work, automatic
merge or live financial transaction is part of this acceptance.

## Independent matrix

| Proof                            | Required observation                                                                                                           | Status  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Retailer and manufacturer agency | Actual seller, agent issuer, one collection, exact contract gold/IRR obligation, approved separate consideration               | PASS |
| DIDAR direct                     | DIDAR seller and no external agency principal payable                                                                          | PASS |
| Native Admin                     | Actual native login, server-authorized mandate review and managed merchant launch                                              | PASS |
| Native Vendor                    | Own history/invoice/finance, tenant-safe denial of other seller and customer facts                                             | PASS |
| Customer                         | Accepted role before payment; own frozen invoice after payment                                                                 | PASS |
| CASH/CREDIT                      | Versioned fees/tax/beneficiaries; exact collection plus explicit principal for merchant-paid service receivables                                                            | PASS |
| Mandate lifecycle                | Unapproved, expired, revoked, changed terms and suspended business fail closed                                                 | PASS |
| Curation                         | Explicit approved A-curates-B mandate, scoped catalog/count/PDP/media/quote/payment, revocation                                | PASS |
| Same physical UID                | Concurrent two-store checkouts share one reservation; exactly one winner                                                       | PASS |
| Financial retry/reversal         | Duplicate callbacks idempotent; partial settlement and post-settlement refund preserve original facts and explicit recoverable | PASS |
| Projection durability            | Actual kill/restart, canonical/ack COMMIT failures, failed forward projection/retry, stale/concurrent revision repair                      | PASS — separate Core proof |
| Legacy preservation              | Populated replay/restart/backup-restore fingerprints unchanged; no economic reclassification                                   | PASS — separate runtime proof |
| Non-demo                         | No default mandates/approvals/demo commerce; feature disabled without explicit sandbox flag                                    | PASS — separate runtime proof |
| PR #15 regression                | Native authorization, protected CMS/media, existing commerce and all builds                                                    | PASS |

## Execution evidence

The independently copied application is source commit
`7b31849bb61255d5dc009c7e24a51051f12154b2`; test-only correction
`010c66a5d55554e6e3fffd834851827630958b1d` changes no application or
production output. Exact Linux/x64 Node 24.19.0 receipt:

- Source SHA-256: `5b6693e7fa0d079a4f8aca9097e0783361ee361e548d0f9d190ab65ff6bb10bc`.
- Complete output SHA-256: `63639704924cb668d955b6b09ec7b17da048950c0b0d03f6ff78174315704e0b`.
- Backend: **192 tests / 3,583 assertions / 0 failures**, across all 25 original
  and added suites, including the eleven reviewer-authored HTTP/PostgreSQL cases.
- Tooling, reported separately: **23 tests / 67 assertions / 0 failures**.
- Real native HTTP Jest: **1 test / 0 failures**.
- Final full browser rerun: **32 tests / 0 failures** (including the two
  separately authored native UI race regressions).

The first full browser pass had 31/32 passing; the added CMS race fixture tried
to create a merchant-home draft before its required storefront existed. The
legitimate HTTP 409 was preserved. A test-only correction provisions a missing
PUBLIC QA storefront while preserving prior global eligibility and any existing
configuration; its cleanup restores the exact prior absence only when that test
created the synthetic row. The intermediate missing-cleanup fixture changed
a later pending-approval prerequisite and was corrected without changing the
application or weakening any assertion. An attempted browser-only fresh setup lacked the original native
bridge prerequisite and correctly reached native login; it was stopped without
relaxing authentication. The complete original backend/native-HTTP/bootstrap and
all 32 browser scenarios were then rerun together on a fresh independent database.
That final complete run passed. The copied source/output was validated before
fixtures; the final original build receipt equals the captured initial receipt.
Uploads and other runtime files stay exclusively in the owned test copy. Diagnostic failures are preserved separately.

After Playwright reported all 32 passes, the executor connection interrupted the
outer harness before its final marker and cleanup. Its exit code is **unknown**;
no harness exit-zero claim is made. After reconnection, `verifyBuild` independently
confirmed the original complete source/output and exact initial/final receipt,
and all 50 test files matched both the frozen commit and owned copy. The
structured proof is `INDEPENDENT_FINAL_VALIDATION.json`. Only the exact owned
scratch processes and labeled disposable PostgreSQL/Redis were subsequently
removed; `INDEPENDENT_OWNED_CLEANUP.json` records that scope. The observed suite
results above are retained without an unnecessary rerun.

The final CMS race fixture uses a private supplier category page, preserving the
original singleton merchant-home fixture. Publication verification now waits for
the actual matching native publish POST response, requires HTTP 200 and completed
response delivery, and keeps the original strict public-version assertion. The
prior HTTP 404 occurred five milliseconds before publication committed; no
application authorization, uniqueness guard or acceptance assertion was relaxed.

Evidence is under `verification/issue18/`: `INDEPENDENT_FULL_REGRESSION.log`, `INDEPENDENT_BACKEND_REGRESSION.log`,
`INDEPENDENT_BROWSER_REGRESSION.log`,
`INDEPENDENT_FULL_DIAGNOSTIC.log`, `INDEPENDENT_BUILD_RECEIPT.json`, and
`INDEPENDENT_TEST_SOURCE_SHA256.json`. The executed copy harness is retained at
`verification/issue18/probes/independent-copy-acceptance.mjs`. Native/canonical endpoints and actual
production Next/Admin/Vendor builds are exercised; only gateway settlement is
the explicitly approved sandbox path. Browser race probes delay actual fetched
HTTP responses and never substitute backend data. All 50 copied test-source files
match the checked-in test source; aggregate SHA-256 is
`ced148cd5776a6d6394f40c60a42f1eeff7c232ad3abb7044a2933deeec98d3a`.

Eighteen actual screenshots are retained in `verification/issue18/screenshots/`:
native Admin agency approval at 1440/390, customer prepayment disclosure and
invoice (1440 and invoice 390), native Vendor own invoice at 1440/390, own finance,
suspended read-only history/invoice, both actual native UI race regressions, and native Admin/Vendor CMS at
1440/390, plus the actually published Customer CMS at1440/390. See
`verification/issue18/SCREENSHOT_INDEX.md` and `SCREENSHOT_SHA256.json`.
The Admin finance form is functionally exercised by the existing
full browser suite; no separate Admin-finance screenshot is relabeled from a
Vendor finance screen.
These are Linux Chromium evidence, with no owner Mac or external provider claim.
The reviewer visually inspected the real document/seller/UID content and mobile
wrapping; browser assertions also require no horizontal overflow.

External statutory accounting/tax certification, provider integration,
hardware/Mac acceptance, production deployment and unapproved
A-reseller/B-supplier economics remain outside this sandbox proof.

The added positive MERCHANT-payer case contains four economic scenarios in one
test: retailer/manufacturer each using CASH and CREDIT. It verifies the frozen
actual principal as payer, exact separately balanced IRR service receivable and
DIDAR consideration, one customer collection/event/journal/attempt despite
callbacks, unchanged original principal gold/IRR liability, and invoice privacy.
The original ten-case source prefix remains byte-for-byte unchanged; the added
case and updated source hashes are recorded in
`INDEPENDENT_SUPPLEMENTAL_TEST_ADDITION.json`. This recognition proof does not
claim a new collection/discharge or external partner payout workflow.

## Findings and corrections checked

- The first reviewer fixture attempted to overlap an existing active pricing
  assignment. Its legitimate `CONFLICT_PROFILE_OVERLAP` was retained; the test
  now uses the existing audited `switch` operation. No application guard was
  relaxed to make a test pass.
- Nested native select controls expose correct ARIA combobox names. Exact
  Playwright label lookup includes option text in this HTML shape; the reviewer
  uses semantic combobox selectors and the original native store-button content.
- A real customer browser journey found that the new Next invoice proxy dropped
  `order_id`, producing backend `GET /didar/invoice` HTTP 400 after a successful
  paid agency order. Bounded query forwarding and malformed/duplicate/unknown-key
  rejection were implemented by the coordinator; the strict invoice journey was
  retained.
- A separate Core review found invoice origin-store inconsistency. The reviewer
  matrix now requires own-customer global/exact-origin reads to pass and an
  unrelated current-store read to return 404.
- The full regression found that replaying older SQL could replace the new
  curation visibility functions. Independent tests now hash actual PostgreSQL
  function definitions, replay each of the three older schemas, and check real
  positive curated catalog/media and outsider/global negative reads after each.
- Acquisition cost and its internal document could remain in a physical
  supplier's financial projection for a DIDAR direct sale. The independent test
  requires supplier redaction while Admin reads and immutable original facts
  retain the cost/document.
- Late Core review identified that a DIRECT_DIDAR profile could create a service
  debtor from the physical source merely because its rule said `MERCHANT`.
  Independent proof requires the exact fail-closed error before new collection
  and preservation of the already-paid role snapshot. No upstream fee contract
  or alternative payer is invented.

- The older full browser suite exposed two real management timing defects:
  one concurrent action could release all controls, and a previously selected
  merchant's delayed sharing response could replace the current merchant's
  data. Implementation fixes use a pending counter and scoped response
  generation; independent probes preserve the real HTTP responses.

## Explicit residual boundaries

Approved A-curates-B means B remains actual seller, with attribution to A and no
invented A fee. It does not prove A resells B's goods. Separate native order,
customer, inventory and payout writers remain unselected. The named third-party
profile allocation test proves recognition and balanced posting to the approved
beneficiary; it does not certify a distinct partner payout/discharge workflow.
Actual seller principal settlement is tested in original gold/IRR instruments.

The independent acceptance agent did not modify application implementation or
approve their own business code. Independent projection process-kill/fault proof
belongs to the separate Core reviewer; populated replay/restore and bootstrap
proof belong to the separate runtime reviewer. Their executions are recorded separately in
`ISSUE18_CORE_REUSE_REVIEW.md` / `verification/issue18/core/` and
`ISSUE18_RUNTIME_REVIEW.md` / `RUNTIME_RESTORE.log`, and are not added as
invented unique test totals. The selected source-first adapter removes the inverse writer; actual native
DB/forward-projection failures, ack failure and deterministic forward recovery
are proven instead. No execution of a nonexistent inverse-compensation branch is
claimed. Core component parity is explicit; its original
fault execution is not relabeled as a rerun of unrelated final UI/API changes.

## Independent disposition

**PASS for the bounded sandbox engineering candidate at the exact receipt above,
pending Chief Architect acceptance.** This does not authorize rollout, owner-server
changes, automatic merge, cross-supplier resale, a new financial authority or CRM
Phases 5–9. Remaining external/legal/provider/distributed-operation and partner
discharge limits are explicit above and in the separate Core/runtime reviews.
