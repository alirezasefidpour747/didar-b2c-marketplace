import { beforeAll, afterAll, test, expect } from "bun:test";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import {
  MultiFormatReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/library";
import { readFileSync } from "node:fs";
import { verifiedPublicOrigin } from "../packages/api/src/didar/labels";
import { financeFixture, finAPI, finOK, finDB } from "./financial-helpers";
let f: Awaited<ReturnType<typeof financeFixture>>,
  root = "",
  middle = "",
  publicKey = "",
  leaf = "",
  otherLeaf = "",
  draft = "",
  batch = "",
  items: any[] = [],
  originalPath = "",
  printed: any,
  requestProduct = "";
const tag = "taxonomy-" + crypto.randomUUID();
const web = process.env.TEST_STOREFRONT_URL || "http://localhost:3000";
const manage = (body: any) => finOK("manage", body, f.admin);
const link = (key: string, value: string) =>
  finOK("product-link?" + key + "=" + encodeURIComponent(value));
function decode(svg: string, format: BarcodeFormat) {
  const png = PNG.sync.read(
    new Resvg(Buffer.from(svg.split(",")[1], "base64")).render().asPng(),
  );
  const gray = new Uint8ClampedArray(png.width * png.height);
  for (let i = 0; i < gray.length; i++) {
    const alpha = png.data[i * 4 + 3] / 255;
    gray[i] = Math.round(
      ((png.data[i * 4] + 2 * png.data[i * 4 + 1] + png.data[i * 4 + 2]) / 4) *
        alpha +
        255 * (1 - alpha),
    );
  }
  const reader = new MultiFormatReader();
  reader.setHints(
    new Map<any, any>([
      [DecodeHintType.POSSIBLE_FORMATS, [format]],
      [DecodeHintType.TRY_HARDER, true],
    ]),
  );
  return reader
    .decodeWithState(
      new BinaryBitmap(
        new HybridBinarizer(
          new RGBLuminanceSource(gray, png.width, png.height),
        ),
      ),
    )
    .getText();
}
beforeAll(async () => {
  f = await financeFixture();
  root = (await manage({ kind: "category", name: "دسته آزمون", slug: tag })).id;
  publicKey = (
    await finDB.query("SELECT public_key FROM didar_product WHERE id=$1", [
      f.pid,
    ])
  ).rows[0].public_key;
  middle = (
    await manage({
      kind: "category",
      name: "دسته آزمون",
      slug: tag + "-category",
      parent_id: root,
    })
  ).id;
  leaf = (
    await manage({
      kind: "category",
      name: "زیردسته آزمون",
      slug: tag + "-child",
      parent_id: middle,
    })
  ).id;
  otherLeaf = (
    await manage({
      kind: "category",
      name: "زیردسته دوم",
      slug: tag + "-other",
      parent_id: middle,
    })
  ).id;
});
afterAll(async () => {
  for (const id of [f?.pid, draft, requestProduct].filter(Boolean))
    await finDB.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=$1",
      [id],
    );
  if (f)
    await finDB.query("UPDATE didar_supplier SET active=false WHERE id=$1", [
      f.sid,
    ]);
});
test("customer label origin requires explicit verification and rejects local, sandbox, credentials and unsafe URL origins", () => {
  expect(verifiedPublicOrigin({})).toBeNull();
  for (const origin of [
    "http://shop.didar-gold.ir",
    "https://localhost",
    "https://localhost.",
    "https://warehouse.lan",
    "https://127.0.0.1",
    "https://[::1]",
    "https://warehouse.internal",
    "https://shop.test",
    "https://shop.example",
    "https://example.com",
    "https://sandbox.didar-gold.ir",
    "https://preview-shop.didar-gold.ir",
    "https://shop.didar-gold.ir/path",
    "https://user:secret@shop.didar-gold.ir",
    "https://shop.didar-gold.ir:8443",
    "https://shop.didar-gold.ir/?x=1",
  ])
    expect(
      verifiedPublicOrigin({
        DIDAR_PUBLIC_ORIGIN: origin,
        DIDAR_PUBLIC_ORIGIN_VERIFIED: "true",
      } as any),
    ).toBeNull();
  expect(
    verifiedPublicOrigin({
      DIDAR_PUBLIC_ORIGIN: "https://shop.didar-gold.ir",
    } as any),
  ).toBeNull();
  expect(
    verifiedPublicOrigin({
      DIDAR_PUBLIC_ORIGIN: "https://shop.didar-gold.ir",
      DIDAR_PUBLIC_ORIGIN_VERIFIED: "true",
    } as any),
  ).toBe("https://shop.didar-gold.ir");
});
test("uncategorized drafts and photo uploads work; API and database deny incomplete publication", async () => {
  draft = (
    await manage({ kind: "product", title: tag + " draft", purity: 750 })
  ).id;
  expect(
    (
      await finDB.query(
        "SELECT published,category_id FROM didar_product WHERE id=$1",
        [draft],
      )
    ).rows[0],
  ).toEqual({ published: false, category_id: null });
  for (const category_id of [null, root, "missing"])
    expect(
      (
        await finAPI(
          "manage",
          { kind: "product", id: draft, category_id, published: true },
          f.admin,
        )
      ).http,
    ).toBe(400);
  expect(
    (
      await finAPI(
        "manage",
        { kind: "product", title: "bad slug", purity: 750, slug: "../oops" },
        f.admin,
      )
    ).http,
  ).toBe(400);
  await expect(
    finDB.query("UPDATE didar_product SET published=true WHERE id=$1", [draft]),
  ).rejects.toThrow("INVALID_PUBLICATION_TAXONOMY");
  await expect(
    finDB.query(
      "INSERT INTO didar_product(id,title,category,purity,published) VALUES($1,'bad','bad',750,true)",
      [tag + "-bad"],
    ),
  ).rejects.toThrow("INVALID_PUBLICATION_TAXONOMY");
  const image = await manage({
    kind: "image_upload",
    product_id: draft,
    mime_type: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=",
  });
  expect((await fetch(web + image.url)).status).toBe(404);
  expect(
    (
      await fetch(web + image.url, {
        headers: { authorization: "Bearer " + f.admin },
      })
    ).status,
  ).toBe(200);
  expect((await finAPI("product-link?id=" + draft)).http).toBe(404);
  expect((await fetch(web + "/products/" + draft)).status).toBe(404);
});
test("leaf and ancestor guards prevent taxonomy corruption and preserve a shared multi-offer master", async () => {
  await manage({
    kind: "product",
    id: f.pid,
    category_id: leaf,
    slug: "shared-gold",
    published: true,
  });
  originalPath = (await link("id", f.pid)).canonical_path;
  expect(originalPath).toBe(
    `/fa/products/${tag}/${tag}-category/${tag}-child/shared-gold-${publicKey}`,
  );
  expect((await link("id", f.pid)).breadcrumbs.map((c: any) => c.id)).toEqual([
    root,
    middle,
    leaf,
  ]);
  for (const b of [
    { id: root, name: "cycle", slug: tag, parent_id: leaf },
    { id: leaf, name: "root alone", slug: tag + "-child", parent_id: null },
    { name: "child of published leaf", slug: tag + "-nested", parent_id: leaf },
    { name: "orphan", slug: tag + "-orphan", parent_id: "missing" },
    { name: "bad slug", slug: "unsafe/slug" },
  ])
    expect(
      (await finAPI("manage", { kind: "category", ...b }, f.admin)).http,
    ).toBe(400);
  await expect(
    finDB.query("UPDATE didar_category SET parent_id=$1 WHERE id=$2", [
      leaf,
      root,
    ]),
  ).rejects.toThrow();
  await expect(
    finDB.query("DELETE FROM didar_category WHERE id=$1", [leaf]),
  ).rejects.toThrow();
  await expect(
    finDB.query("UPDATE didar_category SET slug='../bad' WHERE id=$1", [leaf]),
  ).rejects.toThrow("INVALID_SLUG");
  const ids = (await finOK("catalog")).products.filter(
    (p: any) => p.id === f.pid,
  );
  expect(ids).toHaveLength(1);
  // Two supplier offers still use this same master and canonical path.
  for (const supplier_id of [f.sid, "s2"])
    await manage({
      kind: "new_offer",
      product_id: f.pid,
      supplier_id,
      weight_mg: 2000,
      quantity: 1,
    });
  const p = (await finOK("catalog")).products.find((p: any) => p.id === f.pid);
  expect(new Set(p.offers.map((o: any) => o.supplier_id)).size).toBe(2);
  expect(p.canonical_path).toBe(originalPath);
});
test("supplier proposals cannot bypass publication and admin approval requires taxonomy", async () => {
  await finOK(
    "permissions",
    {
      supplier_id: f.sid,
      permission: "REQUEST_PRODUCT_CREATION",
      granted: true,
    },
    f.admin,
  );
  const request = await finOK(
    "manage",
    {
      kind: "product_request",
      title: tag + " proposal",
      purity: 750,
      published: true,
    },
    f.seller,
  );
  expect(
    (
      await finAPI(
        "manage",
        { kind: "review_request", id: request.id, decision: "approved" },
        f.admin,
      )
    ).http,
  ).toBe(400);
  expect(
    (
      await finAPI(
        "manage",
        { kind: "product", id: f.pid, published: true },
        f.seller,
      )
    ).http,
  ).toBe(403);
  requestProduct = (
    await manage({
      kind: "review_request",
      id: request.id,
      decision: "approved",
      category_id: leaf,
    })
  ).product_id;
  expect((await link("id", requestProduct)).breadcrumbs[2].id).toBe(leaf);
});
test("admin single and batch printing uses permanent UIDs with optional EPC, gates customer visibility and forbids all other roles", async () => {
  batch = (
    await finOK(
      "intake",
      {
        operation: "create",
        supplier_id: f.sid,
        invoice_number: tag,
        reference_purity: 750,
      },
      f.admin,
    )
  ).id;
  const line = (
    await finOK(
      "intake",
      {
        operation: "line",
        making_mode: "percent",
        making_bps: 0,
        batch_id: batch,
        product_id: f.pid,
        description: "Label pieces",
        quantity: 2,
        total_weight_mg: 2100,
        purity: 750,
      },
      f.admin,
    )
  ).id;
  for (const weight_mg of [1000, 1100])
    await finOK(
      "intake",
      { operation: "item", batch_id: batch, line_id: line, weight_mg },
      f.admin,
    );
  items = (await finOK("intake?id=" + batch, undefined, f.admin)).items;
  expect(items).toHaveLength(2);
  expect(items.every((i) => !i.epc)).toBe(true);
  for (const token of ["", f.seller, f.buyer]) {
    expect((await finAPI("labels", undefined, token)).http).toBe(
      token ? 403 : 401,
    );
    expect(
      (
        await finAPI(
          "labels",
          { mode: "warehouse", item_ids: [items[0].id] },
          token,
        )
      ).http,
    ).toBe(token ? 403 : 401);
  }
  expect(
    (await finAPI("labels", { mode: "customer", batch_id: batch }, f.admin))
      .http,
  ).toBe(400);
  const one = await finOK(
    "labels",
    { mode: "warehouse", item_ids: [items[0].id] },
    f.admin,
  );
  expect(one.items).toHaveLength(1);
  expect(one.items[0].qr).toBeNull();
  expect(decode(one.items[0].barcode, BarcodeFormat.CODE_128)).toBe(
    items[0].uid,
  );
  for (const item_ids of [
    [items[0].id, items[0].id],
    ["missing"],
    Array(101).fill("missing"),
  ])
    expect(
      (await finAPI("labels", { mode: "warehouse", item_ids }, f.admin)).http,
    ).toBe(400);
  await finOK("intake", { operation: "verify", batch_id: batch }, f.admin);
  await finOK("intake", { operation: "post", batch_id: batch }, f.admin);
  printed = await finOK(
    "labels",
    { mode: "customer", batch_id: batch },
    f.admin,
  );
  expect(printed.items).toHaveLength(2);
  for (const label of printed.items) {
    expect(decode(label.barcode, BarcodeFormat.CODE_128)).toBe(label.uid);
    expect(decode(label.qr, BarcodeFormat.QR_CODE)).toBe(label.resolver_url);
    expect(label.resolver_url).toBe(
      process.env.DIDAR_PUBLIC_ORIGIN + "/i/" + label.uid,
    );
    expect(label.resolver_url).not.toContain("/products/");
    const found = await finOK(
      "inventory?search=" + label.uid,
      undefined,
      f.seller,
    );
    expect(found.items.map((i: any) => i.id)).toEqual([label.id]);
  }
});
test("public QR and legacy bookmarks redirect to canonical path without disclosing private item fields", async () => {
  for (const item of items) {
    const d = await link("uid", item.uid);
    expect(Object.keys(d).sort()).toEqual([
      "breadcrumbs",
      "canonical_path",
      "http",
      "id",
      "taxonomy_ready",
      "title",
    ]);
    expect(d.canonical_path).toBe(originalPath);
    const r = await fetch(web + "/i/" + item.uid, {
      redirect: "manual",
      headers: { "x-forwarded-host": "evil.invalid" },
    });
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe(originalPath);
    expect(r.headers.get("cache-control")).toBe("no-store");
  }
  const legacy = await fetch(web + "/products/" + f.pid, {
    redirect: "manual",
    headers: { "x-forwarded-host": "evil.invalid" },
  });
  expect(legacy.status).toBe(308);
  expect(new URL(legacy.headers.get("location")!, web).pathname).toBe(
    originalPath,
  );
  expect(new URL(legacy.headers.get("location")!, web).origin).toBe(web);
  const canonical = await fetch(web + originalPath);
  expect(canonical.status).toBe(200);
  expect(await canonical.text()).toContain('rel="canonical"');
});
test("category and product slug rename and reclassification keep old PDP URLs and every printed QR continuous", async () => {
  await manage({
    kind: "category",
    id: root,
    name: "دسته تازه",
    slug: tag + "-renamed",
  });
  await manage({
    kind: "product",
    id: f.pid,
    category_id: otherLeaf,
    slug: "new-gold",
  });
  const current = await link("id", f.pid);
  expect(current.breadcrumbs.map((b: any) => b.id)).toEqual([
    root,
    middle,
    otherLeaf,
  ]);
  expect(current.canonical_path).toBe(
    `/fa/products/${tag}-renamed/${tag}-category/${tag}-other/new-gold-${publicKey}`,
  );
  const old = await fetch(web + originalPath, { redirect: "manual" });
  expect(old.status).toBe(308);
  expect(new URL(old.headers.get("location")!, web).pathname).toBe(
    current.canonical_path,
  );
  const next = await finOK(
    "labels",
    { mode: "customer", batch_id: batch },
    f.admin,
  );
  for (const label of printed.items) {
    expect(next.items.find((i: any) => i.id === label.id).resolver_url).toBe(
      label.resolver_url,
    );
    expect(
      (
        await fetch(web + new URL(label.resolver_url).pathname, {
          redirect: "manual",
        })
      ).headers.get("location"),
    ).toBe(current.canonical_path);
  }
});
test("sold UID resolves a public master but exact-item stock and immutable financial sale history remain authoritative", async () => {
  const bought = await f.buy();
  const item = (
    await finDB.query("SELECT * FROM didar_inventory_item WHERE id=$1", [
      bought.item.id,
    ])
  ).rows[0];
  expect(item.status).toBe("sold");
  expect((await link("uid", item.uid)).id).toBe(f.pid);
  const p = (await finOK("catalog")).products.find((p: any) => p.id === f.pid);
  expect(p.offers.find((o: any) => o.id === item.offer_id).quantity).toBe(0);
  const snapshot = JSON.stringify(
    (
      await finDB.query("SELECT * FROM didar_fin_event WHERE id=$1", [
        bought.sale.id,
      ])
    ).rows[0],
  );
  await manage({ kind: "product", id: f.pid, slug: "after-sale" });
  expect(
    JSON.stringify(
      (
        await finDB.query("SELECT * FROM didar_fin_event WHERE id=$1", [
          bought.sale.id,
        ])
      ).rows[0],
    ),
  ).toBe(snapshot);
  expect(
    (
      await finDB.query("SELECT uid FROM didar_inventory_item WHERE id=$1", [
        item.id,
      ])
    ).rows[0].uid,
  ).toBe(item.uid);
});
test("unpublished, inactive, unknown and draft UID paths fail safely; publication restoration preserves labels", async () => {
  for (const state of [
    { published: false },
    { published: true, active: false },
    { active: true, approved: false },
  ]) {
    await manage({ kind: "product", id: f.pid, ...state });
    const r = await fetch(web + "/i/" + items[0].uid, { redirect: "manual" });
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain(f.sid);
    expect(
      (await finAPI("labels", { mode: "customer", batch_id: batch }, f.admin))
        .http,
    ).toBe(400);
  }
  await manage({
    kind: "product",
    id: f.pid,
    active: true,
    published: true,
    approved: true,
  });
  expect(
    (await fetch(web + "/i/" + items[0].uid, { redirect: "manual" })).status,
  ).toBe(307);
  for (const uid of ["UNKNOWN-UID", "x", "bad-uid", "%2Fbad"])
    expect(
      (await fetch(web + "/i/" + uid, { redirect: "manual" })).status,
    ).toBe(404);
});
test("repeat migration preserves exact UIDs, offers and immutable paid financial rows", async () => {
  const snapshot = async () =>
    JSON.stringify(
      (
        await finDB.query(
          "SELECT (SELECT jsonb_agg(i ORDER BY i.id) FROM didar_inventory_item i WHERE i.supplier_id=$1) items,(SELECT jsonb_agg(o ORDER BY o.id) FROM didar_offer o WHERE o.product_id=$2) offers,(SELECT jsonb_agg(e ORDER BY e.id) FROM didar_fin_event e WHERE e.supplier_id=$1) events",
          [f.sid, f.pid],
        )
      ).rows,
    );
  const before = await snapshot();
  for (let n = 0; n < 2; n++)
    await finDB.query(
      readFileSync("packages/api/src/didar/taxonomy-schema.sql", "utf8"),
    );
  expect(await snapshot()).toBe(before);
});

test("deeper canonical hierarchy uses every ancestor and product identity cannot be rewritten", async () => {
  const a = (
    await manage({ kind: "category", name: "سه سطح", slug: tag + "-deep" })
  ).id;
  const b = (
    await manage({
      kind: "category",
      name: "سطح دوم",
      slug: tag + "-level2",
      parent_id: a,
    })
  ).id;
  const c = (
    await manage({
      kind: "category",
      name: "سطح سوم",
      slug: tag + "-level3",
      parent_id: b,
    })
  ).id;
  await manage({ kind: "product", id: draft, category_id: c, published: true });
  const result = await link("id", draft);
  expect(result.breadcrumbs.map((n: any) => n.id)).toEqual([a, b, c]);
  expect(result.canonical_path).toBe(
    `/fa/products/${tag}-deep/${tag}-level2/${tag}-level3/product-${(await finDB.query("SELECT public_key FROM didar_product WHERE id=$1", [draft])).rows[0].public_key}`,
  );
  await expect(
    finDB.query("UPDATE didar_product SET id=$1 WHERE id=$2", [
      tag + "-replacement",
      draft,
    ]),
  ).rejects.toThrow("INVALID_PRODUCT_ID");
  await manage({ kind: "product", id: draft, published: false });
});
test("UID-only HID counts deduplicate the same untagged piece and never alter stock", async () => {
  const before = (
    await finDB.query(
      "SELECT id,status,uid FROM didar_inventory_item WHERE id=ANY($1::text[]) ORDER BY id",
      [items.map((i) => i.id)],
    )
  ).rows;
  const session = (
    await finOK(
      "rfid",
      { operation: "create_count", supplier_id: f.sid },
      f.admin,
    )
  ).id;
  for (let n = 0; n < 2; n++)
    await finOK(
      "rfid",
      { operation: "scan", session_id: session, value: items[0].uid },
      f.admin,
    );
  const counted = await finOK("rfid?id=" + session, undefined, f.admin);
  expect(counted.distinct_count).toBe(1);
  expect(counted.duplicate_reads).toBe(1);
  expect(
    (
      await finDB.query(
        "SELECT id,status,uid FROM didar_inventory_item WHERE id=ANY($1::text[]) ORDER BY id",
        [items.map((i) => i.id)],
      )
    ).rows,
  ).toEqual(before);
  await finOK(
    "rfid",
    { operation: "close_count", session_id: session },
    f.admin,
  );
});
test("long UID barcodes retain exact identity; draft/void pieces never resolve or generate a customer QR", async () => {
  const b = (
    await finOK(
      "intake",
      {
        operation: "create",
        supplier_id: f.sid,
        invoice_number: tag + "-drafts",
        reference_purity: 750,
      },
      f.admin,
    )
  ).id;
  const line = (
    await finOK(
      "intake",
      {
        operation: "line",
        making_mode: "percent",
        making_bps: 0,
        batch_id: b,
        product_id: f.pid,
        description: "Unaccepted pieces",
        quantity: 2,
        total_weight_mg: 20,
        purity: 750,
      },
      f.admin,
    )
  ).id;
  for (const uid of [
    "LONG-" +
      crypto.randomUUID().replaceAll("-", "").toUpperCase() +
      "X".repeat(43),
    "VOID-" + crypto.randomUUID().toUpperCase(),
  ])
    await finOK(
      "intake",
      { operation: "item", batch_id: b, line_id: line, weight_mg: 10, uid },
      f.admin,
    );
  const units = (await finOK("intake?id=" + b, undefined, f.admin)).items;
  const long = units.find((i: any) => i.uid.startsWith("LONG-")),
    voided = units.find((i: any) => i.uid.startsWith("VOID-"));
  const label = (
    await finOK(
      "labels",
      {
        mode: "warehouse",
        item_ids: [long.id],
        origin: "https://evil.invalid",
      },
      f.admin,
    )
  ).items[0];
  expect(long.uid).toHaveLength(80);
  expect(decode(label.barcode, BarcodeFormat.CODE_128)).toBe(long.uid);
  expect(label.barcode_width_mm).toBeGreaterThan(190);
  await finOK(
    "intake",
    { operation: "void_item", batch_id: b, line_id: line, item_id: voided.id },
    f.admin,
  );
  const remaining = await finOK(
    "labels",
    { mode: "warehouse", batch_id: b },
    f.admin,
  );
  expect(remaining.items.map((i: any) => i.id)).toEqual([long.id]);
  expect(
    (
      await finAPI(
        "labels",
        { mode: "warehouse", item_ids: [voided.id] },
        f.admin,
      )
    ).http,
  ).toBe(400);
  expect(
    (await finAPI("labels", { mode: "customer", batch_id: b }, f.admin)).http,
  ).toBe(400);
  for (const unit of units)
    expect((await finAPI("product-link?uid=" + unit.uid)).http).toBe(404);
});

test("rank, active ancestry and stable machine codes are enforced in API and PostgreSQL", async () => {
  for (const node of [root, middle, otherLeaf]) {
    const row = (
      await finDB.query("SELECT * FROM didar_category WHERE id=$1", [node])
    ).rows[0];
    expect(
      (
        await finAPI(
          "manage",
          {
            kind: "category",
            id: node,
            name: row.name,
            slug: row.slug,
            parent_id: row.parent_id,
            active: false,
          },
          f.admin,
        )
      ).http,
    ).toBe(400);
    await expect(
      finDB.query("UPDATE didar_category SET active=false WHERE id=$1", [node]),
    ).rejects.toThrow("INVALID_PUBLICATION_TAXONOMY");
    expect(
      (
        await finAPI(
          "manage",
          {
            kind: "category",
            id: node,
            name: row.name,
            slug: row.slug,
            parent_id: row.parent_id,
            code: "changed.code",
          },
          f.admin,
        )
      ).http,
    ).toBe(400);
  }
  expect(
    (
      await finAPI(
        "manage",
        {
          kind: "category",
          name: "bad family child",
          slug: tag + "-bad-rank",
          parent_id: root,
          taxonomy_kind: "subcategory",
        },
        f.admin,
      )
    ).http,
  ).toBe(400);
  expect(
    (
      await finAPI(
        "manage",
        {
          kind: "category",
          name: "too deep",
          slug: tag + "-too-deep",
          parent_id: otherLeaf,
          taxonomy_kind: "subcategory",
        },
        f.admin,
      )
    ).http,
  ).toBe(400);
  const family = (
    await manage({
      kind: "category",
      name: "Inactive family",
      slug: tag + "-inactive",
      active: false,
    })
  ).id;
  const cat = (
    await manage({
      kind: "category",
      name: "Inactive category",
      slug: tag + "-inactive-category",
      parent_id: family,
    })
  ).id;
  const sub = (
    await manage({
      kind: "category",
      name: "Inactive subcategory",
      slug: tag + "-inactive-sub",
      parent_id: cat,
    })
  ).id;
  expect(
    (
      await finAPI(
        "manage",
        { kind: "product", id: draft, category_id: sub, published: true },
        f.admin,
      )
    ).http,
  ).toBe(400);
});
