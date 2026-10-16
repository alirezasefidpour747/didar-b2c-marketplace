import { expect, test, beforeAll, afterAll } from "bun:test";
import { Pool } from "../packages/api/node_modules/pg";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const base = process.env.TEST_API_URL || "http://localhost:9000";
let customer = "",
  supplier = "",
  admin = "",
  rateVersion = 0;
const tag = "test-" + crypto.randomUUID(),
  oid = tag + "-offer";
async function api(action: string, body?: any, token = "") {
  const r = await fetch(`${base}/didar/${action}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, ...(await r.json()) };
}
const addr = {
  name: "Test Customer",
  phone: "09123456789",
  city: "Tehran",
  address: "Test address",
  postal_code: "1234567890",
};
async function checkout(key = crypto.randomUUID(), qty = 1, version?: number) {
  if (!version) {
    const {
      rows: [o],
    } = await db.query("SELECT version FROM didar_offer WHERE id=$1", [oid]);
    version = o.version;
  }
  return api(
    "checkout",
    {
      idempotency_key: key,
      rate_version: rateVersion,
      address: addr,
      lines: [{ offer_id: oid, quantity: qty, version }],
    },
    customer,
  );
}
beforeAll(async () => {
  const login = async (email: string) =>
    (await api("login", { email, password: "DidarDemo2026!" })).token;
  customer = await login("customer@didar.test");
  supplier = await login("supplier@didar.test");
  admin = await login("admin@didar.test");
  expect(customer).toBeTruthy();
  expect(supplier).toBeTruthy();
  expect(admin).toBeTruthy();
  rateVersion = (await api("catalog")).rate.version;
  await db.query(
    "INSERT INTO didar_product(id,title,category,purity,category_id,published) VALUES($1,'Test ring','Test',750,'ring',true)",
    [tag],
  );
  await db.query(
    "INSERT INTO didar_offer(id,product_id,supplier_id,weight_mg,quantity,labor_irr,margin_bps) VALUES($1,$2,'s2',1234,5,1000000,700)",
    [oid, tag],
  );
});
afterAll(async () => {
  // Preserve financial/order history; retire only this invocation's synthetic stock.
  await db.query("UPDATE didar_offer SET active=false WHERE id=$1", [oid]);
  await db.query(
    "UPDATE didar_product SET active=false,published=false WHERE id=$1",
    [tag],
  );
  await db.end();
});

test("anonymous and customer users cannot change stock or rate", async () => {
  expect((await api("manage")).status).toBe(401);
  expect((await api("manage", undefined, customer)).status).toBe(403);
  expect((await api("checkout", {}, supplier)).status).toBe(403);
});
test("supplier cannot update or read another supplier inventory", async () => {
  const d = await api("manage", undefined, supplier);
  expect(
    d.products
      .flatMap((p: any) => p.offers)
      .every((o: any) => o.supplier_id === "s1"),
  ).toBe(true);
  expect(
    (
      await api(
        "manage",
        {
          kind: "offer",
          id: oid,
          version: 1,
          quantity: 100,
          labor_irr: 0,
          margin_bps: 0,
        },
        supplier,
      )
    ).status,
  ).toBe(403);
});
test("supplier creates exact-weight offer only under own identity", async () => {
  expect(
    (
      await api(
        "permissions",
        { supplier_id: "s1", permission: "CREATE_OWN_OFFER", granted: true },
        admin,
      )
    ).status,
  ).toBe(200);
  const d = await api(
    "manage",
    {
      kind: "new_offer",
      product_id: tag,
      supplier_id: "s2",
      weight_mg: 1235,
      quantity: 2,
      labor_irr: 100000,
      margin_bps: 500,
    },
    supplier,
  );
  expect(d.status).toBe(200);
  const {
    rows: [o],
  } = await db.query("SELECT * FROM didar_offer WHERE id=$1", [d.id]);
  expect(o.supplier_id).toBe("s1");
  expect(o.weight_mg).toBe(1235);
  await db.query("DELETE FROM didar_offer WHERE id=$1", [d.id]);
  await api(
    "permissions",
    { supplier_id: "s1", permission: "CREATE_OWN_OFFER", granted: false },
    admin,
  );
});
test("stock reserve is idempotent and failed payment restores exactly once", async () => {
  const key = crypto.randomUUID();
  const a = await checkout(key),
    b = await checkout(key);
  expect(a.status).toBe(200);
  expect(b.order.id).toBe(a.order.id);
  expect(
    (await db.query("SELECT quantity FROM didar_offer WHERE id=$1", [oid]))
      .rows[0].quantity,
  ).toBe(4);
  const p = await api(
    "payment",
    { order_id: a.order.id, outcome: "failure" },
    customer,
  );
  expect(p.order.status).toBe("failed");
  await api("payment", { order_id: a.order.id, outcome: "failure" }, customer);
  expect(
    (await db.query("SELECT quantity FROM didar_offer WHERE id=$1", [oid]))
      .rows[0].quantity,
  ).toBe(5);
});
test("stale prices, fractional quantities and duplicate lines rejected", async () => {
  expect((await checkout(crypto.randomUUID(), 1, 999999)).status).toBe(409);
  expect((await checkout(crypto.randomUUID(), 1.5)).status).toBe(400);
  const d = await api(
    "checkout",
    {
      idempotency_key: crypto.randomUUID(),
      rate_version: rateVersion - 1,
      address: addr,
      lines: [{ offer_id: oid, quantity: 1, version: 1 }],
    },
    customer,
  );
  expect(d.message).toBe("CONFLICT_RATE_CHANGED");
  const current = (
    await db.query("SELECT version FROM didar_offer WHERE id=$1", [oid])
  ).rows[0];
  const duplicate = await api(
    "checkout",
    {
      idempotency_key: crypto.randomUUID(),
      rate_version: rateVersion,
      address: addr,
      lines: [
        { offer_id: oid, quantity: 1, version: current.version },
        { offer_id: oid, quantity: 1, version: current.version },
      ],
    },
    customer,
  );
  expect(duplicate.status).toBe(400);
  expect(duplicate.message).toBe("INVALID_DUPLICATE_OFFER");
});
test("two concurrent purchases cannot oversell and paid stock remains deducted", async () => {
  const {
    rows: [o],
  } = await db.query("SELECT version FROM didar_offer WHERE id=$1", [oid]);
  const results = await Promise.all([
    checkout(crypto.randomUUID(), 4, o.version),
    checkout(crypto.randomUUID(), 4, o.version),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const order = results.find((r) => r.status === 200)!.order;
  expect(
    (await api("payment", { order_id: order.id, outcome: "success" }, customer))
      .order.status,
  ).toBe("paid");
  expect(
    (await db.query("SELECT quantity FROM didar_offer WHERE id=$1", [oid]))
      .rows[0].quantity,
  ).toBe(1);
  const list = await api("orders", undefined, supplier);
  expect(
    list.orders.every((r: any) =>
      r.lines.every((l: any) => l.supplier_id === "s1"),
    ),
  ).toBe(true);
});
test("one checkout spans suppliers with isolated order views", async () => {
  const second = oid + "-s1";
  await db.query(
    "INSERT INTO didar_offer(id,product_id,supplier_id,weight_mg,quantity,labor_irr,margin_bps) VALUES($1,$2,'s1',1234,3,2000000,500)",
    [second, tag],
  );
  try {
    const {
      rows: [o],
    } = await db.query("SELECT version FROM didar_offer WHERE id=$1", [oid]);
    const a = await api(
      "checkout",
      {
        idempotency_key: crypto.randomUUID(),
        rate_version: rateVersion,
        address: addr,
        lines: [
          { offer_id: oid, quantity: 1, version: o.version },
          { offer_id: second, quantity: 2, version: 1 },
        ],
      },
      customer,
    );
    expect(a.status).toBe(200);
    const customerOrders = await api("orders", undefined, customer);
    const full = customerOrders.orders.find((v: any) => v.id === a.order.id);
    expect(full.lines).toHaveLength(2);
    const supplierOrders = await api("orders", undefined, supplier);
    const own = supplierOrders.orders.find((v: any) => v.id === a.order.id);
    expect(own.lines).toHaveLength(1);
    expect(own.lines[0].supplier_id).toBe("s1");
    expect(own.total_irr).toBeNull();
    await api(
      "payment",
      { order_id: a.order.id, outcome: "failure" },
      customer,
    );
    expect(
      (await db.query("SELECT quantity FROM didar_offer WHERE id=$1", [second]))
        .rows[0].quantity,
    ).toBe(3);
  } finally {
    await db.query("UPDATE didar_offer SET active=false WHERE id=$1", [second]);
  }
});
test("expired reservation is released, cannot become paid", async () => {
  const a = await checkout();
  await db.query(
    "UPDATE didar_order SET expires_at=now()-interval '1 second' WHERE id=$1",
    [a.order.id],
  );
  expect(
    (
      await api(
        "payment",
        { order_id: a.order.id, outcome: "success" },
        customer,
      )
    ).order.status,
  ).toBe("expired");
  expect(
    (await db.query("SELECT quantity FROM didar_offer WHERE id=$1", [oid]))
      .rows[0].quantity,
  ).toBe(1);
});
