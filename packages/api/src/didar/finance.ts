import { acceptanceRead, acceptanceWrite } from "./finance-uat";
import { tahesabRead, tahesabWrite } from "./tahesab";
import { projectEvent, ledgerRead } from "./finance-ledger";
import { saleAssetSnapshot, valueJewelry } from "./finance-assets";
import { procurementRead, procurementWrite } from "./finance-procurement";
import { randomUUID, createHash } from "node:crypto";
import { transaction } from "./db";
import { requireUser } from "./auth";
import { authorize, audit } from "./permissions";
import { integer } from "./pricing";
export const finText = (v: unknown, max = 250): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new Error("INVALID_TEXT");
  return v.trim();
};
export const big = (v: unknown, positive = false): bigint => {
  if (
    (typeof v !== "string" && typeof v !== "number") ||
    !/^\d{1,18}$/.test(String(v)) ||
    (typeof v === "number" && !Number.isSafeInteger(v))
  )
    throw new Error("INVALID_AMOUNT");
  const n = BigInt(v);
  if (n > 900000000000000000n || (positive && n === 0n))
    throw new Error("INVALID_AMOUNT");
  return n;
};
export const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
export const fingerprint = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function finLock(c: any) {
  // One lock order for payment/refund, procurement and wallets; never acquire order locks after this.
  await c.query(
    "SELECT pg_advisory_xact_lock(hashtext('didar:financial-core'))",
  );
}
export function localFinance() {
  if (
    process.env.DIDAR_ENVIRONMENT !== "local" ||
    process.env.DIDAR_PAYMENT_MODE !== "sandbox"
  )
    throw new Error("FORBIDDEN");
}
export async function appendEvent(c: any, e: any) {
  const id = randomUUID();
  const {
    rows: [row],
  } = await c.query(
    `INSERT INTO didar_fin_event(id,intent,kind,supplier_id,customer_id,order_line_id,reservation_id,source_event_id,gold_ug,irr,snapshot,actor_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(intent) DO NOTHING RETURNING *`,
    [
      id,
      e.intent,
      e.kind,
      e.supplier_id || null,
      e.customer_id || null,
      e.order_line_id || null,
      e.reservation_id || null,
      e.source_event_id || null,
      String(e.gold_ug || 0),
      String(e.irr || 0),
      JSON.stringify(e.snapshot),
      e.actor_id || null,
    ],
  );
  if (row) {
    await projectEvent(c, row);
    return row;
  }
  return (
    await c.query("SELECT * FROM didar_fin_event WHERE intent=$1", [e.intent])
  ).rows[0];
}
export async function snapshotTerms(c: any, line: string, supplier: string) {
  await finLock(c);
  const {
    rows: [contract],
  } = await c.query(
    `SELECT t.* FROM didar_fin_contract t JOIN didar_fin_contract_review r ON r.contract_id=t.id
    WHERE t.supplier_id=$1 AND r.approved AND t.effective_at<=now() ORDER BY t.effective_at DESC,t.version DESC LIMIT 1`,
    [supplier],
  );
  const snapshot = contract || {
    id: null,
    version: 0,
    mode: "GOLD_ONLY",
    gold_bps: 10000,
    ownership: "CONSIGNMENT",
    due_days: 0,
    basis: "documented_sandbox_default",
  };
  await c.query(
    "INSERT INTO didar_fin_sale_terms(line_id,snapshot) VALUES($1,$2)",
    [line, JSON.stringify(snapshot)],
  );
}
/** All gold quantities are integer micrograms of fine gold. Round UP once per physical unit.
 * 100000mg * 750/1000 * 1.12 = 84000000ug fine = 112g at 750. */
export function entitlement(l: any, contract: any, rate: bigint, quantity = 1) {
  const p = l.breakdown.policy,
    q = BigInt(quantity),
    metal = BigInt(l.weight_mg) * BigInt(p.purity);
  let fine: bigint,
    fixed = 0n;
  if (p.making_mode === "fixed_gold")
    fine = metal + BigInt(p.making_weight_mg) * 750n;
  else if (p.making_mode === "percent")
    fine = ceil(metal * BigInt(10000 + p.making_bps), 10000n);
  else if (p.labor_mode === "percent")
    fine = ceil(metal * BigInt(10000 + p.labor_bps), 10000n);
  else {
    fine = metal;
    fixed = BigInt(p.fixed_labor_irr || 0);
  }
  const gold =
    contract.ownership === "DIDAR_OWNED"
      ? 0n
      : (fine * BigInt(contract.gold_bps)) / 10000n;
  const rial =
    contract.ownership === "DIDAR_OWNED"
      ? 0n
      : ceil((fine - gold) * rate, 750000n) + fixed;
  return {
    gold_ug: (gold * q).toString(),
    irr: (rial * q).toString(),
    fine_entitlement_ug: (fine * q).toString(),
    legacy_making_irr: (fixed * q).toString(),
  };
}
export async function recognizePayment(c: any, order: any, actor: string) {
  await finLock(c);
  const { rows: lines } = await c.query(
    `SELECT l.*,t.snapshot contract FROM didar_order_line l JOIN didar_fin_sale_terms t ON t.line_id=l.id WHERE l.order_id=$1 ORDER BY l.id`,
    [order.id],
  );
  for (const l of lines) {
    const { rows: items } = await c.query(
      `SELECT r.id reservation_id,i.uid,i.id item_id,i.line_id invoice_line_id,b.id invoice_id,b.invoice_number FROM didar_item_reservation r JOIN didar_inventory_item i ON i.id=r.item_id JOIN didar_intake_line il ON il.id=i.line_id JOIN didar_intake_batch b ON b.id=il.batch_id WHERE r.order_line_id=$1 ORDER BY r.id`,
      [l.id],
    );
    for (const item of items.length ? items : [{ reservation_id: null }]) {
      const amounts = entitlement(
        l,
        l.contract,
        BigInt(order.rate_snapshot.rate_irr),
        items.length ? 1 : l.quantity,
      );
      const event = await appendEvent(c, {
        intent: "sale:" + l.id + ":" + (item.reservation_id || "legacy"),
        kind: "SALE_EXPOSURE",
        supplier_id: l.supplier_id,
        customer_id: order.customer_id,
        order_line_id: l.id,
        reservation_id: item.reservation_id,
        ...amounts,
        actor_id: actor,
        snapshot: {
          ...item,
          ...(await saleAssetSnapshot(c, item)),
          ...amounts,
          contract: l.contract,
          ownership: l.contract.ownership,
          custody: "DIDAR",
          title: l.contract.ownership === "CONSIGNMENT" ? "SUPPLIER" : "DIDAR",
          recognition: "verified_customer_payment",
          rate_irr: String(order.rate_snapshot.rate_irr),
          price: l.breakdown,
          quantity: items.length ? 1 : l.quantity,
          due_at: new Date(
            Date.now() + l.contract.due_days * 86400000,
          ).toISOString(),
          customer_payment_irr: String(
            BigInt(l.breakdown.total_irr) *
              BigInt(items.length ? 1 : l.quantity),
          ),
        },
      });
      if (BigInt(event.gold_ug) > 0n)
        await c.query(
          "INSERT INTO didar_fin_request(id,sale_event_id,supplier_id,gold_ug) VALUES($1,$1,$2,$3) ON CONFLICT DO NOTHING",
          [event.id, event.supplier_id, event.gold_ug],
        );
    }
  }
}
export async function financeRead(c: any, u: any) {
  const supplier = u.role === "supplier" ? u.supplier_id : null;
  const contracts = (
    await c.query(
      `SELECT t.*,r.approved,r.created_at approved_at FROM didar_fin_contract t LEFT JOIN didar_fin_contract_review r ON r.contract_id=t.id WHERE ($1::text IS NULL OR t.supplier_id=$1) ORDER BY t.created_at DESC`,
      [supplier],
    )
  ).rows;
  const events = (
    await c.query(
      `SELECT id,intent,kind,supplier_id,order_line_id,reservation_id,source_event_id,gold_ug,irr,created_at,
    snapshot-'price'-'customer_payment_irr'-'cost_basis_irr'-'owned_cost_irr'-'items'-'command' AS snapshot FROM didar_fin_event WHERE ($1::text IS NULL OR supplier_id=$1) ORDER BY created_at DESC,id DESC LIMIT 500`,
      [supplier],
    )
  ).rows;
  const accounts = (
    await c.query(
      `SELECT supplier_id,sum(gold_ug)::text gold_ug,sum(irr)::text irr FROM didar_fin_event WHERE supplier_id IS NOT NULL AND ($1::text IS NULL OR supplier_id=$1) GROUP BY supplier_id ORDER BY supplier_id`,
      [supplier],
    )
  ).rows;
  const suppliers = (
    await c.query(
      "SELECT id,name FROM didar_supplier WHERE ($1::text IS NULL OR id=$1) ORDER BY name",
      [supplier],
    )
  ).rows;
  return {
    contracts,
    events,
    accounts,
    suppliers,
    mode: "SANDBOX_MANUAL",
    unit: "fine_gold_microgram",
    rounding: "ceil_per_unit",
    production_accounting: "PROFESSIONAL_APPROVAL_REQUIRED",
  };
}
export async function performFinance(action: string, req: any) {
  if (
    !["finance", "treasury", "ledger", "tahesab", "acceptance"].includes(action)
  )
    return { handled: false };
  const u = await requireUser(req, ["admin", "supplier"]);
  if (
    u.role === "supplier" &&
    (!u.supplier_active || u.supplier_status !== "approved")
  )
    throw new Error("FORBIDDEN");
  if (req.method === "GET")
    return {
      handled: true,
      result: await transaction<any>((c) =>
        action === "acceptance"
          ? acceptanceRead(c, u)
          : action === "tahesab"
            ? tahesabRead(c, u)
            : action === "treasury"
              ? procurementRead(c, u)
              : action === "ledger"
                ? ledgerRead(c, u)
                : financeRead(c, u),
      ),
    };
  if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
  localFinance();
  const b = req.body || {};
  const result = await transaction(async (c) => {
    await finLock(c);
    if (b.operation === "contract_request") {
      const supplier = finText(b.supplier_id);
      await authorize(c, u, supplier);
      if (
        !["GOLD_ONLY", "RIAL_ONLY", "MIXED"].includes(b.mode) ||
        !["CONSIGNMENT", "BUY_TO_RESELL", "DIDAR_OWNED"].includes(b.ownership)
      )
        throw new Error("INVALID_CONTRACT");
      const gold =
        b.mode === "GOLD_ONLY"
          ? 10000
          : b.mode === "RIAL_ONLY"
            ? 0
            : integer(b.gold_bps, "GOLD_SHARE", 1, 9999);
      const effective = new Date(b.effective_at);
      if (!Number.isFinite(effective.getTime()))
        throw new Error("INVALID_EFFECTIVE_DATE");
      const version = (
        await c.query(
          "SELECT COALESCE(max(version),0)+1 n FROM didar_fin_contract WHERE supplier_id=$1",
          [supplier],
        )
      ).rows[0].n;
      const id = randomUUID();
      await c.query(
        `INSERT INTO didar_fin_contract(id,supplier_id,version,mode,gold_bps,ownership,effective_at,due_days,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          supplier,
          version,
          b.mode,
          gold,
          b.ownership,
          effective,
          integer(b.due_days, "DUE_DAYS", 0, 3650),
          finText(b.reason, 1000),
          u.id,
        ],
      );
      await audit(c, u.id, "finance_contract_requested", {
        id,
        supplier_id: supplier,
        version,
      });
      return { id };
    }
    if (u.role !== "admin") throw new Error("FORBIDDEN");
    if (action === "acceptance") return acceptanceWrite(c, u, b);
    if (action === "tahesab") return tahesabWrite(c, u, b);
    if (b.operation === "jewelry_value") return valueJewelry(c, u, b);
    const treasury = await procurementWrite(c, u, b);
    if (treasury) return treasury;
    if (b.operation === "contract_review") {
      if (typeof b.approved !== "boolean") throw new Error("INVALID_APPROVAL");
      await c.query(
        "INSERT INTO didar_fin_contract_review(contract_id,approved,actor_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [finText(b.contract_id), b.approved, u.id, finText(b.reason, 1000)],
      );
      await audit(c, u.id, "finance_contract_reviewed", {
        contract_id: b.contract_id,
        approved: b.approved,
      });
      return { ok: true };
    }
    if (b.operation === "refund") {
      const {
        rows: [sale],
      } = await c.query(
        "SELECT * FROM didar_fin_event WHERE id=$1 AND kind='SALE_EXPOSURE'",
        [finText(b.event_id)],
      );
      if (!sale) throw new Error("NOT_FOUND");
      if (sale.reservation_id) {
        const {
          rows: [r],
        } = await c.query(
          "SELECT status FROM didar_item_return WHERE reservation_id=$1",
          [sale.reservation_id],
        );
        if (!r || !["received", "restocked"].includes(r.status))
          throw new Error("CONFLICT_RETURN_REQUIRED");
      }
      const reason = finText(b.reason, 1000);
      const event = await appendEvent(c, {
        intent: "refund:" + sale.id,
        kind: "REFUND",
        supplier_id: sale.supplier_id,
        customer_id: sale.customer_id,
        order_line_id: sale.order_line_id,
        reservation_id: sale.reservation_id,
        source_event_id: sale.id,
        gold_ug: -BigInt(sale.gold_ug),
        irr: -BigInt(sale.irr),
        snapshot: {
          ...sale.snapshot,
          reason,
          synthetic: true,
          bank_execution: false,
        },
        actor_id: u.id,
      });
      await audit(c, u.id, "finance_refund", {
        event_id: event.id,
        supplier_id: sale.supplier_id,
      });
      return { event };
    }
    throw new Error("INVALID_FINANCE_OPERATION");
  });
  return { handled: true, result };
}
