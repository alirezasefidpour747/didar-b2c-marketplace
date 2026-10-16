# Local-first Mac workflow review

This change implements `docs/LOCAL_FIRST_MAC_WORKFLOW.md` and Gate 0 of the owner's roadmap. The existing Mercur/Medusa/Next/Bun application and Phase 1 business model remain the starting point. Phase 2 finance is excluded. Owner acceptance is on persistent local Mac data; Cloud verification is on independent disposable QA data. `MAC_UAT_PENDING` explicitly separates Linux evidence from native macOS/Apple Silicon and hardware acceptance.

Review boundaries:

- Native setup/start/status/stop/test entry points use pinned toolchain checks and local Docker context. Start verifies free ports and functional API/proxy responses. Stop recognizes only the recorded Node dev wrapper; no unrelated process is killed. A session lock prevents setup/test/dev from concurrently overwriting shared build outputs.
- Native PostgreSQL uses a persistent named volume only for new containers. Existing containers retain their original anonymous/named volume. Setup applies existing additive migrations and does not reset passwords, quantities, UIDs or orders.
- Automated QA owns unique temporary data containers, ports and fresh credentials. Removal is restricted to names created during that invocation. It does not read the owner's persistent API/database configuration. Production build environment is explicit and independent of development-mode migration/seeding.
- Native data ports bind 127.0.0.1 for host applications. Advanced full Compose data ports stay unpublished. Its fixture relay uses Docker exec streams, with Compose DNS resolved inside the API network. There is no Linux bridge-IP assumption, remote Docker or remote staging requirement.
- Playwright defaults to its managed platform browser, honors `CHROMIUM_PATH` and requires explicit `PLAYWRIGHT_NO_SANDBOX=1` to disable the sandbox. Existing browser business journeys and backend/migration suites are retained.
- Existing files and secret values are preserved; non-local/non-sandbox/incomplete settings are refused with values withheld. Legacy environment tests were strengthened to expect refusal, while continuing byte-preservation checks. `.local` logs/state and private environments are excluded from Git/images.

See `verification/local-first/README.md` and `DELIVERY.md` for executed results, data fingerprints and source publication. Native Mac/Docker Desktop and real RFID reader/chip/scale tests remain owner/hardware acceptance work. Legacy Oracle material remains optional; none was deployed.
