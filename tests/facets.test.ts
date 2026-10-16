import { beforeAll, afterAll, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import {
  finAPI as api,
  finOK as ok,
  finDB as db,
  financeFixture,
} from "./financial-helpers";
import { seedFacetVocabulary } from "../packages/api/src/didar/facet-seed";
let f: any,
  other = "",
  hidden = "",
  collection: any;
const tag = "facets-" + crypto.randomUUID();
const assignment = (product: string, value: string, extra: any = {}) => ({
  kind: "classification",
  operation: "assign",
  product_id: product,
  value_id: value,
  reason: "QA owner approved classification",
  evidence: "QA documented design provenance and approved source",
  ...extra,
});
const search = (q: any = {}) =>
  "catalog?" + new URLSearchParams({ q: tag, page: "1", limit: "12", ...q });
beforeAll(async () => {
  f = await financeFixture();
  await db.query("UPDATE didar_product SET title=$1 WHERE id=$2", [
    tag + " A",
    f.pid,
  ]);
  for (const weight_mg of [1000, 2000])
    await ok(
      "manage",
      {
        kind: "new_offer",
        supplier_id: f.sid,
        product_id: f.pid,
        weight_mg,
        quantity: 10,
        labor_irr: 1000,
        margin_bps: 0,
      },
      f.admin,
    );
  other = (
    await ok(
      "manage",
      {
        kind: "product",
        title: tag + " B",
        category_id: "bracelet",
        purity: 750,
        published: true,
      },
      f.admin,
    )
  ).id;
  hidden = (
    await ok(
      "manage",
      {
        kind: "product",
        title: tag + " PRIVATE",
        category_id: "bracelet",
        purity: 750,
        published: false,
      },
      f.admin,
    )
  ).id;
  await ok(
    "manage",
    {
      kind: "new_offer",
      supplier_id: "s2",
      product_id: other,
      weight_mg: 3000,
      quantity: 2,
      labor_irr: 1000,
      margin_bps: 0,
    },
    f.admin,
  );
  for (const pid of [f.pid, other, hidden])
    await ok("manage", assignment(pid, "usage.everyday"), f.admin);
  await ok("manage", assignment(f.pid, "design_style.minimalist"), f.admin);
  await ok("manage", assignment(f.pid, "occasion.nowruz"), f.admin);
  await ok("manage", assignment(f.pid, "market_tier.premium"), f.admin);
  await ok("manage", assignment(other, "usage.formal"), f.admin);
}, 120000);
afterAll(async () => {
  if (f)
    await db.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=ANY($1::text[])",
      [[f.pid, other, hidden].filter(Boolean)],
    );
});
test("seeds all twelve independent dimensions once, no fabricated Arabic/French labels or product assignments", async () => {
  const before = (
    await db.query("SELECT count(*) n FROM didar_product_facet_assignment")
  ).rows[0].n;
  await seedFacetVocabulary(db);
  await seedFacetVocabulary(db);
  const meta = await ok("classification", undefined, f.admin);
  expect(meta.facets).toHaveLength(12);
  expect(meta.values).toHaveLength(113);
  expect(
    meta.translations.filter((t: any) => ["ar", "fr"].includes(t.locale)),
  ).toHaveLength(0);
  expect(meta.storefront_locales).toEqual(["fa"]);
  expect(
    (await db.query("SELECT count(*) n FROM didar_product_facet_assignment"))
      .rows[0].n,
  ).toBe(before);
  expect(
    (await db.query("SELECT mode FROM didar_facet WHERE code='market_tier'"))
      .rows[0].mode,
  ).toBe("single_select");
});
test("AND across dimensions, OR within a dimension, distinct products/counts and stable bounded pages", async () => {
  const both = await ok(search({ usage: "everyday,formal" }));
  expect(both.total).toBe(2);
  expect(new Set(both.products.map((p: any) => p.id)).size).toBe(2);
  const a = await ok(
    search({
      usage: "everyday",
      design_style: "minimalist",
      occasion: "nowruz",
      market_tier: "premium",
      category: "jewelry",
    }),
  );
  expect(a.total).toBe(1);
  expect(a.products[0].id).toBe(f.pid);
  const v = a.facets
    .find((v: any) => v.code === "usage")
    .values.find((v: any) => v.code === "everyday");
  expect(v.count).toBe(1);
  expect(
    (await ok(search({ category_slug: "rings", category: "bracelet" }))).total,
  ).toBe(0);
  expect(
    (
      await ok(search({ category_slug: "bracelets", category: "jewelry" }))
    ).products.map((p: any) => p.id),
  ).toEqual([other]);
  const p1 = await ok(search({ limit: "1" })),
    p2 = await ok(search({ limit: "1", page: "2" })),
    p3 = await ok(search({ limit: "1", page: "3" }));
  expect(p1.total).toBe(2);
  expect(p2.total_pages).toBe(2);
  expect(p1.products[0].id).not.toBe(p2.products[0].id);
  expect(p3.products).toEqual([]);
  expect(p3.total).toBe(2);
  expect(JSON.stringify(a)).not.toContain("PRIVATE");
  expect(JSON.stringify(a)).not.toContain("QA documented");
  expect(JSON.stringify(a)).not.toContain("reviewed_by");
  expect(JSON.stringify(a)).not.toContain(
    'supplier_id":"' + f.sid + '","actor_id',
  );
});
test("offer weight, purity, stock, authoritative price filters combine on the same offer before paging", async () => {
  const a = await ok(
    search({ weight_exact: "1000", purity: "750", in_stock: "true" }),
  );
  expect(a.total).toBe(1);
  expect(a.products[0].offers).toHaveLength(1);
  expect(a.products[0].offers[0].weight_mg).toBe(1000);
  const price = a.products[0].offers[0].price.total_irr;
  expect(
    (await ok(search({ weight_exact: "1000", price_min: String(price + 1) })))
      .total,
  ).toBe(0);
  expect(
    (await ok(search({ weight_exact: "1000", price_max: String(price) })))
      .total,
  ).toBe(1);
  expect(
    (await ok(search({ weight_min: "1500", weight_max: "2500" }))).products[0]
      .offers,
  ).toHaveLength(1);
  const sorted = await ok(search({ sort: "weight_desc" }));
  expect(sorted.products[0].id).toBe(other);
});
test("strict filters reject unknown dimensions/codes, injection, malformed or unsafe pagination", async () => {
  for (const q of [
    { limit: "49" },
    { page: "-1" },
    { page: "1.5" },
    { limit: "0" },
    { page: "10001" },
    { q: "x".repeat(151) },
    { usage: "unknown_value" },
    { usage: "everyday');DROP TABLE didar_product;--" },
    { anything: "whatever" },
    { weight_min: "2000", weight_max: "1000" },
    { price_min: "9007199254740992" },
    { sort: "random" },
    { in_stock: "yes" },
  ])
    expect((await api(search(q))).http).toBe(400);
  expect(
    (await db.query("SELECT id FROM didar_product WHERE id=$1", [f.pid]))
      .rowCount,
  ).toBe(1);
});
test("server prevents competing market tiers even with concurrent owner approvals and rejects F11 product tags", async () => {
  const attempts = await Promise.all(
    ["luxury", "value"].map((code) =>
      api("manage", assignment(f.pid, "market_tier." + code), f.admin),
    ),
  );
  expect(attempts.every((a) => a.http === 409)).toBe(true);
  expect(
    (
      await api(
        "manage",
        assignment(f.pid, "collection_type.heritage"),
        f.admin,
      )
    ).http,
  ).toBe(400);
  await expect(
    db.query(
      "UPDATE didar_facet SET mode='multi_select' WHERE code='market_tier'",
    ),
  ).rejects.toThrow("INVALID_FACET_IDENTITY");
  const current = (
    await ok("classification?product_id=" + other, undefined, f.admin)
  ).assignments;
  const races = await Promise.all(
    ["premium", "value"].map((code) =>
      api("manage", assignment(other, "market_tier." + code), f.admin),
    ),
  );
  expect(races.map((r) => r.http).sort()).toEqual([200, 409]);
});
test("subjective heritage/luxury and best seller require evidence; suppliers cannot self-approve or merchandise", async () => {
  expect(
    (
      await api(
        "manage",
        assignment(f.pid, "heritage.persian_heritage", { evidence: "" }),
        f.admin,
      )
    ).http,
  ).toBe(400);
  expect(
    (
      await api(
        "manage",
        assignment(f.pid, "merchandising.best_seller"),
        f.admin,
      )
    ).http,
  ).toBe(400);
  expect(
    (
      await api(
        "manage",
        assignment(f.pid, "merchandising.editors_pick"),
        f.seller,
      )
    ).http,
  ).toBe(403);
  expect(
    (
      await api(
        "manage",
        {
          kind: "vocabulary",
          operation: "value_create",
          facet_code: "usage",
          code: "supplier_tag",
        },
        f.seller,
      )
    ).http,
  ).toBe(403);
  expect(
    (await api("manage", assignment(f.pid, "market_tier.luxury"), f.seller))
      .http,
  ).toBe(403);
});
test("supplier default-deny, own suggestions, DIDAR review, concurrency, cross supplier denial and immediate revocation", async () => {
  const b = {
    kind: "classification",
    operation: "suggest",
    product_id: f.pid,
    value_id: "audience.unisex",
    reason: "Supplier proposes a factual audience",
  };
  expect((await api("manage", b, f.seller)).http).toBe(403);
  await ok(
    "permissions",
    {
      supplier_id: f.sid,
      permission: "SUGGEST_OWN_CLASSIFICATION",
      granted: true,
    },
    f.admin,
  );
  expect(
    (await api("classification?product_id=" + other, undefined, f.seller)).http,
  ).toBe(403);
  expect(
    (await api("manage", { ...b, product_id: other }, f.seller)).http,
  ).toBe(403);
  const proposed = await ok("manage", b, f.seller);
  expect(proposed.status).toBe("pending");
  expect((await ok(search({ audience: "unisex" }))).total).toBe(0);
  expect(
    (
      await ok("classification?product_id=" + f.pid, undefined, f.seller)
    ).assignments.find((a: any) => a.id === proposed.id).status,
  ).toBe("pending");
  expect(
    (
      await api(
        "manage",
        {
          ...b,
          operation: "review",
          version: proposed.version,
          decision: "approved",
        },
        f.seller,
      )
    ).http,
  ).toBe(403);
  const approved = await ok(
    "manage",
    {
      ...b,
      operation: "review",
      version: proposed.version,
      decision: "approved",
      reason: "DIDAR reviewed audience",
    },
    f.admin,
  );
  expect((await ok(search({ audience: "unisex" }))).total).toBe(1);
  expect(
    (await api("manage", { ...b, version: proposed.version }, f.seller)).http,
  ).toBe(409);
  await ok(
    "permissions",
    {
      supplier_id: f.sid,
      permission: "SUGGEST_OWN_CLASSIFICATION",
      granted: false,
    },
    f.admin,
  );
  expect(
    (await api("manage", { ...b, value_id: "audience.women" }, f.seller)).http,
  ).toBe(403);
  await expect(
    db.query("DELETE FROM didar_classification_event WHERE entity_id=$1", [
      f.pid,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_CLASSIFICATION_HISTORY");
  expect((await api("classification", undefined, f.buyer)).http).toBe(403);
  expect((await api("classification")).http).toBe(401);
});
test("timed merchandising, retired values and hidden dimensions immediately disappear from public filters and PDP", async () => {
  const expired = await ok(
    "manage",
    assignment(f.pid, "merchandising.new_arrival", {
      starts_at: "2020-01-01T00:00:00Z",
      ends_at: "2020-01-02T00:00:00Z",
    }),
    f.admin,
  );
  expect((await ok(search({ merchandising: "new_arrival" }))).total).toBe(0);
  await ok("manage", assignment(f.pid, "merchandising.editors_pick"), f.admin);
  expect((await ok(search({ merchandising: "editors_pick" }))).total).toBe(1);
  const {
    rows: [value],
  } = await db.query(
    "SELECT * FROM didar_facet_value WHERE id='design_style.minimalist'",
  );
  await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "value_update",
      id: value.id,
      version: value.version,
      active: false,
      reason: "Temporary QA retirement",
    },
    f.admin,
  );
  expect((await ok(search({ design_style: "minimalist" }))).total).toBe(0);
  expect(
    (await ok(search())).products.find((p: any) => p.id === f.pid)
      .classification.design_style,
  ).toBeUndefined();
  await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "value_update",
      id: value.id,
      version: value.version + 1,
      active: true,
      reason: "Restore QA vocabulary",
    },
    f.admin,
  );
  const {
    rows: [facet],
  } = await db.query("SELECT * FROM didar_facet WHERE code='usage'");
  await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "facet_update",
      id: "usage",
      version: facet.version,
      visible: false,
      reason: "Temporary QA hide dimension",
    },
    f.admin,
  );
  expect((await ok(search())).facets.some((x: any) => x.code === "usage")).toBe(
    false,
  );
  expect((await ok(search({ usage: "everyday" }))).total).toBe(0);
  await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "facet_update",
      id: "usage",
      version: facet.version + 1,
      visible: true,
      reason: "Restore QA dimension",
    },
    f.admin,
  );
});
test("extend existing collections with F11, owner approval, translated label and memberships without cloning products", async () => {
  const input = {
    kind: "collection",
    name: "مجموعه میراث آزمون",
    slug: tag,
    type_code: "heritage",
    owner_supplier_id: f.sid,
    published: true,
    approved: true,
    product_ids: [f.pid, hidden],
  };
  expect(
    (await api("manage", { ...input, type_code: "everyday" }, f.admin)).http,
  ).toBe(400);
  expect(
    (await api("manage", { ...input, type_code: "limited_edition" }, f.admin))
      .http,
  ).toBe(400);
  collection = await ok("manage", input, f.admin);
  const a = await ok(
    search({ collection_type: "heritage", collection_slug: tag }),
  );
  expect(a.total).toBe(1);
  expect(a.products[0].id).toBe(f.pid);
  expect(
    a.collections.find((c: any) => c.id === collection.id).product_ids,
  ).toEqual([f.pid]);
  expect(
    (
      await api(
        "manage",
        { ...input, id: collection.id, version: 1, code: "replace" },
        f.admin,
      )
    ).http,
  ).toBe(400);
  collection = await ok(
    "manage",
    {
      ...input,
      id: collection.id,
      version: collection.version,
      published: false,
    },
    f.admin,
  );
  const hiddenCatalog = await ok(search());
  expect(
    hiddenCatalog.collections.some((c: any) => c.id === collection.id),
  ).toBe(false);
  expect(
    hiddenCatalog.products.find((p: any) => p.id === f.pid).collection_ids,
  ).not.toContain(collection.id);
  expect((await ok(search({ collection_type: "heritage" }))).total).toBe(0);
  collection = await ok(
    "manage",
    { ...input, id: collection.id, version: collection.version },
    f.admin,
  );
});
test("curated discovery composes immutable page constraints with customer filters and the same master PDP", async () => {
  const page = await ok(
    "manage",
    {
      kind: "curated_page",
      slug: tag,
      name: "طلای روزمره آزمون",
      page_kind: "lifestyle",
      query: { usage: ["everyday"], occasion: ["nowruz"] },
      reason: "QA landing criteria",
    },
    f.admin,
  );
  const a = await ok(search({ discovery_slug: tag }));
  expect(a.total).toBe(1);
  expect(a.products[0].id).toBe(f.pid);
  expect(a.landing.name).toBe("طلای روزمره آزمون");
  expect(
    (await ok(search({ discovery_slug: tag, usage: "formal" }))).total,
  ).toBe(0);
  expect(
    (
      await api(
        "manage",
        {
          kind: "curated_page",
          slug: tag + "-bad",
          name: "آزمون",
          page_kind: "curated",
          query: { sql: "DROP TABLE" },
          reason: "QA invalid criteria",
        },
        f.admin,
      )
    ).http,
  ).toBe(400);
  const fixed = await ok("catalog?discovery_slug=everyday-gold&limit=48");
  expect(fixed.products.some((p: any) => p.id === f.pid)).toBe(true);
});
test("draft translations are validated, reviewed by DIDAR and never expose raw labels or activate storefront locales", async () => {
  const fresh = await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "value_create",
      facet_code: "usage",
      code: "qa_" + tag.replaceAll("-", "_"),
    },
    f.admin,
  );
  expect(
    (await ok(search())).facets
      .find((d: any) => d.code === "usage")
      .values.some((v: any) => v.code === fresh.code),
  ).toBe(false);
  for (const label of ["<script>x</script>", "a", "x\nattack"])
    expect(
      (
        await api(
          "manage",
          {
            kind: "vocabulary",
            operation: "translation_draft",
            entity_type: "value",
            entity_id: fresh.id,
            locale: "fa",
            label,
          },
          f.admin,
        )
      ).http,
    ).toBe(400);
  expect(
    (
      await api(
        "manage",
        {
          kind: "vocabulary",
          operation: "translation_draft",
          entity_type: "constructor",
          entity_id: fresh.id,
          locale: "fa",
          label: "واژه آزمون",
        },
        f.admin,
      )
    ).http,
  ).toBe(400);
  const draft = await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "translation_draft",
      entity_type: "value",
      entity_id: fresh.id,
      locale: "fa",
      label: "کاربرد آزمون",
    },
    f.admin,
  );
  await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "translation_review",
      id: draft.id,
      decision: "approved",
      reason: "Reviewed synthetic FA label",
    },
    f.admin,
  );
  expect(
    (
      await api(
        "manage",
        {
          kind: "vocabulary",
          operation: "translation_review",
          id: draft.id,
          decision: "approved",
          reason: "Duplicate review rejected",
        },
        f.admin,
      )
    ).http,
  ).toBe(409);
  const revision = await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "translation_draft",
      entity_type: "value",
      entity_id: fresh.id,
      locale: "fa",
      label: "کاربرد اصلاح شده",
    },
    f.admin,
  );
  await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "translation_review",
      id: revision.id,
      decision: "approved",
      reason: "Reviewed replacement label",
    },
    f.admin,
  );
  const history = (
    await db.query(
      "SELECT status FROM didar_catalog_translation WHERE entity_id=$1 ORDER BY created_at",
      [fresh.id],
    )
  ).rows;
  expect(history.map((t: any) => t.status)).toEqual(["retired", "approved"]);
  const wrongScript = await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "translation_draft",
      entity_type: "value",
      entity_id: fresh.id,
      locale: "fr",
      label: "ترجمه آزمایشی تأیید نشده",
    },
    f.admin,
  );
  expect(
    (
      await api(
        "manage",
        {
          kind: "vocabulary",
          operation: "translation_review",
          id: wrongScript.id,
          decision: "approved",
          reason: "Script mismatch must be rejected",
        },
        f.admin,
      )
    ).http,
  ).toBe(400);
  const ar = await ok("catalog?locale=ar&page=1");
  expect(ar.facets).toEqual([]);
  expect(ar.pages).toEqual([]);
  expect(ar.collections).toEqual([]);
  expect(ar.storefront_locales).toEqual(["fa"]);
  const en = await ok(search({ locale: "en" }));
  expect(en.facets.find((v: any) => v.code === "usage").label).toBeTruthy();
  expect(
    en.facets
      .find((v: any) => v.code === "usage")
      .values.some((v: any) => v.label === fresh.id),
  ).toBe(false);
  await ok(
    "manage",
    {
      kind: "vocabulary",
      operation: "value_update",
      id: fresh.id,
      version: 1,
      active: false,
      reason: "Retire synthetic QA value",
    },
    f.admin,
  );
});
test("migration replays preserve old collections, product identities, exact inventory and immutable financial snapshots", async () => {
  const fingerprint = async () => {
    const output: any = {};
    for (const table of [
      "didar_product",
      "didar_offer",
      "didar_inventory_item",
      "didar_item_rfid_binding",
      "didar_order",
      "didar_order_line",
      "didar_payment_attempt",
      "didar_fin_event",
      "didar_fin_journal",
      "didar_fin_posting",
    ]) {
      output[table] = (
        await db.query(
          `SELECT md5(coalesce(jsonb_agg(row ORDER BY row::text)::text,'[]')) hash FROM (SELECT to_jsonb(t) row FROM ${table} t) x`,
        )
      ).rows[0].hash;
    }
    return output;
  };
  const before = await fingerprint();
  await db.query(
    readFileSync("packages/api/src/didar/facets-schema.sql", "utf8"),
  );
  await seedFacetVocabulary(db);
  expect(await fingerprint()).toEqual(before);
  const c = await db.connect(),
    schema = "qa_facets_" + crypto.randomUUID().replaceAll("-", "");
  try {
    await c.query("CREATE SCHEMA " + schema);
    await c.query("SET search_path TO " + schema);
    for (const file of [
      "schema",
      "commerce-schema",
      "phase1-schema",
      "taxonomy-schema",
    ])
      await c.query(
        readFileSync("packages/api/src/didar/" + file + ".sql", "utf8"),
      );
    await c.query(
      "INSERT INTO didar_collection VALUES('legacy','مجموعه قدیمی','old-collection')",
    );
    await c.query(
      "INSERT INTO didar_product(id,title,category,purity,published) VALUES('p','قدیمی','طلا',750,false)",
    );
    await c.query("INSERT INTO didar_collection_product VALUES('legacy','p')");
    const snapshot = (
      await c.query(
        "SELECT row_to_json(p) body FROM didar_product p WHERE id='p'",
      )
    ).rows[0].body;
    for (let i = 0; i < 2; i++) {
      await c.query(
        readFileSync("packages/api/src/didar/facets-schema.sql", "utf8"),
      );
      await seedFacetVocabulary(c);
    }
    expect(
      (
        await c.query(
          "SELECT row_to_json(p) body FROM didar_product p WHERE id='p'",
        )
      ).rows[0].body,
    ).toEqual(snapshot);
    expect(
      (
        await c.query(
          "SELECT legacy_public,published,approved,type_id FROM didar_collection WHERE id='legacy'",
        )
      ).rows[0],
    ).toEqual({
      legacy_public: true,
      published: true,
      approved: true,
      type_id: null,
    });
    expect(
      (await c.query("SELECT * FROM didar_collection_product")).rows,
    ).toEqual([{ collection_id: "legacy", product_id: "p" }]);
    expect(
      (
        await c.query(
          "SELECT count(*)::int n FROM didar_product_facet_assignment",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await c.query("ROLLBACK");
    await c.query("SET search_path TO public");
    await c.query("DROP SCHEMA " + schema + " CASCADE");
    c.release();
  }
});

test("reviewed best-seller badge requires paid sales, while UID checkout and balanced accounting keep the same classified master", async () => {
  const uids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const sale = await f.buy();
    uids.push(sale.item.uid);
    const resolved = await ok(
      "product-link?uid=" + encodeURIComponent(sale.item.uid),
    );
    expect(resolved.id).toBe(f.pid);
    expect(sale.order.status).toBe("pending");
    expect(sale.sale.order_line_id).toBeTruthy();
  }
  const badge = await ok(
    "manage",
    assignment(f.pid, "merchandising.best_seller"),
    f.admin,
  );
  const result = await ok(
    search({
      merchandising: "best_seller",
      occasion: "nowruz",
      collection_type: "heritage",
    }),
  );
  expect(result.total).toBe(1);
  expect(result.products[0].id).toBe(f.pid);
  const before = (
    await db.query(
      "SELECT jsonb_agg(to_jsonb(i) ORDER BY id) rows FROM didar_inventory_item i WHERE uid=ANY($1::text[])",
      [uids],
    )
  ).rows[0].rows;
  await db.query(
    readFileSync("packages/api/src/didar/facets-schema.sql", "utf8"),
  );
  await seedFacetVocabulary(db);
  expect(
    (
      await db.query(
        "SELECT jsonb_agg(to_jsonb(i) ORDER BY id) rows FROM didar_inventory_item i WHERE uid=ANY($1::text[])",
        [uids],
      )
    ).rows[0].rows,
  ).toEqual(before);
  const retired = await ok(
    "manage",
    assignment(f.pid, "merchandising.best_seller", {
      operation: "retire",
      version: badge.version,
    }),
    f.admin,
  );
  expect((await ok(search({ merchandising: "best_seller" }))).total).toBe(0);
}, 120000);

test("all ten product dimensions combine with public F11 and F12 without duplicating a master", async () => {
  for (const value of [
    "heritage.persian_heritage",
    "motif.celestial",
    "styling_form.stackable",
    "personalization.engravable",
    "craftsmanship.handmade",
    "merchandising.signature_piece",
  ])
    await ok("manage", assignment(f.pid, value), f.admin);
  const all = await ok(
    search({
      usage: "everyday",
      market_tier: "premium",
      design_style: "minimalist",
      heritage: "persian_heritage",
      occasion: "nowruz",
      audience: "unisex",
      motif: "celestial",
      styling_form: "stackable",
      personalization: "engravable",
      craftsmanship: "handmade",
      collection_type: "heritage",
      merchandising: "signature_piece",
    }),
  );
  expect(all.total).toBe(1);
  expect(all.products[0].id).toBe(f.pid);
  expect(
    Object.keys(all.products[0].classification).length,
  ).toBeGreaterThanOrEqual(10);
  expect(
    (await ok(search({ discovery_slug: "persian-heritage" }))).products.map(
      (p: any) => p.id,
    ),
  ).toEqual([f.pid]);
  expect(
    (await ok(search({ discovery_slug: "heritage-collections" }))).products.map(
      (p: any) => p.id,
    ),
  ).toEqual([f.pid]);
});
