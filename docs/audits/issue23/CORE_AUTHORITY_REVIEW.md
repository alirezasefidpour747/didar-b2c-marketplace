# Issue 23 — independent Core, authority and dependency review

Reviewer: `issue18_core_review` (independent of application implementation). Date: 2026-10-18.
Assessment baseline: `41d880a5dd4c2462144f52b1591576882238d125`, accepted by Chief Architect in PR #20 review `5561363686`. This is a bounded readiness assessment, not production approval or permission to begin Phase 5.

## Source and decision provenance

Read the full Issue #23 and comment `6245470196`, final PR #20 review `5561363686`, PR #22 strategy at `cf2fc25692ea6fe0d2e5c3a6c364f3e901195802`, its roadmap and execution strategy, PR #19 delivery packets, and both proposed five-feature architecture documents in PR #21. Read `AGENTS.md`, `MERCUR_NATIVE_PANEL_ARCHITECTURE.md`, bundled Mercur architecture/catalog/order-group/commission/payout references and actual installed Medusa route/workflow/model code. Exact installed versions are Mercur 2.3.7 and Medusa 2.21.2, not a newer online API assumption.

This reviewer made no application edits, ran no unchanged full regression, and does not approve their own implementation. Existing Issue #18 evidence remains inherited, with the controlled completion receipt supplying the previously missing exit observation. New defect correction requires its own affected-scope proof and independent source review.

| Source | Actual head read | Actual integration status at assessment |
| --- | --- | --- |
| main | `4e953c7cf62c327b92f4a461d776fc11c772a9fb` | Does not contain the accepted PR #15/#20 chain |
| PR #15 | `efbdfcdf8a2ab7f3e397f2d67672328ebcf36254` | OPEN, unmerged; source ancestor of accepted baseline |
| PR #16 | `88d1b004c38efe57fb46f86ba2f99a6a87b4201b` | OPEN, unmerged business ADR; copied into #20 from approved source |
| PR #17 | `aaedd0d81806a20317f2505678a79e7b9a2ba1a2` | OPEN, unmerged technical ADR; source copied into #20 |
| PR #19 | `5a8688acc8018faf3d6c8a333653c3a1d590315d` | OPEN, design-only Phase 5–9 packets, not delivered features |
| PR #20 | `41d880a5dd4c2462144f52b1591576882238d125` | OPEN, bounded Chief acceptance; base is PR #15, not moving main |
| PR #21 | `d869b1df86123682cba896c03ebf3533ff23b13a` | OPEN, proposed F1–F5 architecture/decisions, not implementation authorization |
| PR #22 | `cf2fc25692ea6fe0d2e5c3a6c364f3e901195802` | OPEN strategy; applied by the explicit Issue #23 instruction, not claimed merged |

Old PR #21 text leaves 705/750 unresolved and describes #18 acceptance as conditional. The later owner/Chief instructions supersede those two historical statuses: base 750 is confirmed, and #18 has bounded acceptance at the exact SHA above. Other PR #21 proposed economic decisions are not silently approved by that update.

## Authority map and native reuse

| Concern | Existing authority and supported native seam | Assessment / constraint |
| --- | --- | --- |
| Admin/Vendor workspace | Existing `/dashboard` and `/seller`, Dashboard SDK routes/widgets/navigation/custom fields; native authentication/membership/permissions narrowed by canonical DIDAR authorization | KEEP. No independent Next.js operator platform or duplicated identities |
| Product and merchant listing | DIDAR Product Master, approved Merchant Offers and taxonomy; native Product fixed-ID derived projection, Seller links and native product screens reused | KEEP/EXTEND guarded adapters. A native write must not become a second Product Master writer |
| Business actor | Existing native Seller/Member plus explicit `didar_native_actor` / seller links | KEEP. Selected native context is not permission to infer economic ownership from login/email |
| Physical stock | Permanent DIDAR exact UID, immutable source intake/Offer references and exact reservation/order allocation; RFID optional | KEEP. Native quantity/inventory counts cannot silently replace physical ownership or exact UID |
| Quote/order/payment | Existing gold-first accepted quote, canonical DIDAR order and sandbox verified payment path | KEEP. Native split-cart workflow creates separate native orders/payment allocations/reservations; no demonstrated equivalent adapter authorizes running it in parallel |
| Commission | Native fixed/percentage rules and frozen commission lines available | Native capability exists, but is not equivalent to contractual gold principal/making, actual seller/DIDAR components and third-party liabilities. Reuse needs explicit accounting mapping before activation |
| Supplier gold/IRR obligations | Existing append-only financial event/journal/postings and immutable contractual/sale-role snapshots | KEEP. Collection, principal obligation, DIDAR consideration and reimbursement are distinct facts |
| Settlement/payout | Existing procurement/allocation/treasury/settlement and wallet reclassification; native payout provider workflow available | Native monetary payout is not GOLD_UG discharge. No automatic provider execution or independent partner payout closure is certified |
| Invoice | Existing immutable DIDAR per-actual-seller sale document projection, correction credit, own customer/native Admin/actual agency Seller access, merchant-origin check | KEEP. Projection is not statutory/legal/provider approval |
| Product projection | Canonical transaction creates revision + durable intent; original native Product/Variant workflows, stable IDs, acknowledgement and freshness guards | KEEP. Actual-target generic HTTP guard gap below requires correction; no authority migration |
| Customer/CRM/campaign | Existing canonical customer and own history; native Customer/Group/Promotion are possible compatible seams | Future P5–9 require own bounded permission/consent/adapters. Existing source is not proof that CRM or external delivery is implemented |

Concrete source reviewed includes `commerce.ts`, `pricing.ts`, `merchant-profiles.ts`, `permissions.ts`, `agency.ts`, `finance.ts`, `finance-ledger.ts`, `finance-procurement.ts`, `finance-wallet.ts`, `db.ts`, `payment-provider.ts`, `medusa-config.ts`, native mutation/visibility/permission boundaries, and installed core Product/Variant/Option workflows. The current payment recognition still uses the original canonical financial writer; no second commission/payout journal was introduced by this assessment.

Agency and DIRECT_DIDAR remain different supported sandbox paths. AGENCY freezes the actual physical Supplier principal; DIRECT requires DIDAR-owned receipt evidence and denies unsupported merchant-paid service charges. Zero-fee approved curation preserves the actual Seller B and does not establish upstream A-buys-B resale. Future title transfer must preserve the original UID/source and old sold reservations; no guard relaxation is authorized here.

## Historical five-layer contract reconciliation

**NOT_VERIFIED: original five-layer agreement, names and exact dependency rules.** Searches of tracked Markdown, `AGENTS.md`, project docs and available git history found no original contract. The coordinator also searched the three historical uploaded requests without locating it. Bundled Mercur documentation contains its own layers, but that is not proof of the owner's separate historical five-layer agreement.

The following is a current responsibility assessment required by the approved Issue #23 strategy, **not invented historical layer names**:

| Responsibility | Current location / boundary | Assessment |
| --- | --- | --- |
| Presentation | Native Admin/Vendor SDK extensions; customer storefront; shared DIDAR UI | Native workspace boundary established by inherited browser proof; shared large workspaces are maintainability work, not an automatic P0/P1 |
| Transport/access | Native middleware/permission boundary; DIDAR HTTP handlers/native bridge/store scope | Server-side controls exist; actual-target native mutation defect below is a specific exception |
| Application orchestration | Existing DIDAR transaction/services and original Mercur/Medusa workflows via projection adapter | Functional boundary exists; some handlers are coarse dispatchers. No evidence justifies wholesale repository/microservices refactor |
| Domain | Gold-first arithmetic, exact UID/reservations, sale-role/contract rules, ledger invariants | Existing authorities must remain; narrow typed extraction can accompany later affected work |
| Persistence/integration | PostgreSQL additive schemas/transactions, native module APIs, durable projection jobs, sandbox provider adapters | Local recovery evidence is inherited; distributed/live-provider/release capacity are separate unverified contracts |

Recommended limited ADR: explicitly record that the original contract could not be located; list these observed responsibilities, cross-boundary exceptions and approved extension seams; require owner/Chief confirmation before calling it the historical agreement. Do not rename folders or assert compliance to guessed rules.

## Confirmed source finding and bounded correction candidate

### CORE-23-01 — native mutation checks trust URL parent rather than actual target

**Confirmed P1 integrity defect, independently corroborated using real HTTP/PostgreSQL.** The enabled native Admin is permitted to use built-in catalog routes, while linked DIDAR native Products must only be changed through the DIDAR canonical workflow. Baseline `native-product-guard.ts` queries `didar_product.native_id` using only the parent `/admin/products/:id`, or top-level product batch IDs.

The installed Medusa `DELETE /admin/products/:id/variants/:variant_id` handler explicitly ignores `productId` in `deleteProductVariantsWorkflow({ids:[variantId]})`. Therefore an unrelated valid native parent can be supplied while the actual target belongs to a linked DIDAR projection. The generic mutation can delete the native variant without canonical revision/job changes. This is not a customer ledger debit or proven financial loss, but it violates the supported projection authority and native panel integrity.

The actual Mercur route override has the same unscoped DELETE operation, so this is not a finding based only on an unused upstream route. Independent acceptance run `native-baseline-20261018041432786` observed ordinary linked-parent DELETE returning 409, but the valid unrelated-parent DELETE and unrelated-parent variants batch-delete each returning 200 with actual target soft deletion. Accepted app/test manifests and protected-resource cleanup were independently recorded. This reviewer did not implement or execute that acceptance probe; corroboration is attributable to the separate acceptance agent.

Actual pinned target-bearing write paths reviewed:

| Path family | Actual target, beyond URL parent | Review result |
| --- | --- | --- |
| Product POST / batch | Product IDs; nested variant IDs and option/image associations | Existing top-level product check insufficient for foreign nested IDs; protect actual linked targets |
| Variant DELETE | URL variant ID only, native parent ignored | Definite source bypass |
| Variant POST | Selector includes both variant and parent | Parent-scoped update itself differs from delete; still resolve targets consistently |
| Variants batch | Update variant IDs (with supplied parent field), raw delete IDs | Actual native workflow accepts ID arrays; foreign target checks required |
| Variant inventory-item POST/POST+DELETE/batch | URL/body variant IDs and inventory link | Native handlers ignore product URL parent; actual variant ownership required |
| Variant images batch | URL variant ID plus add/remove image IDs | Native workflow targets variant and associations directly |
| Image variants batch | URL image ID plus add/remove variant IDs | Native workflow targets image/variant associations directly |
| `/admin/product-options/:id` POST/DELETE | Global option ID, linked to products through many-to-many | Outside existing matcher; mutation can change/delete options of linked Products. Resolve every linked product, not one assumed owner |
| `/admin/product-options/:id/values/:value_id` POST/DELETE | Verifies value belongs to option, then changes global value | Guard the option's linked Products; a valid native option/value URL alone does not protect canonical projections |
| Product options batch | Product ID carried into association/value steps; referenced option/value IDs | No demonstrated global foreign-option bypass in this scoped handler; avoid unsupported exploit claim |
| `/admin/product-variants` | GET only in this pinned version | Rejected false alarm: no direct write endpoint to guard |
| Product import/imports + confirmation | Async uploaded-file workflow; actual product targets not in URL | Source-level risk, real target/effect not verified here. Do not silently certify or blanket-disable unrelated imports |
| Price-list and standalone inventory routes | Variant/price/link IDs outside product family | Native capability exists. DIDAR gold quote does not consume native fixed-price lists; investigate separately if actual enabled-authority harm is demonstrated |
| Native ProductChange confirmation | Stored action product/variant IDs | Source can apply recorded actions directly, but a reachable pending linked-target action was not established with currently denied Vendor product writes. NOT_VERIFIED, not a fabricated second confirmed exploit |

Recommended smallest coherent batch: extend the HTTP guard to resolve actual referenced Product/Variant/Image/Option ownership against immutable canonical native IDs; reject an entire mixed mutation before native workflow side effects; keep unrelated native product functionality and original projection workflows working. Use native query/module metadata for native relationships where practical. Preserve Vendor's uniform deny behavior so private IDs are not probed. No native framework patch or DIDAR history rewrite is needed.

Acceptance must include old-fail/new-pass real native HTTP, linked-target before/after DB snapshots, unrelated-parent and mixed-batch cases, actual read-only/read-positive routes and a positive canonical projection update. Check unauthenticated/RBAC responses, no partial batch effect, stable UID/order/financial authority and unchanged inherited #15 privacy behavior. Independent source and HTTP review are required before closure; this section is not self-approval.

### Independent correction design/source review

Reviewed the coordinator's bounded correction before dependent implementation: route/schema-specific target collection; read-only native `QUERY.graph` resolution from Variant to Product, Image to its Product and associated Variants' Products, shared Option to all Products, and OptionValue through Option to Products; canonical `didar_product.native_id` is still the linking authority. Explicit chunks of 100 and `take=page.length` avoid default list limits omitting a late target. Query errors must propagate rather than allow mutation. Native authentication/RBAC remain in force; GET/HEAD/OPTIONS are unchanged; internal projection workflows do not traverse this HTTP-only guard.

Independent source review found an additional concrete target override: native `UpdateProductVariant` accepts optional body `id`, and `ProductModule.updateProductVariants(selector,data)` forms `{id:selectedVariant.id,...data}`. A caller can therefore select an unrelated native Variant in the URL but target a linked Variant through body `id`. The initial correction omitted that target. The coordinator added body `id` to the single-Variant target collector after this finding; the affected test must prove it rejects before actual native data changes.

At the initial source-review checkpoint, the three application files (`native-product-targets.ts`, `native-product-guard.ts`, middleware matcher) preserved the existing authority and native extension boundary. No schema, financial writer, UID/order authority, identity store or native framework patch was introduced. Source review was conditional pending real affected evidence; that condition is superseded by the final result below. The first test fixture hard-coded canonical ID `p1` although the isolated seed uses existing named products; this reviewer requested fixture-independent linked-product selection, not any weakened assertion.

The reviewed correction is frozen at `fa03ac3e5a91ec393d57bae0ac7ee2a0aff05782` (the unpublished `2c536347` candidate was amended only to correct the test fixture before execution); the coordinator selected an existing linked product and an explicit valid native Variant title and recorded a passing backend build. Candidate source/output receipt: `cb75fd84eee02112c1ed08963102247c9b2a4ce565595df8b35c57a6de6cf140` / `518792fe0780c430b55c78ef4cfc3fb194c15ca98ebc4922a903300f2634ba34`. This receipt identifies the changed application and does not reuse the old Issue #18 output hash as proof of the new guard.

## Other findings and honest limits

| Item | Classification / action |
| --- | --- |
| Security review SEC-01 shared customer-proxy throttle and SEC-02 spoofed forwarded-address bypass | Independently reproduced P1 auth availability/abuse boundary, OPEN outside this single coherent native-authority correction. See `INDEPENDENT_SECURITY_REVIEW.md`; selecting one batch does not resolve the other findings |
| Native PRODUCT_ADD descriptive audit can be missing in an internal workflow crash; canonical actor audit and stable projection recovery retained | Accepted Issue #18 residual, P2 operational reconciliation; do not call resolved or re-open unrelated proof |
| Admin manual-rate writer does not acquire the pricing advisory lock used by profile writers and payment | Source locking inconsistency, NOT_VERIFIED as an economic defect. Checkout also locks the rate row. Need exact concurrency/business effect before P1; no speculative fix batch |
| Native Admin/Vendor `react-router-dom` 7.18.1 advisory listed by audit | Actual panels are Vite React SPAs, not an identified RSC server. RSC-only advisory applicability NOT_VERIFIED; no blanket package upgrade |
| Next 15.5.24 listed by audit | Storefront uses dynamic product/shop/home pages and no-store UID resolver. Exact advisory prerequisites and exploitability need security review; affected version alone is not a demonstrated cache leak |
| Direct API image processor uses sharp 0.35.5; audit includes transitive older packages | Trace invoked dependency path before prioritization; do not equate dormant dependency with verified image exploit |
| Redis/distributed workflow, production ingress/TLS/secrets/provider/legal/SLO/capacity/RPO/RTO | PRODUCTION_READINESS NOT_VERIFIED or provider BLOCKED, depending on release-specific prerequisite. No staging/owner-server inspection or rollout performed |
| F1 full-cost asset-backed wallet purchase/buyback; F2 live-backed settlement; F3 Business buyer; F4 actual reseller title transfer; F5 LBS/offline benefits | Not implemented/enabled by current task. Their missing contracts block dependent activation, not unrelated safe architecture work |
| Arabic/French storefront locales | Not delivered; vocabulary review and language coverage must remain explicit. No claim of implemented storefront locales |

## Next existing packet and evidence boundary

After the authorized bounded correction is independently verified, the next usable packet is **S0 contract reconciliation**, already described in PR #21, under the approved build-first readiness rules. This means contract/reuse assessment and isolated prerequisite proof, not activation of a new financial path through the still-open SEC-01/02 auth boundary. It can define party/context, directional/versioned quote and refund, title/custody/current selling authority and additive migration contracts. The gold display base is already 750 and must not be asked again. In-person proof uses customer-account approval as primary, OTP auxiliary; binding, single use, expiry and changed-amount reapproval must remain explicit. These updates do not approve wallet funding composition, title transfer timing/resale pricing, in-transit payment promises, or live settlement policy by implication.

S0 is preparatory contract/reuse work, not a newly delivered user-facing vertical slice. The next existing vertical candidate is **S1 (F2 settlement and backed-wallet prerequisites)** from PR #21. S1 dependent financial implementation needs approved funding/backing/release/withdrawal contracts and failure/reconcile proof; an externally enabled S1 financial path/release remains BLOCKED by the confirmed auth findings until separately corrected and verified or explicitly mitigated under a reviewed release contract. F3/F4 needs approved economic party/current-title/one-sellable-claim semantics. P5 CRM may use the existing P5 packet after identity/economic relationship contracts and its own Chief release; it should not be blocked by unrelated map/provider readiness, but it is **not authorized to start in Issue #23**. Native Promotion should only enter the canonical quote after a disposable equivalence proof with no second cart/order/reservation. No PR #19/#21 document checkbox is delivered functionality.

Inherited evidence: actual accepted app source/output receipt `5b6693e7fa0d079a4f8aca9097e0783361ee361e548d0f9d190ab65ff6bb10bc` / `63639704924cb668d955b6b09ec7b17da048950c0b0d03f6ff78174315704e0b`; independent 192 real HTTP/PostgreSQL tests / 3583 assertions, 23 tooling / 67 assertions, one native HTTP suite, nine G4 fault proofs, restore preservation of 89 tables / 36 UIDs / 24 projections. Controlled completion at accepted SHA records the exact same 32 browser journeys all passing with actual browser/runner/supervisor exit zero and owned cleanup. These results are inherited only for unchanged behavior; they do not prove a future native guard correction or F1–F5.

## Final independent bounded disposition

**PASS for the selected actual-target product/options HTTP guard correction at `fa03ac3e5a91ec393d57bae0ac7ee2a0aff05782`; no outstanding source blocker within that bounded scope.** This reviewer independently read the final three application files, the separate acceptance probe and durable receipts, and visually inspected the three desktop workspace screenshots. The implementation was written by the coordinator and the runtime/HTTP/browser verification executed by the separate acceptance agent; this is not implementation self-approval.

Final affected run: [`correction-20261018042135715`](../../../verification/issue23/reviewer/runs/correction-20261018042135715/runner-observed-exit.json).

| Evidence | Actually observed |
| --- | --- |
| Persistent affected regression file | 6 passing real native HTTP/PostgreSQL tests, 23 assertions, no failures |
| Separate reviewer HTTP probe | [23 passing cases](../../../verification/issue23/reviewer/runs/correction-20261018042135715/independent-http-results.json): original linked guard, unrelated URL parent, batch/mixed/late target, body-ID override, shared Option/OptionValue, image/Variant associations, inventory links, unauthenticated/RBAC/foreign-seller denial and unrelated native CRUD positives |
| Actual native browser smoke | [3 passing authenticated workspace journeys](../../../verification/issue23/reviewer/runs/correction-20261018042135715/independent-browser-smoke.json), Admin `/dashboard/didar`, Vendor `/seller/didar`, customer account/public PDP; 6 desktop/mobile PNGs and zero page errors |
| Actual process completion | Browser child `28781` exit 0/no signal; runner `21595` exit 0/no signal independently observed by parent `21578`. Runner's original pre-exit `NOT_YET_OBSERVED_BY_PARENT` field is retained, with actual completion supplied by the separate observed-exit receipt |
| Candidate parity | [Initial/final receipts identical](../../../verification/issue23/reviewer/runs/correction-20261018042135715/parity.json): source `cb75fd84eee02112c1ed08963102247c9b2a4ce565595df8b35c57a6de6cf140`, outputs `518792fe0780c430b55c78ef4cfc3fb194c15ca98ebc4922a903300f2634ba34`; all 1790 initial compiled files unchanged; no runtime additions |
| Test/reviewer provenance | Existing 50-test manifest `ced148cd5776a6d6394f40c60a42f1eeff7c232ad3abb7044a2933deeec98d3a` preserved; root/copy 51 affected-source aggregate `d5388273d68cf0670ed5c05c84b6d357f270add476eed790feb6120102ca4596`; four exact reviewer source hashes frozen |
| Owned cleanup | [PASS](../../../verification/issue23/reviewer/runs/correction-20261018042135715/cleanup.json): six owned process groups have no live members; exact two owned containers and their two anonymous volumes removed; all ten pre-existing containers preserved |

The separate probe compares complete canonical Product/Offer/inventory/order/event/posting fingerprints and protected native rows before/after attempted attacks. The new fixture has four canonical Products/eight Offers but no historical UID/order/financial entries; populated-history preservation remains inherited from unchanged #18 authorities and restore evidence, not invented as a new populated stress test. The late-target case places a linked Variant after 25 unrelated Variants; shared-Option evidence has two owners. No broader capacity or arbitrary-owner-count certification is claimed.

The smoke proves real native authentication, navigation and connected rendering, plus customer account/public PDP. It does **not** newly execute canonical Product save or payment; their unchanged positive paths retain inherited #18 evidence and the source fact that internal projection workflows bypass this HTTP guard. The first affected run `correction-20261018042015145` already passed 6/23 regressions and the 23-case probe but failed before browser launch because the expected Chromium binary was missing. That diagnostic runner exit 1 and successful cleanup/parity remain preserved. The final run used the available browser executable and supersedes only the missing browser acceptance, without application/assertion changes.

Final assessment: **selected P1 correction independently verified; original historical five-layer contract NOT_VERIFIED; S0 preparatory reconciliation usable after Chief review; next S1 vertical activation BLOCKED on its contracts and open applicable auth P1s; PRODUCTION_READY not asserted.** Import confirmation, pending ProductChange effects, native price-list equivalence and pre-existing malformed cross-product images remain explicit unverified residuals, not certified by this guard. SEC-01/02 are still open and must not be reported fixed. No merge, rollout, owner-host action, live finance or Phase 5–9 was executed by this reviewer.
