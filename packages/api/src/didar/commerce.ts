import { storeScope } from "./storefront";
import { publicOrder } from "./merchant-profiles";
import { recognizePayment } from "./finance";
import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { requireUser } from "./auth";
import { authorize } from "./permissions";
import { finalizeItems } from "./item-stock";
import { integer } from "./pricing";
import { reservationStatus } from "./inventory";
import { paymentProvider, type PaymentOutcome } from "./payment-provider";

function text(v: unknown, max = 250) {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new Error("INVALID_TEXT");
  return v.trim();
}
const audit = (c: any, actor: string | null, action: string, details: any) =>
  c.query("INSERT INTO didar_audit(actor_id,action,details) VALUES($1,$2,$3)", [
    actor,
    action,
    JSON.stringify(details),
  ]);
function publicPayment(p: any) {
  if (!p) return null;
  const { authority, ...safe } = p;
  return { ...safe, amount_irr: Number(p.amount_irr) };
}
async function payment(req: any) {
  const u = await requireUser(req, ["customer"]);
  const provider = paymentProvider();
  const b = req.body || {},
    id = text(b.order_id, 100);
  const operation = b.operation || (b.outcome ? "confirm" : "initialize");
  if (!["initialize", "confirm", "callback"].includes(operation))
    throw new Error("INVALID_PAYMENT_OPERATION");
  if (
    operation !== "initialize" &&
    !["success", "failure", "cancel"].includes(b.outcome)
  )
    throw new Error("INVALID_OUTCOME");
  return transaction(async (c) => {
    // Always lock order before attempt/stock: same lock order as reservation expiry.
    const {
      rows: [o],
    } = await c.query(
      "SELECT * FROM didar_order WHERE id=$1 AND customer_id=$2 FOR UPDATE",
      [id, u.id],
    );
    if (!o) throw new Error("NOT_FOUND");
    const scope = await storeScope(req, c);
    if (scope && o.origin_supplier_id !== scope.supplier_id)
      throw new Error("NOT_FOUND");
    let {
      rows: [attempt],
    } = await c.query("SELECT * FROM didar_payment_attempt WHERE order_id=$1", [
      id,
    ]);
    if (attempt && b.attempt_id && attempt.id !== b.attempt_id)
      throw new Error("NOT_FOUND");
    if (
      b.operation &&
      operation !== "initialize" &&
      (!attempt || b.attempt_id !== attempt.id)
    )
      throw new Error("INVALID_PAYMENT_ATTEMPT");
    if (o.status !== "pending")
      return { order: publicOrder(o), payment: publicPayment(attempt) };
    let status = reservationStatus(
      o.status,
      new Date(o.expires_at),
      new Date(),
    );
    if (!attempt && status === "pending") {
      const initialized = await provider.initialize({
        order_id: id,
        amount_irr: integer(
          Number(o.total_irr),
          "PAYMENT_AMOUNT",
          1,
          Number.MAX_SAFE_INTEGER,
        ),
        currency: "IRR",
      });
      ({
        rows: [attempt],
      } = await c.query(
        `INSERT INTO didar_payment_attempt(id,order_id,provider,authority,amount_irr,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          randomUUID(),
          id,
          provider.name,
          initialized.authority,
          o.total_irr,
          o.expires_at,
        ],
      ));
      await audit(c, u.id, "payment_initialized", {
        order_id: id,
        payment_id: attempt.id,
        provider: provider.name,
      });
    }
    if (operation === "initialize" && status === "pending")
      return { order: publicOrder(o), payment: publicPayment(attempt) };
    let outcome: "success" | "failure" | "cancelled" | "expired" = "expired";
    let reference: string | undefined;
    if (status === "pending") {
      if (
        attempt.provider !== provider.name ||
        Number(attempt.amount_irr) !== Number(o.total_irr)
      )
        throw new Error("CONFLICT_PAYMENT_AMOUNT");
      const result = await provider.confirm({
        authority: attempt.authority,
        amount_irr: Number(attempt.amount_irr),
        outcome: b.outcome as PaymentOutcome,
      });
      outcome = result.status;
      reference = result.reference;
      status = outcome === "success" ? "paid" : "failed";
    }
    await finalizeItems(c, id, status === "paid");
    const {
      rows: [order],
    } = await c.query(
      "UPDATE didar_order SET status=$1 WHERE id=$2 RETURNING *",
      [status, id],
    );
    if (attempt)
      ({
        rows: [attempt],
      } = await c.query(
        "UPDATE didar_payment_attempt SET status=$1,reference=$2,confirmed_at=now() WHERE id=$3 RETURNING *",
        [outcome, reference || null, attempt.id],
      ));
    if (status === "paid") await recognizePayment(c, order, u.id);
    await audit(c, u.id, "sandbox_payment", {
      order_id: id,
      payment_id: attempt?.id,
      status,
      outcome,
    });
    return { order: publicOrder(order), payment: publicPayment(attempt) };
  });
}
async function fulfillment(req: any) {
  const u = await requireUser(req, ["admin", "supplier"]);
  if (
    u.role === "supplier" &&
    (!u.supplier_active || u.supplier_status !== "approved")
  )
    throw new Error("FORBIDDEN");
  const b = req.body || {},
    id = text(b.line_id, 100);
  const states = ["allocated", "preparing", "dispatched", "delivered"];
  if (!states.includes(b.status)) throw new Error("INVALID_FULFILLMENT_STATUS");
  return transaction(async (c) => {
    const {
      rows: [line],
    } = await c.query(
      `SELECT l.*,o.status payment_status FROM didar_order_line l JOIN didar_order o ON o.id=l.order_id WHERE l.id=$1 FOR UPDATE OF l`,
      [id],
    );
    if (!line) throw new Error("NOT_FOUND");
    if (u.role === "supplier" && line.supplier_id !== u.supplier_id)
      throw new Error("FORBIDDEN");
    await authorize(c, u, line.supplier_id, "UPDATE_OWN_FULFILLMENT");
    if (line.stock_mode === "itemized") {
      const { rowCount } = await c.query(
        "SELECT id FROM didar_item_reservation WHERE order_line_id=$1 AND status='sold'",
        [id],
      );
      if (!rowCount) throw new Error("CONFLICT_RETURNED_ITEM");
    }
    if (line.payment_status !== "paid")
      throw new Error("CONFLICT_UNPAID_ORDER");
    if (b.status === line.fulfillment_status) return { line };
    if (
      states.indexOf(b.status) !==
      states.indexOf(line.fulfillment_status) + 1
    )
      throw new Error("CONFLICT_FULFILLMENT_TRANSITION");
    if (u.role === "supplier" && b.status === "delivered")
      throw new Error("FORBIDDEN");
    const tracking =
      b.status === "dispatched"
        ? text(b.tracking_number, 100)
        : line.tracking_number;
    const carrier =
      b.status === "dispatched" ? text(b.carrier, 100) : line.carrier;
    const {
      rows: [updated],
    } = await c.query(
      "UPDATE didar_order_line SET fulfillment_status=$1,tracking_number=$2,carrier=$3,fulfillment_updated_at=now() WHERE id=$4 RETURNING *",
      [b.status, tracking, carrier, id],
    );
    await c.query(
      "UPDATE didar_item_reservation SET fulfillment_status=$1,updated_at=now() WHERE order_line_id=$2 AND status='sold'",
      [b.status, id],
    );
    await audit(c, u.id, "fulfillment_updated", {
      supplier_id: line.supplier_id,
      admin_override: u.role === "admin",
      order_id: line.order_id,
      line_id: id,
      from: line.fulfillment_status,
      status: b.status,
      tracking_number: tracking,
      carrier,
    });
    return { line: updated };
  });
}
async function profile(req: any) {
  const u = await requireUser(req, ["customer", "supplier", "admin"]);
  if (req.method === "POST") {
    const b = req.body || {},
      name = text(b.name, 100),
      phone = b.phone ? text(b.phone, 20) : "";
    if (phone && !/^09\d{9}$/.test(phone)) throw new Error("INVALID_PHONE");
    let address: Record<string, string> = {};
    if (b.address && Object.keys(b.address).length) {
      address = {
        name: text(b.address.name, 100),
        phone: text(b.address.phone, 20),
        city: text(b.address.city, 100),
        address: text(b.address.address, 500),
        postal_code: text(b.address.postal_code, 10),
      };
      if (
        !/^09\d{9}$/.test(address.phone) ||
        !/^\d{10}$/.test(address.postal_code)
      )
        throw new Error("INVALID_ADDRESS");
    }
    await transaction(async (c) => {
      await c.query(
        "UPDATE didar_user SET name=$1,phone=$2,address=$3 WHERE id=$4",
        [name, phone, JSON.stringify(address), u.id],
      );
      await audit(c, u.id, "profile_updated", { user_id: u.id });
    });
  }
  const {
    rows: [user],
  } = await db.query(
    "SELECT id,name,email,role,supplier_id,phone,address FROM didar_user WHERE id=$1",
    [u.id],
  );
  return { user };
}
export async function performCommerce(
  action: string,
  req: any,
): Promise<{ handled: boolean; result?: any }> {
  if (
    action === "manage" &&
    req.method === "POST" &&
    req.body?.kind === "rate"
  ) {
    const u = await requireUser(req, ["admin"]);
    const b = req.body;
    const result = await transaction(async (c) => {
      const {
        rows: [old],
      } = await c.query("SELECT * FROM didar_rate WHERE id=1 FOR UPDATE");
      const rate = integer(b.rate_irr, "RATE", 1),
        tax = integer(b.tax_bps, "TAX", 0, 10000);
      const fee = integer(b.fee_irr ?? Number(old.fee_irr), "FEE");
      const rounding = integer(
        b.rounding_step ?? old.rounding_step,
        "ROUNDING",
        1,
        1000000,
      );
      const margin = integer(
        b.default_margin_bps ?? old.default_margin_bps,
        "MARGIN",
        0,
        10000,
      );
      const {
        rows: [previous],
      } = await c.query("SELECT * FROM didar_pricing_policy WHERE id=$1", [
        old.pricing_policy_id,
      ]);
      const distribution = integer(
        b.distribution_bps ?? previous.distribution_bps,
        "DISTRIBUTION",
        0,
        10000,
      );
      const retail = integer(
        b.retail_bps ?? previous.retail_bps,
        "RETAIL",
        0,
        10000,
      );
      const taxable = b.taxable_components ?? previous.taxable_components;
      if (
        !Array.isArray(taxable) ||
        taxable.some(
          (v: any) => !["gold", "making", "distribution", "retail"].includes(v),
        )
      )
        throw new Error("INVALID_TAX_COMPONENTS");
      const {
        rows: [policy],
      } = await c.query(
        "INSERT INTO didar_pricing_policy(distribution_bps,retail_bps,vat_bps,taxable_components,actor_id) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [distribution, retail, tax, [...new Set(taxable)], u.id],
      );
      await c.query("UPDATE didar_rate SET pricing_policy_id=$1 WHERE id=1", [
        policy.id,
      ]);
      await c.query(
        "UPDATE didar_rate SET rate_irr=$1,tax_bps=$2,fee_irr=$3,rounding_step=$4,default_margin_bps=$5,version=version+1,updated_at=now() WHERE id=1",
        [rate, tax, fee, rounding, margin],
      );
      await audit(c, u.id, "rate_updated", {
        rate_irr: rate,
        tax_bps: tax,
        fee_irr: fee,
        rounding_step: rounding,
        default_margin_bps: margin,
      });
      return { ok: true };
    });
    return { handled: true, result };
  }
  if (!["payment", "fulfillment", "profile"].includes(action))
    return { handled: false };
  if (action !== "profile" && req.method !== "POST")
    throw new Error("METHOD_NOT_ALLOWED");
  if (!["GET", "POST"].includes(req.method))
    throw new Error("METHOD_NOT_ALLOWED");
  return {
    handled: true,
    result: await (action === "payment"
      ? payment(req)
      : action === "fulfillment"
        ? fulfillment(req)
        : profile(req)),
  };
}
