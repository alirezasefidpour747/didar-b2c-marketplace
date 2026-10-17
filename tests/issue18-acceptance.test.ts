import { beforeAll, afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { financeFixture, finDB as db } from "./financial-helpers";
import sharp from "../packages/api/node_modules/sharp";

// Independent reviewer-owned tests: no application imports, no mocked payment,
// and no direct insertion of mandates, sales, reservations or accounting facts.
const origin = process.env.TEST_API_URL!;
const disposable =
  process.env.DIDAR_DISPOSABLE_QA === "true" &&
  process.env.DIDAR_ENVIRONMENT === "local" &&
  /^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:\d+\/didar_qa$/.test(
    process.env.DATABASE_URL || "",
  );
let admin = "",
  proof = "";
const fixtures: any[] = [];
const reason =
  "Independent Issue 18 synthetic acceptance, no financial execution";

async function request(
  path: string,
  token = "",
  body?: any,
  context?: string,
  selected?: string,
) {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
      ...(context ? { "x-didar-context": context } : {}),
      ...(selected ? { "x-seller-id": selected } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
async function ok(
  path: string,
  token = "",
  body?: any,
  context?: string,
  selected?: string,
) {
  const r = await request(path, token, body, context, selected);
  expect(r.status, JSON.stringify(r.data)).toBe(200);
  return r.data;
}
const native = (action: string, body?: any) =>
  ok("/admin/didar/" + action, admin, body);
const fingerprint = (rows: any) =>
  createHash("sha256").update(JSON.stringify(rows)).digest("hex");

beforeAll(async () => {
  if (!disposable || process.env.DIDAR_AGENCY_MODE !== "sandbox")
    throw Error(
      "Independent acceptance requires explicit disposable loopback agency sandbox",
    );
  admin = (
    await ok("/auth/user/emailpass", "", {
      email: "native-admin@didar.test",
      password: "DidarNative2026!",
    })
  ).token;
  proof = (
    await ok("/didar/login", "", {
      email: "admin@didar.test",
      password: "DidarDemo2026!",
    })
  ).token;
  await ok("/admin/didar/connect", admin, { didar_token: proof });
});
afterAll(async () => {
  if (!disposable) return;
  if (fixtures.length)
    await db.query(
      "UPDATE didar_supplier SET active=false WHERE id=ANY($1::text[])",
      [fixtures.map((f) => f.sid)],
    );
  await db.query("DELETE FROM didar_native_actor WHERE user_id='demo-admin'");
});

async function fixture(mode = "MIXED", ownership = "CONSIGNMENT") {
  const f = await financeFixture(mode, proof);
  fixtures.push(f);
  if (ownership !== "CONSIGNMENT") {
    const id = (
      await native("finance", {
        operation: "contract_request",
        supplier_id: f.sid,
        mode,
        ownership,
        effective_at: new Date(Date.now() - 1000).toISOString(),
        due_days: 7,
        reason,
      })
    ).id;
    await native("finance", {
      operation: "contract_review",
      contract_id: id,
      approved: true,
      reason,
    });
  }
  f.contract = (
    await db.query(
      `SELECT t.* FROM didar_fin_contract t JOIN didar_fin_contract_review r ON r.contract_id=t.id
    WHERE supplier_id=$1 AND r.approved ORDER BY t.effective_at DESC,t.version DESC LIMIT 1`,
      [f.sid],
    )
  ).rows[0];
  return f;
}
async function intake(f: any, quantity = 1) {
  const batch = (
    await native("intake", {
      operation: "create",
      supplier_id: f.sid,
      invoice_number: "ind18-" + crypto.randomUUID(),
      reference_purity: 750,
    })
  ).id;
  const line = (
    await native("intake", {
      operation: "line",
      batch_id: batch,
      product_id: f.pid,
      description: reason,
      quantity,
      total_weight_mg: quantity * 100000,
      purity: 750,
      making_mode: "percent",
      making_bps: 1200,
    })
  ).id;
  for (let n = 0; n < quantity; n++)
    await native("intake", {
      operation: "item",
      batch_id: batch,
      line_id: line,
      weight_mg: 100000,
    });
  await native("intake", { operation: "verify", batch_id: batch });
  await native("intake", { operation: "post", batch_id: batch });
  const items = (await native("intake?id=" + batch)).items;
  const offer = (
    await db.query("SELECT * FROM didar_offer WHERE id=$1", [items[0].offer_id])
  ).rows[0];
  return { items, offer, batch };
}
async function mandate(f: any, mode = "AGENCY", extra: any = {}) {
  return (
    await native("agency", {
      operation: "mandate_request",
      supplier_id: f.sid,
      mode,
      contract_id: f.contract.id,
      effective_at: "2020-01-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
      rounding_limit_irr: 0,
      reason,
      ...extra,
    })
  ).id;
}
async function approve(id: string) {
  await native("agency", {
    operation: "mandate_review",
    mandate_id: id,
    approved: true,
    reason,
  });
}
const quote = (f: any, offer: any, method = "CASH", context?: string) =>
  ok(
    "/didar/quote",
    f.buyer,
    { payment_method: method, lines: [{ offer_id: offer.id, quantity: 1 }] },
    context,
  );
const checkoutBody = (q: any) => ({
  idempotency_key: crypto.randomUUID(),
  payment_method: q.payment_method,
  quote_key: q.quote_key,
  rate_version: q.rate_version,
  address: {
    name: "Independent QA",
    phone: "09123456789",
    city: "تهران",
    address: "نشانی آزمایشی مستقل",
    postal_code: "1234567890",
  },
  lines: q.lines.map((l: any) => ({
    offer_id: l.offer_id,
    version: l.version,
    quantity: l.quantity,
    quote_key: l.breakdown.quote_key,
  })),
});

async function profile(
  f: any,
  type: "RETAILER" | "MANUFACTURER",
  thirdParty = false,
  payer: "CUSTOMER" | "MERCHANT" = "CUSTOMER",
) {
  const code = "i18_" + crypto.randomUUID().replaceAll("-", "");
  const op = (body: any) => native("merchant-pricing", { reason, ...body });
  const policy = (
    await op({ operation: "tax_policy_save", code, name: reason })
  ).id;
  const tax = (
    await op({
      operation: "tax_draft",
      policy_id: policy,
      bps: 1000,
      taxable_components: ["making", "distribution", "retail", "credit"],
    })
  ).id;
  await op({ operation: "tax_review", id: tax, approved: true });
  const p = (
    await op({
      operation: "profile_save",
      code,
      name: reason,
      merchant_types: [type],
    })
  ).id;
  const rules = ["distribution", "retail", "credit"].map((component) => ({
    code: component,
    label: component,
    component,
    mode: "PERCENT",
    basis: "GOLD_BASE_750_IRR",
    value:
      component === "distribution" ? 300 : component === "retail" ? 700 : 250,
    scope: "ITEM",
    payer,
    recipient:
      thirdParty && component === "distribution" ? "THIRD_PARTY" : "DIDAR",
    application_mode: component === "credit" ? "CREDIT_ONLY" : "ALWAYS",
  }));
  const version = (
    await op({
      operation: "version_draft",
      profile_id: p,
      tax_version_id: tax,
      rules,
    })
  ).id;
  await op({ operation: "version_review", id: version, approved: true });
  const revision = (
    await db.query("SELECT pricing_revision FROM didar_supplier WHERE id=$1", [
      f.sid,
    ])
  ).rows[0].pricing_revision;
  await op({
    operation: "classify",
    supplier_id: f.sid,
    commercial_type: type,
    revision,
  });
  await op({
    operation: "switch",
    supplier_id: f.sid,
    profile_version_id: version,
  });
  return { tax, version };
}
async function accepted(f: any, offer: any, method = "CASH", context?: string) {
  const q = await quote(f, offer, method, context);
  const order = (await ok("/didar/checkout", f.buyer, checkoutBody(q), context))
    .order;
  return { q, order };
}
async function sales(order: any) {
  return (
    await db.query(
      `SELECT e.* FROM didar_fin_event e JOIN didar_order_line l ON l.id=e.order_line_id
    WHERE l.order_id=$1 AND e.kind='SALE_EXPOSURE' ORDER BY e.id`,
      [order.id],
    )
  ).rows;
}
async function postings(event: any) {
  return (
    await db.query(
      `SELECT p.* FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id
    WHERE j.event_id=$1 ORDER BY p.id`,
      [event.id],
    )
  ).rows;
}
function balanced(rows: any[]) {
  const sums: Record<string, bigint> = {};
  for (const row of rows)
    sums[row.instrument] = (sums[row.instrument] || 0n) + BigInt(row.delta);
  expect(rows.length).toBeGreaterThan(1);
  for (const value of Object.values(sums)) expect(value).toBe(0n);
}

for (const type of ["RETAILER", "MANUFACTURER"] as const) {
  test(`I18 independent ${type} agency CASH/CREDIT: exact single liability, collection and frozen tenant-safe invoice`, async () => {
    const f = await fixture(),
      pricing = await profile(f, type),
      { offer, items } = await intake(f, 2);
    await approve(await mandate(f));
    const paid: any[] = [];
    for (const method of ["CASH", "CREDIT"]) {
      const { q, order } = await accepted(f, offer, method);
      await Promise.all(
        [1, 2, 3].map(() =>
          ok("/didar/payment", f.buyer, {
            order_id: order.id,
            outcome: "success",
          }),
        ),
      );
      const facts = await sales(order);
      expect(facts).toHaveLength(1);
      const sale = facts[0],
        rows = await postings(sale);
      const frozenRate = BigInt(
        (
          await db.query(
            "SELECT rate_snapshot->>'rate_irr' rate FROM didar_order WHERE id=$1",
            [order.id],
          )
        ).rows[0].rate,
      );
      const expectedRial = (
        (42000000n * frozenRate + 749999n) /
        750000n
      ).toString();
      paid.push({ order, sale, q });
      expect(sale.supplier_id).toBe(f.sid);
      expect(sale.gold_ug).toBe("42000000");
      expect(sale.irr).toBe(expectedRial);
      expect(sale.snapshot.contract.id).toBe(f.contract.id);
      expect(items.some((i: any) => i.uid === sale.snapshot.uid)).toBe(true);
      expect(sale.snapshot.customer_payment_irr).toBe(String(q.total_irr));
      const role = sale.snapshot.sale_role,
        allocation = sale.snapshot.allocation;
      expect(role).toMatchObject({
        schema_version: 1,
        mode: "AGENCY",
        principal_id: f.sid,
        physical_supplier_id: f.sid,
        payee_id: f.sid,
        issuer: "DIDAR",
        collector: "DIDAR",
        on_behalf: true,
      });
      expect(allocation.rule).toBe("COMPONENTS_V1");
      expect(allocation.profile_version_id).toBe(pricing.version);
      expect(allocation.tax_version_id).toBe(pricing.tax);
      expect(allocation.conversion_adjustment_irr).toBe("0");
      expect(BigInt(allocation.collection_irr)).toBe(
        BigInt(allocation.seller_gold_book_irr) +
          BigInt(allocation.seller_rial_irr) +
          BigInt(allocation.didar_share_irr) +
          BigInt(allocation.third_party_irr) +
          BigInt(allocation.tax_irr),
      );
      expect(BigInt(allocation.didar_share_irr)).toBeGreaterThan(0n);
      balanced(rows);
      expect(
        rows.filter(
          (p) => p.account === "CASH_CLEARING" && BigInt(p.delta) > 0n,
        ),
      ).toHaveLength(1);
      expect(
        rows.find((p) => p.account === "SUPPLIER_RIAL_PAYABLE")?.delta,
      ).toBe("-" + expectedRial);
      expect(
        rows.find((p) => p.account === "SUPPLIER_GOLD_PAYABLE")?.delta,
      ).toBe("-42000000");
      expect(
        rows.filter((p) => p.account === "PRINCIPAL_REVENUE"),
      ).toHaveLength(0);
      expect(
        rows.some(
          (p) =>
            p.instrument === "IRR" &&
            /REVENUE$/.test(p.account) &&
            BigInt(p.delta) < 0n,
        ),
      ).toBe(true);
      expect(
        rows.every(
          (p) => p.party === "DIDAR" || p.party === "supplier:" + f.sid,
        ),
      ).toBe(true);
      const invoice = await ok("/didar/invoice?order_id=" + order.id, f.buyer);
      const text = JSON.stringify(invoice);
      expect(text).toContain("AGENCY");
      expect(text).toContain(f.sid);
      expect(text).toContain(sale.snapshot.uid);
      expect(text).not.toContain("owned_cost_irr");
      expect(text).not.toContain("acquisition");
      expect(text).not.toContain("cost_basis_irr");
      expect(
        JSON.stringify(
          await ok("/didar/invoice?order_id=" + order.id, f.buyer),
        ),
      ).toBe(text);
      const stranger = (
        await ok("/didar/register", "", {
          email: "i18-other-" + crypto.randomUUID() + "@didar.test",
          password: "IndependentOther2026!",
          name: reason,
        })
      ).token;
      expect(
        (await request("/didar/invoice?order_id=" + order.id, stranger)).status,
      ).toBe(404);
      const attempts = (
        await db.query(
          "SELECT * FROM didar_payment_attempt WHERE order_id=$1",
          [order.id],
        )
      ).rows;
      expect(attempts).toHaveLength(1);
      expect(attempts[0].status).toBe("success");
      expect(
        (
          await db.query("SELECT * FROM didar_fin_journal WHERE event_id=$1", [
            sale.id,
          ])
        ).rowCount,
      ).toBe(1);
      expect(JSON.stringify(q)).not.toContain("contract_request");
    }
    expect(BigInt(paid[1].order.total_irr)).toBeGreaterThan(
      BigInt(paid[0].order.total_irr),
    );
    expect(paid[0].sale.snapshot.uid).not.toBe(paid[1].sale.snapshot.uid);
    expect(JSON.stringify(paid[1].sale.snapshot)).toContain(pricing.tax);
    expect(JSON.stringify(paid[1].sale.snapshot)).toContain(pricing.version);
    const latestMandate = (
      await db.query(
        "SELECT id FROM didar_sale_mandate WHERE supplier_id=$1 ORDER BY version DESC LIMIT 1",
        [f.sid],
      )
    ).rows[0].id;
    const frozenDocument = await ok(
      "/didar/invoice?order_id=" + paid[1].order.id,
      f.buyer,
    );
    await native("agency", {
      operation: "mandate_revoke",
      mandate_id: latestMandate,
      reason,
    });
    await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [
      f.sid,
    ]);
    try {
      expect(
        await ok("/didar/invoice?order_id=" + paid[1].order.id, f.seller),
      ).toEqual(frozenDocument);
      const history = await ok("/didar/history", f.seller);
      expect(history.orders.some((o: any) => o.id === paid[1].order.id)).toBe(
        true,
      );
      expect(JSON.stringify(history)).not.toContain("postal_code");
      expect(JSON.stringify(history)).not.toContain("customer_id");
    } finally {
      await db.query("UPDATE didar_supplier SET active=true WHERE id=$1", [
        f.sid,
      ]);
    }
  }, 90000);
}

test("I18 independent DIRECT_DIDAR has no external principal obligation or duplicated agency journal", async () => {
  const f = await fixture("RIAL_ONLY", "DIDAR_OWNED"),
    { offer, batch } = await intake(f);
  const cost = "5000000000";
  const valuation = (
    await native("finance", {
      operation: "jewelry_value",
      batch_id: batch,
      cost_irr: cost,
      document: "Independent synthetic owned-stock cost evidence",
      reason,
    })
  ).event;
  await approve(await mandate(f, "DIRECT_DIDAR"));
  const { q, order } = await accepted(f, offer);
  expect(JSON.stringify(q)).toContain("DIRECT_DIDAR");
  await ok("/didar/payment", f.buyer, {
    order_id: order.id,
    outcome: "success",
  });
  const facts = await sales(order);
  expect(facts).toHaveLength(1);
  const sale = facts[0],
    rows = await postings(sale);
  expect(sale.gold_ug).toBe("0");
  expect(sale.irr).toBe("0");
  expect(sale.snapshot.owned_cost_irr).toBe(cost);
  expect(sale.snapshot.valuation_event_id).toBe(valuation.id);
  expect(
    rows.filter((p) => /SUPPLIER_.*PAYABLE|AGENCY.*PAYABLE/.test(p.account)),
  ).toHaveLength(0);
  expect(
    rows.some((p) => p.account === "PRINCIPAL_REVENUE" && BigInt(p.delta) < 0n),
  ).toBe(true);
  expect(rows.find((p) => p.account === "COGS")?.delta).toBe(cost);
  balanced(rows);
  const invoice = await ok("/didar/invoice?order_id=" + order.id, f.buyer);
  expect(JSON.stringify(invoice)).toContain("DIRECT_DIDAR");
  expect(
    (await request("/didar/invoice?order_id=" + order.id, f.seller)).status,
  ).toBe(404);
  const ownFinance = await ok("/didar/finance", f.seller);
  const ownValuation = ownFinance.events.find(
    (e: any) => e.id === valuation.id,
  );
  expect(ownValuation.snapshot.cost_irr).toBeUndefined();
  expect(ownValuation.snapshot.document).toBeUndefined();
  expect(ownValuation.snapshot.items).toBeUndefined();
  const ownSale = ownFinance.events.find((e: any) => e.id === sale.id);
  for (const key of [
    "owned_cost_irr",
    "cost_basis_irr",
    "sale_role",
    "allocation",
    "customer_payment_irr",
  ])
    expect(ownSale.snapshot[key]).toBeUndefined();
  const adminValuation = (await native("finance")).events.find(
    (e: any) => e.id === valuation.id,
  );
  expect(adminValuation.snapshot.cost_irr).toBe(cost);
  expect(adminValuation.snapshot.document).toBe(
    "Independent synthetic owned-stock cost evidence",
  );
  expect(
    (
      await db.query("SELECT snapshot FROM didar_fin_event WHERE id=$1", [
        valuation.id,
      ])
    ).rows[0].snapshot.cost_irr,
  ).toBe(cost);
  // A physical source on DIDAR's direct sale is not automatically a merchant
  // service debtor. No approved upstream fee obligation is invented here.
  const originalRole = fingerprint(
    (
      await db.query(
        "SELECT * FROM didar_sale_role WHERE line_id IN (SELECT id FROM didar_order_line WHERE order_id=$1)",
        [order.id],
      )
    ).rows,
  );
  const attemptsBefore = (
    await db.query(
      "SELECT count(*)::int n FROM didar_payment_attempt WHERE order_id IN (SELECT id FROM didar_order WHERE customer_id=$1)",
      [f.buyerId],
    )
  ).rows[0].n;
  await profile(f, "RETAILER", false, "MERCHANT");
  const remaining = await intake(f);
  const deniedQuote = await request("/didar/quote", f.buyer, {
    payment_method: "CASH",
    lines: [{ offer_id: remaining.offer.id, quantity: 1 }],
  });
  expect(deniedQuote.status).toBe(409);
  expect(deniedQuote.data.message).toBe("CONFLICT_AGENCY_DIRECT_PAYER");
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM didar_payment_attempt WHERE order_id IN (SELECT id FROM didar_order WHERE customer_id=$1)",
        [f.buyerId],
      )
    ).rows[0].n,
  ).toBe(attemptsBefore);
  expect(
    fingerprint(
      (
        await db.query(
          "SELECT * FROM didar_sale_role WHERE line_id IN (SELECT id FROM didar_order_line WHERE order_id=$1)",
          [order.id],
        )
      ).rows,
    ),
  ).toBe(originalRole);
}, 60000);

test("I18 independent partial GOLD/IRR settlement then return/refund keeps original allocation and explicit recoverable", async () => {
  const f = await fixture(),
    { offer, items } = await intake(f);
  await approve(await mandate(f));
  const { order } = await accepted(f, offer);
  await ok("/didar/payment", f.buyer, {
    order_id: order.id,
    outcome: "success",
  });
  const sale = (await sales(order))[0];
  const original = fingerprint(sale);
  const originalInvoice = (
    await ok("/didar/invoice?order_id=" + order.id, f.buyer)
  ).documents[0];
  const command = (body: any) =>
    native("treasury", {
      idempotency_key: crypto.randomUUID(),
      reason,
      ...body,
    });
  await command({ operation: "request_approve", sale_id: sale.id });
  const purchase = (
    await command({
      operation: "purchase",
      synthetic: true,
      weight_mg: "60000",
      purity: 995,
      cost_irr: "5174000000",
      rate_irr: sale.snapshot.rate_irr,
      currency: "IRR",
      counterparty: reason,
      document: "INDEPENDENT_QA_GOLD_COST",
      custody: "Disposable QA custody",
      title_confirmed: true,
    })
  ).event;
  await command({ operation: "purchase_approve", purchase_id: purchase.id });
  const allocation = (
    await command({
      operation: "allocate",
      sale_id: sale.id,
      purchase_id: purchase.id,
      amount_ug: "42000000",
    })
  ).event;
  await command({
    operation: "title_transfer",
    allocation_id: allocation.id,
    document: "Independent synthetic title evidence",
  });
  await command({
    operation: "physical_handover",
    allocation_id: allocation.id,
    disposition: "HELD_FOR_SUPPLIER",
    document: "Independent synthetic custody evidence",
  });
  const goldKey = crypto.randomUUID(),
    rialKey = crypto.randomUUID();
  for (let repeat = 0; repeat < 2; repeat++) {
    await command({
      operation: "gold_settle",
      allocation_id: allocation.id,
      amount_ug: "10000000",
      idempotency_key: goldKey,
    });
    await command({
      operation: "rial_settle",
      sale_id: sale.id,
      amount_irr: "1000",
      document: reason,
      idempotency_key: rialKey,
    });
  }
  const partial = (await native("treasury")).requests.find(
    (r: any) => r.sale_event_id === sale.id,
  );
  expect(partial.balance).toEqual({
    gold_ug: "32000000",
    irr: (BigInt(sale.irr) - 1000n).toString(),
  });
  await ok("/didar/returns", f.buyer, {
    operation: "request",
    reservation_id: sale.reservation_id,
    reason,
  });
  await native("returns", {
    operation: "receive",
    reservation_id: sale.reservation_id,
    reason,
  });
  const refunded = (
    await native("finance", { operation: "refund", event_id: sale.id, reason })
  ).event;
  const retry = (
    await native("finance", { operation: "refund", event_id: sale.id, reason })
  ).event;
  expect(retry.id).toBe(refunded.id);
  expect(refunded.snapshot.sale_role).toEqual(sale.snapshot.sale_role);
  expect(refunded.snapshot.allocation).toEqual(sale.snapshot.allocation);
  const recoverable = (await native("treasury")).requests.find(
    (r: any) => r.sale_event_id === sale.id,
  );
  expect(recoverable.balance).toEqual({ gold_ug: "-10000000", irr: "-1000" });
  const refundPostings = await postings(refunded);
  expect(
    refundPostings.find(
      (p) =>
        p.account === "SUPPLIER_REFUND_RECOVERABLE" &&
        p.instrument === "GOLD_UG",
    )?.delta,
  ).toBe("10000000");
  expect(
    refundPostings.find(
      (p) =>
        p.account === "SUPPLIER_REFUND_RECOVERABLE" && p.instrument === "IRR",
    )?.delta,
  ).toBe("1000");
  expect(
    fingerprint(
      (await db.query("SELECT * FROM didar_fin_event WHERE id=$1", [sale.id]))
        .rows[0],
    ),
  ).toBe(original);
  expect(
    (
      await db.query("SELECT status FROM didar_inventory_item WHERE id=$1", [
        items[0].id,
      ])
    ).rows[0].status,
  ).not.toBe("available");
  const documents = (await ok("/didar/invoice?order_id=" + order.id, f.buyer))
    .documents;
  expect(documents).toHaveLength(2);
  expect(documents[0]).toEqual(originalInvoice);
  expect(documents[1]).toMatchObject({
    kind: "CREDIT",
    original_document_id: originalInvoice.id,
  });
  expect(documents[1].snapshot.lines[0].uids).toEqual([sale.snapshot.uid]);
  expect(documents[1].snapshot.physical_restock).toBe(false);
  const journalRows = (
    await db.query(
      `SELECT p.* FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id
    JOIN didar_fin_event e ON e.id=j.event_id WHERE e.id=$1 OR e.source_event_id=$1`,
      [sale.id],
    )
  ).rows;
  for (const id of new Set(journalRows.map((p) => p.journal_id)))
    balanced(journalRows.filter((p) => p.journal_id === id));
}, 90000);

test("I18 independent accepted-order mandate replacement and commercial suspension block payment without consuming UID", async () => {
  const f = await fixture(),
    { offer, items } = await intake(f, 2);
  await approve(await mandate(f));
  const { order } = await accepted(f, offer);
  await approve(await mandate(f));
  expect(
    (
      await request("/didar/payment", f.buyer, {
        order_id: order.id,
        outcome: "success",
      })
    ).status,
  ).toBe(409);
  expect(await sales(order)).toHaveLength(0);
  const second = await accepted(f, offer);
  await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [f.sid]);
  try {
    expect(
      (
        await request("/didar/payment", f.buyer, {
          order_id: second.order.id,
          outcome: "success",
        })
      ).status,
    ).toBe(409);
    expect(await sales(second.order)).toHaveLength(0);
    const statuses = (
      await db.query(
        "SELECT status FROM didar_inventory_item WHERE id=ANY($1::text[])",
        [items.map((i: any) => i.id)],
      )
    ).rows;
    expect(statuses.every((i) => i.status !== "sold")).toBe(true);
  } finally {
    await db.query("UPDATE didar_supplier SET active=true WHERE id=$1", [
      f.sid,
    ]);
  }
}, 60000);

async function store(f: any) {
  const handle = "i18-" + crypto.randomUUID().slice(0, 12);
  await native("storefront", {
    kind: "save",
    supplier_id: f.sid,
    handle,
    name: reason,
    visibility: "UNLISTED_LINK",
    published: true,
    approved: true,
  });
  const context = (await ok("/didar/storefront", "", { kind: "enter", handle }))
    .context_token;
  return { handle, context };
}
test("I18 independent curation gates catalog/count/PDP/media and invoice; two shops race the same physical UID", async () => {
  const a = await fixture(),
    b = await fixture(),
    stranger = await fixture();
  const { offer } = await intake(b, 2);
  await approve(await mandate(b));
  const [sa, sb, sc] = await Promise.all([store(a), store(b), store(stranger)]);
  const product = (
    await db.query("SELECT title,public_key FROM didar_product WHERE id=$1", [
      b.pid,
    ])
  ).rows[0];
  const photo = await sharp({
    create: { width: 1000, height: 700, channels: 3, background: "#b99138" },
  })
    .png()
    .toBuffer();
  const asset = (
    await native("media", {
      operation: "upload",
      supplier_id: b.sid,
      product_id: b.pid,
      data: photo.toString("base64"),
      mime_type: "image/png",
      alt: reason,
      allow_shared: false,
      idempotency_key: crypto.randomUUID(),
    })
  ).id;
  await native("media", {
    operation: "review",
    asset_id: asset,
    approved: true,
    visibility: "MERCHANT_ONLY",
    reason,
  });
  const catalog = (context: string) =>
    ok(
      "/didar/catalog?q=" +
        encodeURIComponent(product.title) +
        "&page=1&limit=1",
      b.buyer,
      undefined,
      context,
    );
  const image = (context?: string) =>
    fetch(origin + "/didar/image?id=" + encodeURIComponent(asset), {
      headers: context ? { "x-didar-context": context } : {},
    });
  expect((await catalog(sa.context)).total).toBe(0);
  expect((await image(sa.context)).status).toBe(404);
  expect((await image()).status).toBe(404);
  const agreement = (
    await native("curation", {
      operation: "request",
      store_supplier_id: a.sid,
      seller_supplier_id: b.sid,
      offer_id: offer.id,
      effective_at: "2020-01-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
      reason,
    })
  ).id;
  expect((await catalog(sa.context)).total).toBe(0);
  await native("curation", {
    operation: "review",
    agreement_id: agreement,
    approved: true,
    reason,
  });
  const definitions = async () =>
    (
      await db.query(
        `SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname=ANY($1::text[]) ORDER BY proname`,
        [
          [
            "didar_global_supplier",
            "didar_visible_product",
            "didar_media_visible",
            "didar_scoped_offer",
            "didar_curated_offer",
          ],
        ],
      )
    ).rows;
  const beforeDefinitions = fingerprint(await definitions());
  for (const schema of ["storefront", "onboarding", "native-lifecycle"]) {
    await db.query(
      readFileSync("packages/api/src/didar/" + schema + "-schema.sql", "utf8"),
    );
    expect(fingerprint(await definitions())).toBe(beforeDefinitions);
    expect((await catalog(sa.context)).total).toBe(1);
    expect((await image(sa.context)).status).toBe(200);
    expect((await catalog(sc.context)).total).toBe(0);
    expect((await image(sc.context)).status).toBe(404);
    expect((await image()).status).toBe(404);
  }
  const curated = await catalog(sa.context);
  expect(curated.total).toBe(1);
  expect(curated.products).toHaveLength(1);
  expect(curated.products[0].id).toBe(b.pid);
  expect(curated.products[0].offers.map((o: any) => o.id)).toEqual([offer.id]);
  expect(curated.products[0].canonical_path).toBe(
    "/m/" + sa.handle + "/products/" + product.public_key,
  );
  expect((await image(sa.context)).status).toBe(200);
  expect((await image(sc.context)).status).toBe(404);
  expect((await catalog(sc.context)).total).toBe(0);
  const preview = await ok(
    "/didar/storefront?handle=" +
      sa.handle +
      "&product_key=" +
      product.public_key,
  );
  expect(preview.preview.title).toBe(product.title);
  const acceptedBeforeRevoke = await accepted(b, offer, "CASH", sa.context);
  await native("curation", {
    operation: "revoke",
    agreement_id: agreement,
    reason,
  });
  expect((await catalog(sa.context)).total).toBe(0);
  expect((await image(sa.context)).status).toBe(404);
  expect(
    (
      await request(
        "/didar/payment",
        b.buyer,
        { order_id: acceptedBeforeRevoke.order.id, outcome: "success" },
        sa.context,
      )
    ).status,
  ).toBe(409);
  expect(await sales(acceptedBeforeRevoke.order)).toHaveLength(0);
  const restored = (
    await native("curation", {
      operation: "request",
      store_supplier_id: a.sid,
      seller_supplier_id: b.sid,
      offer_id: offer.id,
      effective_at: "2020-01-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
      reason,
    })
  ).id;
  await native("curation", {
    operation: "review",
    agreement_id: restored,
    approved: true,
    reason,
  });
  const [qa, qb] = await Promise.all([
    quote(b, offer, "CASH", sa.context),
    quote(b, offer, "CASH", sb.context),
  ]);
  const race = await Promise.all([
    request("/didar/checkout", b.buyer, checkoutBody(qa), sa.context),
    request("/didar/checkout", b.buyer, checkoutBody(qb), sb.context),
  ]);
  expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
  const winnerIndex = race.findIndex((r) => r.status === 200),
    winner = race[winnerIndex].data.order;
  await ok(
    "/didar/payment",
    b.buyer,
    { order_id: winner.id, outcome: "success" },
    winnerIndex === 0 ? sa.context : sb.context,
  );
  const events = await sales(winner);
  expect(events).toHaveLength(1);
  expect(events[0].supplier_id).toBe(b.sid);
  expect(events[0].snapshot.sale_role.principal_id).toBe(b.sid);
  expect(
    events[0].snapshot.allocation.charges.some(
      (charge: any) => charge.payee_id === a.sid,
    ),
  ).toBe(false);
  const rows = (
    await db.query(
      `SELECT r.item_id,r.status FROM didar_item_reservation r JOIN didar_order_line l ON l.id=r.order_line_id
    WHERE l.order_id=$1`,
      [winner.id],
    )
  ).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("sold");
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM didar_item_reservation WHERE item_id=$1 AND status='sold'",
        [rows[0].item_id],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (await request("/didar/invoice?order_id=" + winner.id, a.seller)).status,
  ).toBe(404);
  expect(
    (await request("/didar/invoice?order_id=" + winner.id, stranger.seller))
      .status,
  ).toBe(404);
  expect(
    (await ok("/didar/invoice?order_id=" + winner.id, b.seller)).documents,
  ).toHaveLength(1);
  const invoicePath = "/didar/invoice?order_id=" + winner.id;
  expect((await ok(invoicePath, b.buyer)).documents).toHaveLength(1);
  expect(
    (
      await ok(
        invoicePath,
        b.buyer,
        undefined,
        winnerIndex === 0 ? sa.context : sb.context,
      )
    ).documents,
  ).toHaveLength(1);
  expect(
    (await request(invoicePath, b.buyer, undefined, sc.context)).status,
  ).toBe(404);
}, 120000);

test("I18 independent unknown beneficiary fails before collection; approved beneficiary is separately frozen once", async () => {
  const f = await fixture(),
    beneficiary = await fixture();
  await profile(f, "RETAILER", true);
  const { offer } = await intake(f);
  await approve(await mandate(f));
  const invalid = await request("/didar/quote", f.buyer, {
    payment_method: "CASH",
    lines: [{ offer_id: offer.id, quantity: 1 }],
  });
  expect(invalid.status).toBe(409);
  expect(
    (
      await db.query(
        `SELECT count(*)::int n FROM didar_payment_attempt p JOIN didar_order o ON o.id=p.order_id
    WHERE o.customer_id=$1`,
        [f.buyerId],
      )
    ).rows[0].n,
  ).toBe(0);
  await approve(
    await mandate(f, "AGENCY", {
      beneficiaries: { distribution: beneficiary.sid },
    }),
  );
  const { q, order } = await accepted(f, offer);
  await ok("/didar/payment", f.buyer, {
    order_id: order.id,
    outcome: "success",
  });
  const sale = (await sales(order))[0],
    allocation = sale.snapshot.allocation;
  expect(BigInt(allocation.third_party_irr)).toBeGreaterThan(0n);
  expect(
    allocation.charges.find((charge: any) => charge.code === "distribution")
      .payee_id,
  ).toBe(beneficiary.sid);
  expect(sale.snapshot.sale_role.beneficiaries).toEqual({
    distribution: beneficiary.sid,
  });
  const rows = await postings(sale);
  balanced(rows);
  expect(
    rows.filter(
      (p) =>
        p.account === "PROFILE_PARTNER_PAYABLE" &&
        p.party === "supplier:" + beneficiary.sid,
    ),
  ).toHaveLength(1);
  expect(rows.some((p) => p.party === "THIRD_PARTY")).toBe(false);
  expect(BigInt(q.total_irr)).toBe(BigInt(allocation.collection_irr));
}, 60000);

test("I18 independent changed approved profile/tax before payment requires requote and never collects old terms", async () => {
  const f = await fixture();
  const initial = await profile(f, "RETAILER"),
    { offer } = await intake(f, 2);
  await approve(await mandate(f));
  const { q, order } = await accepted(f, offer, "CREDIT");
  const originalRole = fingerprint(
    (
      await db.query(
        "SELECT * FROM didar_sale_role WHERE line_id IN (SELECT id FROM didar_order_line WHERE order_id=$1)",
        [order.id],
      )
    ).rows,
  );
  const replacement = await profile(f, "RETAILER");
  expect(replacement.version).not.toBe(initial.version);
  expect(replacement.tax).not.toBe(initial.tax);
  const payment = await request("/didar/payment", f.buyer, {
    order_id: order.id,
    outcome: "success",
  });
  expect(payment.status).toBe(409);
  expect(
    (await request("/didar/checkout", f.buyer, checkoutBody(q))).status,
  ).toBe(409);
  expect(await sales(order)).toHaveLength(0);
  expect(
    (
      await db.query("SELECT * FROM didar_payment_attempt WHERE order_id=$1", [
        order.id,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    fingerprint(
      (
        await db.query(
          "SELECT * FROM didar_sale_role WHERE line_id IN (SELECT id FROM didar_order_line WHERE order_id=$1)",
          [order.id],
        )
      ).rows,
    ),
  ).toBe(originalRole);
}, 60000);

test("I18 independent mandate governance denies unauthenticated/customer/supplier approval and unapproved sales", async () => {
  const f = await fixture(),
    { offer } = await intake(f),
    id = await mandate(f);
  const operation = {
    operation: "mandate_review",
    mandate_id: id,
    approved: true,
    reason,
  };
  for (const token of ["", f.buyer, f.seller]) {
    expect((await request("/didar/agency", token, operation)).status).toBe(
      token ? 403 : 401,
    );
  }
  expect(
    (
      await request("/didar/quote", f.buyer, {
        lines: [{ offer_id: offer.id, quantity: 1 }],
      })
    ).status,
  ).toBe(409);
  await approve(id);
  const q = await quote(f, offer);
  expect(q.lines).toHaveLength(1);
  expect(JSON.stringify(q)).toContain("AGENCY");
  expect(JSON.stringify(q)).not.toContain(f.contract.reason);
}, 60000);

test("I18 independent revocation and expiry invalidate new economics without rewriting contract history", async () => {
  const f = await fixture(),
    { offer } = await intake(f),
    id = await mandate(f);
  await approve(id);
  const q = await quote(f, offer);
  const contractsBefore = fingerprint(
    (
      await db.query(
        "SELECT * FROM didar_fin_contract WHERE supplier_id=$1 ORDER BY id",
        [f.sid],
      )
    ).rows,
  );
  await native("agency", {
    operation: "mandate_revoke",
    mandate_id: id,
    reason,
  });
  const stale = await request("/didar/checkout", f.buyer, checkoutBody(q));
  expect(stale.status).toBe(409);
  expect(
    (
      await request("/didar/quote", f.buyer, {
        lines: [{ offer_id: offer.id, quantity: 1 }],
      })
    ).status,
  ).toBe(409);
  expect(
    fingerprint(
      (
        await db.query(
          "SELECT * FROM didar_fin_contract WHERE supplier_id=$1 ORDER BY id",
          [f.sid],
        )
      ).rows,
    ),
  ).toBe(contractsBefore);
  const expired = await mandate(f, "AGENCY", {
    effective_at: "2020-01-01T00:00:00Z",
    expires_at: "2021-01-01T00:00:00Z",
  });
  await approve(expired);
  expect(
    (
      await request("/didar/quote", f.buyer, {
        lines: [{ offer_id: offer.id, quantity: 1 }],
      })
    ).status,
  ).toBe(409);
}, 60000);
