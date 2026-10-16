# Phase 4 release evidence

Baseline: `95836630ce29cef3a23a251a6f0991116cae8f76`. Official Mercur 2.3.7 / Medusa 2.21.2 / Next.js / PostgreSQL 17; Linux x64, Node 24.19.0, Bun 1.4.3, real system Chromium and installed FFmpeg/FFprobe.

Final command: `CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_NO_SANDBOX=1 bun run local:test --reuse-build`. All native admin/vendor/API production builds passed; the final storefront layout was rebuilt with `bun run --cwd apps/storefront build`. The source/output/platform receipt matches these current complete artifacts; reuse refused stale artifacts. The final full gate and source receipt were checked again before publication.

| Check | Actual result |
|---|---|
| Backend/workflow/security/migration/media + all previous finance/UID/profile suites | **161 passed, 2,047 assertions, zero failures/skips** |
| Native Medusa HTTP | **1 passed** |
| Production Playwright | **22 passed, 2.1 minutes** |
| Official route generation and all four production outputs | Passed; current source/output/platform receipt verified |
| Clean raw SQL + repeated upgrade and previous-media replay | Passed |
| Populated QA migration replay | Content versions/publications/video bytes and UID/order fingerprints unchanged |
| Actual PostgreSQL restart + fresh compiled API process | Persisted merchant page/version/title and protected decoded poster reloaded |
| Two stopped historical volume clones | Product/Offer/paid-order/image bytes/collection fingerprints unchanged; source volumes read-only |
| Genuine screenshots | Desktop public CMS, 390px public CMS, desktop private builder/preview, 390px builder |
| Actual software recording | `cms-responsive-walkthrough.webm`, 1440×1000 VP9, approximately 3.75 seconds, desktop/mobile Chromium frames |

The Persian browser journey uploads and approves real synthetic landscape/portrait PNG and MP4 assets, starts from the approved six-block structural preset, exercises keyboard-equivalent up/down reorder, configures the six core blocks and adds the other five. It previews privately with actual mobile media, validates both editor widths, denies anonymous preview, reviews/publishes and renders **all eleven block types**. It proves asymmetric desktop/intentional mobile mosaic geometry, keyboard slider navigation, real muted video decode/pause, responsive images, populated approved collection, live existing Product/Offer prices, mobile carousel scrolling, controlled category links, brand/divider/full-bleed blocks, metadata and reduced-motion poster fallback. Public cards use the existing ProductCard/OfferCard and quote engine. The full exact-UID sandbox checkout, profile CASH/CREDIT/Gold-First and balanced finance regressions also passed.

Backend tests prove private draft/asset isolation, frozen version titles, immutable source/version/preset/event records, competing revision rejection, reviewed publication, future cutover, publication intent replay, pause/rollback, bounded real video normalization and byte ranges, merchant A/B/global isolation, fresh capability revocation and unchanged existing share slug/page/visit IDs. Reserved future campaign kinds cannot publish a pretend campaign. Historical source databases were never migrated in place; neither clone had historical UID tables, while real UID/ledger history is exercised in the full disposable populated QA suite.

## Lab performance samples

| Viewport | Observed LCP | Observed CLS | Interaction sample |
|---|---|---|---|
| 1440px desktop | 240 ms | 0.0011474460 | Maximum observed event duration 24 ms |
| 390px mobile | 152 ms | 0.0087343753 | No qualifying event sample in this measurement |

Raw samples are included. These are local, unthrottled, synthetic-content lab observations with instrumentation; **not field INP, a percentile/business KPI, physical-device performance or a commercial-media benchmark**. Media containers reserve aspect ratios, real WebP derivatives use srcset/sizes, below-fold video is deferred, and controls honor reduced-motion/data-saving poster fallback. Page width stays 390px; the product rail intentionally contains horizontally scrollable cards.

The optional Playwright recorder CDN was denied by the Cloud network policy. Recording instead uses actual Chromium CDP screencast frames encoded with installed system FFmpeg, without changing TLS/proxy/network policy or substituting a downloaded-browser cache. Recording dimensions are fixed with proportional padding; it is an actual software capture, not a generated design mock.

**CODEX_LINUX_VERIFIED. OWNER_MAC_UAT_NOT_RUN. LIVE_MEDIA_CONTENT_PENDING. LIVE_PROVIDER_PENDING.** Actual commercial photography/video and editorial approval, external social-crawler reachability, native Mac/physical phones/RFID/printers, concrete proprietary Tahesab mapping and production financial/legal approval remain separate acceptance. Dockerfile runtime FFmpeg installation is implemented/documented; no new production image build or external deployment is claimed. All financial operations remain sandbox/mock; no Oracle, live payment, reward payout, outbound customer message, original data reset or configuration replacement occurred.

Phases **5–9 remain pending**. This is Phase 4 software delivery, not completion of the whole roadmap. Owner Mac UAT stays outside the numbered development phases after all features.
