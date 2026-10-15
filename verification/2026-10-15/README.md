# Verified acceptance evidence

These are current-run outputs, not results inferred from the prior baseline delivery.

- backend-tests.log: 36 passed, 0 failed, 210 assertions. Actual development Medusa API/PostgreSQL, preserved old commerce tests plus pricing/inventory/security/new integration tests.
- playwright.log: 7 passed, 0 failed, Chromium against the production Next build. Six browser workflows plus an oversized chunked HTTP request test. Full admin/supplier/customer successful payment and delivery journey, failed/expired payments, profile persistence, catalog hierarchy/collections, images and mobile layout.
- medusa-health.log: 1 passed against the actual server process.
- deployment-tests.log: 23 local mocked/temporary-file tests. No real Oracle provisioning/deployment or restore is implied.
- secret-comparison.json: six ignored local secret values compared internally against current candidate source and Git history; zero matches. No actual values are recorded.
- Screenshots: genuine browser captures of the implemented RTL UI. Uploaded images in the operational test are explicit synthetic fixtures; the sample catalog honestly shows missing-photo placeholders.

Native ARM image descriptors/static dependency evidence is in deploy/oracle/ARM64_VERIFICATION.md. Clean source/container verification is recorded in DELIVERY.md and PROGRESS.md. Native ARM execution and external staging remain pending authorized infrastructure. Local/container logs may list loopback test addresses; those are internal checks, not public application URLs.

- compose-tests.log: the same36 backend tests/210 assertions and7 Playwright checks passed against fresh source-built Compose services with fixtures privately bound to the API database.
- compose-default-check.json: staging demo login401 and no baked runtime secrets. compose-final-check.json: four healthy services, restart persistence and zero competing native commerce records.
- container-source-match.json:68 application/build source files match the committed working tree; container-operational-smoke.json verifies secure stdin account provisioning and both native panel asset paths.
