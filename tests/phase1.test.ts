import { beforeAll, afterAll, test, expect } from "bun:test";
import { Pool } from "../packages/api/node_modules/pg";
import { price } from "../packages/api/src/didar/pricing";
import { normalizeEPC } from "../packages/api/src/didar/phase1";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const base = process.env.TEST_API_URL || "http://localhost:9000",
  tag = "p1-" + crypto.randomUUID(),
  password = "DidarPhase1Fixture2026!";
const epc = (n: number) =>
  "E2" +
  tag.replaceAll("-", "").slice(2, 22).toUpperCase() +
  n.toString(16).padStart(2, "0");
let admin = "",
  supplier = "",
  other = "",
  customer = "",
  customer2 = "",
  supplierId = "",
  product = "",
  batch = "",
  lines: any[] = [],
  items: any[] = [];
const address = {
  name: "Phase1",
  phone: "09123456789",
  city: "Tehran",
  address: "Test physical items",
  postal_code: "1234567890",
};
async function api(action: string, body?: any, token = admin) {
  const r = await fetch(base + "/didar/" + action, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { http: r.status, ...(await r.json()) };
}
async function ok(action: string, body?: any, token = admin) {
  const r = await api(action, body, token);
  expect(r.http, JSON.stringify(r)).toBe(200);
  return r;
}
async function grant(permission: string, granted: boolean) {
  return ok("permissions", { supplier_id: supplierId, permission, granted });
}
async function reload() {
  const d = await ok("intake?id=" + batch);
  lines = d.lines;
  items = d.items;
  return d;
}
async function checkout(
  offer: any,
  key = crypto.randomUUID(),
  buyer = customer,
) {
  const rate = (await ok("catalog")).rate;
  return api(
    "checkout",
    {
      idempotency_key: key,
      rate_version: rate.version,
      address,
      lines: [{ offer_id: offer.id, quantity: 1, version: offer.version }],
    },
    buyer,
  );
}
async function current(offer: string) {
  return (await db.query("SELECT * FROM didar_offer WHERE id=$1", [offer]))
    .rows[0];
}
async function pay(order: string, outcome: string) {
  return ok("payment", { order_id: order, outcome }, customer);
}
async function unit(item: string) {
  return (
    await db.query("SELECT * FROM didar_inventory_item WHERE id=$1", [item])
  ).rows[0];
}
beforeAll(async () => {
  admin = (
    await api(
      "login",
      { email: "admin@didar.test", password: "DidarDemo2026!" },
      "",
    )
  ).token;
  expect(admin).toBeTruthy();
  product = (
    await ok("manage", {
      kind: "product",
      title: tag,
      category: "Acceptance",
      purity: 750,
      description: "Physical item QA",
      published: false,
      attributes: { material: "gold", scope: "Phase1" },
    })
  ).id;
  supplierId = (
    await ok("manage", {
      kind: "supplier",
      name: tag,
      email: tag + "@didar.test",
      password,
    })
  ).id;
  supplier = (await ok("login", { email: tag + "@didar.test", password }, ""))
    .token;
  other = (
    await ok(
      "login",
      { email: "supplier@didar.test", password: "DidarDemo2026!" },
      "",
    )
  ).token;
  customer = (
    await ok(
      "register",
      { email: tag + "-buyer@didar.test", password, name: "Phase1 buyer" },
      "",
    )
  ).token;
  customer2 = (
    await ok(
      "register",
      {
        email: tag + "-second-buyer@didar.test",
        password,
        name: "Second concurrent buyer",
      },
      "",
    )
  ).token;
  batch = (
    await ok("intake", {
      operation: "create",
      supplier_id: supplierId,
      invoice_number: tag,
      reference_purity: 750,
      tahesab_reference: "QA-NO-ACCOUNTING-WRITE",
    })
  ).id;
});
afterAll(async () => {
  // Permanent UIDs, bindings and paid/returned sales are retained as QA history, never deleted/reused.
  if (product)
    await api("manage", {
      kind: "product",
      id: product,
      published: false,
      active: false,
    });
  if (supplierId)
    await api("manage", {
      kind: "supplier_state",
      id: supplierId,
      status: "approved",
      active: false,
    });
  await db.end();
});
test("mandatory 100g Gold-First 12+3+7, IRR VAT and fixed equivalent making are additive", () => {
  const input = {
    weight_mg: 100000,
    purity: 750,
    rate_irr: 65000000,
    making_mode: "percent",
    making_bps: 1200,
    distribution_bps: 300,
    retail_bps: 700,
    vat_bps: 1000,
  };
  expect(price(input)).toMatchObject({
    metal_irr: 6500000000,
    labor_irr: 780000000,
    distribution_irr: 195000000,
    retail_irr: 455000000,
    vat_irr: 143000000,
    total_irr: 8073000000,
    price_model: "gold_first_v1",
  });
  expect(
    price({ ...input, making_mode: "fixed_gold", making_weight_mg: 12000 }),
  ).toMatchObject({
    labor_irr: 780000000,
    vat_irr: 143000000,
    total_irr: 8073000000,
  });
  expect(price({ ...input, taxable_components: ["making"] })).toMatchObject({
    vat_irr: 78000000,
  });
  expect(normalizeEPC("EPC: 0xe2-00-aa bb")).toBe("E200AABB");
  expect(() => normalizeEPC("not a tag")).toThrow("INVALID_EPC");
});
test("all eight supplier mutations default denied; grants revoke immediately; reads isolated", async () => {
  const request = { kind: "product_request", title: "Forbidden", purity: 750 };
  const newOffer = {
    kind: "new_offer",
    product_id: product,
    weight_mg: 9999,
    quantity: 0,
    labor_irr: 0,
    making_mode: "percent",
    making_bps: 1200,
  };
  expect((await api("manage", request, supplier)).http).toBe(403);
  expect((await api("manage", newOffer, supplier)).http).toBe(403);
  expect(
    (
      await api(
        "intake",
        {
          operation: "create",
          invoice_number: tag + "-no",
          reference_purity: 750,
        },
        supplier,
      )
    ).http,
  ).toBe(403);
  expect(
    (
      await api(
        "permissions",
        {
          supplier_id: supplierId,
          permission: "CREATE_OWN_INTAKE",
          granted: true,
        },
        supplier,
      )
    ).http,
  ).toBe(403);
  expect(
    (await ok("intake", undefined, supplier)).batches.some(
      (b: any) => b.id === batch,
    ),
  ).toBe(true);
  expect((await api("intake?id=" + batch, undefined, other)).http).toBe(403);
  await grant("CREATE_OWN_INTAKE", true);
  const draft = await ok(
    "intake",
    {
      operation: "create",
      invoice_number: tag + "-delegated",
      reference_purity: 750,
    },
    supplier,
  );
  expect(draft.id).toBeTruthy();
  await grant("CREATE_OWN_INTAKE", false);
  expect(
    (
      await api(
        "intake",
        {
          operation: "create",
          invoice_number: tag + "-revoked",
          reference_purity: 750,
        },
        supplier,
      )
    ).http,
  ).toBe(403);
  // A separate published legacy offer proves each field-specific grant is independently enforced.
  await ok("manage", { kind: "product", id: product, published: true });
  const offer = (
    await ok("manage", {
      ...newOffer,
      supplier_id: supplierId,
      terms: "initial",
    })
  ).id;
  for (const [permission, change] of [
    ["EDIT_OWN_INVENTORY", { quantity: 1 }],
    ["EDIT_OWN_MAKING_CHARGE", { making_bps: 1300 }],
    ["EDIT_OWN_OFFER", { terms: "changed" }],
  ] as const) {
    const o = await current(offer);
    const body = { kind: "offer", id: offer, version: o.version, ...change };
    expect((await api("manage", body, supplier)).http).toBe(403);
    await grant(permission, true);
    await ok("manage", body, supplier);
    await grant(permission, false);
    expect(
      (
        await api(
          "manage",
          {
            ...body,
            version: (await current(offer)).version,
            ...(permission === "EDIT_OWN_INVENTORY"
              ? { quantity: 2 }
              : permission === "EDIT_OWN_MAKING_CHARGE"
                ? { making_bps: 1400 }
                : { terms: "again" }),
          },
          supplier,
        )
      ).http,
    ).toBe(403);
  }
  await grant("CREATE_OWN_OFFER", true);
  expect(
    (await ok("manage", { ...newOffer, weight_mg: 9998 }, supplier)).id,
  ).toBeTruthy();
  await grant("CREATE_OWN_OFFER", false);
  await grant("REQUEST_PRODUCT_CREATION", true);
  expect((await ok("manage", request, supplier)).id).toBeTruthy();
  await grant("REQUEST_PRODUCT_CREATION", false);
  await ok("manage", { kind: "product", id: product, published: false });
  expect(
    (await ok("manage", undefined, supplier)).products.some(
      (p: any) => p.id === product,
    ),
  ).toBe(true);
  expect(
    (await ok("manage", undefined, other)).products.some(
      (p: any) => p.id === product,
    ),
  ).toBe(false);
});
test("19 separately measured items reconcile 5/135g, 2/127g, 12/117g; mismatch and unverified stock blocked", async () => {
  const groups = [
    {
      description: "5 services, authenticity not asserted",
      quantity: 5,
      total_weight_mg: 135000,
      weights: [26000, 27000, 28000, 26500, 27500],
    },
    {
      description: "2 services",
      quantity: 2,
      total_weight_mg: 127000,
      weights: [63000, 64000],
    },
    {
      description: "12 rings",
      quantity: 12,
      total_weight_mg: 117000,
      weights: [
        9000, 9100, 9200, 9300, 9400, 9500, 10000, 10100, 10200, 10300, 10400,
        10500,
      ],
    },
  ];
  for (const g of groups) {
    const line = (
      await ok("intake", {
        operation: "line",
        batch_id: batch,
        product_id: product,
        purity: 750,
        making_mode: "percent",
        making_bps: 1200,
        ...g,
      })
    ).id;
    expect(
      (await api("intake", { operation: "verify", batch_id: batch })).message,
    ).toBe("CONFLICT_RECONCILIATION");
    for (let k = 0; k < g.weights.length; k++)
      await ok("intake", {
        operation: "item",
        batch_id: batch,
        line_id: line,
        weight_mg: g.weights[k],
        uid: `${tag}-${g.quantity}-${k}`,
      });
  }
  const d = await reload();
  expect(items).toHaveLength(19);
  expect(new Set(items.map((i) => i.uid)).size).toBe(19);
  expect(
    lines
      .map((l) => [l.measured_quantity, l.measured_weight_mg])
      .sort((a, b) => a[0] - b[0]),
  ).toEqual([
    [2, 127000],
    [5, 135000],
    [12, 117000],
  ]);
  expect(items.every((i) => i.status === "draft" && i.offer_id === null)).toBe(
    true,
  );
  const wrong = items[0];
  await ok("intake", {
    operation: "item",
    batch_id: batch,
    line_id: wrong.line_id,
    item_id: wrong.id,
    weight_mg: wrong.weight_mg + 1,
  });
  expect(
    (await api("intake", { operation: "verify", batch_id: batch })).message,
  ).toBe("CONFLICT_RECONCILIATION");
  expect(
    (await api("intake", { operation: "post", batch_id: batch })).http,
  ).toBe(409);
  await ok("intake", {
    operation: "item",
    batch_id: batch,
    line_id: wrong.line_id,
    item_id: wrong.id,
    weight_mg: wrong.weight_mg,
  });
  const duplicate = await Promise.all([
    api("intake", {
      operation: "item",
      batch_id: batch,
      line_id: wrong.line_id,
      weight_mg: 1,
      uid: wrong.uid,
    }),
    api("intake", {
      operation: "item",
      batch_id: batch,
      line_id: wrong.line_id,
      weight_mg: 1,
      uid: wrong.uid,
    }),
  ]);
  expect(duplicate.map((d) => d.http)).toEqual([409, 409]);
  await grant("CREATE_OWN_INTAKE", true);
  expect(
    (await api("intake", { operation: "verify", batch_id: batch }, supplier))
      .http,
  ).toBe(403);
  await grant("CREATE_OWN_INTAKE", false);
  await ok("intake", { operation: "verify", batch_id: batch });
  expect(
    (
      await api("intake", {
        operation: "item",
        batch_id: batch,
        line_id: wrong.line_id,
        item_id: wrong.id,
        weight_mg: 1,
      })
    ).http,
  ).toBe(409);
  await ok("intake", { operation: "post", batch_id: batch });
  await ok("intake", { operation: "post", batch_id: batch });
  await reload();
  expect(items.every((i) => i.status === "available" && i.offer_id)).toBe(true);
  const cache = await db.query(
    "SELECT sum(quantity)::int n FROM didar_offer WHERE supplier_id=$1 AND stock_mode='itemized'",
    [supplierId],
  );
  expect(cache.rows[0].n).toBe(19);
  expect(
    (
      await api("manage", {
        kind: "offer",
        id: items[0].offer_id,
        version: (await current(items[0].offer_id)).version,
        quantity: 10,
      })
    ).http,
  ).toBe(409);
  expect((await ok("inventory", undefined, supplier)).items).toHaveLength(19);
  expect(
    (await ok("inventory", undefined, other)).items.every(
      (i: any) => i.supplier_id !== supplierId,
    ),
  ).toBe(true);
  await ok("manage", {
    kind: "product",
    id: product,
    published: true,
    approved: true,
  });
});
test("EPC normalization, global uniqueness, audited replacement and independent pairing grant", async () => {
  const a = items[0],
    b = items[1];
  expect(
    (
      await api(
        "rfid",
        {
          operation: "pair",
          item_id: a.id,
          epc: epc(1),
          reason: "permission denied",
        },
        supplier,
      )
    ).http,
  ).toBe(403);
  await grant("PAIR_OWN_RFID", true);
  await ok(
    "rfid",
    {
      operation: "pair",
      item_id: a.id,
      epc: "EPC: 0x" + epc(1).toLowerCase(),
      reason: "delegated pairing",
    },
    supplier,
  );
  await grant("PAIR_OWN_RFID", false);
  expect(
    (
      await api(
        "rfid",
        { operation: "unpair", item_id: a.id, reason: "revoked" },
        supplier,
      )
    ).http,
  ).toBe(403);
  expect(
    (
      await api("rfid", {
        operation: "pair",
        item_id: b.id,
        epc: epc(1),
        reason: "duplicate",
      })
    ).http,
  ).toBe(409);
  await ok("rfid", {
    operation: "pair",
    item_id: a.id,
    epc: epc(2),
    reason: "damaged tag replacement",
  });
  expect((await unit(a.id)).uid).toBe(a.uid);
  expect((await ok("inventory?search=" + epc(1))).items).toHaveLength(0);
  expect((await ok("inventory?search=" + epc(2))).items[0].id).toBe(a.id);
  const race = await Promise.all([
    api("rfid", {
      operation: "pair",
      item_id: items[2].id,
      epc: epc(3),
      reason: "concurrent",
    }),
    api("rfid", {
      operation: "pair",
      item_id: items[3].id,
      epc: epc(3),
      reason: "concurrent",
    }),
  ]);
  expect(race.map((r) => r.http).sort()).toEqual([200, 409]);
  for (let n = 0; n < 5; n++)
    await ok("rfid", {
      operation: "pair",
      item_id: items[n].id,
      epc: epc(10 + n),
      reason: "count fixture",
    });
});
test("count snapshot deduplicates five EPCs and UID aliases, flags missing/unknown, never changes stock", async () => {
  const session = (
    await ok("rfid", { operation: "create_count", supplier_id: supplierId })
  ).id;
  let report: any;
  for (let n = 0; n < 5; n++)
    report = await ok("rfid", {
      operation: "scan",
      session_id: session,
      value: epc(10 + n),
    });
  expect(report.distinct_count).toBe(5);
  expect(report.missing).toHaveLength(14);
  report = await ok("rfid", {
    operation: "scan",
    session_id: session,
    value: epc(10),
  });
  expect(report.distinct_count).toBe(5);
  expect(report.duplicate_reads).toBe(1);
  report = await ok("rfid", {
    operation: "scan",
    session_id: session,
    value: items[0].uid,
  });
  expect(report.distinct_count).toBe(5);
  expect(report.duplicate_reads).toBe(2);
  report = await ok("rfid", {
    operation: "scan",
    session_id: session,
    value: "FFFFFFFFFFFFFFFF",
  });
  expect(
    report.observations.some((o: any) => o.classification === "unknown"),
  ).toBe(true);
  expect(
    (
      await api(
        "rfid",
        { operation: "scan", session_id: session, value: items[0].uid },
        supplier,
      )
    ).http,
  ).toBe(403);
  expect((await api("rfid?id=" + session, undefined, other)).http).toBe(404);
  expect(
    (await ok("rfid?id=" + session, undefined, supplier)).distinct_count,
  ).toBe(5);
  await ok("rfid", { operation: "close_count", session_id: session });
  expect(
    (
      await api("rfid", {
        operation: "scan",
        session_id: session,
        value: items[0].uid,
      })
    ).http,
  ).toBe(409);
  expect((await unit(items[0].id)).status).toBe("available");
});
test("failed, cancelled and expired payments release the identical UID exactly once", async () => {
  const item = items[5];
  for (const outcome of ["failure", "cancel", "expired"]) {
    const order = await checkout(await current(item.offer_id));
    expect(order.http).toBe(200);
    expect((await unit(item.id)).status).toBe("reserved");
    if (outcome === "expired")
      await db.query(
        "UPDATE didar_order SET expires_at=now()-interval '1 minute' WHERE id=$1",
        [order.order.id],
      );
    const paid = await pay(
      order.order.id,
      outcome === "expired" ? "success" : outcome,
    );
    expect(paid.order.status).toBe(
      outcome === "expired" ? "expired" : "failed",
    );
    await pay(order.order.id, "success");
    expect((await unit(item.id)).status).toBe("available");
    expect((await current(item.offer_id)).quantity).toBe(1);
  }
});
test("concurrent checkout reserves/sells one exact UID; immutable pricing and supplier fulfillment permission", async () => {
  const item = items[0],
    offer = await current(item.offer_id);
  const buyers = await Promise.all([
    checkout(offer),
    checkout(offer, crypto.randomUUID(), customer2),
  ]);
  expect(buyers.map((b) => b.http).sort()).toEqual([200, 409]);
  const winner = buyers.findIndex((b) => b.http === 200);
  if (winner === 1) [customer, customer2] = [customer2, customer];
  const order = buyers[winner].order;
  expect((await unit(item.id)).status).toBe("reserved");
  expect((await current(offer.id)).quantity).toBe(0);
  const snapshot = (
    await db.query("SELECT * FROM didar_order_line WHERE order_id=$1", [
      order.id,
    ])
  ).rows[0];
  expect(snapshot.breakdown.price_model).toBe("gold_first_v1");
  expect(snapshot.breakdown.policy.making_bps).toBe(1200);
  expect(
    (
      await api("rfid", {
        operation: "pair",
        item_id: item.id,
        epc: "AAAAAAAAAAAAAAAA",
        reason: "reserved",
      })
    ).http,
  ).toBe(409);
  const callbacks = await Promise.all([
    pay(order.id, "success"),
    pay(order.id, "success"),
  ]);
  expect(callbacks.every((p) => p.order.status === "paid")).toBe(true);
  expect((await unit(item.id)).status).toBe("sold");
  const own = (await ok("orders", undefined, supplier)).orders.find(
    (o: any) => o.id === order.id,
  );
  expect(own.lines[0].items[0].uid).toBe(item.uid);
  expect(own.total_irr).toBeNull();
  expect(
    (
      await api(
        "fulfillment",
        { line_id: snapshot.id, status: "preparing" },
        supplier,
      )
    ).http,
  ).toBe(403);
  await grant("UPDATE_OWN_FULFILLMENT", true);
  await ok(
    "fulfillment",
    { line_id: snapshot.id, status: "preparing" },
    supplier,
  );
  await grant("UPDATE_OWN_FULFILLMENT", false);
  expect(
    (
      await api(
        "fulfillment",
        {
          line_id: snapshot.id,
          status: "dispatched",
          carrier: "QA",
          tracking_number: "QA",
        },
        supplier,
      )
    ).http,
  ).toBe(403);
  await ok("fulfillment", {
    line_id: snapshot.id,
    status: "dispatched",
    carrier: "QA",
    tracking_number: "QA",
  });
  await ok("fulfillment", { line_id: snapshot.id, status: "delivered" });
  const {
    rows: [rate],
  } = await db.query("SELECT * FROM didar_rate WHERE id=1");
  await ok("manage", {
    kind: "rate",
    rate_irr: Number(rate.rate_irr),
    tax_bps: rate.tax_bps,
    distribution_bps: 400,
    retail_bps: 800,
  });
  expect(
    (
      await db.query("SELECT breakdown FROM didar_order_line WHERE id=$1", [
        snapshot.id,
      ])
    ).rows[0].breakdown,
  ).toEqual(snapshot.breakdown);
  await ok("manage", {
    kind: "rate",
    rate_irr: Number(rate.rate_irr),
    tax_bps: rate.tax_bps,
    distribution_bps: 300,
    retail_bps: 700,
  });
  const count = (
    await ok("rfid", { operation: "create_count", supplier_id: supplierId })
  ).id;
  const report = await ok("rfid", {
    operation: "scan",
    session_id: count,
    value: item.uid,
  });
  expect(report.observations[0].classification).toBe("sold");
  expect(report.distinct_count).toBe(0);
});
test("physical return quarantines then restocks once; old callback never re-sells returned UID", async () => {
  const item = items[0],
    r = (
      await db.query(
        "SELECT * FROM didar_item_reservation WHERE item_id=$1 AND status='sold'",
        [item.id],
      )
    ).rows[0];
  await ok(
    "returns",
    { operation: "request", reservation_id: r.id, reason: "physical return" },
    customer,
  );
  await ok("returns", {
    operation: "receive",
    reservation_id: r.id,
    reason: "received and inspected",
  });
  expect((await unit(item.id)).status).toBe("returned");
  expect((await current(item.offer_id)).quantity).toBe(0);
  await ok("returns", {
    operation: "restock",
    reservation_id: r.id,
    reason: "quality approved",
  });
  await ok("returns", {
    operation: "restock",
    reservation_id: r.id,
    reason: "duplicate retry",
  });
  expect((await current(item.offer_id)).quantity).toBe(1);
  const order = (
    await db.query("SELECT order_id FROM didar_order_line WHERE id=$1", [
      r.order_line_id,
    ])
  ).rows[0].order_id;
  await pay(order, "success");
  expect((await unit(item.id)).status).toBe("available");
  const next = await checkout(await current(item.offer_id));
  expect(next.http).toBe(200);
  await pay(next.order.id, "success");
  expect((await unit(item.id)).status).toBe("sold");
  const {
    rows: [active],
  } = await db.query(
    "SELECT count(*)::int n FROM didar_item_reservation WHERE item_id=$1 AND status IN ('sold','reserved')",
    [item.id],
  );
  expect(active.n).toBe(1);
});
test("physical identity and posted source are database protected, legacy stock remains unserialized", async () => {
  await expect(
    db.query("UPDATE didar_inventory_item SET uid=$1 WHERE id=$2", [
      "REASSIGNED-UID",
      items[0].id,
    ]),
  ).rejects.toThrow();
  await expect(
    db.query("DELETE FROM didar_inventory_item WHERE id=$1", [items[0].id]),
  ).rejects.toThrow();
  await expect(
    db.query("UPDATE didar_intake_line SET total_weight_mg=1 WHERE id=$1", [
      lines[0].id,
    ]),
  ).rejects.toThrow();
  await expect(
    db.query("UPDATE didar_offer SET quantity=900 WHERE id=$1", [
      items[0].offer_id,
    ]),
  ).rejects.toThrow();
  const {
    rows: [legacy],
  } = await db.query(
    "SELECT count(*)::int n FROM didar_inventory_item i JOIN didar_offer o ON o.id=i.offer_id WHERE o.stock_mode='legacy'",
  );
  expect(legacy.n).toBe(0);
  const {
    rows: [audit],
  } = await db.query(
    "SELECT count(*)::int n FROM didar_audit WHERE details->>'supplier_id'=$1 AND details->>'admin_override'='true'",
    [supplierId],
  );
  expect(audit.n).toBeGreaterThan(0);
});

test("UID and active EPC uniqueness spans suppliers, with no competitor disclosure", async () => {
  const another = (
    await ok("intake", {
      operation: "create",
      supplier_id: "s1",
      invoice_number: tag + "-other-supplier",
      reference_purity: 750,
    })
  ).id;
  const line = (
    await ok("intake", {
      operation: "line",
      batch_id: another,
      product_id: product,
      description: "Cross-supplier registry fixture",
      quantity: 1,
      total_weight_mg: 1111,
      purity: 750,
      making_mode: "fixed_gold",
      making_weight_mg: 100,
    })
  ).id;
  expect(
    (
      await api("intake", {
        operation: "item",
        batch_id: another,
        line_id: line,
        weight_mg: 1111,
        uid: items[1].uid,
      })
    ).http,
  ).toBe(409);
  const uid = tag.toUpperCase() + "-OTHER";
  await ok("intake", {
    operation: "item",
    batch_id: another,
    line_id: line,
    weight_mg: 1111,
    uid,
  });
  const otherItem = (await ok("inventory?search=" + uid)).items[0];
  expect(
    (
      await api("rfid", {
        operation: "pair",
        item_id: otherItem.id,
        epc: epc(11),
        reason: "cross-supplier duplicate",
      })
    ).http,
  ).toBe(409);
  expect(
    (await ok("inventory?search=" + uid, undefined, supplier)).items,
  ).toHaveLength(0);
  expect(
    (
      await api(
        "rfid",
        {
          operation: "pair",
          item_id: otherItem.id,
          epc: epc(90),
          reason: "isolation test",
        },
        supplier,
      )
    ).http,
  ).toBe(403);
});
test("expiry sweep releases item UID exactly once and stock correction is independently authorized/audited", async () => {
  const item = items[6],
    order = await checkout(await current(item.offer_id));
  expect(order.http).toBe(200);
  await db.query(
    "UPDATE didar_order SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [order.order.id],
  );
  await ok("catalog");
  await ok("catalog");
  expect((await unit(item.id)).status).toBe("available");
  expect((await current(item.offer_id)).quantity).toBe(1);
  expect(
    (
      await api(
        "inventory",
        { item_id: item.id, status: "withdrawn", reason: "no permission" },
        supplier,
      )
    ).http,
  ).toBe(403);
  await grant("EDIT_OWN_INVENTORY", true);
  await ok(
    "inventory",
    {
      item_id: item.id,
      status: "withdrawn",
      reason: "authorized physical exception",
    },
    supplier,
  );
  expect((await current(item.offer_id)).quantity).toBe(0);
  await grant("EDIT_OWN_INVENTORY", false);
  expect(
    (
      await api(
        "inventory",
        { item_id: item.id, status: "available", reason: "revoked" },
        supplier,
      )
    ).http,
  ).toBe(403);
  await ok("inventory", {
    item_id: item.id,
    status: "available",
    reason: "administrator inventory review",
  });
  expect((await current(item.offer_id)).quantity).toBe(1);
});
test("explicit tolerance is versioned, admin-only, reason required, quantity exceptions still forbidden", async () => {
  const draft = (
    await ok("intake", {
      operation: "create",
      supplier_id: supplierId,
      invoice_number: tag + "-tolerance",
      reference_purity: 750,
    })
  ).id;
  const line = (
    await ok("intake", {
      operation: "line",
      batch_id: draft,
      product_id: product,
      description: "Tolerance fixture",
      quantity: 1,
      total_weight_mg: 1000,
      purity: 750,
      making_mode: "percent",
      making_bps: 0,
    })
  ).id;
  await ok("intake", {
    operation: "item",
    batch_id: draft,
    line_id: line,
    weight_mg: 1001,
  });
  expect(
    (
      await api("intake", {
        operation: "verify",
        batch_id: draft,
        reason: "no approved tolerance",
      })
    ).http,
  ).toBe(409);
  expect(
    (
      await api(
        "intake",
        {
          operation: "tolerance_policy",
          tolerance_mg: 1,
          reason: "unauthorized",
        },
        supplier,
      )
    ).http,
  ).toBe(403);
  await ok("intake", {
    operation: "tolerance_policy",
    tolerance_mg: 1,
    reason: "QA calibrated scale exception",
  });
  try {
    expect(
      (await api("intake", { operation: "verify", batch_id: draft })).http,
    ).toBe(409);
    await ok("intake", {
      operation: "verify",
      batch_id: draft,
      reason: "Explicit administrator accepts 1 mg documented scale deviation",
    });
    const saved = await ok("intake?id=" + draft);
    expect(saved.batch.verification).toMatchObject({
      exception: true,
      tolerance_mg: 1,
    });
  } finally {
    await ok("intake", {
      operation: "tolerance_policy",
      tolerance_mg: 0,
      reason: "Restore exact default after isolated QA exception",
    });
  }
  await ok("intake", { operation: "post", batch_id: draft });
  expect((await ok("intake?id=" + draft)).batch.status).toBe("posted");
});

test("equal-weight physical units share a derived offer and reserve/release an exact set for quantity two", async () => {
  const draft = (
    await ok("intake", {
      operation: "create",
      supplier_id: supplierId,
      invoice_number: tag + "-equal-weight",
      reference_purity: 750,
    })
  ).id;
  const line = (
    await ok("intake", {
      operation: "line",
      batch_id: draft,
      product_id: product,
      description: "Two separately measured equal weights",
      quantity: 2,
      total_weight_mg: 2222,
      purity: 750,
      making_mode: "fixed_gold",
      making_weight_mg: 10,
    })
  ).id;
  for (let n = 0; n < 2; n++)
    await ok("intake", {
      operation: "item",
      batch_id: draft,
      line_id: line,
      weight_mg: 1111,
      uid: tag + "-equal-" + n,
    });
  await ok("intake", { operation: "verify", batch_id: draft });
  await ok("intake", { operation: "post", batch_id: draft });
  const equal = (await ok("intake?id=" + draft)).items;
  expect(equal[0].offer_id).toBe(equal[1].offer_id);
  const offer = await current(equal[0].offer_id);
  expect(offer.quantity).toBe(2);
  const rate = (await ok("catalog")).rate;
  const order = await ok(
    "checkout",
    {
      idempotency_key: crypto.randomUUID(),
      rate_version: rate.version,
      address,
      lines: [{ offer_id: offer.id, quantity: 2, version: offer.version }],
    },
    customer,
  );
  const mapping = (
    await db.query(
      "SELECT i.uid FROM didar_item_reservation r JOIN didar_inventory_item i ON i.id=r.item_id JOIN didar_order_line l ON l.id=r.order_line_id WHERE l.order_id=$1",
      [order.order.id],
    )
  ).rows;
  expect(mapping.map((i: any) => i.uid).sort()).toEqual(
    equal.map((i: any) => i.uid).sort(),
  );
  expect((await current(offer.id)).quantity).toBe(0);
  await pay(order.order.id, "failure");
  await pay(order.order.id, "failure");
  expect((await current(offer.id)).quantity).toBe(2);
});

test("voided physical UID remains permanent; authorized unpair releases its tag without recreating stock", async () => {
  const draft = (
    await ok("intake", {
      operation: "create",
      supplier_id: supplierId,
      invoice_number: tag + "-void",
      reference_purity: 750,
    })
  ).id;
  const line = (
    await ok("intake", {
      operation: "line",
      batch_id: draft,
      product_id: product,
      description: "Void registry fixture",
      quantity: 1,
      total_weight_mg: 1000,
      purity: 750,
      making_mode: "percent",
      making_bps: 0,
    })
  ).id;
  const uid = tag + "-void-unit";
  await ok("intake", {
    operation: "item",
    batch_id: draft,
    line_id: line,
    weight_mg: 1000,
    uid,
  });
  const item = (await ok("inventory?search=" + uid)).items[0];
  await ok("rfid", {
    operation: "pair",
    item_id: item.id,
    epc: epc(95),
    reason: "draft tag",
  });
  await ok("intake", {
    operation: "void_item",
    batch_id: draft,
    line_id: line,
    item_id: item.id,
  });
  expect(
    (
      await api("rfid", {
        operation: "pair",
        item_id: item.id,
        epc: epc(96),
        reason: "invalid void pairing",
      })
    ).http,
  ).toBe(409);
  await ok("rfid", {
    operation: "unpair",
    item_id: item.id,
    reason: "release tag from void draft; retain UID",
  });
  expect(
    (
      await api("intake", {
        operation: "item",
        batch_id: draft,
        line_id: line,
        weight_mg: 1000,
        uid,
      })
    ).http,
  ).toBe(409);
  expect((await unit(item.id)).status).toBe("void");
  expect((await ok("inventory?search=" + epc(95))).items).toHaveLength(0);
});
