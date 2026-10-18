import { beforeAll, afterAll, test, expect } from "bun:test";
import { financeFixture } from "./financial-helpers";
import { Pool } from "../packages/api/node_modules/pg";

// Independently authored regression: execute only against disposable loopback QA.
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  allowExitOnIdle: true,
});
const origin = process.env.TEST_API_URL!;
let admin = "",
  vendor = "",
  selected = "",
  canonicalAdmin = "",
  nativePrivate = "",
  unlinked = "",
  publishable = "",
  nativePublic = "",
  orphan = "";
async function request(
  path: string,
  token = "",
  body?: unknown,
  seller?: string,
) {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
      ...(seller ? { "x-seller-id": seller } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
async function ok(path: string, token = "", body?: unknown, seller?: string) {
  const r = await request(path, token, body, seller);
  expect(r.status, path + " " + JSON.stringify(r.data)).toBe(200);
  return r.data;
}
beforeAll(async () => {
  if (
    process.env.DIDAR_DISPOSABLE_QA !== "true" ||
    process.env.DIDAR_ENVIRONMENT !== "local" ||
    !/^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:\d+\/didar_qa$/.test(
      process.env.DATABASE_URL || "",
    )
  )
    throw Error("Disposable loopback QA required");
  admin = (
    await ok("/auth/user/emailpass", "", {
      email: "native-admin@didar.test",
      password: "DidarNative2026!",
    })
  ).token;
  canonicalAdmin = (
    await ok("/didar/login", "", {
      email: "admin@didar.test",
      password: "DidarDemo2026!",
    })
  ).token;
  await ok("/admin/didar/connect", admin, { didar_token: canonicalAdmin });
  vendor = (
    await ok("/auth/member/emailpass", "", {
      email: "native-supplier@didar.test",
      password: "DidarNative2026!",
    })
  ).token;
  const proof = (
    await ok("/didar/login", "", {
      email: "supplier@didar.test",
      password: "DidarDemo2026!",
    })
  ).token;
  selected = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1' AND active",
    )
  ).rows[0].seller_id;
  await ok("/vendor/didar/connect", vendor, { didar_token: proof }, selected);
  const f = await financeFixture("MIXED", canonicalAdmin);
  const privateMaster = { id: f.pid };
  await ok("/admin/didar/storefront", admin, {
    kind: "save",
    supplier_id: f.sid,
    handle: "independent-private-" + crypto.randomUUID().slice(0, 12),
    name: "Independent private fixture",
    visibility: "UNLISTED_LINK",
    published: true,
    approved: true,
  });
  const batch = (
    await ok("/admin/didar/intake", admin, {
      operation: "create",
      supplier_id: f.sid,
      invoice_number: crypto.randomUUID(),
      reference_purity: 750,
    })
  ).id;
  const line = (
    await ok("/admin/didar/intake", admin, {
      operation: "line",
      batch_id: batch,
      product_id: f.pid,
      description: "Independent private exact unit",
      quantity: 1,
      total_weight_mg: 100000,
      purity: 750,
      making_mode: "percent",
      making_bps: 1200,
    })
  ).id;
  await ok("/admin/didar/intake", admin, {
    operation: "item",
    batch_id: batch,
    line_id: line,
    weight_mg: 100000,
  });
  await ok("/admin/didar/intake", admin, {
    operation: "verify",
    batch_id: batch,
  });
  await ok("/admin/didar/intake", admin, {
    operation: "post",
    batch_id: batch,
  });
  const publicMaster = await ok("/admin/didar/manage", admin, {
    kind: "product",
    title: "Independent allowed public master " + crypto.randomUUID(),
    category_id: "ring",
    category: "QA",
    purity: 750,
    published: true,
  });
  nativePublic = (
    await db.query("SELECT native_id FROM didar_product WHERE id=$1", [
      publicMaster.id,
    ])
  ).rows[0].native_id;
  nativePrivate = (
    await db.query("SELECT native_id FROM didar_product WHERE id=$1", [
      privateMaster.id,
    ])
  ).rows[0].native_id;
  expect(
    (
      await db.query(
        "SELECT didar_visible_product(id,NULL) visible FROM didar_product WHERE id=$1",
        [privateMaster.id],
      )
    ).rows[0].visible,
  ).toBe(false);
  const native = await request("/admin/products", admin, {
    title: "Independent unmapped native master " + crypto.randomUUID(),
    handle: "authorization-review-" + crypto.randomUUID(),
    status: "published",
    variants: [{ title: "Private native variant" }],
  });
  expect([200, 201], JSON.stringify(native.data)).toContain(native.status);
  unlinked = native.data.product.id;
  const orphanFixture = await request("/admin/products", admin, {
    title: "Independent tagged orphan " + crypto.randomUUID(),
    handle: "authorization-orphan-" + crypto.randomUUID(),
    status: "published",
    metadata: { didar: true },
    variants: [{ title: "Unreconciled native variant" }],
  });
  expect([200, 201], JSON.stringify(orphanFixture.data)).toContain(
    orphanFixture.status,
  );
  orphan = orphanFixture.data.product.id;
  const key = await request("/admin/api-keys", admin, {
    title: "Independent authorization QA",
    type: "publishable",
  });
  expect([200, 201], JSON.stringify(key.data)).toContain(key.status);
  publishable = key.data.api_key.token;
}, 60000);
afterAll(async () => {
  if (canonicalAdmin)
    await db.query(
      "DELETE FROM didar_native_actor WHERE user_id IN ('demo-admin','demo-supplier')",
    );
  await db.end();
});
for (const kind of ["canonical-private", "native-unmapped"])
  test(
    "separate Vendor variant list/count must preserve product visibility: " +
      kind,
    async () => {
      const id = kind === "canonical-private" ? nativePrivate : unlinked;
      const productList = await ok(
        "/vendor/products?id=" + encodeURIComponent(id) + "&limit=1",
        vendor,
        undefined,
        selected,
      );
      expect(productList.products).toEqual([]);
      expect(productList.count).toBe(0);
      expect(
        (await request("/vendor/products/" + id, vendor, undefined, selected))
          .status,
      ).toBe(404);
      const variants = await ok(
        "/vendor/product-variants?product_id=" +
          encodeURIComponent(id) +
          "&limit=1",
        vendor,
        undefined,
        selected,
      );
      console.log(
        "INDEPENDENT_VARIANT_VISIBILITY",
        JSON.stringify({
          kind,
          products_count: productList.count,
          variants_count: variants.count,
          returned_product_ids: variants.variants.map((v: any) => v.product_id),
        }),
      );
      expect(variants.variants).toEqual([]);
      expect(variants.count).toBe(0);
      for (const extra of [
        "&offset=1",
        "&fields=id,product_id,product.title",
        "&$or[0][product_id]=" + encodeURIComponent(id),
      ]) {
        const filtered = await ok(
          "/vendor/product-variants?product_id=" +
            encodeURIComponent(id) +
            "&limit=1" +
            extra,
          vendor,
          undefined,
          selected,
        );
        expect(filtered.variants).toEqual([]);
        expect(filtered.count).toBe(0);
      }
    },
  );
test("deactivated native Member cannot retain generic or DIDAR commerce through an existing bearer", async () => {
  const actor = (
    await db.query(
      "SELECT id FROM member WHERE email='native-supplier@didar.test' AND deleted_at IS NULL",
    )
  ).rows[0].id;
  const prior = (
    await db.query("SELECT is_active FROM member WHERE id=$1", [actor])
  ).rows[0].is_active;
  try {
    await db.query("UPDATE member SET is_active=false WHERE id=$1", [actor]);
    const outcomes = [];
    for (const path of [
      "/vendor/products",
      "/vendor/offers",
      "/vendor/orders",
      "/vendor/didar/manage",
      "/vendor/didar/history",
    ])
      outcomes.push({
        path,
        status: (await request(path, vendor, undefined, selected)).status,
      });
    console.log("INDEPENDENT_DEACTIVATED_MEMBER", JSON.stringify(outcomes));
    for (const outcome of outcomes)
      expect(outcome.status, outcome.path).toBe(403);
  } finally {
    await db.query("UPDATE member SET is_active=$2 WHERE id=$1", [
      actor,
      prior,
    ]);
  }
  expect(
    (await request("/vendor/products", vendor, undefined, selected)).status,
  ).toBe(200);
  expect(
    (await request("/vendor/didar/manage", vendor, undefined, selected)).status,
  ).toBe(200);
});

test("public native Store API cannot disclose a DIDAR-private master through its published mirror", async () => {
  const outcomes = [];
  for (const path of [
    "/store/products?id=" + encodeURIComponent(nativePrivate) + "&limit=1",
    "/store/products/" + nativePrivate,
  ]) {
    const response = await fetch(origin + path, {
      headers: { "x-publishable-api-key": publishable },
    });
    const data = await response.json();
    outcomes.push({
      path,
      status: response.status,
      count: data.count,
      product_ids: data.products?.map((p: any) => p.id),
      detail_id: data.product?.id,
    });
  }
  console.log("INDEPENDENT_PUBLIC_MIRROR", JSON.stringify(outcomes));
  expect(outcomes[0].status).toBe(200);
  expect(outcomes[0].count).toBe(0);
  expect(outcomes[1].status).toBe(404);
});
test("failed canonical edit must compensate an unapproved native mirror back to draft", async () => {
  const created = await ok("/admin/didar/manage", admin, {
    kind: "product",
    title: "Unapproved rollback " + crypto.randomUUID(),
    category_id: "ring",
    category: "QA",
    purity: 750,
    description: "Unapproved original",
    published: true,
    approved: false,
  });
  expect(created.id).toMatch(/^[a-f0-9-]{36}$/);
  const row = (
    await db.query(
      "SELECT native_id,md5(row_to_json(p)::text) fingerprint FROM didar_product p WHERE id=$1",
      [created.id],
    )
  ).rows[0];
  const before = await ok("/admin/products/" + row.native_id, admin);
  expect(before.product.status).toBe("draft");
  // This persistent trigger affects only the unique fixture ID in the disposable QA database; finally removes it.
  const suffix = created.id.replaceAll("-", "");
  const functionName = "qa_auth_fail_" + suffix,
    triggerName = "qa_auth_fail_" + suffix;
  try {
    await db.query(
      `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INDEPENDENT_QA_CANONICAL_WRITE_FAILURE'; END $$`,
    );
    await db.query(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT OR UPDATE ON didar_product FOR EACH ROW WHEN (NEW.id='${created.id}') EXECUTE FUNCTION ${functionName}()`,
    );
    const edit = await request("/admin/didar/manage", admin, {
      kind: "product",
      id: created.id,
      title: "Failed edit should be rolled back",
    });
    expect(edit.status).toBeGreaterThanOrEqual(400);
    const after = await ok("/admin/products/" + row.native_id, admin);
    const canonical = (
      await db.query(
        "SELECT md5(row_to_json(p)::text) fingerprint FROM didar_product p WHERE id=$1",
        [created.id],
      )
    ).rows[0];
    console.log(
      "INDEPENDENT_COMPENSATION",
      JSON.stringify({
        edit_status: edit.status,
        before_native_status: before.product.status,
        after_native_status: after.product.status,
        canonical_unchanged: canonical.fingerprint === row.fingerprint,
      }),
    );
    expect(canonical.fingerprint).toBe(row.fingerprint);
    expect(after.product.title).toBe(before.product.title);
    expect(after.product.status).toBe("draft");
  } finally {
    await db.query(`DROP TRIGGER IF EXISTS ${triggerName} ON didar_product`);
    await db.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
  }
});

test("authorized public native variants retain original list/count/pagination behavior", async () => {
  const first = await ok(
    "/vendor/product-variants?product_id=" +
      encodeURIComponent(nativePublic) +
      "&limit=1",
    vendor,
    undefined,
    selected,
  );
  expect(first.count).toBe(1);
  expect(first.limit).toBe(1);
  expect(first.offset).toBe(0);
  expect(first.variants.map((v: any) => v.product_id)).toEqual([nativePublic]);
  const next = await ok(
    "/vendor/product-variants?product_id=" +
      encodeURIComponent(nativePublic) +
      "&limit=1&offset=1",
    vendor,
    undefined,
    selected,
  );
  expect(next.count).toBe(1);
  expect(next.variants).toEqual([]);
});

test("native Store keeps eligible public and untagged native-only products visible while tagged orphans stay hidden", async () => {
  for (const id of [nativePublic, unlinked, orphan]) {
    const expectedVisible = id !== orphan;
    const paths = [
      "/store/products?id=" + encodeURIComponent(id) + "&limit=1",
      "/store/products/" + id,
    ];
    const responses = [];
    for (const path of paths) {
      const response = await fetch(origin + path, {
        headers: { "x-publishable-api-key": publishable },
      });
      responses.push({ status: response.status, data: await response.json() });
    }
    expect(responses[0].status).toBe(200);
    expect(responses[0].data.count).toBe(expectedVisible ? 1 : 0);
    expect(responses[0].data.products.map((p: any) => p.id)).toEqual(
      expectedVisible ? [id] : [],
    );
    expect(responses[1].status).toBe(expectedVisible ? 200 : 404);
    if (expectedVisible) expect(responses[1].data.product.id).toBe(id);
  }
  for (const suffix of [
    "&offset=1",
    "&fields=id,title",
    "&$or[0][id]=" + encodeURIComponent(nativePrivate),
  ]) {
    const response = await fetch(
      origin +
        "/store/products?id=" +
        encodeURIComponent(nativePrivate) +
        "&limit=1" +
        suffix,
      { headers: { "x-publishable-api-key": publishable } },
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.count).toBe(0);
    expect(data.products).toEqual([]);
  }
});
