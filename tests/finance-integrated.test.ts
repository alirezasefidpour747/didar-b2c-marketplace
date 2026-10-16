import { test, expect } from "bun:test";
import { financeFixture, finAPI, finOK, finDB } from "./financial-helpers";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
test("Gate 5: one integrated 5/135g + 2/127g + 12/117g +100g UID/RFID sale, mixed finance, wallet, mock close and refund", async () => {
  const f = await financeFixture(),
    tag = "INTEGRATED-" + crypto.randomUUID().slice(0, 12).toUpperCase();
  const batch = (
    await finOK(
      "intake",
      {
        operation: "create",
        supplier_id: f.sid,
        invoice_number: tag,
        reference_purity: 750,
        tahesab_reference: "QA-MERCHANT-INVOICE",
      },
      f.admin,
    )
  ).id;
  const weights = [
    [25000, 26000, 27000, 28000, 29000],
    [63000, 64000],
    [
      9000, 9100, 9200, 9300, 9400, 9500, 10000, 10100, 10200, 10300, 10400,
      10500,
    ],
    [100000],
  ];
  let serial = 0;
  for (const list of weights) {
    const line = (
      await finOK(
        "intake",
        {
          operation: "line",
          batch_id: batch,
          product_id: f.pid,
          description: tag,
          quantity: list.length,
          total_weight_mg: list.reduce((a, b) => a + b, 0),
          purity: 750,
          making_mode: "percent",
          making_bps: 1200,
        },
        f.admin,
      )
    ).id;
    for (const weight of list)
      await finOK(
        "intake",
        {
          operation: "item",
          batch_id: batch,
          line_id: line,
          weight_mg: weight,
          uid: tag + "-" + ++serial,
        },
        f.admin,
      );
  }
  let intake = await finOK("intake?id=" + batch, undefined, f.admin);
  expect(intake.items).toHaveLength(20);
  expect(new Set(intake.items.map((i: any) => i.uid)).size).toBe(20);
  const epc =
    "E2" + crypto.randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase();
  for (const [n, i] of intake.items.entries())
    await finOK(
      "rfid",
      {
        operation: "pair",
        item_id: i.id,
        epc: epc + n.toString(16).padStart(2, "0"),
        reason: "Mock integrated tag; no hardware claim",
      },
      f.admin,
    );
  await finOK("intake", { operation: "verify", batch_id: batch }, f.admin);
  await finOK("intake", { operation: "post", batch_id: batch }, f.admin);
  expect(
    (await finOK("finance", undefined, f.admin)).events.filter(
      (e: any) => e.supplier_id === f.sid && e.kind === "SALE_EXPOSURE",
    ),
  ).toHaveLength(0);
  intake = await finOK("intake?id=" + batch, undefined, f.admin);
  const item = intake.items.find((i: any) => i.weight_mg === 100000);
  const offer = (
      await finDB.query("SELECT * FROM didar_offer WHERE id=$1", [
        item.offer_id,
      ])
    ).rows[0],
    rate = (await finOK("catalog")).rate;
  const order = (
    await finOK(
      "checkout",
      {
        idempotency_key: crypto.randomUUID(),
        rate_version: rate.version,
        address: {
          name: "QA buyer",
          phone: "09123456789",
          city: "تهران",
          address: "نشانی ساختگی",
          postal_code: "1234567890",
        },
        lines: [{ offer_id: offer.id, version: offer.version, quantity: 1 }],
      },
      f.buyer,
    )
  ).order;
  expect(order.total_irr).toBe("8073000000");
  await Promise.all([
    finOK("payment", { order_id: order.id, outcome: "success" }, f.buyer),
    finOK("payment", { order_id: order.id, outcome: "success" }, f.buyer),
  ]);
  const sales = (
    await finDB.query(
      "SELECT e.* FROM didar_fin_event e JOIN didar_order_line l ON l.id=e.order_line_id WHERE l.order_id=$1 AND kind='SALE_EXPOSURE'",
      [order.id],
    )
  ).rows;
  expect(sales).toHaveLength(1);
  const sale = sales[0];
  expect(sale.snapshot.uid).toBe(item.uid);
  expect(sale.gold_ug).toBe("42000000");
  expect(sale.irr).toBe("3640000000");
  const own = await finOK("inventory", undefined, f.seller);
  expect(own.items.every((i: any) => i.supplier_id === f.sid)).toBe(true);
  expect((await finAPI("ledger", undefined, f.buyer)).http).toBe(403);
  await f.command({ operation: "request_approve", sale_id: sale.id });
  const purchase = (
    await f.command({
      operation: "purchase",
      synthetic: true,
      weight_mg: "60000",
      purity: 995,
      cost_irr: "5174000000",
      rate_irr: "65000000",
      currency: "IRR",
      counterparty: "Synthetic QA desk",
      document: "QA-GOLD-DOCUMENT",
      custody: "QA single treasury",
      title_confirmed: true,
    })
  ).event;
  await f.command({ operation: "purchase_approve", purchase_id: purchase.id });
  const allocation = (
    await f.command({
      operation: "allocate",
      sale_id: sale.id,
      purchase_id: purchase.id,
      amount_ug: "42000000",
    })
  ).event;
  expect(
    (
      await finAPI(
        "treasury",
        {
          operation: "gold_settle",
          allocation_id: allocation.id,
          amount_ug: "42000000",
          idempotency_key: crypto.randomUUID(),
          reason: "not delivered",
        },
        f.admin,
      )
    ).http,
  ).toBe(409);
  await f.command({
    operation: "title_transfer",
    allocation_id: allocation.id,
    document: "QA title evidence",
  });
  await f.command({
    operation: "physical_handover",
    allocation_id: allocation.id,
    disposition: "HELD_FOR_SUPPLIER",
    document: "QA custody evidence",
  });
  for (const amount of ["20000000", "22000000"])
    await f.command({
      operation: "gold_settle",
      allocation_id: allocation.id,
      amount_ug: amount,
    });
  await finOK(
    "wallet",
    {
      operation: "payable_to_wallet",
      sale_id: sale.id,
      party: "supplier:" + f.sid,
      instrument: "IRR",
      amount: "1000",
      reason: "Reclassify same supplier payable",
      idempotency_key: crypto.randomUUID(),
    },
    f.admin,
  );
  await f.command({
    operation: "rial_settle",
    sale_id: sale.id,
    amount_irr: "3639999000",
    document: "QA synthetic rial proof",
  });
  const request = (await finOK("treasury", undefined, f.admin)).requests.find(
    (r: any) => r.sale_event_id === sale.id,
  );
  expect(request.balance).toEqual({ gold_ug: "0", irr: "0" });
  expect(request.state).toBe("settled");
  const statement = await finOK("wallet", undefined, f.seller);
  expect(
    statement.balances.find(
      (b: any) => b.account === "WALLET_AVAILABLE" && b.instrument === "IRR",
    ).balance,
  ).toBe("1000");
  await finOK(
    "tahesab",
    {
      operation: "mapping",
      supplier_id: f.sid,
      merchant_code: "QA_INTEGRATED",
      gold_code: "QA_GOLD",
      rial_code: "QA_RIAL",
      invoice_reference: "QA-MERCHANT-INVOICE",
      db_alias: "QA_DIDAR",
      reason: "Integrated dry run only",
    },
    f.admin,
  );
  const period = {
    operation: "close",
    supplier_id: f.sid,
    start_at: new Date(Date.now() - 86400000).toISOString(),
    end_at: new Date().toISOString(),
  };
  const close = (await finOK("tahesab", period, f.admin)).close;
  expect(JSON.stringify(close.payload)).not.toContain(item.uid);
  expect(JSON.stringify(close.payload)).not.toContain(f.buyerId);
  expect(
    (
      await finOK(
        "tahesab",
        { operation: "dispatch", close_id: close.id, outcome: "transient" },
        f.admin,
      )
    ).attempt.state,
  ).toBe("transient_error");
  const ack = (
    await finOK(
      "tahesab",
      { operation: "dispatch", close_id: close.id },
      f.admin,
    )
  ).attempt;
  expect(
    (
      await finOK(
        "tahesab",
        { operation: "dispatch", close_id: close.id },
        f.admin,
      )
    ).attempt.id,
  ).toBe(ack.id);
  await finOK(
    "returns",
    {
      operation: "request",
      reservation_id: sale.reservation_id,
      reason: "QA physical return",
    },
    f.buyer,
  );
  await finOK(
    "returns",
    {
      operation: "receive",
      reservation_id: sale.reservation_id,
      reason: "QA received",
    },
    f.admin,
  );
  await finOK(
    "finance",
    {
      operation: "refund",
      event_id: sale.id,
      reason:
        "Full synthetic refund after prior settlement; supplier recoverable remains",
    },
    f.admin,
  );
  await finOK(
    "returns",
    {
      operation: "restock",
      reservation_id: sale.reservation_id,
      reason: "QA inspected",
    },
    f.admin,
  );
  await finOK(
    "returns",
    {
      operation: "restock",
      reservation_id: sale.reservation_id,
      reason: "retry QA",
    },
    f.admin,
  );
  expect(
    (
      await finDB.query(
        "SELECT uid,status FROM didar_inventory_item WHERE id=$1",
        [item.id],
      )
    ).rows[0],
  ).toEqual({ uid: item.uid, status: "available" });
  const session = (
    await finOK(
      "rfid",
      { operation: "create_count", supplier_id: f.sid },
      f.admin,
    )
  ).id;
  for (const n of [0, 1, 2, 3, 4, 0])
    await finOK(
      "rfid",
      {
        operation: "scan",
        session_id: session,
        value: epc + n.toString(16).padStart(2, "0"),
      },
      f.admin,
    );
  const scan = await finOK("rfid?id=" + session, undefined, f.admin);
  expect(scan.distinct_count).toBe(5);
  expect(scan.duplicate_reads).toBe(1);
  expect(scan.missing).toHaveLength(15);
  const refundClose = (
    await finOK(
      "tahesab",
      {
        operation: "close",
        supplier_id: f.sid,
        start_at: close.end_at,
        end_at: new Date().toISOString(),
      },
      f.admin,
    )
  ).close;
  expect(
    refundClose.payload.groups.some((g: any) => g.event_type === "REFUND"),
  ).toBe(true);
  expect(
    refundClose.payload.groups.some(
      (g: any) => g.event_type === "PHYSICAL_RETURN_MEMO",
    ),
  ).toBe(true);
  const report = await finOK("acceptance", undefined, f.admin);
  expect(report.technical_pass).toBe(true);
  expect(Object.values(report.checks).every((n) => n === 0)).toBe(true);
  expect(report.mac_uat).toBe("PENDING");
  expect(report.concrete_tahesab).toBe("BLOCKED_BY_SPEC");
  const checkpoint = await finOK(
    "acceptance",
    {
      operation: "checkpoint",
      reviewed_revision: "0e569d4d912c5a43739f8a5c8714dae080d73f7a",
    },
    f.admin,
  );
  expect(checkpoint.report.technical_pass).toBe(true);
  expect(
    (
      await finAPI(
        "acceptance",
        { operation: "checkpoint", reviewed_revision: "0".repeat(40) },
        f.seller,
      )
    ).http,
  ).toBe(403);
  await expect(
    finDB.query("UPDATE didar_fin_uat_checkpoint SET report='{}' WHERE id=$1", [
      checkpoint.id,
    ]),
  ).rejects.toThrow();
  const before = (
    await finDB.query(
      "SELECT id,uid,weight_mg FROM didar_inventory_item ORDER BY id",
    )
  ).rows;
  for (let n = 0; n < 2; n++)
    await finDB.query(
      readFileSync("packages/api/src/didar/finance-uat-schema.sql", "utf8"),
    );
  expect(
    (
      await finDB.query(
        "SELECT id,uid,weight_mg FROM didar_inventory_item ORDER BY id",
      )
    ).rows,
  ).toEqual(before);
  await finDB.query(
    "UPDATE didar_product SET active=false,published=false WHERE id=$1",
    [f.pid],
  );
}, 30000);
test("Gate 5: disposable PostgreSQL restart preserves all physical, historical and financial rows and reconnects the API", async () => {
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.pathname).toBe("/didar_qa");
  const run = (args: string[]) => {
    const r = spawnSync("docker", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error("Disposable QA Docker command failed");
    return r.stdout.trim();
  };
  const ids = run(["ps", "-q", "--filter", "label=didar.disposable-qa=true"])
    .split("\n")
    .filter(Boolean);
  let container = "";
  for (const id of ids) {
    const x = JSON.parse(run(["inspect", id]))[0];
    if (
      x.Name.startsWith("/didar-qa-pg-") &&
      x.Config.Labels["didar.disposable-qa"] === "true" &&
      x.NetworkSettings.Ports["5432/tcp"]?.some(
        (b: any) => b.HostIp === "127.0.0.1" && b.HostPort === url.port,
      )
    )
      container = id;
  }
  expect(container).not.toBe("");
  const tables = [
    "didar_inventory_item",
    "didar_intake_batch",
    "didar_intake_line",
    "didar_item_rfid_binding",
    "didar_order",
    "didar_order_line",
    "didar_payment_attempt",
    "didar_fin_event",
    "didar_fin_request",
    "didar_fin_journal",
    "didar_fin_posting",
    "didar_fin_close",
    "didar_fin_account_mapping",
    "didar_fin_uat_checkpoint",
  ];
  const fingerprints = async () => {
    const values: any = {};
    for (const t of tables) {
      const rows = (await finDB.query("SELECT * FROM " + t + " ORDER BY id"))
        .rows;
      values[t] = {
        count: rows.length,
        sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      };
    }
    return values;
  };
  const before = await fingerprints();
  run(["restart", container]);
  for (let n = 0; n < 80; n++) {
    try {
      await finDB.query("SELECT 1");
      break;
    } catch {
      if (n === 79) throw new Error("QA PostgreSQL restart failed");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  expect(await fingerprints()).toEqual(before);
  const response = await fetch(
    (process.env.TEST_API_URL || "http://localhost:9000") + "/didar/catalog",
  );
  expect(response.status).toBe(200);
  expect(Array.isArray((await response.json()).products)).toBe(true);
}, 20000);
