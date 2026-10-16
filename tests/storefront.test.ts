import { test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { financeFixture, finDB as db, finOK as ok } from "./financial-helpers";
const extraProducts: string[] = [];
let a: any,
  b: any,
  ctx = "",
  offerA = "",
  offerB = "",
  item: any,
  handle = "store-" + crypto.randomUUID().slice(0, 8);
async function call(
  action: string,
  body?: any,
  token = "",
  context = "",
  visit = "",
) {
  const r = await fetch(
    (process.env.TEST_API_URL || "http://localhost:9000") + "/didar/" + action,
    {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token,
        ...(context ? { "x-didar-context": context } : {}),
        ...(visit ? { "x-didar-visit": visit } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  return { http: r.status, ...(await r.json()) };
}
const save = (f: any, h: string, visibility: string, extra: any = {}) =>
  ok(
    "storefront",
    {
      kind: "save",
      supplier_id: f.sid,
      handle: h,
      name: h,
      intro: "ویترین آزمایشی",
      visibility,
      published: true,
      approved: true,
      ...extra,
    },
    a.admin,
  );
beforeAll(async () => {
  a = await financeFixture();
  b = await financeFixture();
  for (const [f, pid] of [
    [a, a.pid],
    [b, b.pid],
  ]) {
    const batch = (
      await ok(
        "intake",
        {
          operation: "create",
          supplier_id: f.sid,
          invoice_number: crypto.randomUUID(),
          reference_purity: 750,
        },
        a.admin,
      )
    ).id;
    const line = (
      await ok(
        "intake",
        {
          operation: "line",
          batch_id: batch,
          product_id: pid,
          description: "scoped UID",
          quantity: 2,
          total_weight_mg: 200000,
          purity: 750,
          making_mode: "percent",
          making_bps: 1200,
        },
        a.admin,
      )
    ).id;
    for (let i = 0; i < 2; i++)
      await ok(
        "intake",
        {
          operation: "item",
          batch_id: batch,
          line_id: line,
          weight_mg: 100000,
        },
        a.admin,
      );
    await ok("intake", { operation: "verify", batch_id: batch }, a.admin);
    await ok("intake", { operation: "post", batch_id: batch }, a.admin);
    const items = (await ok("intake?id=" + batch, undefined, a.admin)).items;
    if (f === a) {
      offerA = items[0].offer_id;
      item = items[0];
    } else offerB = items[0].offer_id;
  }
  await save(a, handle, "UNLISTED_LINK");
  await save(b, handle + "-b", "INVITE_ONLY");
  ctx = (await call("storefront", { kind: "enter", handle })).context_token;
  expect(ctx).toMatch(/^[a-f0-9]{64}$/);
});
afterAll(async () => {
  if (extraProducts.length)
    await db.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=ANY($1::text[])",
      [extraProducts],
    );
  if (a)
    await db.query(
      "UPDATE didar_supplier SET active=false WHERE id=ANY($1::text[])",
      [[a.sid, b.sid]],
    );
});
test("merchant context filters global/scoped catalogs, facets, private offers, PDP/UID and rejects direct quote smuggling", async () => {
  const global = await ok("catalog");
  expect(
    global.products.some((p: any) => p.id === a.pid || p.id === b.pid),
  ).toBe(false);
  const own = await call("catalog?page=1&limit=48", undefined, "", ctx);
  expect(own.http).toBe(200);
  expect(own.total).toBe(1);
  expect(own.products[0].id).toBe(a.pid);
  expect(
    own.products[0].offers.every((o: any) => o.supplier_id === a.sid),
  ).toBe(true);
  expect(own.products[0].canonical_path).toContain(
    "/m/" + handle + "/products/",
  );
  expect(
    (await call("quote", { lines: [{ offer_id: offerA, quantity: 1 }] })).http,
  ).toBe(409);
  expect(
    (
      await call(
        "quote",
        { lines: [{ offer_id: offerB, quantity: 1 }] },
        "",
        ctx,
      )
    ).http,
  ).toBe(409);
  expect(
    (await call("product-link?id=" + b.pid, undefined, "", ctx)).http,
  ).toBe(404);
  expect((await call("product-link?uid=" + item.uid)).http).toBe(404);
  expect((await call("catalog", undefined, "", "0".repeat(64))).http).toBe(404);
});
test("a shared public Master never exposes its unlisted/invite-only rival Offers in global or merchant context", async () => {
  const visible = (
    await ok(
      "manage",
      {
        kind: "new_offer",
        supplier_id: "s1",
        product_id: a.pid,
        weight_mg: 1234,
        quantity: 2,
        labor_irr: 0,
        margin_bps: 0,
      },
      a.admin,
    )
  ).id;
  const hidden = (
    await ok(
      "manage",
      {
        kind: "new_offer",
        supplier_id: b.sid,
        product_id: a.pid,
        weight_mg: 2345,
        quantity: 2,
        labor_irr: 0,
        margin_bps: 0,
      },
      a.admin,
    )
  ).id;
  try {
    const global = (await ok("catalog")).products.find(
      (p: any) => p.id === a.pid,
    );
    expect(global.offers.map((o: any) => o.id)).toEqual([visible]);
    const own = (await call("catalog", undefined, "", ctx)).products.find(
      (p: any) => p.id === a.pid,
    );
    expect(own.offers.every((o: any) => o.supplier_id === a.sid)).toBe(true);
    expect(
      (
        await call(
          "quote",
          { lines: [{ offer_id: hidden, quantity: 1 }] },
          "",
          ctx,
        )
      ).http,
    ).toBe(409);
    expect((await call("product-link?uid=" + item.uid)).http).toBe(404);
  } finally {
    await db.query(
      "UPDATE didar_offer SET active=false WHERE id=ANY($1::text[])",
      [[visible, hidden]],
    );
  }
});
test("invite-only requires central customer identity, bound grant and immediate revocation", async () => {
  expect(
    (await call("storefront", { kind: "enter", handle: handle + "-b" })).http,
  ).toBe(401);
  expect(
    (
      await call(
        "storefront",
        { kind: "enter", handle: handle + "-b" },
        a.buyer,
      )
    ).http,
  ).toBe(403);
  const email = (
    await db.query("SELECT email FROM didar_user WHERE id=$1", [a.buyerId])
  ).rows[0].email;
  await ok(
    "storefront",
    { kind: "invite", supplier_id: b.sid, email, days: 1, active: true },
    b.seller,
  );
  const entered = await call(
    "storefront",
    { kind: "enter", handle: handle + "-b" },
    a.buyer,
  );
  expect(entered.http).toBe(200);
  expect(
    (await call("catalog", undefined, "", entered.context_token)).http,
  ).toBe(401);
  expect(
    (await call("catalog", undefined, a.buyer, entered.context_token))
      .products[0].id,
  ).toBe(b.pid);
  await ok(
    "storefront",
    { kind: "invite", supplier_id: b.sid, email, days: 1, active: false },
    b.seller,
  );
  expect(
    (await call("catalog", undefined, a.buyer, entered.context_token)).http,
  ).toBe(403);
});
test("cross-tenant management and stable handle guard, optimistic revisions and default-deny staff", async () => {
  expect(
    (
      await call(
        "storefront",
        { kind: "save", supplier_id: b.sid, handle: handle + "-b" },
        a.seller,
      )
    ).http,
  ).toBe(403);
  expect(
    (
      await call(
        "storefront",
        { kind: "save", supplier_id: a.sid, handle },
        a.buyer,
      )
    ).http,
  ).toBe(403);
  const old = (
    await db.query("SELECT * FROM didar_storefront WHERE supplier_id=$1", [
      a.sid,
    ])
  ).rows[0];
  expect(
    (
      await call(
        "storefront",
        {
          kind: "save",
          supplier_id: a.sid,
          handle,
          name: handle,
          visibility: "PUBLIC_MARKETPLACE",
          published: true,
          version: 999,
        },
        a.seller,
      )
    ).http,
  ).toBe(409);
  await expect(
    db.query("UPDATE didar_storefront SET handle=$1 WHERE supplier_id=$2", [
      handle + "-changed",
      a.sid,
    ]),
  ).rejects.toThrow("CONFLICT_STABLE_HANDLE");
  await save(a, handle, "UNLISTED_LINK", { version: old.version });
  const fresh = (
    await ok("manage", { kind: "supplier", name: handle + " race" }, a.admin)
  ).id;
  try {
    const input = {
      kind: "save",
      supplier_id: fresh,
      handle: handle + "-race",
      name: "concurrent store",
      visibility: "PUBLIC_MARKETPLACE",
      published: false,
      approved: false,
    };
    const results = await Promise.all([
      call("storefront", input, a.admin),
      call("storefront", input, a.admin),
    ]);
    expect(results.map((r) => r.http).sort()).toEqual([200, 409]);
  } finally {
    await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [
      fresh,
    ]);
  }
});
test("explicit membership grants one capability without global supplier or finance access, and revokes immediately", async () => {
  const email = (
    await db.query("SELECT email FROM didar_user WHERE id=$1", [b.buyerId])
  ).rows[0].email;
  await ok(
    "storefront",
    {
      kind: "member",
      supplier_id: a.sid,
      email,
      permission: "STOREFRONT",
      active: true,
    },
    a.admin,
  );
  const scoped = await call("storefront", undefined, b.buyer);
  expect(scoped.stores.map((s: any) => s.supplier_id)).toEqual([a.sid]);
  expect(
    (
      await call(
        "storefront",
        { kind: "invite", supplier_id: b.sid, email, days: 1, active: true },
        b.buyer,
      )
    ).http,
  ).toBe(403);
  expect((await call("finance", undefined, b.buyer)).http).toBe(403);
  expect(
    (await call("manage", { kind: "new_offer", supplier_id: a.sid }, b.buyer))
      .http,
  ).toBe(403);
  await ok(
    "storefront",
    {
      kind: "member",
      supplier_id: a.sid,
      email,
      permission: "STOREFRONT",
      active: false,
    },
    a.admin,
  );
  expect(
    (
      await call(
        "storefront",
        { kind: "invite", supplier_id: a.sid, email, days: 1, active: true },
        b.buyer,
      )
    ).http,
  ).toBe(403);
});
test("sandbox checkout preserves exact UID, supplier origin, frozen pricing, balanced journals and idempotent replay", async () => {
  const quote = await call(
    "quote",
    { lines: [{ offer_id: offerA, quantity: 1 }] },
    a.buyer,
    ctx,
  );
  expect(quote.http).toBe(200);
  const body = {
    idempotency_key: crypto.randomUUID(),
    payment_method: quote.payment_method,
    rate_version: quote.rate_version,
    quote_key: quote.quote_key,
    lines: quote.lines.map((l: any) => ({
      offer_id: l.offer_id,
      version: l.version,
      quantity: l.quantity,
      quote_key: l.breakdown.quote_key,
    })),
    address: {
      name: "QA",
      phone: "09123456789",
      city: "تهران",
      address: "نشانی آزمایشی",
      postal_code: "1234567890",
    },
  };
  const order = (await call("checkout", body, a.buyer, ctx)).order;
  expect(order.origin_supplier_id).toBe(a.sid);
  expect(order.storefront_snapshot.handle).toBe(handle);
  expect((await call("checkout", body, a.buyer, ctx)).order.id).toBe(order.id);
  expect((await call("checkout", body, a.buyer)).http).toBe(409);
  const paid = await call(
    "payment",
    { order_id: order.id, outcome: "success" },
    a.buyer,
    ctx,
  );
  expect(paid.order.status).toBe("paid");
  const reservations = (
    await db.query(
      "SELECT i.uid FROM didar_item_reservation r JOIN didar_inventory_item i ON i.id=r.item_id JOIN didar_order_line l ON l.id=r.order_line_id WHERE l.order_id=$1",
      [order.id],
    )
  ).rows;
  expect(reservations.length).toBe(1);
  await expect(
    db.query("UPDATE didar_order SET origin_supplier_id=$1 WHERE id=$2", [
      b.sid,
      order.id,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_ORIGIN");
  expect(
    (await call("orders", undefined, a.buyer, ctx)).orders.every(
      (o: any) => o.origin_supplier_id === a.sid,
    ),
  ).toBe(true);
});
test("curated sharing references ten own masters, rejects rival products, freezes valid attribution and scopes metrics", async () => {
  const ids = [a.pid];
  for (let i = 0; i < 9; i++) {
    const p = (
      await ok(
        "manage",
        {
          kind: "product",
          title: handle + " curated " + i,
          category_id: "ring",
          purity: 750,
          published: true,
        },
        a.admin,
      )
    ).id;
    await ok(
      "manage",
      {
        kind: "new_offer",
        product_id: p,
        supplier_id: a.sid,
        weight_mg: 1000 + i,
        quantity: 1,
        labor_irr: 0,
        margin_bps: 0,
      },
      a.admin,
    );
    extraProducts.push(p);
    ids.push(p);
  }
  const baseline = (await db.query("SELECT count(*)::int n FROM didar_product"))
    .rows[0].n;
  const body = {
    kind: "save",
    supplier_id: a.sid,
    title: "منتخب ویژه",
    intro: "ده محصول خود فروشگاه",
    published: true,
    product_ids: ids,
  };
  expect(
    (await call("sharing", { ...body, product_ids: ids.slice(0, 9) }, a.seller))
      .http,
  ).toBe(400);
  expect(
    (
      await call(
        "sharing",
        { ...body, product_ids: [...ids.slice(0, 9), b.pid] },
        a.seller,
      )
    ).http,
  ).toBe(400);
  const saved = await call("sharing", body, a.seller);
  expect(saved.http).toBe(200);
  expect(
    (await db.query("SELECT count(*)::int n FROM didar_product")).rows[0].n,
  ).toBe(baseline);
  const page = await call("sharing?slug=" + saved.slug, undefined, "", ctx);
  expect(page.page.product_ids).toEqual(ids);
  expect((await call("sharing?slug=" + saved.slug)).http).toBe(404);
  expect(
    (await call("sharing?supplier_id=" + a.sid, undefined, b.seller)).http,
  ).toBe(403);
  const visit = await call(
    "sharing",
    { kind: "visit", slug: saved.slug },
    "",
    ctx,
  );
  expect(visit.visit_token).toMatch(/^[a-f0-9]{64}$/);
  const again = await call(
    "sharing",
    { kind: "visit", slug: saved.slug },
    "",
    ctx,
    visit.visit_token,
  );
  expect(again.visit_token).toBeUndefined();
  const quote = await call(
    "quote",
    { lines: [{ offer_id: offerA, quantity: 1 }] },
    a.buyer,
    ctx,
  );
  const order = (
    await call(
      "checkout",
      {
        idempotency_key: crypto.randomUUID(),
        rate_version: quote.rate_version,
        quote_key: quote.quote_key,
        lines: quote.lines.map((l: any) => ({
          offer_id: l.offer_id,
          quantity: l.quantity,
          version: l.version,
          quote_key: l.breakdown.quote_key,
        })),
        address: {
          name: "QA",
          phone: "09123456789",
          city: "تهران",
          address: "نشانی",
          postal_code: "1234567890",
        },
        share_page_id: "forged",
      },
      a.buyer,
      ctx,
      visit.visit_token,
    )
  ).order;
  expect(order.share_page_id).toBe(saved.id);
  await call(
    "payment",
    { order_id: order.id, outcome: "success" },
    a.buyer,
    ctx,
  );
  const metrics = (
    await call("sharing?supplier_id=" + a.sid, undefined, a.seller)
  ).pages[0];
  expect(metrics.visits).toBe(1);
  expect(metrics.paid_orders).toBe(1);
  expect(BigInt(metrics.gross_paid_irr)).toBe(BigInt(order.total_irr));
  expect(
    (await call("sharing?slug=" + saved.slug, undefined, "", ctx)).page
      .product_ids.length,
  ).toBe(9);
  const single = await call(
    "sharing",
    { ...body, page_kind: "PRODUCT", product_ids: [ids[1]] },
    a.seller,
  );
  expect(single.http).toBe(200);
  expect(
    (await call("sharing?slug=" + single.slug, undefined, "", ctx)).page
      .product_ids,
  ).toEqual([ids[1]]);
  const reversed = [...ids].reverse();
  // One source UID is now sold out: retain references when pausing, rather than requiring fresh stock.
  const old = (
    await db.query("SELECT version FROM didar_share_page WHERE id=$1", [
      saved.id,
    ])
  ).rows[0];
  const edit = await call(
    "sharing",
    {
      ...body,
      id: saved.id,
      version: old.version,
      product_ids: reversed,
      published: false,
    },
    a.seller,
  );
  expect(edit.http).toBe(200);
  expect(
    (await call("sharing?slug=" + saved.slug, undefined, "", ctx)).http,
  ).toBe(404);
  await expect(
    db.query("UPDATE didar_order SET share_page_id=NULL WHERE id=$1", [
      order.id,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_ATTRIBUTION");
});
test("migration replay preserves populated commerce and origin history", async () => {
  const sql = readFileSync(
    "packages/api/src/didar/storefront-schema.sql",
    "utf8",
  );
  const before = (
    await db.query(
      "SELECT md5(row_to_json(o)::text) fingerprint FROM didar_order o ORDER BY id",
    )
  ).rows;
  await db.query(sql);
  await db.query(sql);
  const shareSQL = readFileSync(
    "packages/api/src/didar/share-schema.sql",
    "utf8",
  );
  await db.query(shareSQL);
  await db.query(shareSQL);
  expect(
    (
      await db.query(
        "SELECT md5(row_to_json(o)::text) fingerprint FROM didar_order o ORDER BY id",
      )
    ).rows,
  ).toEqual(before);
});
