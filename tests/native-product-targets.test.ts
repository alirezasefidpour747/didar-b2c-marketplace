import { test, expect, afterAll } from "bun:test";
import { Pool } from "../packages/api/node_modules/pg";

// Destructive fixture cleanup is limited to the disposable local QA database.
if (process.env.DIDAR_DISPOSABLE_QA !== "true")
  throw Error("Native target regressions require owned disposable QA");
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const origin = process.env.TEST_API_URL || "http://127.0.0.1:9000";
let token: string, parent: any, linked: any;
async function request(path: string, method = "GET", body?: any, auth = token) {
  return fetch(origin + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: "Bearer " + auth } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function ok(path: string, method = "GET", body?: any) {
  const r = await request(path, method, body);
  expect(r.status, await r.clone().text()).toBe(200);
  return r.json();
}
afterAll(async () => {
  if (parent) await request("/admin/products/" + parent.id, "DELETE");
  // Return the shared disposable fixture to the unconnected state used by the
  // following real browser dual-proof journey; touch only this QA actor/link.
  await db.query(
    `DELETE FROM didar_native_actor WHERE actor_type='user' AND user_id='demo-admin'
     AND actor_id IN (SELECT id FROM "user" WHERE email=$1 AND deleted_at IS NULL)`,
    ["native-admin@didar.test"],
  );
  await db.end();
});
test("real native target setup retains DIDAR projections and ordinary native CRUD", async () => {
  const r = await request(
    "/auth/user/emailpass",
    "POST",
    {
      email: "native-admin@didar.test",
      password: "DidarNative2026!",
    },
    "",
  );
  expect(r.status).toBe(200);
  token = (await r.json()).token;
  // Other suites deliberately remove this bridge. Establish this suite's own
  // authorization through the existing dual-proof API, never by bypassing RBAC.
  const proof = await ok("/didar/login", "POST", {
    email: "admin@didar.test",
    password: "DidarDemo2026!",
  });
  await ok("/admin/didar/connect", "POST", { didar_token: proof.token });
  const me = await ok("/admin/users/me?fields=+permissions");
  expect(["edit", "manage"]).toContain(me.user.permissions.products);
  parent = (
    await ok("/admin/products", "POST", {
      title: "QA native target regression",
      status: "draft",
      variants: [{ title: "QA native variant" }],
    })
  ).product;
  linked = (
    await db.query(
      "SELECT v.id variant_id,d.native_id FROM didar_product d JOIN product_variant v ON v.product_id=d.native_id WHERE d.native_id IS NOT NULL AND v.deleted_at IS NULL ORDER BY d.id,v.id LIMIT 1",
    )
  ).rows[0];
  expect(linked?.variant_id).toBeTruthy();
  const result = await ok("/admin/products/" + parent.id, "POST", {
    title: "QA unrelated native edit",
  });
  expect(result.product.title).toBe("QA unrelated native edit");
});
test("a forged URL parent cannot delete the linked native variant", async () => {
  for (const id of [parent.id, "prod_nonexistent_qa"]) {
    const r = await request(
      `/admin/products/${id}/variants/${linked.variant_id}`,
      "DELETE",
    );
    expect(r.status, await r.clone().text()).toBe(409);
    expect((await r.json()).message).toBe("CONFLICT_USE_DIDAR_PRODUCT_EDITOR");
  }
  expect(
    (
      await db.query("SELECT deleted_at FROM product_variant WHERE id=$1", [
        linked.variant_id,
      ])
    ).rows[0].deleted_at,
  ).toBeNull();
});
test("mixed native/DIDAR variant batches reject before any partial native mutation", async () => {
  const nativeVariant = (
    await db.query(
      "SELECT id FROM product_variant WHERE product_id=$1 AND deleted_at IS NULL LIMIT 1",
      [parent.id],
    )
  ).rows[0].id;
  const r = await request(
    `/admin/products/${parent.id}/variants/batch`,
    "POST",
    {
      delete: [nativeVariant, linked.variant_id],
    },
  );
  expect(r.status).toBe(409);
  const rows = (
    await db.query(
      "SELECT deleted_at FROM product_variant WHERE id=ANY($1::text[])",
      [[nativeVariant, linked.variant_id]],
    )
  ).rows;
  expect(rows).toHaveLength(2);
  expect(rows.every((v: any) => v.deleted_at === null)).toBe(true);
});
test("a variant update body cannot redirect an ordinary native editor to a DIDAR target", async () => {
  const nativeVariant = (
    await db.query(
      "SELECT id FROM product_variant WHERE product_id=$1 AND deleted_at IS NULL LIMIT 1",
      [parent.id],
    )
  ).rows[0].id;
  const before = (
    await db.query("SELECT title FROM product_variant WHERE id=$1", [
      linked.variant_id,
    ])
  ).rows[0].title;
  const r = await request(
    `/admin/products/${parent.id}/variants/${nativeVariant}`,
    "POST",
    { id: linked.variant_id, title: "QA must not replace DIDAR variant" },
  );
  expect(r.status, await r.clone().text()).toBe(409);
  expect(
    (
      await db.query("SELECT title FROM product_variant WHERE id=$1", [
        linked.variant_id,
      ])
    ).rows[0].title,
  ).toBe(before);
});
test("standalone shared-option writes cannot bypass the linked Product Master editor", async () => {
  const option = (
    await ok(
      "/admin/products/" +
        linked.native_id +
        "?fields=id,options.id,options.title,options.values.id",
    )
  ).product.options[0];
  expect(option?.id).toBeTruthy();
  for (const [method, body] of [
    ["POST", { title: "QA must not replace DIDAR option" }],
    ["DELETE", undefined],
  ] as const) {
    const r = await request(
      "/admin/product-options/" + option.id,
      method,
      body,
    );
    expect(r.status, await r.clone().text()).toBe(409);
  }
  const current = (await ok("/admin/product-options/" + option.id))
    .product_option;
  expect(current.title).toBe(option.title);
});
test("authentication and native reads keep their original behavior", async () => {
  expect(
    (
      await request(
        `/admin/products/${parent.id}/variants/${linked.variant_id}`,
        "DELETE",
        undefined,
        "",
      )
    ).status,
  ).toBe(401);
  expect((await request("/admin/products/" + linked.native_id)).status).toBe(
    200,
  );
});
