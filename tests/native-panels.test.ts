import { test, expect, afterAll } from "bun:test";
import { Pool } from "../packages/api/node_modules/pg";
import { readFileSync } from "node:fs";
const db = new Pool({ connectionString: process.env.DATABASE_URL }),
  origin = process.env.TEST_API_URL || "http://localhost:9000";
afterAll(() => db.end());
async function request(path: string, token = "", body?: any, seller?: string) {
  return fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(seller ? { "x-seller-id": seller } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function deniedByMembership(response: Response) {
  expect([400, 403]).toContain(response.status);
  expect((await response.json()).message).toMatch(/not a member|FORBIDDEN/);
}
async function login(actor: string, email: string, password: string) {
  const r = await request("/auth/" + actor + "/emailpass", "", {
    email,
    password,
  });
  expect(r.status, await r.clone().text()).toBe(200);
  return (await r.json()).token;
}
async function proof(email: string) {
  const r = await request("/didar/login", "", {
    email,
    password: "DidarDemo2026!",
  });
  expect(r.status).toBe(200);
  return (await r.json()).token;
}
test("native identity migration is additive and repeatable; connections do not clone commercial records", async () => {
  const before = (
    await db.query(
      "SELECT (SELECT count(*) FROM didar_product)::int products,(SELECT count(*) FROM didar_offer)::int offers,(SELECT count(*) FROM didar_user)::int users,(SELECT count(*) FROM didar_order)::int orders",
    )
  ).rows[0];
  for (let n = 0; n < 2; n++)
    await db.query(
      readFileSync("packages/api/src/didar/native-schema.sql", "utf8"),
    );
  expect(
    (
      await db.query(
        "SELECT (SELECT count(*) FROM didar_product)::int products,(SELECT count(*) FROM didar_offer)::int offers,(SELECT count(*) FROM didar_user)::int users,(SELECT count(*) FROM didar_order)::int orders",
      )
    ).rows[0],
  ).toEqual(before);
});
test("native admin and member authentication, dual proof, immediate revocation and seller isolation", async () => {
  const admin = await login(
      "user",
      "native-admin@didar.test",
      "DidarNative2026!",
    ),
    vendor = await login(
      "member",
      "native-supplier@didar.test",
      "DidarNative2026!",
    );
  const seller = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1'",
    )
  ).rows[0].seller_id;
  const rival = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s2'",
    )
  ).rows[0].seller_id;
  const actor = (
    await db.query(
      "SELECT id FROM member WHERE email='native-supplier@didar.test'",
    )
  ).rows[0].id;
  const didarAdmin = await proof("admin@didar.test"),
    didarSupplier = await proof("supplier@didar.test");
  expect((await request("/admin/didar/context")).status).toBe(401);
  expect((await request("/admin/didar/context", didarAdmin)).status).toBe(401);
  expect((await request("/didar/manage", admin)).status).toBe(401);
  expect((await request("/admin/didar/context", vendor)).status).toBe(401);
  expect((await request("/admin/didar/context", admin)).status).toBe(200);
  expect(
    (await request("/vendor/didar/context", vendor, undefined, seller)).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/vendor/didar/connect",
        vendor,
        { didar_token: didarAdmin },
        seller,
      )
    ).status,
  ).toBe(403);
  await deniedByMembership(
    await request(
      "/vendor/didar/connect",
      vendor,
      { didar_token: didarSupplier },
      rival,
    ),
  );
  const connected = await request(
    "/vendor/didar/connect",
    vendor,
    { didar_token: didarSupplier },
    seller,
  );
  expect(connected.status, await connected.clone().text()).toBe(200);
  const result = await request(
    "/vendor/didar/manage",
    vendor,
    undefined,
    seller,
  );
  expect(result.status, await result.clone().text()).toBe(200);
  const data = await result.json();
  expect(data.suppliers.every((s: any) => s.id === "s1")).toBe(true);
  expect(
    data.products
      .flatMap((p: any) => p.offers || [])
      .every((o: any) => o.supplier_id === "s1"),
  ).toBe(true);
  const ledger = await request(
    "/vendor/didar/ledger",
    vendor,
    undefined,
    seller,
  );
  expect(ledger.status).toBe(200);
  const ownLedger = await ledger.json();
  expect(ownLedger.balances.every((b: any) => b.party === "supplier:s1")).toBe(
    true,
  );
  expect(ownLedger.obligations.every((b: any) => b.supplier_id === "s1")).toBe(
    true,
  );
  expect(
    (
      await request(
        "/vendor/didar/treasury",
        vendor,
        { operation: "purchase" },
        seller,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/vendor/didar/storefront",
        vendor,
        { operation: "save", supplier_id: "s2" },
        seller,
      )
    ).status,
  ).toBe(403);
  await deniedByMembership(
    await request("/vendor/didar/context", vendor, undefined, rival),
  );
  expect(
    (await request("/vendor/didar/checkout", vendor, {}, seller)).status,
  ).toBe(404);
  await db.query(
    "UPDATE didar_native_seller SET active=false WHERE seller_id=$1",
    [seller],
  );
  expect(
    (await request("/vendor/didar/manage", vendor, undefined, seller)).status,
  ).toBe(403);
  await db.query(
    "UPDATE didar_native_seller SET active=true WHERE seller_id=$1",
    [seller],
  );
  await db.query(
    "UPDATE seller_member SET deleted_at=now() WHERE seller_id=$1 AND member_id=$2",
    [seller, actor],
  );
  await deniedByMembership(
    await request("/vendor/didar/manage", vendor, undefined, seller),
  );
  await db.query(
    "UPDATE seller_member SET deleted_at=NULL WHERE seller_id=$1 AND member_id=$2",
    [seller, actor],
  );
  await db.query(
    "DELETE FROM didar_native_actor WHERE actor_type='member' AND actor_id=$1",
    [actor],
  );
}, 30000);

test("native RBAC adds a restriction to Didar admin authority and cannot be bypassed through manage mutation kinds", async () => {
  const { nativeHandler } = await import("../packages/api/src/didar/native");
  const { nativeUser } =
    await import("../packages/api/src/didar/native-context");
  const id = (
    await db.query(
      `SELECT actor_id FROM didar_native_actor WHERE actor_type='user' AND user_id='demo-admin'`,
    )
  ).rows[0].actor_id;
  async function invoke(
    action: string,
    method: string,
    permissions: any,
    body?: any,
  ) {
    let status = 200;
    const req: any = {
      path: "/admin/didar/" + action,
      originalUrl: "/admin/didar/" + action,
      method,
      params: { action },
      query: {},
      headers: {},
      auth_context: { actor_type: "user", actor_id: id },
      permissions_enforced: true,
      permissions,
      body,
    };
    const res: any = {
      setHeader() {},
      status(n: number) {
        status = n;
        return this;
      },
      json(value: any) {
        return value;
      },
    };
    const data = await nativeHandler(req, res);
    expect(nativeUser(req)).toBeUndefined();
    return { status, data };
  }
  expect((await invoke("manage", "GET", {})).status).toBe(403);
  expect(
    (await invoke("manage", "POST", { products: "view" }, { kind: "product" }))
      .status,
  ).toBe(403);
  expect(
    (await invoke("manage", "POST", { products: "edit" }, { kind: "supplier" }))
      .status,
  ).toBe(403);
  expect(
    (
      await invoke(
        "manage",
        "POST",
        { products: "edit", sellers: "edit" },
        { kind: "supplier_state" },
      )
    ).status,
  ).toBe(403);
  expect(
    (await invoke("manage", "POST", { products: "manage" }, { kind: "rate" }))
      .status,
  ).toBe(403);
  expect(
    (
      await invoke(
        "finance",
        "POST",
        { payments: "edit" },
        { operation: "refund" },
      )
    ).status,
  ).toBe(403);
  expect((await invoke("catalog", "GET", {})).status).toBe(403);
});

test("generic native product mutations cannot diverge or delete an existing linked gold master", async () => {
  const token = await login(
    "user",
    "native-admin@didar.test",
    "DidarNative2026!",
  );
  const p = (
    await db.query(
      "SELECT p.id,p.title,p.native_id,n.title native_title FROM didar_product p JOIN product n ON n.id=p.native_id ORDER BY p.id LIMIT 1",
    )
  ).rows[0];
  expect(p).toBeDefined();
  const response = await request("/admin/products/" + p.native_id, token, {
    title: "Must not replace gold master",
  });
  expect(response.status).toBe(409);
  expect((await response.json()).message).toBe(
    "CONFLICT_USE_DIDAR_PRODUCT_EDITOR",
  );
  expect(
    (
      await request("/admin/products/" + p.native_id, "", {
        title: "unauthenticated",
      })
    ).status,
  ).toBe(401);
  const batch = await request("/admin/products/batch", token, {
    delete: [p.native_id],
  });
  expect(batch.status).toBe(409);
  const after = (
    await db.query(
      "SELECT p.id,p.title,p.native_id,n.title native_title FROM didar_product p JOIN product n ON n.id=p.native_id WHERE p.id=$1",
      [p.id],
    )
  ).rows[0];
  expect(after).toEqual(p);
});

test("native Vendor generic product mutations reveal no private product existence and cannot create a competing master", async () => {
  const token = await login(
    "member",
    "native-supplier@didar.test",
    "DidarNative2026!",
  );
  const sid = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1'",
    )
  ).rows[0].seller_id;
  const known = (
    await db.query(
      "SELECT native_id FROM didar_product WHERE native_id IS NOT NULL LIMIT 1",
    )
  ).rows[0].native_id;
  const a = await request(
    "/vendor/products/" + known,
    token,
    { title: "blocked" },
    sid,
  );
  const b = await request(
    "/vendor/products/does-not-exist",
    token,
    { title: "blocked" },
    sid,
  );
  expect(a.status).toBe(409);
  expect(b.status).toBe(409);
  expect(await a.json()).toEqual(await b.json());
});
