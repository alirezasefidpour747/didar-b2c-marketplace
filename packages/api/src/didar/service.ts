import { randomBytes, randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import {
  hashPassword,
  verifyPassword,
  digest,
  requireUser,
  sessionUser,
  demoAccountAllowed,
} from "./auth";
import { integer, price, withPolicy } from "./pricing";
import { catalog, manage } from "./catalog";
import { performCommerce } from "./commerce";
import { performPhase1 } from "./phase1";
import { reserveItems, finalizeItems } from "./item-stock";
import { performWallet } from "./finance-wallet";
import { performFinance, snapshotTerms } from "./finance";
import { isAvailable } from "./inventory";

const text = (v: unknown, max = 250) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new Error("INVALID_TEXT");
  return v.trim();
};
const uid = () => randomUUID();
const audit = (c: any, actor: string, action: string, details: any) =>
  c.query("INSERT INTO didar_audit(actor_id,action,details) VALUES($1,$2,$3)", [
    actor,
    action,
    JSON.stringify(details),
  ]);
export async function expireOrders() {
  await transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT id FROM didar_order WHERE status='pending' AND expires_at<=now() ORDER BY id FOR UPDATE SKIP LOCKED",
    );
    for (const o of rows) {
      await finalizeItems(c, o.id, false);
      await c.query("UPDATE didar_order SET status='expired' WHERE id=$1", [
        o.id,
      ]);
      await c.query(
        "UPDATE didar_payment_attempt SET status='expired' WHERE order_id=$1 AND status='initialized'",
        [o.id],
      );
      await audit(c, null as any, "order_expired", { order_id: o.id });
    }
  });
}
export async function perform(action: string, req: any): Promise<any> {
  const b = req.body || {};
  if (!["GET", "POST"].includes(req.method))
    throw new Error("METHOD_NOT_ALLOWED");
  if (
    [
      "register",
      "login",
      "logout",
      "checkout",
      "payment",
      "fulfillment",
      "profile",
    ].includes(action) &&
    req.method !== "POST" &&
    action !== "profile"
  )
    throw new Error("METHOD_NOT_ALLOWED");
  const wallet = await performWallet(action, req);
  if (wallet.handled) return wallet.result;
  const financial = await performFinance(action, req);
  if (financial.handled) return financial.result;
  const phase1 = await performPhase1(action, req);
  if (phase1.handled) return phase1.result;
  const extended = await performCommerce(action, req);
  if (extended.handled) return extended.result;
  if (action === "catalog" && req.method === "GET") {
    await expireOrders();
    return catalog();
  }
  if (action === "me") return { user: (await sessionUser(req)) || null };
  if (action === "register" || action === "login") {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const email = text(b.email, 150).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("INVALID_EMAIL");
    const password = text(b.password, 128);
    if (password.length < 12) throw new Error("INVALID_PASSWORD_MIN_12");
    if (!demoAccountAllowed(email)) throw new Error("UNAUTHORIZED");
    const {
      rows: [ipLimit],
    } = await db.query(
      `INSERT INTO didar_login_attempt(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN didar_login_attempt.reset_at<now() THEN 1 ELSE didar_login_attempt.attempts+1 END,reset_at=CASE WHEN didar_login_attempt.reset_at<now() THEN now()+interval '15 minutes' ELSE didar_login_attempt.reset_at END RETURNING attempts`,
      [digest(`ip:${req.ip}`)],
    );
    if (ipLimit.attempts > 200) throw new Error("RATE_LIMIT");
    // Persistent, shared rate limit; no in-memory bypass on worker restart.
    const key = digest(`${req.ip}:${email}`);
    const {
      rows: [limit],
    } = await db.query(
      `INSERT INTO didar_login_attempt(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN didar_login_attempt.reset_at<now() THEN 1 ELSE didar_login_attempt.attempts+1 END,reset_at=CASE WHEN didar_login_attempt.reset_at<now() THEN now()+interval '15 minutes' ELSE didar_login_attempt.reset_at END RETURNING attempts`,
      [key],
    );
    if (limit.attempts > 20) throw new Error("RATE_LIMIT");
    if (action === "register") {
      await transaction(async (c) => {
        const id = uid(),
          name = text(b.name, 100);
        if (b.role === "supplier") {
          const supplierId = uid();
          await c.query(
            "INSERT INTO didar_supplier(id,name,active,status) VALUES($1,$2,false,'pending')",
            [supplierId, text(b.supplier_name || name, 100)],
          );
          await c.query(
            "INSERT INTO didar_user(id,email,name,password,role,supplier_id) VALUES($1,$2,$3,$4,'supplier',$5)",
            [id, email, name, hashPassword(password), supplierId],
          );
          await audit(c, id, "supplier_registered", {
            supplier_id: supplierId,
          });
        } else {
          if (b.role && b.role !== "customer") throw new Error("INVALID_ROLE");
          await c.query(
            "INSERT INTO didar_user(id,email,name,password,role) VALUES($1,$2,$3,$4,'customer')",
            [id, email, name, hashPassword(password)],
          );
        }
      });
    }
    const {
      rows: [u],
    } = await db.query("SELECT * FROM didar_user WHERE email=$1", [email]);
    if (!u || !verifyPassword(password, u.password))
      throw new Error("UNAUTHORIZED");
    const token = randomBytes(32).toString("hex");
    await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `session:${u.id}`,
      ]);
      await c.query("DELETE FROM didar_session WHERE expires_at<=now()");
      await c.query(
        "DELETE FROM didar_session WHERE user_id=$1 AND token_hash NOT IN (SELECT token_hash FROM didar_session WHERE user_id=$1 ORDER BY expires_at DESC,token_hash LIMIT 4)",
        [u.id],
      );
      await c.query(
        "INSERT INTO didar_session VALUES($1,$2,now()+interval '12 hours')",
        [digest(token), u.id],
      );
    });
    return {
      token,
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        supplier_id: u.supplier_id,
      },
    };
  }
  if (action === "logout") {
    await db.query("DELETE FROM didar_session WHERE token_hash=$1", [
      digest(String(req.headers.authorization || "").replace(/^Bearer /, "")),
    ]);
    return { ok: true };
  }
  if (action === "checkout") {
    const u = await requireUser(req, ["customer"]);
    const key = text(b.idempotency_key, 100);
    if (!Array.isArray(b.lines) || b.lines.length < 1 || b.lines.length > 30)
      throw new Error("INVALID_LINES");
    const address = {
      name: text(b.address?.name, 100),
      phone: text(b.address?.phone, 20),
      city: text(b.address?.city, 100),
      address: text(b.address?.address, 500),
      postal_code: text(b.address?.postal_code, 10),
    };
    if (
      !/^09\d{9}$/.test(address.phone) ||
      !/^\d{10}$/.test(address.postal_code)
    )
      throw new Error("INVALID_ADDRESS");
    const lines = b.lines
      .map((l: any) => ({
        offer_id: text(l.offer_id, 100),
        quantity: integer(l.quantity, "QUANTITY", 1, 100),
        version: integer(l.version, "VERSION", 1),
      }))
      .sort((a: any, b: any) => a.offer_id.localeCompare(b.offer_id));
    if (new Set(lines.map((l: any) => l.offer_id)).size !== lines.length)
      throw new Error("INVALID_DUPLICATE_OFFER");
    await expireOrders();
    return transaction(async (c) => {
      // Serialize identical checkout requests before stock mutations.
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${u.id}:${key}`,
      ]);
      const {
        rows: [existing],
      } = await c.query(
        "SELECT * FROM didar_order WHERE customer_id=$1 AND idempotency_key=$2",
        [u.id, key],
      );
      if (existing) return { order: existing };
      const {
        rows: [rate],
      } = await c.query("SELECT * FROM didar_rate WHERE id=1 FOR SHARE");
      if (rate.version !== b.rate_version)
        throw new Error("CONFLICT_RATE_CHANGED");
      if (
        Date.now() - new Date(rate.updated_at).getTime() >
        24 * 60 * 60 * 1000
      )
        throw new Error("CONFLICT_RATE_STALE");
      const pricingRate = await withPolicy(c, rate);
      const snapshots: any[] = [];
      let total = 0;
      for (const l of lines) {
        const {
          rows: [o],
        } = await c.query(
          "SELECT o.*,p.title,p.purity,p.active product_active,p.published,p.approved,s.active supplier_active,s.status supplier_status FROM didar_offer o JOIN didar_product p ON p.id=o.product_id JOIN didar_supplier s ON s.id=o.supplier_id WHERE o.id=$1 FOR UPDATE OF o",
          [l.offer_id],
        );
        if (
          !o ||
          !o.active ||
          !o.product_active ||
          !o.published ||
          !o.approved ||
          !o.supplier_active ||
          o.supplier_status !== "approved" ||
          !isAvailable(o.quantity, l.quantity)
        )
          throw new Error("CONFLICT_STOCK");
        if (o.version !== l.version) throw new Error("CONFLICT_OFFER_CHANGED");
        const breakdown = {
          ...price({
            ...pricingRate,
            ...o,
            labor_irr: Number(o.labor_irr),
            rate_irr: Number(rate.rate_irr),
            fee_irr: Number(rate.fee_irr ?? 0),
            tax_bps: rate.tax_bps,
          }),
          policy: {
            purity: o.purity,
            labor_mode: o.labor_mode,
            labor_bps: o.labor_bps,
            fixed_labor_irr: Number(o.labor_irr),
            pricing_policy_id: pricingRate.pricing_policy_id,
            distribution_bps: pricingRate.distribution_bps,
            retail_bps: pricingRate.retail_bps,
            vat_bps: pricingRate.vat_bps,
            taxable_components: pricingRate.taxable_components,
            making_mode: o.making_mode,
            making_bps: o.making_bps,
            making_weight_mg: o.making_weight_mg,
          },
        };
        total += breakdown.total_irr * l.quantity;
        snapshots.push({ ...o, quantity: l.quantity, breakdown });
      }
      integer(total, "TOTAL", 1, Number.MAX_SAFE_INTEGER);
      const id = uid();
      const {
        rows: [order],
      } = await c.query(
        "INSERT INTO didar_order(id,customer_id,idempotency_key,total_irr,status,address,rate_snapshot) VALUES($1,$2,$3,$4,'pending',$5,$6) RETURNING *",
        [
          id,
          u.id,
          key,
          total,
          JSON.stringify(address),
          JSON.stringify(pricingRate),
        ],
      );
      for (const l of snapshots) {
        const lineID = uid();
        await c.query(
          "INSERT INTO didar_order_line(id,order_id,offer_id,supplier_id,title,weight_mg,quantity,breakdown,stock_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            lineID,
            id,
            l.id,
            l.supplier_id,
            l.title,
            l.weight_mg,
            l.quantity,
            JSON.stringify(l.breakdown),
            l.stock_mode,
          ],
        );
        await snapshotTerms(c, lineID, l.supplier_id);
        if (l.stock_mode === "itemized")
          await reserveItems(c, l, lineID, order.expires_at);
        else
          await c.query(
            "UPDATE didar_offer SET quantity=quantity-$1,version=version+1 WHERE id=$2",
            [l.quantity, l.id],
          );
      }
      await audit(c, u.id, "checkout", { order_id: id, total_irr: total });
      return { order };
    });
  }
  if (action === "orders") {
    const u = await requireUser(req, ["customer", "supplier", "admin"]);
    if (u.role === "supplier") {
      const {
        rows: [supplier],
      } = await db.query(
        "SELECT active,status FROM didar_supplier WHERE id=$1",
        [u.supplier_id],
      );
      if (!supplier?.active || supplier.status !== "approved")
        throw new Error("FORBIDDEN");
    }
    await expireOrders();
    const { rows: orders } = await db.query(
      `SELECT o.id,o.status,o.created_at,o.expires_at,(SELECT status FROM didar_payment_attempt pa WHERE pa.order_id=o.id LIMIT 1) payment_status,${u.role === "supplier" ? "NULL" : "o.total_irr"} total_irr,${u.role === "supplier" ? "'{}'::jsonb" : "o.address"} address,json_agg(json_build_object('id',l.id,'stock_mode',l.stock_mode,'items',(SELECT json_agg(json_build_object('reservation_id',r.id,'uid',i.uid,'weight_mg',i.weight_mg,'status',r.status,'fulfillment_status',r.fulfillment_status,'return_status',ret.status)) FROM didar_item_reservation r JOIN didar_inventory_item i ON i.id=r.item_id LEFT JOIN didar_item_return ret ON ret.reservation_id=r.id WHERE r.order_line_id=l.id),'fulfillment_status',l.fulfillment_status,'tracking_number',l.tracking_number,'carrier',l.carrier,'fulfillment_updated_at',l.fulfillment_updated_at,'title',l.title,'quantity',l.quantity,'weight_mg',l.weight_mg,'breakdown',l.breakdown,'supplier_id',l.supplier_id,'supplier_name',(SELECT s.name FROM didar_supplier s WHERE s.id=l.supplier_id))) lines FROM didar_order o JOIN didar_order_line l ON l.order_id=o.id WHERE ($1='admin' OR ($1='customer' AND o.customer_id=$2) OR ($1='supplier' AND l.supplier_id=$3)) GROUP BY o.id ORDER BY o.created_at DESC`,
      [u.role, u.id, u.supplier_id],
    );
    return { orders };
  }
  if (action === "manage") {
    const u = await requireUser(req, ["supplier", "admin"]);
    return manage(req, u);
  }
  throw new Error("NOT_FOUND");
}
export async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const result = await perform(
      req.path.split("/").filter(Boolean).pop()!,
      req,
    );
    res.json(result);
  } catch (e: any) {
    const msg = e.message || "INTERNAL_ERROR";
    const status =
      msg === "UNAUTHORIZED"
        ? 401
        : msg === "FORBIDDEN"
          ? 403
          : msg === "NOT_FOUND"
            ? 404
            : msg === "RATE_LIMIT"
              ? 429
              : [
                    "PAYMENTS_DISABLED",
                    "RATE_UNAVAILABLE",
                    "LIVE_GATEWAY_NOT_CONFIGURED",
                  ].includes(msg)
                ? 503
                : msg.startsWith("CONFLICT") ||
                    ["23505", "40P01", "40001"].includes(e.code)
                  ? 409
                  : msg.startsWith("INVALID") ||
                      msg === "METHOD_NOT_ALLOWED" ||
                      ["23503", "23514"].includes(e.code)
                    ? 400
                    : 500;
    if (msg === "FORBIDDEN") {
      const actor = await sessionUser(req).catch(() => null);
      if (actor)
        await audit(db, actor.id, "access_denied", {
          action: req.path.split("/").pop(),
          role: actor.role,
          supplier_id: actor.supplier_id,
          resource_id:
            req.body?.item_id || req.body?.id || req.body?.batch_id || null,
        }).catch(() => {});
    }
    if (status === 500)
      console.error("Didar request failed", e.code || e.message);
    res.status(status).json({
      message:
        status === 500
          ? "INTERNAL_ERROR"
          : e.code === "23505"
            ? "CONFLICT_DUPLICATE"
            : ["40P01", "40001"].includes(e.code)
              ? "CONFLICT_RETRY"
              : ["23503", "23514"].includes(e.code)
                ? "INVALID_REFERENCE"
                : msg,
    });
  }
}
