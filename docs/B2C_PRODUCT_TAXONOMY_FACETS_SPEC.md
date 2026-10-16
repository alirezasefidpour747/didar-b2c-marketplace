# DIDAR B2C — Canonical Product Taxonomy, Facets, Collections & Stable UID Labels

**Document type:** Adapted implementation specification for the **existing** Didar B2C repository.
**Status:** REQUIRED / NOT IMPLEMENTED. Publishing this document does not mean the described features have been coded, tested or deployed.
**Source:** User-supplied `DIDAR-PRODUCT-TAXONOMY-FACETED-CATALOG-SPEC-v1(1).md`, 16 Oct 2026, originally covering B2B sourcing + B2C. The complete archival structural taxonomy and canonical facet vocabulary are reproduced below in the **Reference vocabulary** section. Original B2B-only requirements are adapted, not blindly transplanted.
**Working repository:** `alirezasefidpour747/didar-b2c-marketplace`, existing official Mercur/Medusa/Next.js/PostgreSQL application.
**Related task:** GitHub Issue #4, which covers mandatory taxonomy for publication and printable UID barcode/QR. Implement the same underlying data model; do not build a competing taxonomy or two UID resolvers.

## 1. Business goal and concrete B2C example

Customer-facing Didar needs three distinct but connected product discovery layers:

1. **One structural identity:** `Family → Category → Subcategory (leaf) → Master Product`. Exactly one primary active leaf per public master product.
2. **Independent faceted classification:** how the shopper uses, describes, gifts or discovers the item. Multiple approved values can apply to one product across F01–F10.
3. **Collections and merchandising:** editorial/manufacturer collections and controlled showcase markers; neither is a structural Category. Reuse native `didar_collection` and `didar_collection_product`.

Example: a single master bracelet under `Jewelry → Bracelets → Clasp` has `usage=everyday`, `market_tier=premium`, `design_style=minimalist`, `heritage=persian_heritage`, `occasion=nowruz`, and membership in one approved `Heritage` collection. This **must not clone the master product**, supplier offers, exact item stock or PDP. It may appear under the structural branch plus several B2C discovery views.

**Hard boundary:** This is one B2C application with Didar's existing supplier-sourced offer model, customer cart/checkout and internal gold operations. **Do not implement the old B2B sourcing portal**, retailer-as-vendor subsystem, `b2b_categories` table, wholesale terms engine, B2B settlement, or a B2B-to-B2C synchronization service as prerequisites. The uploaded source's multi-site / retailer-publication paragraphs are future architecture reference only. Today, the existing `didar_product` is the single canonical shared master in this repository.

## 2. Actual codebase audit (facts, not assumptions)

At time of preparing this specification, current GitHub main was `d70e1fbb366a50b6dc58c3aa16e7d31be2bc3a3d`. **Re-audit the actual main before edits**, because concurrent coding may have progressed.

| Existing surface | Confirmed reality | Adaptation |
|---|---|---|
| `didar_product` | One master, `category_id` nullable; `category` fallback «بدون دسته»; `published` default true | Add safe taxonomy publication rules; don't rebuild Product Core |
| `didar_category` | `id,name,slug,parent_id`; arbitrary parent nesting; no explicit Family/Category/Subcategory rank or verified leaf requirement | Extend same table with stable `code`/`kind`/levels and labels using additive migrations, after data audit |
| `didar_collection` and `didar_collection_product` | Basic collection and membership already exist | Extend minimally for type, owner, localized names, visibility, audit and sort order |
| `packages/api/src/didar/catalog.ts` | Shared master CRUD through native product workflow and SQL; existing category/collection writes; no facet-vocabulary/assignment API | Extend existing catalogue routes/services, no parallel catalog |
| `apps/storefront/src/components/didar/manage.tsx` | One `category_id` dropdown; master approval and publication controls | Add cascading Family/Category/leaf selectors and governed facet/collection UI |
| `apps/storefront/src/components/didar/catalog.tsx` | Existing category-descendant filtering, collections, public offer cards; PDP links `/products/{id}` | Use server-safe faceted read, navigation, canonical breadcrumbs/URLs |
| `/products/[id]` | Existing simple PDP by immutable master product ID | Keep as backwards-compatible resolver/redirect to canonical B2C path |
| `didar_inventory_item.uid`, optional `didar_item_rfid_binding.epc` | UID permanent and mandatory on physical intake; EPC optional; item-level reservation/payment works | Use existing UID for Code128/QR; no new inventory or UID system |
| Financial Core | Contracts, gold/IRR, purchase requests, wallets, ledger and mock Tahesab present | No accounting or financial-code changes from this taxonomy task |

**Do not assume** the old B2B/P01 tree of 5/21/74 (100 nodes) or archival 5/33/69 (plus reserved family) is loaded in this B2C database. They are historical references. Export the **actual current Didar `didar_category` rows** with IDs, names, parent IDs, product counts and slugs first; write `docs/audits/b2c-taxonomy-reconciliation.md`. Never destructively reseed, truncate, re-key or mass-reparent existing product categories based on archive names/counts. No synthetic catalog products/suppliers/orders in production.

## 3. B2C publishing and taxonomy contract

- Public master product requires **complete and valid** `Family → Category → Subcategory (leaf)` ancestry, category/subcategory active status, explicit Didar product approval and `active + published` flags. Choose the active leaf as the one primary `didar_product.category_id`. The three taxonomy nodes share existing IDs where possible and stable machine codes; do not duplicate nodes merely to populate another menu.
- Allow saving product and images **as an unpublished draft** before classification is finished. Block new publication, approval-to-public, re-publication and customer QR print until the full validated leaf path exists. Validate on server and public query gates, not only admin form. Do not silently publish the current default `category=بدون دسته`.
- Preserve pre-existing published products and prior `/products/{id}` links. Run a non-destructive readiness audit of incomplete products, mark for owner remediation and preserve existing public links during rollout unless an explicit safety/approval rule requires withholding. Do not guess an approved category or erase visibility histories. Enforce the new gate for newly published or re-published products; provide a migration review path for legacy exceptions and explicit final enforcement sign-off.
- `didar_category.parent_id` supports a hierarchy; add constraints/enforced ancestry, level and status via existing table. A Family is a root, Category its child, Subcategory an active leaf child of a Category. Prevent cycles, invalid child depths, inactive ancestors and arbitrary leaf with children. When a current branch cannot be unambiguously mapped, leave it as a documented legacy category until approved rather than auto-reparenting.
- **Canonical customer path target**, not a claim of current routing: `/fa/products/{familySlug}/{categorySlug}/{subcategorySlug}/{productSlug}-{stableProductKey}`, with future `/en`, `/ar`, `/fr` once respective localized storefronts are enabled. Generate human-readable slugs independently of mutable localized display text; enforce URL collision safety. Original `/products/{id}` remains working and redirects/canonicals to its newest approved path. Slug changes/category moves require stable aliases/redirects so old links survive.
- A physical UID label uses a **separate stable short resolver URL**, e.g. `/i/{uid}`, not a printed mutable hierarchy URL. A mobile QR scan redirects to the current published PDP only after safe public validation; no B2B prices, supplier cost or invoice, customer/order/UID private histories, or hidden products leak. For items sold/unavailable, show current **product** (if published), not a false claim that the **exact UID** is still sellable. Public customer QR printing requires configured verified public origin; never print `localhost` or a mock/sandbox URL onto real labels.
- Existing item UID itself is printed in **Code 128** for internal operational HID scanners. RFID EPC stays fully optional. Reprinting retains exact UID; one UID points to the same item, product and existing stock/checkout ledger. Batch printing by verified intake, with print previews and supported label sizes, is handled by Issue #4, sharing this resolver.

## 4. Product data boundaries (avoid incompatible sources of truth)

- Master Product: stable ID/code, title, descriptions, pictures, approved leaf/category, classification, collections and normal publication. Supplier offers: exact measured weight, price/fee terms, availability and the existing multi-supplier relationship. Inventory item: permanent UID, exact weight/purity, EPC optional and life-cycle. **Never use facets as a substitute for these fields.**
- Keep weight in integer milligrams and gold/purity/fee/rate/price in the project's authoritative types; size, color, stone properties and bullion denominations are native attributes/variant/offer fields as supported, not new free-form taxonomic subcategories. Do not invent new production/bullion or precious-metal settlement behavior.
- Do not expose supplier wholesale terms, contract, treasury, cost, settlements, UID/EPC inventories or buyer identities in public facets, counts, PDP metadata, QR resolvers or collection pages. Preserve B2C's current explicitly approved offer display policy, including multi-supplier comparison; do not independently decide to change the seller of record or money recipient.
- Subjective/high-risk labels, notably `luxury`, `high_jewelry`, `authentic_vintage_antique`, `best_seller`, `limited_edition`, need owner-approved curation/evidence and must not be inferred from price, sale count or keyword alone. If the source lacks evidence, keep pending/inactive rather than assert authenticity, certification or popularity.
- Start with the actual jewelry families currently supported. Archived `symbolic` remains reserved. Bullion and unsupported payment/product types stay unpublished/inactive unless existing product/payment controls and explicit owner approval support them.

## 5. Reference vocabulary — copied faithfully from the user's B2B taxonomy source

The following tables and facet-value lists are preserved as a **reference/canonical candidate vocabulary**, not evidence of seeded active B2C records. Structural archive names must pass reconciliation before activation. F01–F10 are Product facet groups; F11 is **Collection type only**; F12 is **admin-governed merchandising only**. Four-language translations must be supplied/validated for public locale activation, because the source tables contain mostly `fa/en` but not complete authoritative `ar/fr` translations; **do not invent approved translations** or expose untranslated raw codes. Product labels in the current public storefront remain Persian until the corresponding localized routes are actually implemented.

### 3.1 Five main families

| Code | Persian (`fa`) | English (`en`) | Handling |
|---|---|---|---|
| `jewelry` | زیورآلات بدنی | Jewelry | Active if current catalog supports it |
| `accessories` | اکسسوری‌ها | Accessories | Active if current catalog supports it |
| `sets` | ست‌ها و پک‌های ترکیبی | Sets & Packs | Active if current catalog supports it |
| `bullion` | محصولات سرمایه‌ای | Bullion & Coins | Active if current catalog supports it |
| `symbolic` | اقلام مفهومی / نمادین | Symbolic Products | **Reserved** until product owner explicitly finalizes child taxonomy |

Family → Category → Subcategory (leaf) remains the only structural path. Each sellable product has a single primary active leaf; additional product placements are handled with independent facets/collections.

### 3.2 Archived category/subcategory reference — **do not overwrite live taxonomy**

The codes are indicative archival identifiers as preserved in the old UI source. They are **not** guaranteed to match production PostgreSQL codes. Compare first.

#### Family: `jewelry` / زیورآلات بدنی

| Category (`archive_code`) | Persian Category | Historical Subcategories (Persian) |
|---|---|---|
| `rings` | انگشتر | حلقه ازدواج؛ حلقه نامزدی؛ سولیتر؛ هالو؛ جواهردار؛ فانتزی؛ کوکتل؛ اسپرت/مردانه؛ قابل تنظیم |
| `earrings` | گوشواره | میخی؛ حلقه‌ای؛ آویزی؛ چسبان/کلیپ‌دار؛ بخیه‌ای؛ پیرسینگ گوش؛ ست/دوبل؛ عروس |
| `necklaces` | گردنبند | زنجیر ساده؛ گردنبند با آویز؛ چوکر؛ لایه‌ای |
| `bracelets` | دستبند | قفلی؛ آویزدار/Charm؛ چرمی + طلا؛ سنگ‌دار |
| `bangles` | النگو | النگو/Bangle |
| `anklets` | پابند | پابند حلقه‌ای |
| `body` | زیورآلات بدن | زیور بدن |
| `pendants` | آویز / پلاک | ثابت؛ سفارشی/اسم؛ Charm |
| `chains` | زنجیر | ساده؛ بافت‌دار؛ Box |

#### Family: `accessories` / اکسسوری‌ها

| Category (`archive_code`) | Persian Category | Historical Subcategories (Persian) |
|---|---|---|
| `cufflinks` | دکمه سردست | دکمه سردست |
| `tie-clips` | گیره کراوات | Tie Clip |
| `brooches` | سنجاق سینه | کلاسیک دایره‌ای/بیضی؛ مفهومی/نمادین؛ سنجاق کت مردانه |
| `scarf-clips` | گیره روسری | حلقه‌ای؛ سوزنی/سنجاق‌دار |
| `hair` | اکسسوری مو | سنجاق مو؛ شانه تزئینی پهن؛ سنجاق مویی ساده |
| `tiaras` | تاج / نیم‌تاج | نیم‌تاج عروسی؛ تاج کودک/دکوری |
| `forehead` | زیور پیشانی | زنجیر سنتی پیشانی/Maang Tikka؛ پلاک پیشانی |

#### Family: `sets` / ست‌ها و پک‌های ترکیبی

| Category (`archive_code`) | Persian Category | Historical Subcategory |
|---|---|---|
| `full-set` | سرویس کامل | ست کامل طلا |
| `half-set` | نیم‌ست | نیم‌ست |
| `mother-child` | ست مادر و کودک | ست مادر و کودک |
| `occasion-pack` | پک مناسبتی | هدیه/مناسبتی |
| `mens-set` | ست مردانه | ست مردانه |
| `everyday-pack` | پک اقتصادی / روزمره | پک روزمره / اقتصادی |
| `kids-pack` | پک کودک / نوجوان | پک کودک / نوجوان |

#### Family: `bullion` / محصولات سرمایه‌ای

| Category (`archive_code`) | Persian Category | Historical Subcategories |
|---|---|---|
| `standard-bars` | شمش استاندارد | شمش متریک؛ شمش یک اونسی |
| `iran-coins` | سکه بانکی ایران | تمام‌سکه؛ نیم‌سکه؛ ربع‌سکه؛ سکه یک‌گرمی |
| `private-coins` | سکه/مسکوک غیربانکی | سکه/پلاک سرمایه‌ای خصوصی |
| `commemorative-coins` | سکه یادبود | سکه یادبود طلا |
| `international-coins` | سکه بین‌المللی | Bullion Coin — **future/disabled** in archive |
| `occasion-bars` | شمش مناسبتی | Occasion Bullion |
| `global-bars` | شمش برنددار جهانی | Branded Bullion |
| `baby-bars` | شمش کودک / نوزاد | Baby/Kids Bullion |
| `custom-bars` | شمش سفارشی | حکاکی‌شده / شخصی‌سازی‌شده |
| `combi-bars` | شمش ترکیبی | CombiBar / تقسیم‌پذیر |

**Special handling:** Do not classify nominal bar weight (`0.25 g` to `1 kg`, and one troy ounce) as a unique leaf for each weight; treat it as a concrete attribute/variant, using the current bullion subsystem if one already exists.

#### Family: `symbolic` / اقلام مفهومی / نمادین

Historically **pending / not finalized**. Keep the family reserved. Do not invent approved subcategories. `symbolic` may nevertheless be a **motif** facet value or appear in a thematic collection, independent of this reserved structural family.

### 3.3 Legacy taxonomy normalization rule

Some archival leaf names mix structure and facets; examples: `گوشواره عروس` is an earring plus `bridal` usage/occasion; `انگشتر اسپرت/مردانه` mixes a ring subtype with a `men` audience; `پک اقتصادی/روزمره` mixes a product bundle with usage/tier. **For this phase:** leave existing leaves working and introduce the facet mapping in parallel; do not mass-reassign or delete products. Produce proposed cleanup mappings for later owner review.

---

## 4. Facet classification — canonical vocabulary

### 4.1 Rules

- A **facet** is a named dimension, e.g. `usage`; a **facet value** is an option, e.g. `everyday`.
- Store a stable machine-readable code; never key on Persian or English display text.
- Support `multi_select` and `single_select` per dimension; enforce each dimension's cardinality.
- All options must support localized `fa/en/ar/fr` names, publish visibility, sort order, and `active` state. Provide real labels in all four languages before exposing to a locale; do not show raw keys or blank strings.
- All seller-entered values are chosen from a governed vocabulary. Suppliers **may suggest assignments** to their own products but cannot create a globally published facet, redefine a value, or directly publish unapproved claims.
- Only **approved, visible** classification assignments can appear in B2C or public catalog APIs.
- A product can be assigned to multiple **different facet dimensions** simultaneously. E.g., `usage=everyday`; `market_tier=premium`; `heritage=persian_heritage`; `occasion=nowruz`.
- Search is **OR within the same multi-select dimension, AND across different dimensions** by default. Make this behavior clear to frontend users.
- Some dimensions are **editorial/subjective**. `luxury`, `high_jewelry`, `heritage`, `best_seller`, `limited_edition` cannot be inferred from price or a keyword alone. Require a managed policy/approval.

### 4.2 Planned facet dimensions and values (seed full vocabulary)

The tables give canonical `code — Persian label`; English descriptions/keys can be used to generate seed mappings; fill validated Arabic and French labels in localization. This is an **initial controlled vocabulary**. Adding future values must not require a schema migration.

#### F01 — `usage` / کاربرد و موقعیت استفاده — `multi_select`

| Code | `fa` | `en` |
|---|---|---|
| `everyday` | روزمره | Everyday |
| `workwear` | محیط کار | Workwear |
| `casual` | غیررسمی | Casual |
| `evening` | مهمانی و شب | Evening |
| `formal` | رسمی | Formal |
| `bridal` | عروس | Bridal |
| `ceremonial` | تشریفاتی / آیینی | Ceremonial |
| `statement` | شاخص / جلوه‌دار | Statement |

#### F02 — `market_tier` / جایگاه تجاری — `single_select` per product, owner-managed

| Code | `fa` | `en` |
|---|---|---|
| `value` | اقتصادی | Value |
| `mid_market` | میان‌رده | Mid-market |
| `premium` | پریمیوم | Premium |
| `luxury` | لوکس | Luxury |
| `high_jewelry` | جواهرات ممتاز و استثنایی | High Jewelry |

Tier is **not automatically computed from price, weight, karat, or making fee**. Do not enable `luxury` or `high_jewelry` for a supplier product without DIDAR review; no claims about quality or certification without evidence.

#### F03 — `design_style` / سبک طراحی — `multi_select`

| Code | `fa` | `en` |
|---|---|---|
| `minimalist` | مینیمال | Minimalist |
| `classic` | کلاسیک | Classic |
| `modern` | مدرن | Modern |
| `contemporary` | معاصر | Contemporary |
| `geometric` | هندسی | Geometric |
| `art_deco` | آرت‌دکو | Art Deco |
| `vintage_inspired` | الهام‌گرفته از قدیم | Vintage-inspired |
| `traditional` | سنتی | Traditional |
| `bohemian` | بوهمین | Bohemian |
| `organic` | ارگانیک | Organic |
| `bold` | جسورانه | Bold |
| `romantic` | رمانتیک | Romantic |
| `timeless` | فراتر از مد | Timeless |
| `sporty` | اسپرت | Sporty |

#### F04 — `heritage` / میراث و ریشه طراحی — `multi_select`, governed

| Code | `fa` | `en` |
|---|---|---|
| `persian_heritage` | میراث ایرانی | Persian Heritage |
| `regional_craft` | هنر بومی/محلی | Regional Craft |
| `historical_revival` | بازآفرینی تاریخی | Historical Revival |
| `traditional_motifs` | نقوش سنتی | Traditional Motifs |
| `cultural_fusion` | تلفیق فرهنگی | Cultural Fusion |
| `craft_heritage` | میراث فن و صنعتگری | Craft Heritage |
| `authentic_vintage_antique` | اثر اصیل قدیمی/عتیقه | Authentic Vintage / Antique |

**Evidence rule:** `heritage` does not imply an antique item. A new work may be `persian_heritage`. Only assign `authentic_vintage_antique` when independently verified; do not label merely old-looking products as antique. Optionally capture a provenance/design-inspiration note using existing metadata fields or a minimal approved evidence field.

#### F05 — `occasion` / مناسبت خرید — `multi_select`

| Code | `fa` | `en` |
|---|---|---|
| `birthday` | تولد | Birthday |
| `anniversary` | سالگرد | Anniversary |
| `engagement` | نامزدی | Engagement |
| `wedding` | ازدواج | Wedding |
| `bridal` | عروس | Bridal |
| `newborn` | تولد نوزاد | Newborn / Baby Shower |
| `graduation` | فارغ‌التحصیلی | Graduation |
| `mothers_day` | روز مادر | Mother's Day |
| `fathers_day` | روز پدر | Father's Day |
| `valentines` | ولنتاین | Valentine's Day |
| `nowruz` | نوروز | Nowruz |
| `yalda` | یلدا | Yalda |
| `eid` | عید | Eid |
| `milestone` | موفقیت شخصی | Personal Milestone |
| `just_because` | هدیه بی‌مناسبت | Just Because |

Do not hard-code these as product subcategories. Scheduling of promotional landing pages belongs to merchandising/CMS, not to facet identity.

#### F06 — `audience` / مخاطب — `multi_select`

| Code | `fa` | `en` |
|---|---|---|
| `women` | زنانه | Women |
| `men` | مردانه | Men |
| `unisex` | بدون تفکیک جنسیت | Unisex |
| `kids` | کودک | Kids |
| `teen` | نوجوان | Teen |
| `baby` | نوزاد | Baby |
| `couples` | زوج‌ها | Couples |
| `mother_child` | مادر و کودک | Mother & Child |
| `partner_gift` | هدیه شریک زندگی | Gift for Partner |
| `family_gift` | هدیه خانواده | Gift for Family |

`audience` means catalog targeting, **not** the authenticated shopper's personal attributes. Do not collect new personal data to support it.

#### F07 — `motif` / مضمون و نماد — `multi_select`

| Code | `fa` | `en` |
|---|---|---|
| `heart_love` | قلب و عشق | Heart & Love |
| `floral` | گل و گیاه | Floral |
| `nature` | طبیعت | Nature |
| `animals` | حیوانات | Animals |
| `celestial` | ماه و ستاره | Celestial |
| `zodiac` | ماه تولد و برج‌ها | Zodiac |
| `letters_numbers` | حروف و اعداد | Letters & Numbers |
| `geometric_symbols` | نمادهای هندسی | Geometric Symbols |
| `lucky_symbols` | نمادهای خوش‌شانسی | Lucky Symbols |
| `cultural_symbols` | نشانه‌های فرهنگی | Cultural Symbols |
| `spiritual_symbols` | نمادهای معنوی | Spiritual Symbols |

#### F08 — `styling_form` / فرم و نحوه ست‌کردن — `multi_select`

| Code | `fa` | `en` |
|---|---|---|
| `stackable` | قابل ترکیب روی هم | Stackable |
| `layering` | چندلایه | Layering |
| `mix_match` | قابل ست‌کردن | Mix & Match |
| `convertible` | تغییرشکل‌پذیر | Convertible |
| `adjustable` | قابل تنظیم | Adjustable |
| `modular` | ماژولار | Modular |
| `oversized` | درشت | Oversized |
| `delicate` | ظریف | Delicate |

#### F09 — `personalization` / شخصی‌سازی — `multi_select`

| Code | `fa` | `en` |
|---|---|---|
| `engravable` | قابل حکاکی | Engravable |
| `name_initial` | اسم و حروف | Name / Initial |
| `birthstone` | سنگ ماه تولد | Birthstone |
| `custom_size` | اندازه سفارشی | Custom Size |
| `custom_design` | طرح اختصاصی | Custom Design |
| `custom_motif` | نشان اختصاصی | Custom Motif |
| `made_to_order` | ساخت سفارشی | Made to Order |

The actual customization request/production workflow stays with existing ordering and supplier modules; a facet is **not** an executable promise to manufacture.

#### F10 — `craftsmanship` / شیوه ساخت و پرداخت — `multi_select`

| Code | `fa` | `en` |
|---|---|---|
| `handmade` | دست‌ساز | Handmade |
| `casting` | ریخته‌گری | Casting |
| `machine_made` | ماشینی | Machine-made |
| `electroforming` | الکتروفرم | Electroforming |
| `filigree` | ملیله‌کاری | Filigree |
| `enamel` | میناکاری | Enamel |
| `engraving` | قلم‌زنی / حکاکی | Engraving |
| `gem_setting` | مخراج‌کاری | Gem Setting |
| `solid` | توپر | Solid |
| `hollow` | توخالی | Hollow |

If the host system already has authoritative fields for `solid/hollow`, technique, or material, prefer a **derived facet/read model** over a second independent conflicting source of truth.

#### F11 — `collection_type` / نوع کالکشن — applied to **Collection**, not directly to Product

| Code | `fa` | `en` |
|---|---|---|
| `signature` | امضا | Signature |
| `heritage` | میراث | Heritage |
| `contemporary` | معاصر | Contemporary |
| `bridal` | عروس | Bridal |
| `seasonal` | فصلی | Seasonal |
| `capsule` | کپسولی / موضوعی محدود | Capsule |
| `limited_edition` | نسخه محدود | Limited Edition |
| `designer` | طراح‌محور | Designer |
| `manufacturer` | کالکشن تولیدکننده | Manufacturer Collection |
| `editorial` | انتخاب ویترینی | Editorial Selection |

**Important:** A collection is an entity with its own `code`, localized names, ownership, visibility, and product membership. `collection_type` is an attribute of that entity; the actual collection names are not global facet values. Products may belong to multiple collections.

#### F12 — `merchandising` / وضعیت نمایشی — controlled merchandising assignments, not uncontrolled supplier tags

| Code | `fa` | `en` |
|---|---|---|
| `new_arrival` | تازه‌وارد | New Arrival |
| `best_seller` | پرفروش | Best Seller |
| `trending` | محبوب روز | Trending |
| `limited_edition` | عرضه محدود | Limited Edition |
| `editors_pick` | منتخب | Editor's Pick |
| `gift_pick` | پیشنهاد هدیه | Gift Pick |
| `seasonal_highlight` | ویژه فصل | Seasonal Highlight |
| `signature_piece` | محصول شاخص | Signature Piece |

Prefer actual, timestamped merchandising state with optional `starts_at`/`ends_at`; `best_seller` must be backed by available sales data or be explicitly editorially curated under a different label. Do not claim real-time sales popularity without data. Implement simple manual curation first if analytics do not exist.

### 4.3 Important authoritative technical attributes — **not flat tags**

Keep the following in existing Product, Variant, Supplier Offer, gold policy and/or bullion models (do not create parallel free-text facet values):

- `karat/purity`: 18K and other supported purities per business policy.
- Metal/color: yellow, white, rose; alloy composition if available.
- Weight / weight range in **grams**, and nominal bullion denomination (including one troy ounce).
- Size and measurements; stones, gem type, cut and stone weight if supported.
- Manufacturer/brand, product code, SKU and UID where appropriate.
- Making-fee type/rate/range, supplier offer validity, settlement terms, and dynamic gold pricing.
- Stock and physical UID availability: **do not expose retailer-selectable stock or exact UID inventory** merely because classification filters are added.

### 4.4 Cross-dimensional landing pages (examples, not new taxonomy nodes)

| Page / label | Selection logic |
|---|---|
| Everyday Gold / طلای روزمره | `usage=everyday` |
| Occasion Gold / طلای مناسبتی | selected `occasion` values, optionally `usage=formal/evening/bridal` |
| Luxury Jewelry / طلای لوکس | `market_tier=luxury` (DIDAR-approved only) |
| Heritage Jewelry / طلای میراث | approved `heritage` values and/or selected `collection_type=heritage` |
| Everyday Luxury | `usage=everyday AND market_tier=luxury` |
| Persian Heritage | `heritage=persian_heritage` |
| Minimal Gold | `design_style=minimalist` |
| Nowruz Gifts | `occasion=nowruz` plus any approved campaign rules |

Store these as reusable **curated page definitions or query configurations** in the existing CMS/router where possible, rather than creating permanent duplicate product categories.

---


---

## 6. Data model changes in the existing B2C PostgreSQL schema

Treat the following names as **conceptual and additive**: adapt existing Didar naming and native Mercur products, never create a second master-product/stock table.

1. `didar_category` gets validated immutable `code`, `rank` / kind (`family`, `category`, `subcategory`), `active`, sorted order and localized labels via the existing DB localization convention or an additive related table. Keep `id`, `slug`, `parent_id` and old product FKs intact. Existing categories with no safe lineage are marked `legacy_pending_review` rather than forcibly shifted.
2. `didar_facet`: unique immutable code; input mode; scope; activation, display sort and localized labels. `didar_facet_value`: unique (facet_id,code), approved localization, status/sort and optional evidence rules. Facet *values* do not become categories.
3. `didar_product_facet_assignment`: product and value FKs, supplier suggestion vs admin approval states, actor, approval, audit and timestamps; unique product/value; **at most one approved `market_tier` per product**, enforced server-side and transactionally. All public facet values require approved, active parent vocabulary and product public visibility.
4. Extend **existing** `didar_collection` and `didar_collection_product`: immutable code or suitable slug, one approved F11 `collection_type`, Didar/owned supplier scope where compatible with existing user model, public visibility/approval, translated names/artwork, sort and timestamps. Do not create a disconnected duplicate collection data model. One product can belong to many collections.
5. `didar_merchandising_assignment` or a controlled extension: F12 code, owner approval, optional start/end, source/evidence and audit. `best_seller` is not a self-granted supplier tag.
6. Only if missing: immutable canonical product-path aliases to preserve existing and changed URLs. Public `/i/{uid}` resolver must use the existing item/product relations, **not an externally selectable product ID** supplied in a URL.
7. All migrations/seed runs idempotent, concurrency safe, immutable stable identifiers, no fabricated production products, no UID reissue, no changes to checkout/financial tables. Seed controlled vocabulary by stable keys exactly once; default sensitive labels inactive pending required review. Retiring a value preserves historical assignments and audit.

## 7. APIs / routing: B2C only

Use current `/didar/catalog`, `/didar/manage` and existing Next same-origin proxy rather than new parallel API namespaces. Additional endpoints are permitted only where a bounded dedicated path materially simplifies authorizations. Provide:

- Authorized tree `Family → Category → Subcategory` with public-safe visible nodes, localized labels, stable IDs/slugs and breadcrumbs; admin may inspect draft/incomplete records.
- Facet metadata with per-dimension `single_select`/`multi_select`, code, localized labels, statuses and valid values. Public counts must count **only public products**, never hidden suppliers/UIDs.
- Server-paginated/filterable catalog. Filters compose **OR within multi-select dimension**, **AND across distinct dimensions** and **AND with the selected structural taxonomy subtree**. Example `subcategory=bracelets.clasp AND usage IN (everyday,workwear) AND design_style=minimalist`. Do not rely on local browser filtering as the authoritative searchable catalog.
- Admin CRUD for classifications, pending/approved assignments, vocabulary/order/locales, collections and merchandising; server-side tenant/supplier permissions and audit. Read-only supplier by default; supplier suggestions allowed **only if explicitly granted** through existing admin permission model. Product Ops approval is independent from wholesale inventory.
- One canonical B2C PDP route and legacy redirects; stable public UID scan resolver governed by published product visibility. Product/category edit returns useful validation errors and current canonical URL for UI preview.
- Never return internal UID/EPC/custody records, exact stock reservations, private supplier commercial/cost data, order/customer records, or hidden facets in public filter APIs. Preserve existing product/supplier/offer response contract where public-safe.

## 8. Connected B2C UI (no disconnected screenshots or mock-only pages)

- In `/manage` product editor: **cascading Family / Category / Subcategory selector** plus image upload, actual gold attributes, code/SKU and public URL preview. Show required-state validation before publishing; draft may be incomplete.
- Add `Classification` collapsible editor for F01–F10, searchable controlled values, F02 single-select. Show status of unapproved suggestions. Add separate existing Collections membership editor and DIDAR-only F12 merchandising. Add a lightweight vocabulary management tab for activate/retire labels, sort and four-locale labels.
- On B2C storefront: structural browse menus (shop by product), optional filtered entry routes for everyday/lifestyle, wedding/occasion/gifts, heritage/collections and editorial premium/featured picks. These must be **query views into the same products**, not duplicate master rows.
- Filtering for `usage`, `design_style`, `occasion`, `audience`, `market_tier` first; preserve weight, purity and offer-price filters. F03/F04/F07–F10 remain manageable in back office and queryable. Empty public sections should be suppressed or show honest empty states, not seeded with invented jewelry.
- Breadcrumbs `Home → Family → Category → Subcategory → Product`; canonical link, stable legacy redirects and permalink. Product Detail shows only suitable approved consumer descriptors, not internal contract/facets that are not consumer meaningful.
- Localization must use the **existing real route/locale infrastructure**. Do not claim four B2C locales currently exist; plan fa first with fa/en/ar/fr vocabulary data. When enabling new /ar,/en,/fr routes, implement correct RTL/LTR mirroring and actual translated content, not just locale prefixes.
- Responsive B2C test at 390px mobile and desktop, scanner QR navigation into a public PDP, mixed Latin product identifiers inside RTL labels. All actions persisted/reloaded through PostgreSQL.

## 9. Verified implementation sequence (one project, not many projects)

**Slice A — Audit + model:** Inspect actual current `didar_category` contents and existing product assignments. Save `docs/audits/b2c-taxonomy-reconciliation.md` with `existing/new_candidate/rename_candidate/legacy_alias/conflict/deferred`. Add only required idempotent migrations, taxonomy rank and localization, F01–F12 vocabulary, approved assignment models, extending existing collections. Demonstrate fresh and migrated/legacy DB integrity.

**Slice B — Server + API:** Valid ancestry/publication gate, subjective/supplier review, locale-ready public meta, visibility-safe facet search/pagination/sorting, cross-facet AND/OR, canonical product URL and legacy alias service. No initial mass publishing or automatic reclassification.

**Slice C — Real admin/supplier UI:** One existing `/manage` form with cascading selectors and approvals; save/reload facet and collection assignments; explain missing taxonomy/translation/owner approval. Do not give suppliers global facet publishing or arbitrary catalog editing.

**Slice D — Real B2C storefront:** Category, lifestyle, occasion, collection and curated views all query the same product core; hierarchical PDP URL and breadcrumbs. Coordinate the UID Code128 + QR printing/resolver implementation from **Issue #4** so the QR remains valid after taxonomy relocation. No printing real customer QR without valid public origin.

**Slice E — Full regression + handoff:** Existing commerce/finance/PDP/UID/supplier/checkout/returns/ledger test suites, additive migrations, API permission/filter tests, browser click-through and Mac UAT update. If the Codex Linux run cannot validate actual Mac barcode printer/camera, report `MAC_PRINT_SCAN_UAT_PENDING` rather than claimed verified.

**Acceptance demonstration:** Admin creates an unpublished bracelet draft with images → selects approved `Jewelry > Bracelets > Clasp` leaf → assigns `usage=everyday`, `market_tier=premium`, `design_style=minimalist`, `occasion=nowruz`, adds approved Heritage collection → admin approves/publishes → consumer sees product in bracelet structural tree **and** everyday/Nowruz/collection filters without duplication → authorized intake adds exact weighed UID → prints Code128 and public-origin-safe QR → QR resolves same master PDP even after renaming or recategorization → supplier offers, checkout, payments, stock, gold obligations and all historical UIDs remain intact.

Must test negative cases: publish draft without full leaf blocked; supplier cannot self-approve luxury/best_seller; invalid 2 approved market tiers rejected; hidden/expired facet not shown; supplier A cannot mutate B; changed leaf/title does not break old link/QR; one product returned once; no hidden data leakage; archival taxonomy counts never blindly seeded; re-run seed doesn't duplicate; full Phase 1/2 test and builds pass.

## 10. Codex execution contract

Read this entire B2C adaptation and latest `main`; refer back to the source historical vocabulary section, but **this B2C applicability/routing/permissions section overrides old B2B-specific workflow instructions**. Preserve official Mercur/Medusa and existing Didar PostgreSQL, Finance, UID, offers, images, shipping and customer flows. Execute real migration → backend → API → Persian admin → B2C storefront → tests. No unrelated business redesign, no B2B system creation, no clone of another app, no speculative product examples as production seed, no destructive reset.

Deliver actual code and test results, changed-file list, real database audit/crosswalk, exact commit SHA and explicit `DONE / PENDING / BLOCKED`. Do not mark the taxonomy or barcode journeys implemented until full UI/API/browser verification passes. Use one coherent reviewed code branch for substantial work; no new branches for routine discussions, and merge into `main` only after successful verification.
