import { test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { price } from "../packages/api/src/didar/pricing";
import { validateRules } from "../packages/api/src/didar/merchant-profiles";
import {
  finAPI as api,
  finOK as ok,
  finDB as db,
  financeFixture,
} from "./financial-helpers";
const tag = "merchant-" + crypto.randomUUID(),
  reason = "Approved synthetic merchant pricing acceptance";
const rules = (retailer = false) =>
  validateRules(
    ["distribution", "retail", "credit"].map((code) => ({
      code,
      label: code,
      component: code,
      mode: "PERCENT",
      basis: "GOLD_BASE_750_IRR",
      value:
        code === "distribution"
          ? 300
          : code === "retail"
            ? retailer
              ? 0
              : 700
            : retailer
              ? 250
              : 0,
      scope: "ITEM",
      payer: "CUSTOMER",
      recipient: "DIDAR",
      application_mode: "ALWAYS",
    })),
  );
const engine = (rs: any[], method = "CASH", extra: any = {}) =>
  price({
    weight_mg: 100000,
    purity: 750,
    rate_irr: 65000000,
    making_mode: "percent",
    making_bps: 1200,
    distribution_bps: 9999,
    retail_bps: 9999,
    fee_irr: 999,
    margin_bps: 9999,
    merchant_profile: {
      rounding_step: 1,
      tax: {
        id: "qa-tax",
        bps: 1000,
        taxable_components: ["making", "distribution", "retail", "credit"],
      },
      rules: rs,
    },
    payment_method: method,
    ...extra,
  });
let m: any,
  r: any,
  tax: any,
  mProfile: any,
  rProfile: any,
  mItems: any[],
  rItems: any[],
  mOffer = "",
  rOffer = "",
  paidOrder: any,
  sharedOrder: any,
  oldSnapshot: any;
const profiles: string[] = [];
const mp = (b: any) => ok("merchant-pricing", { reason, ...b }, m.admin);
async function profile(types: string[], rs: any[], taxId = tax.id) {
  const p = await mp({
    operation: "profile_save",
    code: "qa_" + crypto.randomUUID().replaceAll("-", ""),
    name: tag,
    merchant_types: types,
  });
  profiles.push(p.id);
  const v = await mp({
    operation: "version_draft",
    profile_id: p.id,
    tax_version_id: taxId,
    rules: rs,
  });
  await mp({ operation: "version_review", id: v.id, approved: true });
  return { id: p.id, version_id: v.id };
}
async function revision(p: any, rs: any[]) {
  const v = await mp({
    operation: "version_draft",
    profile_id: p.id,
    tax_version_id: tax.id,
    rules: rs,
  });
  await mp({ operation: "version_review", id: v.id, approved: true });
  return v.id;
}
async function assign(f: any, type: string, p: any) {
  const s = (
    await db.query("SELECT pricing_revision FROM didar_supplier WHERE id=$1", [
      f.sid,
    ])
  ).rows[0];
  await mp({
    operation: "classify",
    supplier_id: f.sid,
    commercial_type: type,
    revision: s.pricing_revision,
  });
  await mp({
    operation: "assign",
    supplier_id: f.sid,
    profile_version_id: p.version_id,
  });
}
async function intake(f: any) {
  const b = (
    await ok(
      "intake",
      {
        operation: "create",
        supplier_id: f.sid,
        invoice_number: tag + f.sid,
        reference_purity: 750,
      },
      m.admin,
    )
  ).id;
  const l = (
    await ok(
      "intake",
      {
        operation: "line",
        batch_id: b,
        product_id: m.pid,
        description: tag,
        quantity: 4,
        total_weight_mg: 400000,
        purity: 750,
        making_mode: "percent",
        making_bps: 1200,
      },
      m.admin,
    )
  ).id;
  for (let i = 0; i < 4; i++)
    await ok(
      "intake",
      { operation: "item", batch_id: b, line_id: l, weight_mg: 100000 },
      m.admin,
    );
  await ok("intake", { operation: "verify", batch_id: b }, m.admin);
  await ok("intake", { operation: "post", batch_id: b }, m.admin);
  return (await ok("intake?id=" + b, undefined, m.admin)).items;
}
const q = (offers: any[], method = "CASH") =>
  ok("quote", {
    payment_method: method,
    lines: offers.map((o) => ({
      offer_id: typeof o === "string" ? o : o.id,
      quantity: o.quantity || 1,
    })),
  });
const checkout = (quote: any, key = crypto.randomUUID()) => ({
  idempotency_key: key,
  payment_method: quote.payment_method,
  quote_key: quote.quote_key,
  rate_version: quote.rate_version,
  lines: quote.lines.map((l: any) => ({
    offer_id: l.offer_id,
    version: l.version,
    quantity: l.quantity,
    quote_key: l.breakdown.quote_key,
  })),
  address: {
    name: "QA",
    phone: "09123456789",
    postal_code: "1234567890",
    city: "تهران",
    address: "نشانی آزمایشی",
  },
});
beforeAll(async () => {
  m = await financeFixture("GOLD_ONLY");
  r = await financeFixture("GOLD_ONLY");
  await ok(
    "manage",
    {
      kind: "product",
      id: m.pid,
      title: tag,
      category_id: "ring",
      purity: 750,
      published: true,
    },
    m.admin,
  );
  mItems = await intake(m);
  rItems = await intake(r);
  mOffer = mItems[0].offer_id;
  rOffer = rItems[0].offer_id;
  const policy = await mp({
    operation: "tax_policy_save",
    code: "qa_" + crypto.randomUUID().replaceAll("-", ""),
    name: "مالیات آزمایشی مصوب",
  });
  tax = await mp({
    operation: "tax_draft",
    policy_id: policy.id,
    bps: 1000,
    taxable_components: ["making", "distribution", "retail", "credit"],
  });
  await mp({ operation: "tax_review", id: tax.id, approved: true });
  mProfile = await profile(["MANUFACTURER"], rules());
  rProfile = await profile(["RETAILER"], rules(true));
  await assign(m, "MANUFACTURER", mProfile);
  await assign(r, "RETAILER", rProfile);
}, 120000);
afterAll(async () => {
  if (m)
    await db.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=ANY($1::text[])",
      [[m.pid, r?.pid].filter(Boolean)],
    );
  if (profiles.length)
    await db.query(
      "UPDATE didar_merchant_profile SET active=false WHERE id=ANY($1::text[])",
      [profiles],
    );
  if (m)
    await db.query(
      "UPDATE didar_supplier SET active=false WHERE id=ANY($1::text[])",
      [[m.sid, r?.sid].filter(Boolean)],
    );
});
test("one Gold-First engine reproduces manufacturer and retailer additive 750-base examples without legacy double margins", () => {
  expect(engine(rules())).toMatchObject({
    metal_irr: 6500000000,
    labor_irr: 780000000,
    distribution_irr: 195000000,
    retail_irr: 455000000,
    credit_irr: 0,
    tax_irr: 143000000,
    total_irr: 8073000000,
    fee_irr: 0,
  });
  expect(engine(rules(true))).toMatchObject({
    metal_irr: 6500000000,
    labor_irr: 780000000,
    distribution_irr: 195000000,
    retail_irr: 0,
    credit_irr: 162500000,
    tax_irr: 113750000,
    total_irr: 7751250000,
  });
  expect(engine(rules(true), "CREDIT").total_irr).toBe(
    engine(rules(true), "CASH").total_irr,
  );
  const zero = rules(true).map((r) => ({ ...r, value: 0 }));
  expect(engine(zero).total_irr).toBe(7358000000);
  for (const making_bps of [0, 100, 1500, 2500])
    expect(engine(rules(true), "CASH", { making_bps }).labor_irr).toBe(
      (6500000000 * making_bps) / 10000,
    );
  const fraction = engine(rules(true), "CASH", {
    weight_mg: 1,
    purity: 585,
    rate_irr: 65000001,
  });
  expect(Number.isSafeInteger(fraction.total_irr)).toBe(true);
});
test("C application modes and explicit alternative/fixed calculation bases never compound other Didar additions", () => {
  const base = rules(true);
  for (const [mode, cash, credit] of [
    ["ALWAYS", 162500000, 162500000],
    ["CASH_ONLY", 162500000, 0],
    ["CREDIT_ONLY", 0, 162500000],
    ["DISABLED", 0, 0],
  ] as any) {
    const rs = base.map((r) =>
      r.code === "credit" ? { ...r, application_mode: mode } : r,
    );
    expect(engine(rs, "CASH").credit_irr).toBe(cash);
    expect(engine(rs, "CREDIT").credit_irr).toBe(credit);
  }
  const by = base.map((r) =>
    r.code === "credit"
      ? {
          ...r,
          application_mode: "BY_PAYMENT_METHOD",
          cash_rule: {
            mode: "PERCENT",
            basis: "GOLD_BASE_750_IRR",
            value: 100,
          },
          credit_rule: {
            mode: "PERCENT",
            basis: "GOLD_BASE_750_IRR",
            value: 400,
          },
        }
      : r,
  );
  expect(engine(by, "CASH").credit_irr).toBe(65000000);
  expect(engine(by, "CREDIT").credit_irr).toBe(260000000);
  expect(
    engine(
      base.map((r) =>
        r.code === "credit" ? { ...r, basis: "MAKING_IRR", value: 1000 } : r,
      ),
    ).credit_irr,
  ).toBe(78000000);
  expect(
    engine(
      base.map((r) =>
        r.code === "credit"
          ? { ...r, basis: "GOLD_PLUS_MAKING_IRR", value: 1000 }
          : r,
      ),
    ).credit_irr,
  ).toBe(728000000);
  expect(
    engine(
      base.map((r) =>
        r.code === "credit"
          ? { ...r, mode: "FIXED_IRR", basis: "FIXED_IRR", value: 12345 }
          : r,
      ),
    ).credit_irr,
  ).toBe(12345);
  expect(() =>
    validateRules(
      base.map((r) => (r.code === "credit" ? { ...r, value: -1 } : r)),
    ),
  ).toThrow();
});
test("same public master has two authoritative merchant-specific prices and CASH always includes the approved C", async () => {
  const catalog = await ok("catalog"),
    p = catalog.products.find((p: any) => p.id === m.pid),
    ma = p.offers.find((o: any) => o.id === mOffer),
    ra = p.offers.find((o: any) => o.id === rOffer);
  expect(ma.price.merchant_profile.merchant_type).toBe("MANUFACTURER");
  const equivalent = ra.price.gold_components.credit;
  expect(BigInt(equivalent.numerator) * 2n).toBe(
    BigInt(equivalent.denominator) * 5n,
  );

  expect(ra.price.merchant_profile.merchant_type).toBe("RETAILER");
  expect(ma.price.total_irr).toBeGreaterThan(ra.price.total_irr);
  expect(ra.price.credit_irr).toBeGreaterThan(0);
  expect(ra.prices.CREDIT.total_irr).toBe(ra.price.total_irr);
  const sim = await mp({
    operation: "preview",
    offer_id: rOffer,
    payment_method: "CASH",
  });
  expect(sim.price.total_irr).toBe(ra.price.total_irr);
  expect(sim.price.merchant_profile.version_id).toBe(rProfile.version_id);
  expect(
    (
      await ok(
        "catalog?payment_method=CREDIT&page=1&limit=48&q=" +
          encodeURIComponent(tag) +
          "",
      )
    ).products
      .find((p: any) => p.id === m.pid)
      .offers.find((o: any) => o.id === rOffer).price.payment_method,
  ).toBe("CREDIT");
});
test("profiled mixed UID checkout snapshots rates, conditions, versions and charges; supplier entitlement remains gold-first and journals balance", async () => {
  const quote = await q([mOffer, rOffer]);
  paidOrder = (await ok("checkout", checkout(quote), m.buyer)).order;
  expect(Number(paidOrder.total_irr)).toBe(quote.total_irr);
  await ok("payment", { order_id: paidOrder.id, outcome: "success" }, m.buyer);
  const rows = (
    await db.query(
      "SELECT * FROM didar_order_line WHERE order_id=$1 ORDER BY offer_id",
      [paidOrder.id],
    )
  ).rows;
  expect(rows).toHaveLength(2);
  for (const l of rows) {
    expect(l.breakdown.merchant_profile.version_id).toBe(
      l.supplier_id === m.sid ? mProfile.version_id : rProfile.version_id,
    );
    expect(l.breakdown.policy.tax_version_id).toBe(tax.id);
    expect(l.breakdown.payment_method).toBe("CASH");
    const sale = (
      await db.query(
        "SELECT * FROM didar_fin_event WHERE order_line_id=$1 AND kind='SALE_EXPOSURE'",
        [l.id],
      )
    ).rows[0];
    expect(sale.gold_ug).toBe("84000000");
    expect(sale.irr).toBe("0");
    expect(sale.snapshot.price.merchant_profile.version_id).toBe(
      l.breakdown.merchant_profile.version_id,
    );
    expect(sale.snapshot.uid).toBeTruthy();
  }
  const postings = (
    await db.query(
      "SELECT p.* FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id JOIN didar_fin_event e ON e.id=j.event_id WHERE e.order_line_id=ANY($1::text[])",
      [rows.map((l: any) => l.id)],
    )
  ).rows;
  expect(
    postings.some(
      (p: any) =>
        p.account === "PROFILE_CREDIT_REVENUE" && BigInt(p.delta) < 0n,
    ),
  ).toBe(true);
  for (const instrument of ["IRR", "GOLD_UG"])
    expect(
      postings
        .filter((p: any) => p.instrument === instrument)
        .reduce((s: bigint, p: any) => s + BigInt(p.delta), 0n),
    ).toBe(0n);
  oldSnapshot = (
    await db.query(
      "SELECT jsonb_agg(to_jsonb(l) ORDER BY id) snapshot FROM didar_order_line l WHERE order_id=$1",
      [paidOrder.id],
    )
  ).rows[0].snapshot;
  await expect(
    db.query("UPDATE didar_order_line SET breakdown='{}' WHERE order_id=$1", [
      paidOrder.id,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_ORDER_PRICING");
  await expect(
    db.query("UPDATE didar_order SET total_irr=total_irr+1 WHERE id=$1", [
      paidOrder.id,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_ORDER_PRICING");
});
test("reassigning approved versions affects future quotes only, detects stale carts and preserves already accepted payment snapshots", async () => {
  const oldQuote = await q([rOffer]),
    pending = (await ok("checkout", checkout(oldQuote), m.buyer)).order;
  const next = await revision(
    rProfile,
    rules(true).map((r) =>
      r.code === "credit" ? { ...r, application_mode: "CREDIT_ONLY" } : r,
    ),
  );
  await mp({
    operation: "switch",
    supplier_id: r.sid,
    profile_version_id: next,
  });
  expect((await q([rOffer])).lines[0].breakdown.credit_irr).toBe(0);
  expect(
    (await q([rOffer], "CREDIT")).lines[0].breakdown.credit_irr,
  ).toBeGreaterThan(0);
  expect((await api("checkout", checkout(oldQuote), m.buyer)).http).toBe(409);
  await ok("payment", { order_id: pending.id, outcome: "success" }, m.buyer);
  expect(
    (
      await db.query(
        "SELECT breakdown FROM didar_order_line WHERE order_id=$1",
        [pending.id],
      )
    ).rows[0].breakdown.merchant_profile.version_id,
  ).toBe(rProfile.version_id);
  expect(
    (
      await db.query(
        "SELECT jsonb_agg(to_jsonb(l) ORDER BY id) snapshot FROM didar_order_line l WHERE order_id=$1",
        [paidOrder.id],
      )
    ).rows[0].snapshot,
  ).toEqual(oldSnapshot);
  const by = await revision(
    rProfile,
    rules(true).map((r) =>
      r.code === "credit"
        ? {
            ...r,
            application_mode: "BY_PAYMENT_METHOD",
            cash_rule: {
              mode: "PERCENT",
              basis: "GOLD_BASE_750_IRR",
              value: 100,
            },
            credit_rule: {
              mode: "FIXED_IRR",
              basis: "FIXED_IRR",
              value: 50000,
            },
          }
        : r,
    ),
  );
  await mp({ operation: "switch", supplier_id: r.sid, profile_version_id: by });
  expect((await q([rOffer], "CREDIT")).lines[0].breakdown.credit_irr).toBe(
    50000,
  );
  expect((await q([rOffer])).lines[0].breakdown.credit_irr).toBeGreaterThan(
    50000,
  );
});
test("effective assignment intervals, incompatible types, immutable versions and concurrent overlapping assignments are database enforced", async () => {
  expect(
    (
      await api(
        "merchant-pricing",
        {
          operation: "assign",
          supplier_id: m.sid,
          profile_version_id: mProfile.version_id,
          reason,
        },
        m.admin,
      )
    ).http,
  ).toBe(409);
  const wrong = await api(
    "merchant-pricing",
    {
      operation: "switch",
      supplier_id: m.sid,
      profile_version_id: rProfile.version_id,
      reason,
    },
    m.admin,
  );
  expect(wrong.http).toBe(400);
  await expect(
    db.query(
      "UPDATE didar_merchant_profile_rule SET rule=jsonb_set(rule,'{value}','999') WHERE version_id=$1",
      [mProfile.version_id],
    ),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_PRICING_VERSION");
  await expect(
    db.query("DELETE FROM didar_merchant_assignment WHERE supplier_id=$1", [
      m.sid,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_PRICING_HISTORY");
  const future = new Date(Date.now() + 86400000).toISOString(),
    end = new Date(Date.now() + 2 * 86400000).toISOString();
  await mp({
    operation: "assignment_end",
    id: (
      await db.query(
        "SELECT id FROM didar_merchant_assignment WHERE supplier_id=$1 AND effective_to IS NULL",
        [m.sid],
      )
    ).rows[0].id,
    effective_to: future,
  });
  const race = await Promise.all(
    [1, 2].map(() =>
      api(
        "merchant-pricing",
        {
          operation: "assign",
          supplier_id: m.sid,
          profile_version_id: mProfile.version_id,
          effective_from: future,
          effective_to: end,
          reason,
        },
        m.admin,
      ),
    ),
  );
  expect(race.map((r) => r.http).sort()).toEqual([200, 409]);
  const scheduled = (
    await db.query(
      "SELECT id FROM didar_merchant_assignment WHERE supplier_id=$1 AND effective_from=$2",
      [m.sid, future],
    )
  ).rows[0];
  await mp({ operation: "assignment_cancel", id: scheduled.id });
});
test("new merchant types and reusable profiles use the same formula and legacy merchants are not auto-assigned", async () => {
  const type = "QA_" + crypto.randomUUID().replaceAll("-", "").toUpperCase();
  await mp({ operation: "type_save", code: type, name: "نوع تجاری آزمایشی" });
  const p = await profile(
    [type, "MANUFACTURER"],
    rules().map((r) => ({ ...r, value: 0 })),
  );
  expect(p.version_id).toBeTruthy();
  const existing = (
    await db.query("SELECT commercial_type FROM didar_supplier WHERE id='s1'")
  ).rows[0];
  expect(existing.commercial_type).toBe("LEGACY_UNCLASSIFIED");

  const t = await financeFixture();
  await assign(t, type, p);
  const created = (
    await ok(
      "manage",
      {
        kind: "new_offer",
        supplier_id: t.sid,
        product_id: m.pid,
        weight_mg: 1000,
        quantity: 1,
        labor_irr: 100,
        margin_bps: 9999,
      },
      m.admin,
    )
  ).id;
  expect(
    (await q([created])).lines[0].breakdown.merchant_profile.merchant_type,
  ).toBe(type);
  await db.query("UPDATE didar_product SET active=false WHERE id=$1", [t.pid]);
  await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [t.sid]);
});
test("suppliers can read and simulate only their own assignments; shared percentages, taxes and competitor settings are denied", async () => {
  for (const body of [
    {
      operation: "profile_save",
      code: "intruder",
      name: "intruder",
      merchant_types: ["RETAILER"],
    },
    {
      operation: "classify",
      supplier_id: m.sid,
      commercial_type: "RETAILER",
      revision: 1,
    },
    {
      operation: "tax_draft",
      policy_id: tax.id,
      bps: 0,
      taxable_components: [],
    },
    { operation: "preview", offer_id: mOffer },
  ])
    expect(
      (await api("merchant-pricing", { ...body, reason }, r.seller)).http,
    ).toBe(403);
  const own = await ok("merchant-pricing", undefined, r.seller);
  expect(own.suppliers).toHaveLength(1);
  expect(own.suppliers[0].id).toBe(r.sid);
  expect(own.assignments.every((a: any) => a.supplier_id === r.sid)).toBe(true);
  expect(own.versions.some((v: any) => v.id === mProfile.version_id)).toBe(
    false,
  );
  expect((await api("merchant-pricing", undefined, r.buyer)).http).toBe(403);
  expect((await api("merchant-pricing")).http).toBe(401);
});
test("mixed-merchant order services are charged once, allocated exactly, and internal/merchant costs are not added to customer VAT or gold entitlement", async () => {
  const service = {
    code: "packaging",
    component: "distribution",
    label: "بسته‌بندی مشترک",
    mode: "FIXED_IRR",
    basis: "FIXED_IRR",
    value: 1001,
    application_mode: "ALWAYS",
    payer: "CUSTOMER",
    recipient: "DIDAR",
    scope: "ORDER",
    service_key: "qa_shared_packaging",
  };
  const internal = {
    ...service,
    code: "operating_cost",
    service_key: "qa_shared_cost",
    value: 777,
    payer: "DIDAR",
    recipient: "THIRD_PARTY",
  };
  const merchant = {
    ...service,
    code: "merchant_service",
    service_key: "qa_merchant_service",
    value: 123,
    payer: "MERCHANT",
    recipient: "DIDAR",
  };
  const v1 = await revision(mProfile, [
      ...rules(),
      service,
      internal,
      merchant,
    ]),
    v2 = await revision(rProfile, [
      ...rules(true),
      service,
      internal,
      merchant,
    ]);
  await mp({ operation: "switch", supplier_id: m.sid, profile_version_id: v1 });
  await mp({ operation: "switch", supplier_id: r.sid, profile_version_id: v2 });
  const quote = await q([mOffer, rOffer]);
  expect(quote.order_charges).toHaveLength(1);
  expect(quote.order_charges[0].amount_irr).toBe(1001);
  expect(quote.order_charges[0].tax_irr).toBe(101);
  expect(quote.total_irr - quote.subtotal_irr).toBe(1102);
  expect(JSON.stringify(quote)).not.toContain("operating_cost");
  expect(JSON.stringify(quote)).not.toContain("merchant_service");
  const allocations = quote.lines.flatMap((l: any) =>
    l.breakdown.order_allocations.flat(),
  );
  expect(
    allocations.reduce((s: number, a: any) => s + a.amount_irr + a.tax_irr, 0),
  ).toBe(1102);
  const order = (await ok("checkout", checkout(quote), m.buyer)).order;
  sharedOrder = order;
  await ok("payment", { order_id: order.id, outcome: "success" }, m.buyer);
  const postings = (
    await db.query(
      "SELECT p.* FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id JOIN didar_fin_event e ON e.id=j.event_id JOIN didar_order_line l ON l.id=e.order_line_id WHERE l.order_id=$1",
      [order.id],
    )
  ).rows;
  const sum = (account: string) =>
    postings
      .filter((p: any) => p.account === account && p.instrument === "IRR")
      .reduce((s: bigint, p: any) => s + BigInt(p.delta), 0n);
  expect(sum("CASH_CLEARING")).toBe(BigInt(quote.total_irr));
  expect(sum("PROFILE_OPERATING_COST_ACCRUAL")).toBe(777n);
  expect(sum("MERCHANT_SERVICE_RECEIVABLE")).toBe(123n);
  expect(
    postings
      .filter((p: any) => p.instrument === "IRR")
      .reduce((s: bigint, p: any) => s + BigInt(p.delta), 0n),
  ).toBe(0n);
  const customer = (await ok("orders", undefined, m.buyer)).orders.find(
    (o: any) => o.id === order.id,
  );
  expect(JSON.stringify(customer)).not.toContain("operating_cost");
}, 120000);
test("profile/tax retirement fails closed for future quotes and repeat migrations preserve exact UIDs, paid rows and journals", async () => {
  const tables = [
    "didar_inventory_item",
    "didar_item_rfid_binding",
    "didar_order",
    "didar_order_line",
    "didar_fin_event",
    "didar_fin_posting",
  ];
  const fingerprint = async () => {
    const out: any = {};
    for (const t of tables)
      out[t] = (
        await db.query(
          `SELECT md5(coalesce(jsonb_agg(row ORDER BY row::text)::text,'[]')) hash FROM (SELECT to_jsonb(t) row FROM ${t} t) q`,
        )
      ).rows[0].hash;
    return out;
  };
  const before = await fingerprint();
  for (let i = 0; i < 2; i++)
    await db.query(
      readFileSync(
        "packages/api/src/didar/merchant-pricing-schema.sql",
        "utf8",
      ),
    );
  expect(await fingerprint()).toEqual(before);
  const p = (
    await db.query("SELECT * FROM didar_merchant_profile WHERE id=$1", [
      mProfile.id,
    ])
  ).rows[0];
  await mp({
    operation: "profile_save",
    id: p.id,
    code: p.code,
    name: p.name,
    merchant_types: p.merchant_types,
    revision: p.revision,
    active: false,
  });
  expect(
    (await api("quote", { lines: [{ offer_id: mOffer, quantity: 1 }] })).http,
  ).toBe(409);
  expect(
    (await ok("catalog")).products
      .find((p: any) => p.id === m.pid)
      .offers.find((o: any) => o.id === mOffer).price,
  ).toBeNull();
  expect(
    (
      await db.query(
        "SELECT jsonb_agg(to_jsonb(l) ORDER BY id) snapshot FROM didar_order_line l WHERE order_id=$1",
        [paidOrder.id],
      )
    ).rows[0].snapshot,
  ).toEqual(oldSnapshot);
});

test("checkout and an administrator profile switch serialize: acceptance freezes the observed quote or returns a conflict", async () => {
  const quote = await q([rOffer]);
  const active = (
    await db.query(
      "SELECT id,profile_version_id FROM didar_merchant_assignment WHERE supplier_id=$1 AND effective_to IS NULL AND NOT cancelled",
      [r.sid],
    )
  ).rows[0];
  // Retirement at the previous test is limited to the manufacturer; retailer remains quotable.
  const next = await revision(
    rProfile,
    rules(true).map((r) => ({
      ...r,
      value: r.code === "credit" ? 333 : r.value,
    })),
  );
  const results = await Promise.all([
    api("checkout", checkout(quote), m.buyer),
    api(
      "merchant-pricing",
      {
        operation: "switch",
        supplier_id: r.sid,
        profile_version_id: next,
        reason,
      },
      m.admin,
    ),
  ]);
  expect(results[1].http).toBe(200);
  expect([200, 409]).toContain(results[0].http);
  if (results[0].http === 200) {
    const line = (
      await db.query(
        "SELECT breakdown FROM didar_order_line WHERE order_id=$1",
        [results[0].order.id],
      )
    ).rows[0];
    expect(line.breakdown.merchant_profile.version_id).toBe(
      active.profile_version_id,
    );
    expect(Number(results[0].order.total_irr)).toBe(quote.total_irr);
    await ok(
      "payment",
      { order_id: results[0].order.id, outcome: "failure" },
      m.buyer,
    );
  }
});

test("returning a profiled exact UID reverses only its allocated services, VAT, receivable and provisional costs once", async () => {
  const sale = (
    await db.query(
      "SELECT e.* FROM didar_fin_event e JOIN didar_order_line l ON l.id=e.order_line_id WHERE l.order_id=$1 AND e.kind='SALE_EXPOSURE' ORDER BY e.id LIMIT 1",
      [sharedOrder.id],
    )
  ).rows[0];
  await ok(
    "returns",
    { operation: "request", reservation_id: sale.reservation_id, reason },
    m.buyer,
  );
  await ok(
    "returns",
    { operation: "receive", reservation_id: sale.reservation_id, reason },
    m.admin,
  );
  const refund = await ok(
    "finance",
    { operation: "refund", event_id: sale.id, reason },
    m.admin,
  );
  const retry = await ok(
    "finance",
    { operation: "refund", event_id: sale.id, reason },
    m.admin,
  );
  expect(refund.event.id).toBe(retry.event.id);
  expect(refund.event.gold_ug).toBe("-84000000");
  expect(refund.event.snapshot.bank_execution).toBe(false);
  const unbalanced = (
    await db.query(
      `SELECT p.account,p.party,p.instrument,sum(p.delta) FROM didar_fin_posting p JOIN didar_fin_journal j ON j.id=p.journal_id WHERE j.event_id=ANY($1::text[]) AND p.instrument<>'MEMO_GOLD_UG' GROUP BY p.account,p.party,p.instrument HAVING sum(p.delta)<>0`,
      [[sale.id, refund.event.id]],
    )
  ).rows;
  expect(unbalanced).toEqual([]);
  const units = (
    await db.query(
      "SELECT snapshot FROM didar_fin_event WHERE order_line_id=$1 AND kind='SALE_EXPOSURE'",
      [sale.order_line_id],
    )
  ).rows;
  expect(units[0].snapshot.customer_payment_irr).toBe(
    sale.snapshot.customer_payment_irr,
  );
});

test("PostgreSQL rejects JSON-null rule modes, missing shared service keys and re-keying approved components", async () => {
  expect(
    (
      await db.query(
        `SELECT didar_merchant_rule_valid('{"mode":null,"basis":"FIXED_IRR","value":0}'::jsonb) valid`,
      )
    ).rows[0].valid,
  ).toBe(false);
  const draft = await mp({
    operation: "version_draft",
    profile_id: rProfile.id,
    tax_version_id: tax.id,
    rules: rules(true),
  });
  await expect(
    db.query(
      `UPDATE didar_merchant_profile_rule SET rule=jsonb_set(rule,'{payer}','null') WHERE version_id=$1 AND code='credit'`,
      [draft.id],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      `UPDATE didar_merchant_profile_rule SET rule=jsonb_set(rule,'{scope}','"ORDER"') WHERE version_id=$1 AND code='credit'`,
      [draft.id],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      "UPDATE didar_merchant_profile_rule SET version_id=$1 WHERE version_id=$2",
      [draft.id, rProfile.version_id],
    ),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_PRICING_VERSION");
});
