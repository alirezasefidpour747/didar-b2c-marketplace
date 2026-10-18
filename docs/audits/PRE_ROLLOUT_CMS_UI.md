# Pre-rollout independent CMS and native UI review

Review date: 2026-10-17. Baseline: `4e953c7cf62c327b92f4a461d776fc11c772a9fb`.
Scope: source review and independently executed disposable PostgreSQL / production-build Chromium checks. This report does not attest staging deployment, commercial content publication, Mac hardware, or Chief Architect acceptance.

**Outcome: PASS for bounded native CMS/UI software.** Final code candidate independently exercised: `3a6e98f68dd38af1ad0c915f88d40ba8201e4dba`. [Independent execution log](../../verification/pre-rollout/CMS_INDEPENDENT.log). External host/content acceptance remains unverified.

## Architecture and source trace

The original Mercur Admin and Vendor applications expose real SDK routes at `/dashboard/didar/pages` and `/seller/didar/pages`. Both use `@didar-ui/content-editor` within their native authenticated `Workspace`; no iframe or independent Next management application is introduced. Native API calls use `/admin/didar/*` or `/vendor/didar/*`, original Mercur authentication and fresh selected-Seller authorization. This matches the bundled Mercur 2.3.7 custom route/navigation guidance, `AGENTS.md`, and the owner architecture directive.

`packages/api/src/didar/content.ts` owns versioned drafts, review, interval publication, rollback and pause. `content-permissions.ts` rechecks canonical role/capability and native selected-Supplier restriction. `content-media.ts` reuses the existing image/video pipeline. `packages/didar-ui/src/content-page.tsx` is the shared renderer used by private native previews and customer pages. B2C `/` obtains published `DIDAR_HOME` through the existing backend; missing/unpublished content deliberately uses `DefaultHome`.

The eleven implemented blocks are video hero, media slider, asymmetric mosaic, split story, full-bleed media, live collection spotlight, live featured product grid, live product carousel, controlled category/facet discovery, brand story and spacer/divider. Product blocks reference current Product/Offer and price services; they do not copy inventory, prices, UID or financial authority into CMS records.

## Independent coverage added

`tests/browser/pre-rollout-cms.spec.ts` refuses any database except the owned loopback `didar_qa` environment. It generates clearly identified synthetic editorial images/video, reuses eligible existing seeded Product/Offer records and creates a temporary approved collection. It never creates commercial stock or mutates an owner database. Publication slots are paused/cancelled during cleanup; synthetic login/link cleanup is restricted to that disposable fixture.

| Acceptance                   | New targeted browser proof                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Native Admin editing         | Real native login, eleven-block draft, actual native editor title/reorder/save, private preview, review and publish                      |
| Publication lifecycle        | Immutable draft leaves old public version; scheduled effective-time switch; explicit rollback; native pause and public fallback          |
| Native Vendor editing        | Real login/store selection; own merchant draft edit/save/preview; global page and rival media denied server-side                         |
| Published customer rendering | All eleven blocks at 1440px and 390px; asymmetric desktop and stacked mobile mosaic; zero horizontal overflow                            |
| Media controls               | Decoded video readiness; explicit pause; RTL keyboard slider; reduced-motion poster; unavailable video poster fallback                   |
| Resource failure             | Withdrawn approved asset omitted with accessible missing-media placeholder; network image failure requires a visible accessible fallback |
| Dynamic commerce             | Live existing collection/product Offer tiles; current positive backend price/stock eligibility; no new commerce writer                   |
| Private access               | Anonymous preview denied; native selected tenant cannot request another merchant's media or global draft                                 |

The existing `content.spec.ts` remains complementary coverage for upload/processing through UI, carousel movement, collection/product pricing and all block editor controls. `native-policy.spec.ts` independently exercises managed merchant launch followed by actual customer checkout/payment and native suspended-history preservation. The new CMS case intentionally does not claim a second financial acceptance or introduce another sandbox payment.

## Reference comparison

The baseline Phase 4 desktop and 390px references under `verification/merchant-phase4/` were inspected visually. They are actual prior software screenshots using synthetic media, not commercial photography. Relevant parity is navy/white/champagne surfaces, large muted video hero, separate slider, unequal mosaic tiles, editorial whitespace, split/full-bleed media, live collection/grid/rail and responsive stacking. Exact pixel matching of fixture content is inappropriate; geometric and interaction assertions accompany fresh screenshots.

## Execution and findings

The reviewer independently launched a scratch runner using the existing disposable local-test lifecycle and the verified baseline production build receipt. It applied clean native/Didar migrations, repeated the no-demo migration path, seeded native QA identities through real workflows, started compiled API/Next processes, and invoked only the new browser case. Original volumes/configuration were not used. The owned processes, temporary PostgreSQL/Redis containers and `.local/dev.json` lock were removed by its cleanup.

**Baseline test failure, then corrected test precondition:** the initial browser case observed one `.cms-full_bleed_media img` for all 34 polls over 15 seconds and failed. The run lasted 22.8 seconds inside Chromium. Subsequent inspection showed that this image was lazy and offscreen: installing a 404 interception alone did not prove a network request occurred. Consequently this failure is **not claimed as a reproduced public image-response defect**. The corrected test scrolls the target into view and explicitly observes a real 404 response before asserting the accessible fallback. Earlier assertions in the initial execution passed: native eleven-block save/private preview/review/publication, public 1440px/390px rendering, desktop/mobile mosaic geometry, video readiness/pause, RTL slider keyboard navigation and missing-video poster fallback. Scheduling, rollback and Vendor checks are later in the case and were **not exercised by that failed baseline run**.

Baseline test failure log and DOM evidence are retained under `.local/evidence/pre-rollout/baseline-image-404-*`, with fresh Admin and customer screenshots. Their names describe the intended probe, not proof that the lazy target received a 404. A separate attempted follow-up screenshot could not connect because the disposable runtime had already completed cleanup; no baseline response-failure screenshot is claimed.

Static review of the original shared `ImageAsset` found no public error handler, an empty private-fetch catch, and unkeyed previous-blob state without an active-result guard. The implementer changed that component. Independent source review confirms request-keyed state, abort/active guards, object-URL cleanup and terminal public/private image failure handling, without changes to media authorization or commerce authorities. A first fixed-build run passed the added real authenticated native-preview check: changing a loaded landscape asset to an asset with a controlled HTTP 403 response removes the old image and shows a terminal accessible failure. Its later public test exposed the lazy-loading test-precondition problem above. A subsequent fixture correction used the documented native `seller_members[].seller` bootstrap response instead of an assumed `sellers[]` response; no application change was needed for that correction.

**Independent full CMS case PASS:** the first complete fixed-build execution passed in 22.7 seconds (23.7 seconds including Playwright overhead), after fresh disposable migrations and native fixture provisioning. The final exact code candidate `3a6e98f68dd38af1ad0c915f88d40ba8201e4dba`, including the native metadata correction below, was then independently rerun against a newly provisioned disposable database: **one complete case passed in 24.1 seconds, 24.9 seconds including Playwright overhead**, exit 0. The production source/output/platform receipt was verified before startup. Every row in the coverage table above passed, including the corrected observed-404 probe, scheduling/rollback, native Vendor editing and actual backend tenant denials. Zero uncaught browser errors were observed. This is one independently executed CMS case; repository-wide regression totals belong to the separate final verification report.

The reviewer also identified missing `noindex,nofollow` metadata in the native panel entry HTML, despite the legacy private-preview route having it. Authentication still denied anonymous private data. The implementer added the narrow metadata correction to the two original native panel HTML entry files. The final independently executed case asserted the actual head metadata in both authenticated native Admin and Vendor panels and passed. This change does not replace authentication or grant access.

## Screenshots

These are actual disposable native/customer interfaces using synthetic editorial media:

- [Native Admin publisher, 1440px](../../verification/pre-rollout/screenshots/native-admin-cms-published-1440.png), [native editor, 390px](../../verification/pre-rollout/screenshots/native-admin-cms-editor-390.png).
- [Native Vendor private preview, 1440px](../../verification/pre-rollout/screenshots/native-vendor-cms-private-1440.png), [native editor, 390px](../../verification/pre-rollout/screenshots/native-vendor-cms-private-390.png).
- [Published customer CMS, 1440px](../../verification/pre-rollout/screenshots/cms-published-1440.png), [390px](../../verification/pre-rollout/screenshots/cms-published-390.png).
- [Authenticated image-source failure](../../verification/pre-rollout/screenshots/native-private-image-403-fallback.png), [public image failure](../../verification/pre-rollout/screenshots/image-404-fallback-390.png), [unpublished-home fallback](../../verification/pre-rollout/screenshots/cms-unpublished-fallback-390.png).

## Remaining external limits

This review uses local production builds and synthetic QA media. Actual staging SHA, reverse proxy/auth gateway, approved published home, licensed content, stock and privileged identities require Work 03's separate authorized host verification. A deployed CMS engine with no approved current `DIDAR_HOME` publication must be reported as `CMS_ENGINE_DEPLOYED_BUT_CONTENT_NOT_PUBLISHED`; a fallback screenshot does not establish luxury CMS acceptance. No live payment, owner content write, production exposure, CRM phase or cross-Supplier resale is authorized by this review.
