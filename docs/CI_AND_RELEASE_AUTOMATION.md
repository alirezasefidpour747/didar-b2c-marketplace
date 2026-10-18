# DIDAR CI and separately authorized release automation

## Audit and reuse

Audit baseline: main `4f41784db6ca67f7566503c508cc609f1d50c7ce`. No tracked `.github` workflows existed. There is no useful application typecheck behind the root `check-types` Turbo alias because workspaces do not define that task. Admin/Vendor production builds already run `tsc -b`; explicit API/storefront no-emit checks are added to CI. Existing lint is invoked unchanged; baseline lint/type failures block CI and must be triaged, not hidden or “fixed” by weakening checks.

`scripts/local/test.mjs` already owns isolated PostgreSQL 17/Redis 7, random loopback ports and sandbox secrets, schema/demo/native seeding, all original production builds, tooling/backend tests, native HTTP and full browser journeys. CI reuses `local:test`, then its supported no-demo installer/bootstrap mode with an exact build receipt. It does not point tests at staging. FFmpeg and Chromium are explicit prerequisites.

Original `build:all`, `scripts/build-prepared-images.sh --reuse-build`, Dockerfiles, build receipt and signed-ingress package are reused without business-logic or architecture changes. The independent artifact job reuses the existing nonimplementer-owned packaged HTTP probe and native/customer browser smoke from `verification/auth-packaging/reviewer`. It runs delivered images on a second runner with no source/dependency mounts. It is automated independent execution, not a claim of a new human independent review. Historical broad acceptance and populated-history evidence are not relabeled as fresh.

`deploy/oracle` remains historical; retained Debian staging branches and the actual installed host need runtime review. No workflows, branches, data or existing deployment procedures are deleted.

## Pull Request / main CI

`.github/workflows/didar-ci.yml` runs on PRs, main pushes and manual dispatch. It uses pinned Node **24.19.0** (the reviewed Node 24 builder line) and Bun **1.4.3**, frozen install, original lint and explicit types, full production-build/backend/native/browser harness and non-demo bootstrap. No generic npm/Webpack starter is introduced. Actions are pinned to verified full upstream commit SHAs. Permissions are contents-read only, checkout credentials are not persisted and PR jobs receive no release/staging secrets. PR code is untrusted; there is no pull_request_target or privileged workflow_run execution of PR code.

Observed stage exits are written to a sanitized `validation.json`. Raw `.env`, QA keys, tokens, logs and browser state are not uploaded. Cancellation/timeout on a GitHub-hosted ephemeral runner is not a successful stage; the run conclusion remains non-success.

## Activation prerequisites — repository administrator

This PR does not merge itself, dispatch a release, configure repository protections or publish images. Before release use:

1. Review/approve this PR; merge through Chief Architect approval and require successful CI for the exact resulting main commit.
2. Create environment **didar-release**, configure required Chief/owner reviewers, restrict it to main and disable approval bypass/self-approval where appropriate. An environment name alone does NOT establish protection. Actual environment settings are NOT_VERIFIED by this implementation. Make these settings part of release acceptance.
3. After the environment is configured, set repository/environment variable **DIDAR_RELEASE_ENABLED=true**. Without it the gate fails. This variable is an administrative opt-in, not independent proof that reviewer protections exist.
4. Allow Actions package publication if GHCR is desired and ensure the repository can write to existing package names. No PAT or staging SSH key is required; only the publish job gets packages-write via GITHUB_TOKEN.
5. Configure package visibility deliberately. GHCR packages may be private even for a public repository. Anonymous access is probed and reported, not assumed.

The workflow is manual-only, must be dispatched from main and requires a 40-character accepted source SHA plus exact text `RELEASE <SHA>`. It verifies that SHA is an ancestor of main and its latest matching main-push DIDAR CI completed successfully. The selected revision must contain these automation scripts/workflows; older pre-automation commits cannot satisfy the CI gate. A moving main head is never substituted for the requested revision.

## Release job boundaries

1. **authorize:** protected environment, explicit opt-in/confirmation, exact source/main ancestry and CI evidence. Minimal contents/actions-read.
2. **build:** fresh lint/types/full original integration/browser/build and no-demo checks; original same-platform packaging; OCI revision labels; two image IDs; observed docker-save plus gzip; release manifest and archive checksums. Contents-read only, no registry credentials.
3. **verify:** fresh runner downloads/checksums/loads archives, validates IDs/revision/architecture and packaged manifest, boots the actual images against new disposable PG/Redis and ephemeral TLS. Executes the 16 auth/product regressions, the reused 19+4 independent HTTP checks across actual restart and the 3 original native/customer browser smoke journeys. No hosted-server access. Only after PASS and exact owned cleanup does it upload the **verified** release artifact.
4. **publish:** optional packages-write job downloads the verified bundle, checks/loads it, pushes unique source/run/attempt tags to GHCR, records manifest digest references and confirms authenticated digest pull resolves to the tested image ID. A separate empty Docker configuration probes anonymous manifest access. Tags are convenient names, not a registry-enforced immutability promise; installation uses digest refs. No `latest` tag is written.

If login/push/pull fails, the publish job fails visibly and uploads its partial/error result; the independently verified downloadable image archive remains available. Publication and staging deployment are entirely separate. No deployment job or staging credentials exist.

## Manifest and fallback

The verified artifact contains `images.tar.gz`, `release-manifest.json`, `SHA256SUMS` and `INSTALL.md`. Manifest includes exact source, workflow/accepted-CI URL, image config IDs, revision labels, linux/amd64 platform, archive digest and fresh verification stages/limits. It has no fabricated registry digest before publication. Registry results/manifest are a separate artifact because they are produced afterwards. Verify the inner checksums and the Actions-provided artifact ZIP digest separately.

Download links are in the verify-job summary; GitHub access may be required. Verified downloads retain 30 days, candidates 7 days and diagnostics 14 days. Archive a verified release in owner-controlled storage before expiration. No source tarball or local image ID is described as a downloadable release.

Detailed existing-server guide: [CI_RELEASE_INSTALL.md](CI_RELEASE_INSTALL.md). It explicitly requires preflight, backup/recovery, matching images without rebuild, secrets, migrations, correct signer/TLS/routing and public native/customer acceptance by conversation 03. This generic runbook does not invent host-specific commands or certify target Internet access.

## Verification limits

Workflow YAML, scripts and manifest contracts can be checked locally without Docker. Full application/packaged-image checks require Docker, the pinned Bun/dependencies, network access and a suitable runner. Until actual Actions runs complete, builds/tests/publication/accessibility are NOT_EXECUTED/NOT_VERIFIED, not PASS. Existing source-only, prototype and historical QA evidence remain explicitly separate.

Known operational boundaries: Linux/amd64 only; source-to-source bitwise rebuild reproducibility is not guaranteed by moving base tags or apt repositories; Docker image IDs and produced registry digests pin each actual release. Runner disk/time/package download limits may require a larger approved GitHub-hosted runner. No broad runner prune or unrelated cleanup is included. Genuine shared NAT, native-provider throttle SEC-03, password semantics SEC-04, live providers, statutory approval, SLO/capacity and target network remain outside this CI change.

Official references: [environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments), [workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [GHCR visibility/authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [artifact verification](https://docs.github.com/en/actions/tutorials/store-and-share-data).

## Native Dashboard SDK lint compatibility

Admin and Vendor use the bundled Mercur Dashboard SDK **2.3.7** contracts documented in `@mercurjs/docs/content/resources/customization/extending-panels.mdx`, `resources/tutorials/custom-panel-page.mdx`, and `resources/tutorials/extend-forms-and-tables.mdx`. Route `src/routes/**/page.tsx` modules export `config`/`handle`; widget modules export `config`; model-level `src/custom-fields/*.tsx` modules default-export `defineCustomFieldsConfig({...})` with local field components.

`scripts/eslint/mercur-dashboard-refresh.mjs` keeps the canonical `react-refresh/only-export-components` rule enabled at error level. Export-name exceptions apply only to route entrypoints and widgets. The custom-fields option recognizes only a direct runtime named import (including aliases) of that factory from the exact SDK and one object argument. It delegates to the locked upstream rule on a cloned classification view; application source and the parser AST are unchanged. This is static lint compatibility, not a new claim about runtime HMR behavior. Upstream `customHOCs` alone cannot recognize the SDK's object argument.

`node --test tests/native-sdk-lint.test.mjs` runs through both actual panel configurations before the original lint stage. Positive SDK cases and negative path/export/fake-import/type-import cases protect against blanket exemptions. Vite constant-export support and other recommended ESLint rules remain enforced. Actual observed CI outcomes and skipped stages are recorded in PR #29; the original failed run remains linked there and its decoded log is retained under `verification/ci-lint-pr29/`.

The first run past the original lint failure also exposed `TS18046` in the existing disposable-only `native-qa-seed.ts`: the Mercur string-key container resolution has no inferred service type. The QA fixture now supplies a structural method signature using the locked SDK's `CreateMemberDTO` and name fields from `MemberDTO`. This changes only erased TypeScript annotations; the fixture guard, method, arguments and application behavior are unchanged. No compiler option or check was disabled. The failed lint-only successor run and observed type-check exits are retained with the original failure evidence.

The subsequent complete backend run exposed a separate test-order dependency: earlier suites intentionally disconnect the shared disposable Native Admin; `native-product-targets` assumed its initial seed bridge still existed. Its setup now proves the canonical account through `/didar/login` and the existing `/admin/didar/connect` flow and verifies native product permissions before CRUD. Teardown removes only that QA actor's bridge so the later browser dual-proof journey still starts unconnected. All native target-denial assertions and production authorization code remain unchanged. The failed 225-pass/6-fail run is retained; five failures were fixture-setup cascades after the initial `403 MISSING_PERMISSION`.
