import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { Pool } from "../packages/api/node_modules/pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const base = process.env.TEST_API_URL || "http://localhost:9000";
const tag = `qa-${randomUUID()}`;
const password = "DidarTestFixture2026!";
const product = `${tag}-product`;
const supplierEmail = `${tag}-supplier@didar.test`;
let admin = "",
  customer = "",
  outsider = "",
  supplier = "",
  supplierId = "",
  categoryId = "";
const users: string[] = [];
const categoryChildren: string[] = [],
  collections: string[] = [],
  requestedProducts: string[] = [];
const address = {
  name: "QA customer",
  phone: "09123456789",
  city: "Tehran",
  address: "QA fixture address",
  postal_code: "1234567890",
};

async function api(action: string, body?: unknown, token = "") {
  const response = await fetch(`${base}/didar/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ...(await response.json()), status: response.status };
}
async function fixtureAccount(role: string) {
  const id = `${tag}-${role}-${users.length}`;
  const email = `${id}@didar.test`;
  const salt = randomBytes(16).toString("hex");
  const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  await db.query(
    "INSERT INTO didar_user(id,email,name,password,role) VALUES($1,$2,$3,$4,$5)",
    [id, email, tag, hash, role],
  );
  users.push(id);
  const login = await api("login", { email, password });
  expect(login.status).toBe(200);
  return login.token;
}
async function offer(weight: number, quantity = 3) {
  const result = await api(
    "manage",
    {
      kind: "new_offer",
      product_id: product,
      weight_mg: weight,
      quantity,
      labor_irr: 100000,
      margin_bps: 500,
      terms: "QA dispatch within two days",
    },
    supplier,
  );
  expect(result.status).toBe(200);
  const {
    rows: [row],
  } = await db.query("SELECT * FROM didar_offer WHERE id=$1", [result.id]);
  return row;
}
async function reserve(id: string, quantity = 1, key = randomUUID()) {
  const {
    rows: [o],
  } = await db.query("SELECT version FROM didar_offer WHERE id=$1", [id]);
  const catalog = await api("catalog");
  return api(
    "checkout",
    {
      idempotency_key: key,
      rate_version: catalog.rate.version,
      address,
      lines: [{ offer_id: id, quantity, version: o.version }],
    },
    customer,
  );
}
async function quantity(id: string) {
  return (await db.query("SELECT quantity FROM didar_offer WHERE id=$1", [id]))
    .rows[0].quantity;
}
async function paidOrder(weight: number) {
  const o = await offer(weight);
  const checkout = await reserve(o.id);
  expect(checkout.status).toBe(200);
  const init = await api(
    "payment",
    { order_id: checkout.order.id, operation: "initialize" },
    customer,
  );
  expect(init.status).toBe(200);
  const paid = await api(
    "payment",
    {
      order_id: checkout.order.id,
      operation: "confirm",
      attempt_id: init.payment.id,
      outcome: "success",
    },
    customer,
  );
  expect(paid.order.status).toBe("paid");
  return { offer: o, order: checkout.order, payment: init.payment };
}

beforeAll(async () => {
  admin = await fixtureAccount("admin");
  customer = await fixtureAccount("customer");
  outsider = await fixtureAccount("customer");
  await db.query(
    "INSERT INTO didar_product(id,title,category,purity) VALUES($1,$2,'QA',750)",
    [product, `${tag} shared ring`],
  );
  const registration = await api("register", {
    email: supplierEmail,
    password,
    name: `${tag} supplier`,
    supplier_name: `${tag} gold supply`,
    role: "supplier",
  });
  expect(registration.status).toBe(200);
  supplier = registration.token;
  supplierId = registration.user.supplier_id;
  users.push(registration.user.id);
  // Earlier MVP write tests now exercise explicitly delegated rights; production defaults remain read-only.
  for (const permission of [
    "REQUEST_PRODUCT_CREATION",
    "CREATE_OWN_OFFER",
    "EDIT_OWN_OFFER",
    "EDIT_OWN_INVENTORY",
    "EDIT_OWN_MAKING_CHARGE",
    "CREATE_OWN_INTAKE",
    "PAIR_OWN_RFID",
    "UPDATE_OWN_FULFILLMENT",
  ])
    expect(
      (
        await api(
          "permissions",
          { supplier_id: supplierId, permission, granted: true },
          admin,
        )
      ).status,
    ).toBe(200);
});

afterAll(async () => {
  // Financial snapshots and events reference these fixtures permanently. Retire, do not erase.
  for (const id of [product, ...requestedProducts])
    await db.query("UPDATE didar_product SET active=false,published=false WHERE id=$1", [id]);
  if (supplierId) await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [supplierId]);
  await db.end();
});

test("supplier registration requires admin approval and cannot self-approve", async () => {
  expect(supplierId).toBeTruthy();
  expect(
    (
      await api(
        "manage",
        {
          kind: "supplier_state",
          id: supplierId,
          status: "approved",
          active: true,
        },
        supplier,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await api(
        "manage",
        {
          kind: "new_offer",
          product_id: product,
          weight_mg: 6200,
          quantity: 2,
          labor_irr: 0,
          margin_bps: 0,
        },
        supplier,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await api(
        "manage",
        {
          kind: "supplier_state",
          id: supplierId,
          status: "approved",
          active: true,
        },
        customer,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await api(
        "manage",
        {
          kind: "supplier_state",
          id: supplierId,
          status: "approved",
          active: true,
        },
        admin,
      )
    ).status,
  ).toBe(200);
  const o = await offer(6200);
  expect(o.supplier_id).toBe(supplierId);
  expect(
    (
      await api(
        "manage",
        {
          kind: "supplier_state",
          id: supplierId,
          status: "approved",
          active: false,
        },
        admin,
      )
    ).status,
  ).toBe(200);
  expect(
    (await api("catalog")).products
      .find((p: any) => p.id === product)
      .offers.some((candidate: any) => candidate.id === o.id),
  ).toBe(false);
  expect(
    (
      await api(
        "manage",
        {
          kind: "offer",
          id: o.id,
          version: o.version,
          quantity: 5,
          labor_irr: 0,
          margin_bps: 0,
        },
        supplier,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await api(
        "manage",
        {
          kind: "supplier_state",
          id: supplierId,
          status: "approved",
          active: true,
        },
        admin,
      )
    ).status,
  ).toBe(200);
});

test("admin category and product edits persist publication controls", async () => {
  const category = await api(
    "manage",
    { kind: "category", name: `${tag} rings`, slug: tag },
    admin,
  );
  expect(category.status).toBe(200);
  categoryId = category.id;
  const edit = {
    kind: "product",
    id: product,
    title: `${tag} edited ring`,
    category: "QA",
    category_id: categoryId,
    purity: 750,
    reference: "QA-A120",
    jewelry_type: "ring",
    min_weight_mg: 6000,
    max_weight_mg: 8000,
    description: "Audited shared master product",
    active: true,
    published: false,
  };
  expect((await api("manage", edit, supplier)).status).toBe(403);
  expect((await api("manage", edit, admin)).status).toBe(200);
  expect(
    (await api("catalog")).products.some((p: any) => p.id === product),
  ).toBe(false);
  expect(
    (await api("manage", { ...edit, published: true }, admin)).status,
  ).toBe(200);
  const visible = (await api("catalog")).products.find(
    (p: any) => p.id === product,
  );
  expect(visible.reference).toBe("QA-A120");
  expect(visible.min_weight_mg).toBe(6000);
});

test("subcategory hierarchy rejects cycles and collection membership is editable", async () => {
  const child = await api(
    "manage",
    {
      kind: "category",
      name: `${tag} subcategory`,
      slug: `${tag}-child`,
      parent_id: categoryId,
    },
    admin,
  );
  expect(child.status).toBe(200);
  categoryChildren.push(child.id);
  const cycle = await api(
    "manage",
    {
      kind: "category",
      id: categoryId,
      name: `${tag} rings`,
      slug: tag,
      parent_id: child.id,
    },
    admin,
  );
  expect(cycle.status).toBe(400);
  const collection = await api(
    "manage",
    {
      kind: "collection",
      name: `${tag} collection`,
      slug: `${tag}-collection`,
      product_ids: [product],
    },
    admin,
  );
  expect(collection.status).toBe(200);
  collections.push(collection.id);
  const catalog = await api("catalog");
  expect(catalog.categories.find((c: any) => c.id === child.id).parent_id).toBe(
    categoryId,
  );
  expect(
    catalog.collections.find((c: any) => c.id === collection.id).product_ids,
  ).toContain(product);
  expect(
    catalog.products.find((p: any) => p.id === product).collection_ids,
  ).toContain(collection.id);
  expect(
    (
      await api(
        "manage",
        {
          kind: "collection",
          id: collection.id,
          name: `${tag} changed collection`,
          slug: `${tag}-collection`,
          product_ids: [],
        },
        admin,
      )
    ).status,
  ).toBe(200);
  const edited = await api("catalog");
  expect(edited.collections.find((c: any) => c.id === collection.id).name).toBe(
    `${tag} changed collection`,
  );
  expect(
    edited.collections.find((c: any) => c.id === collection.id).product_ids,
  ).toEqual([]);
  expect(
    edited.products.find((p: any) => p.id === product).collection_ids,
  ).not.toContain(collection.id);
});

test("product images require admin authorization and matching image bytes", async () => {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWu0AAAAASUVORK5CYII=";
  const payload = {
    kind: "image_upload",
    product_id: product,
    data: png,
    mime_type: "image/png",
    alt: "QA uploaded image fixture",
  };
  expect((await api("manage", payload, supplier)).status).toBe(403);
  expect(
    (
      await api(
        "manage",
        { ...payload, data: Buffer.from("not a PNG").toString("base64") },
        admin,
      )
    ).status,
  ).toBe(400);
  const uploaded = await api("manage", payload, admin);
  expect(uploaded.status).toBe(200);
  const p = (await api("catalog")).products.find((p: any) => p.id === product);
  expect(p.images.some((i: any) => i.alt === payload.alt)).toBe(true);
  const image = p.images.find((i: any) => i.alt === payload.alt);
  const resource = await fetch(
    `${base}/didar/image?id=${encodeURIComponent(image.id)}`,
  );
  expect(resource.status).toBe(200);
  expect(resource.headers.get("content-type")).toContain("image/png");
  expect(
    (await api("manage", { kind: "image_delete", id: image.id }, admin)).status,
  ).toBe(200);
  expect(
    (await api("catalog")).products.find((p: any) => p.id === product).images,
  ).toHaveLength(0);
});

test("supplier manages multiple weights, deactivates an offer, and cannot alter another supplier", async () => {
  const first = await offer(6400, 2),
    second = await offer(6800, 1);
  expect(first.weight_mg).toBe(6400);
  expect(second.weight_mg).toBe(6800);
  const change = await api(
    "manage",
    {
      kind: "offer",
      id: second.id,
      version: second.version,
      quantity: 1,
      labor_irr: 0,
      labor_bps: 150,
      labor_mode: "percent",
      margin_bps: 500,
      active: false,
      terms: "Temporarily unavailable",
    },
    supplier,
  );
  expect(change.status).toBe(200);
  const p = (await api("catalog")).products.find((p: any) => p.id === product);
  expect(p.offers.some((o: any) => o.id === second.id)).toBe(false);
  const old = (
    await db.query("SELECT * FROM didar_offer WHERE id=$1", [second.id])
  ).rows[0];
  expect((await reserve(second.id)).status).toBe(409);
  expect(old.active).toBe(false);
  expect(old.labor_bps).toBe(150);
  expect(old.labor_mode).toBe("percent");
});

test("supplier product requests remain pending until admin review", async () => {
  const requested = await api(
    "manage",
    {
      kind: "product_request",
      title: `${tag} new requested bracelet`,
      category: "QA",
      purity: 750,
      reference: "QA-REQUEST",
      min_weight_mg: 6000,
      max_weight_mg: 9000,
    },
    supplier,
  );
  expect(requested.status).toBe(200);
  expect(
    (await api("catalog")).products.some(
      (p: any) => p.title === `${tag} new requested bracelet`,
    ),
  ).toBe(false);
  expect(
    (
      await api(
        "manage",
        { kind: "review_request", id: requested.id, decision: "approved" },
        supplier,
      )
    ).status,
  ).toBe(403);
  // Rejection verifies the review boundary without creating native catalog fixtures.
  expect(
    (
      await api(
        "manage",
        {
          kind: "review_request",
          id: requested.id,
          decision: "rejected",
          reason: "QA fixture reviewed",
        },
        admin,
      )
    ).status,
  ).toBe(200);
});

test("approved supplier product request becomes one shared native-linked product", async () => {
  const title = `${tag} approved request`;
  const request = await api(
    "manage",
    {
      kind: "product_request",
      title,
      category: "QA",
      purity: 750,
      reference: `${tag}-requested`,
    },
    supplier,
  );
  expect(request.status).toBe(200);
  const review = await api(
    "manage",
    { kind: "review_request", id: request.id, decision: "approved" },
    admin,
  );
  expect(review.status).toBe(200);
  expect(review.product_id).toBeTruthy();
  requestedProducts.push(review.product_id);
  const approved = (await api("catalog")).products.find(
    (p: any) => p.id === review.product_id,
  );
  expect(approved.title).toBe(title);
  expect(approved.native_id).toBeTruthy();
  expect(approved.published).toBe(true);
  const retry = await api(
    "manage",
    { kind: "review_request", id: request.id, decision: "approved" },
    admin,
  );
  expect(retry.product_id).toBe(review.product_id);
  expect(
    Number(
      (
        await db.query("SELECT count(*) FROM didar_product WHERE title=$1", [
          title,
        ])
      ).rows[0].count,
    ),
  ).toBe(1);
});

test("stock edits during a reservation count available pieces and release exactly once", async () => {
  const o = await offer(7000, 3);
  const checkout = await reserve(o.id, 2);
  expect(checkout.status).toBe(200);
  expect(await quantity(o.id)).toBe(1);
  const current = (
    await db.query("SELECT * FROM didar_offer WHERE id=$1", [o.id])
  ).rows[0];
  expect(
    (
      await api(
        "manage",
        {
          kind: "offer",
          id: o.id,
          version: current.version,
          quantity: 4,
          labor_irr: 100000,
          margin_bps: 500,
        },
        supplier,
      )
    ).status,
  ).toBe(200);
  const cancelled = await api(
    "payment",
    { order_id: checkout.order.id, outcome: "cancel" },
    customer,
  );
  expect(cancelled.order.status).toBe("failed");
  expect(await quantity(o.id)).toBe(6);
  await api(
    "payment",
    { order_id: checkout.order.id, outcome: "cancel" },
    customer,
  );
  expect(await quantity(o.id)).toBe(6);
});

test("payment initialization and concurrent callbacks are idempotent and owner scoped", async () => {
  const o = await offer(7100, 2);
  const key = randomUUID();
  const checkout = await reserve(o.id, 1, key);
  expect((await reserve(o.id, 1, key)).order.id).toBe(checkout.order.id);
  const initialize = () =>
    api(
      "payment",
      { order_id: checkout.order.id, operation: "initialize" },
      customer,
    );
  const [first, second] = await Promise.all([initialize(), initialize()]);
  expect(first.payment.id).toBe(second.payment.id);
  expect(Number(first.payment.amount_irr)).toBe(
    Number(checkout.order.total_irr),
  );
  const body = {
    order_id: checkout.order.id,
    operation: "callback",
    attempt_id: first.payment.id,
    outcome: "success",
  };
  expect((await api("payment", body, outsider)).status).toBe(404);
  expect(
    (await api("payment", { ...body, attempt_id: randomUUID() }, customer))
      .status,
  ).toBe(404);
  expect(await quantity(o.id)).toBe(1);
  const pendingLine = (
    await db.query("SELECT id FROM didar_order_line WHERE order_id=$1", [
      checkout.order.id,
    ])
  ).rows[0];
  expect(
    (
      await api(
        "fulfillment",
        { line_id: pendingLine.id, status: "preparing" },
        admin,
      )
    ).status,
  ).toBe(409);

  const confirmed = await Promise.all([
    api("payment", body, customer),
    api("payment", body, customer),
  ]);
  expect(confirmed.map((r) => r.order.status)).toEqual(["paid", "paid"]);
  expect(await quantity(o.id)).toBe(1);
  const lines = await db.query(
    "SELECT id,breakdown FROM didar_order_line WHERE order_id=$1",
    [checkout.order.id],
  );
  expect(lines.rows).toHaveLength(1);
  expect(lines.rows[0].breakdown.total_irr).toBe(
    Number(checkout.order.total_irr),
  );
  expect(
    Number(
      (
        await db.query(
          "SELECT count(*) FROM didar_order WHERE customer_id=$1 AND idempotency_key=$2",
          [users[1], key],
        )
      ).rows[0].count,
    ),
  ).toBe(1);
  const terminal = await api(
    "payment",
    { ...body, outcome: "failure" },
    customer,
  );
  expect(terminal.order.status).toBe("paid");
  expect(await quantity(o.id)).toBe(1);
});

test("expired initialized payment releases stock and cannot confirm successfully", async () => {
  const o = await offer(7200, 2);
  const checkout = await reserve(o.id);
  const init = await api(
    "payment",
    { order_id: checkout.order.id, operation: "initialize" },
    customer,
  );
  await db.query(
    "UPDATE didar_order SET expires_at=now()-interval '1 second' WHERE id=$1",
    [checkout.order.id],
  );
  const result = await api(
    "payment",
    {
      order_id: checkout.order.id,
      operation: "confirm",
      attempt_id: init.payment.id,
      outcome: "success",
    },
    customer,
  );
  expect(result.order.status).toBe("expired");
  expect(await quantity(o.id)).toBe(2);
  await api("catalog");
  expect(await quantity(o.id)).toBe(2);
});

test("paid allocation progresses through valid fulfillment and protects customer privacy", async () => {
  const paid = await paidOrder(7300);
  const own = (await api("orders", undefined, supplier)).orders.find(
    (o: any) => o.id === paid.order.id,
  );
  expect(own.lines).toHaveLength(1);
  expect(own.total_irr).toBeNull();
  expect(own.address).toEqual({});
  const line = own.lines[0];
  expect(line.fulfillment_status).toBe("allocated");
  expect(
    (
      await api(
        "fulfillment",
        { line_id: line.id, status: "delivered" },
        customer,
      )
    ).status,
  ).toBe(403);
  expect(
    (await api("fulfillment", { line_id: line.id, status: "delivered" }, admin))
      .status,
  ).toBe(409);
  expect(
    (
      await api(
        "fulfillment",
        { line_id: line.id, status: "preparing" },
        supplier,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await api(
        "fulfillment",
        { line_id: line.id, status: "dispatched" },
        supplier,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await api(
        "fulfillment",
        {
          line_id: line.id,
          status: "dispatched",
          tracking_number: "QA-TRACK-7300",
          carrier: "QA carrier",
        },
        supplier,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await api(
        "fulfillment",
        { line_id: line.id, status: "delivered" },
        supplier,
      )
    ).status,
  ).toBe(403);
  expect(
    (await api("fulfillment", { line_id: line.id, status: "delivered" }, admin))
      .status,
  ).toBe(200);
  const tracked = (await api("orders", undefined, customer)).orders.find(
    (o: any) => o.id === paid.order.id,
  );
  expect(tracked.lines[0].fulfillment_status).toBe("delivered");
  expect(tracked.lines[0].tracking_number).toBe("QA-TRACK-7300");
  expect(await quantity(paid.offer.id)).toBe(2);
});

test("product purity edits invalidate old offers without changing paid pricing snapshots", async () => {
  const paid = await paidOrder(7400);
  const original = (
    await db.query("SELECT breakdown FROM didar_order_line WHERE order_id=$1", [
      paid.order.id,
    ])
  ).rows[0].breakdown;
  expect(original.policy.purity).toBe(750);
  expect(original.policy.fixed_labor_irr).toBe(100000);
  const quoted = (
    await db.query("SELECT version FROM didar_offer WHERE id=$1", [
      paid.offer.id,
    ])
  ).rows[0].version;
  expect(
    (await api("manage", { kind: "product", id: product, purity: 585 }, admin))
      .status,
  ).toBe(200);
  const rate = (await api("catalog")).rate;
  const stale = await api(
    "checkout",
    {
      idempotency_key: randomUUID(),
      rate_version: rate.version,
      address,
      lines: [{ offer_id: paid.offer.id, quantity: 1, version: quoted }],
    },
    customer,
  );
  expect(stale.status).toBe(409);
  expect(stale.message).toBe("CONFLICT_OFFER_CHANGED");
  const current = (
    await db.query("SELECT * FROM didar_offer WHERE id=$1", [paid.offer.id])
  ).rows[0];
  expect(current.version).toBeGreaterThan(quoted);
  expect(
    (
      await api(
        "manage",
        {
          kind: "offer",
          id: current.id,
          version: current.version,
          quantity: current.quantity,
          labor_irr: 9000000,
          margin_bps: 1000,
        },
        supplier,
      )
    ).status,
  ).toBe(200);
  const historical = (
    await db.query("SELECT breakdown FROM didar_order_line WHERE order_id=$1", [
      paid.order.id,
    ])
  ).rows[0].breakdown;
  expect(historical).toEqual(original);
  expect(
    Number(
      (
        await db.query("SELECT total_irr FROM didar_order WHERE id=$1", [
          paid.order.id,
        ])
      ).rows[0].total_irr,
    ),
  ).toBe(original.total_irr);
});

test("profile updates are private, validated and logout revokes the session", async () => {
  expect(
    (
      await api(
        "profile",
        { name: "QA updated customer", phone: "bad" },
        customer,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await api(
        "profile",
        { name: "QA updated customer", phone: address.phone, address },
        customer,
      )
    ).status,
  ).toBe(200);
  const own = await api("profile", undefined, customer);
  expect(own.user.name).toBe("QA updated customer");
  expect(own.user.phone).toBe(address.phone);
  expect(JSON.stringify(own)).not.toContain("password");
  expect((await api("profile", undefined, outsider)).user.name).not.toBe(
    "QA updated customer",
  );
  expect((await api("logout", {}, outsider)).status).toBe(200);
  expect((await api("profile", undefined, outsider)).status).toBe(401);
});
