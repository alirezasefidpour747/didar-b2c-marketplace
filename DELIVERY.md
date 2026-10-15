# Didar Gold delivery

## Working local MVP

Generated from the **official Mercur 2.3.7 application starter**, retaining the initial README commit and the generated starter in Git history. This is an application, not the Mercur framework development repository.

Implemented Persian RTL storefront, shared catalog, multiple suppliers, exact integer milligram weights and quantities, IRR gold pricing with transparent components, cart, address validation, transactional checkout, payment sandbox and order history. Customer, supplier and admin gold interfaces work. Suppliers can create offers against shared products and manage only their own inventory/order lines. Administrators manage products, suppliers, offers and pricing. No individual-piece UID or advanced warehouse model was introduced.

Stock reservations, rate/offer version checks, checkout idempotency, immutable order-price snapshots, replay-safe payment success/failure, expiration, scrypt authentication, hashed sessions, role checks and audit records are implemented in PostgreSQL-backed Medusa routes. Pricing uses BigInt/integer arithmetic; tax applies to labor/profit rather than gold principal. See README.md for the exact formula.

## Verified results

| Check | Result |
| --- | --- |
| Frozen dependency installation | Passed |
| Mercur migrations and shared catalog seed | Passed; repeated without duplicating 4 products / 8 offers |
| API and storefront TypeScript | Passed |
| Native Mercur admin/vendor and Medusa backend production builds | Passed |
| Final Next production compilation, lint, type check and build | Passed |
| Pricing + real HTTP commerce suite inside the final API container | **12 passed, 0 failed; 40 assertions** |
| Chromium E2E against final Compose services | **3 passed**: checkout/payment failure, supplier isolation, admin rate management |
| Medusa health test against containerized API | **1 passed** |
| Oracle staging policy/limit tests with mocked instance metadata | **8 passed** |
| Static ARM64 lockfile/integrity audit | Passed for required native artifacts; no incompatible Linux/ARM hard-dependency selector found |
| Local and ARM override Compose configuration + shell syntax | Passed |
| Final prepared API and standalone storefront images | Built; current architecture **amd64**, not ARM64 |
| Running Compose PostgreSQL, Redis, API and storefront | **All four healthy** |
| API/storefront restart and persistent catalog requests | Passed |
| 390px mobile inspection | Rendered without horizontal overflow |
| Packaging exclusions | Verified: no environment files or Git metadata in prepared context |

The final API image is about 2.39 GB; standalone storefront about 506 MB. The local test stack is loopback-bound and contains explicitly opted-in sandbox demo users. It is not publicly deployed.

Resolved setup issues included the managed SWC native-cache incompatibility, missing starter i18next resolution, Docker proxy CA/DNS configuration, VFS disk usage and Medusa assuming TLS for private Docker PostgreSQL. The private PostgreSQL connection is explicitly configured for its internal non-TLS service. HTTPS package/artifact verification was not disabled.

Mercur 2.3.7's module-loader patches conflicted with Jest's in-process Medusa runner, which attempted to execute a declaration file. The health test now exercises the real server with status and response-body assertions; no production patch was disabled. Gold integration/E2E tests exercise the actual running database and application.

## Architecture boundaries

Gold products link to native Mercur shared master products. Exact-weight offers, stock, sessions and gold orders live in Didar PostgreSQL extension tables. Generic Mercur offers, carts/orders, commissions and payouts are **not synchronized** with that gold ledger. Gold role interfaces are in the Persian storefront; native Mercur panel authentication remains separate. The browser cart is local until checkout; orders/stock persist in PostgreSQL.

Payment outcomes are simulated. No real payment gateway, live gold-rate feed, real supplier payouts or shipping provider is connected. Initial pricing data is demonstrative. Native Mercur event/workflow locks retain starter local defaults; use one API replica. This delivery makes no real-money/production-launch claim.

## Oracle Always Free staging

Preferred target is **Ubuntu ARM64, VM.Standard.A1.Flex, at most 2 OCPUs and 12 GB RAM**. [deploy/oracle/README.md](deploy/oracle/README.md) contains source-only SSH transfer, staging-only host guards, read-only IMDS shape/resource checks, native ARM builds, image architecture checks, resource-limited Compose and functional readiness checks. Scripts neither provision OCI resources nor choose paid fallbacks. A staging-only host marker and verified SSH host key are required. Private SSH tunneling avoids requiring a paid domain or load balancer. No production server was touched.

**External blockers:** no Oracle VM address, confirmed available Always Free capacity or usable staging SSH access was supplied. The current machine is x86_64. All four official image manifest queries (Node, Bun, PostgreSQL, Redis) returned **HTTP 503**. Consequently, current-tag ARM64 image descriptors, a native ARM dependency installation/build and Oracle runtime behavior are **not yet verified**. The scripts fail closed until these checks succeed. No Oracle resources were provisioned and no remote deployment occurred.

The same registry outage prevents a final clean source-image rebuild here. Earlier source-image builds passed; final current-code containers were built from already-installed, verified dependencies using `scripts/build-prepared-images.sh`, then tested. This same-architecture fallback must not be used to copy x64 dependencies/images onto ARM. Native source builds on the authorized A1 VM remain required. The official CLI metadata fetched earlier over verified HTTPS is tracked to seed its supported codegen fallback cache during GitHub outages.

## Reusable setup and source delivery

`install_script` and `start_skill` were saved successfully to the environment draft, including development startup, local/Compose database separation, readiness/tests, Oracle staging constraints and pending ARM verification. Review and save them in environment settings, then publish the environment. Saving the draft did not publish it; fresh-task restoration has not been tested.

All progress is committed locally on `main`; no GitHub push was performed. A portable Git bundle is provided at `/workspace/didar-gold-delivery.bundle` so the complete source/history can be recovered independently of local-only commit restoration. See PROGRESS.md and Git history for implementation milestones. Remote deployment remains optional pending the external Oracle prerequisites above; the local MVP is working and tested.
