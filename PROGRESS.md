# Didar Gold progress

- Starting commit: fbb4e099a3ed56505f8267d58cb2f20c9967644a (initial README, main).
- Generated using official create-mercur-app 2.3.7, basic template plus official Next.js storefront; not a framework clone.
- CLI network fetch required NODE_USE_ENV_PROXY=1; TLS verification retained.
- Scope: shared catalog, supplier offers, milligram weights, integer IRR pricing, transactional sandbox checkout, Persian RTL and role interfaces, tests and Docker.

- Implemented Persian RTL storefront and customer/supplier/admin gold interfaces, native shared product creation, supplier-scoped exact-weight offers, pricing components, SQL-backed auth, cart/checkout and payment sandbox.
- 11 pricing/commerce tests passed, including contention, multi-supplier order isolation, idempotency and reservation release; 3 Chromium browser tests passed.
- Native admin, vendor, API and Next production builds passed. Fixed missing starter i18next resolution and pinned SWC 1.11.31 for the managed runtime.
- Native Jest in-process Medusa runner was incompatible with Mercur's patch loader (it attempted to execute a .d.ts file). Preserved the health assertions against a real server process; the health test passes.
- First Docker API build passed with official Bun binary and injected proxy CA; TLS verification preserved. Final image and stack verification in progress.
