# Local-first workflow verification

Executed on Linux x64 in the preserved Codex Cloud workspace, Node 24.19.0/Bun1.4.3. **MAC_UAT_PENDING**: this evidence is not native macOS/Apple Silicon/Docker Desktop or physical RFID verification.

- Production build component passed: official Mercur codegen, both native panels, Medusa backend and Next production output. Development-mode build leakage was found and fixed. A later two-minute cold-start timeout affected runtime readiness after the build succeeded; readiness now allows five minutes.
- The successful fresh-database verification command was `CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test --reuse-build`. A private receipt verified unchanged source inputs, production output contents, Node version, OS and CPU before reusing that successful build. No failing assertion was skipped or disabled.
- **74 backend/workflow tests / 570 assertions**, including the existing 52 backend/migration tests and 22 local-workflow regressions; **1 native Medusa HTTP test**; **8 Playwright journeys** passed, with zero failures/skips. All fixture SQL and HTTP/browser traffic targeted independent disposable QA services, never the persistent UAT data.
- **23 setup/deployment guard tests** passed with local/mocked infrastructure only; no Oracle provisioning/deployment occurred.
- Source and reachable Git-history review found 0 token/key/credential-URL findings; six actual runtime values had 0 matches in the reviewed source/build files. Exact scan counts are in the attached logs.
- Real private Compose PostgreSQL relay check passed through Docker exec with no database host port or bridge-IP access. Binary relay multiplexing is also covered by the new workflow suite.
- Prepared-image archive filtering was tested using the actual tar arguments and private fixture paths: source retained; env/key/backup/private local-log files excluded.
- Complete-row fingerprints in seven history tables and original PostgreSQL volume identities matched in both existing databases after disposable QA. Native setup, startup, status, owned stop, restart, matching catalog/rate proxy, RTL HTML and loopback-only listeners all passed on Linux. After restart, those seven tables/volumes still matched exactly; 204 native and 29 Compose physical units, 64 native and 13 Compose orders were retained.

`automated-verification.log` contains current passed test names/counts; `production-build.log` contains successful build-component results. Old failed attempts remain in private `/tmp/didar-mac-evidence` for diagnosis, and are not represented as successful complete runs. Server logs/build receipts remain ignored under `.local/`; no runtime credentials or raw business records are published here. Public local-only demo identities/passwords are synthetic fixtures.

The Mac owner must execute the documented native commands and manual Phase 1 checklist on the exact published main SHA. Real HID/RF capture, chip writing and scale validation remain separate hardware work. Legacy Oracle instructions are optional, not acceptance blockers.
