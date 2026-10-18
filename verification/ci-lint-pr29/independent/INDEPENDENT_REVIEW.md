# PR #29 independent lint review

**PASS — no must-fix findings.** Reviewed frozen implementation against original head `4ac8f9e8a3f95567fb83bed21e08a8b1d3673404`. Reviewer wrote no repository implementation, config, application or persistent test files.

## Independent evidence

- Independently fetched failed run `39116968405`, job `117644614806`: actual job exit 1, all 78 native findings from `react-refresh/only-export-components`; decoded log SHA-256 `f6cb9af5adc97eff1dbca2e957b8ccdb43fd71469c24675ac61dde432e68681d`.
- Installed upstream 0.4.26 reproduction: SDK object default with local component produces `anonymousExport` and `localComponents`; adding upstream `customHOCs` alone still produces both. Ordinary component passes. Original upstream reproduction process exit 0.
- Independent actual-config matrix: **76/76 PASS; observed Node exit 0**, source hashes equal before/after. See `INDEPENDENT_LINT_RESULTS.json` and `ACTUAL_EXITS_AND_VERDICT.json`.
- Independently replayed the 38 persistent SDK contract tests: **38 PASS / 0 FAIL / 0 SKIP**, observed Node exit 0; log `ROOT_38_INDEPENDENT_REPLAY.log`. Tested six-source hashes remained equal afterward.
- First external reviewer fixture run exited 1 after 30 checks because its namespace import string missed a space, causing a parser error. Original script and failure JSON remain retained. Corrected only that reviewer fixture before the 76/76 run; no implementation changes.

## Source and contract findings

The route entrypoint exceptions are bounded to `config` and `handle`; widget exceptions to `config`. Ordinary component and route helper files keep upstream checks. Direct model custom-field files alone enable the adapter. It requires a real runtime named import (including aliases) of `defineCustomFieldsConfig` from exact `@mercurjs/dashboard-sdk`, a direct default call, and one object argument. Type-only imports, local helpers, another SDK member, another module, namespace calls and extra arguments are not recognized.

The helper delegates to the installed upstream rule using a cloned classification view of the recognized default export. This avoids mutating the parser AST and preserves unexpected named-export detection. Simply suppressing upstream diagnostics would leave its `hasReactExport` flag false and miss those errors; the chosen classification delegation avoids that weakening. The canonical rule ID stays enabled at error level throughout both effective configurations. Original Vite primitive-constant allowances, Hooks errors, React context mixed-export errors and other recommended TypeScript rules remain intact.

Read the bundled Mercur 2.3.7 custom-field, widget and panel-extension contracts and SDK implementation. The documented local component inside a default factory object matches the actual repository files. The CI change only adds SDK contract tests before the existing lint stage; it preserves subsequent stages.

## Boundaries

This proves static lint compatibility. It does not certify runtime HMR, application/browser/database behavior, deployment or the outcome of a not-yet-observed new GitHub run. Numeric constant exports allowed by the original Vite preset remain intentionally allowed. Nested/custom alternative SDK forms not implemented here retain upstream behavior; this is not universal SDK export support. Exact tested hashes are recorded in the JSON receipts. Full configured local validation and GitHub CI outcomes are coordinator-owned follow-up evidence.
