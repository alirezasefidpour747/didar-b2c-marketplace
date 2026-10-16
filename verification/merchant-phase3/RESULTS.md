# Phase 3 release evidence

Baseline `00447d39ffa64881c35813b5242b95fd356c84bb`; official Mercur/Medusa/Next stack, Linux x64, Node 24.19.0, Bun 1.4.3, PostgreSQL 17, real system Chromium.

Final command: `CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test` with Bun prepended to PATH.

| Check | Actual result |
|---|---|
| Backend + integration/security/migrations + all prior finance/UID/profile suites | 152 passed, 1,922 assertions; zero failed/skipped |
| Native Medusa HTTP | 1 passed |
| Production Playwright | 21 passed, 1.9 minutes |
| Official code generation, native admin/vendor, API, Next production builds | Passed |
| Source/output/platform build receipt | Verified after final run |
| Populated QA migration replay + actual disposable PostgreSQL restart | Media IDs/source digests/receipts/variants and UID/order history unchanged |
| Two historical database volume clones | Original image bytes/IDs and every audited commerce fingerprint unchanged; migrations replayed twice |
| Genuine browser captures | `onboarding-merchant.png`, `onboarding-pdp-390.png` |

The new browser journey registers a pending Merchant, observes approval gating, receives DIDAR approval/permission, submits one shared Product Draft, uploads a real JPEG larger than the ordinary proxy budget (synthetic camera-noise test imagery with EXIF orientation), receives measured private WebP receipts, approves Product and media through Persian UI, explicitly approves/assigns a RETAILER profile, records a 2,350mg physical-item input through existing verification/posting, and renders that exact native-linked Master/Offer with real profile price and responsive decoded media. Metadata/GPS is absent from output. A cookie-free public/unlisted OG media URL works and invite-only previews are denied.

Backend tests cover signatures/format/decode/pixel/frame constraints, orientation/color/alpha, idempotency and mismatched intents, actual assistant/uploader identity, default-deny/revocation, join without cloning, private pre-Offer publication window, admin-only versioned media policy, source/variant/event immutability, approval/withdrawal, shared-master tenant privacy, twenty processing operations plus active-image replacement/quota, historical migrations and restart persistence. Old taxonomy/UID/Code128/QR/printing/checkout/financial regression suites remain green. QR verification retains decoder hints; generator and permanent UID identity were not rebuilt.

Original stopped owner services/volumes/configuration were never reset, migrated in place or replaced. Clone sources were mounted read-only with no network on copies. Disposable QA services and volumes were cleaned up. No Oracle/live finance/Tahesab/outbound messaging was used. Screenshot photos are clearly synthetic test fixtures, not invented commercial jewelry content. No native Mac/physical hardware/external social-crawler acceptance is claimed. Owner Mac testing remains outside the development roadmap after all features. Phases 4–9 are still pending.
