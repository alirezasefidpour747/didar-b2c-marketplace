import { randomBytes, randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import {
  hashPassword,
  verifyPassword,
  digest,
  requireUser,
  sessionUser,
} from "./auth";
import { integer, price } from "./pricing";

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
      const { rows: lines } = await c.query(
        "SELECT * FROM didar_order_line WHERE order_id=$1 ORDER BY offer_id",
        [o.id],
      );
      for (const l of lines)
        await c.query(
          "UPDATE didar_offer SET quantity=quantity+$1,version=version+1 WHERE id=$2",
          [l.quantity, l.offer_id],
        );
      await c.query("UPDATE didar_order SET status='expired' WHERE id=$1", [
        o.id,
      ]);
    }
  });
}
async function catalog() {
  const {
    rows: [rate],
  } = await db.query("SELECT * FROM didar_rate WHERE id=1");
  const { rows: products } = await db.query(
    `SELECT p.*,coalesce(json_agg(json_build_object('id',o.id,'supplier_id',o.supplier_id,'supplier',s.name,'weight_mg',o.weight_mg,'quantity',o.quantity,'labor_irr',o.labor_irr::text,'margin_bps',o.margin_bps,'version',o.version) ORDER BY o.id) FILTER (WHERE s.active), '[]') offers FROM didar_product p LEFT JOIN didar_offer o ON o.product_id=p.id LEFT JOIN didar_supplier s ON s.id=o.supplier_id WHERE p.active GROUP BY p.id ORDER BY p.id`,
  );
  for (const p of products)
    p.offers = p.offers.map((o: any) => ({
      ...o,
      labor_irr: Number(o.labor_irr),
      price: price({
        ...o,
        labor_irr: Number(o.labor_irr),
        purity: p.purity,
        rate_irr: Number(rate.rate_irr),
        tax_bps: rate.tax_bps,
      }),
    }));
  return { products, rate: { ...rate, rate_irr: Number(rate.rate_irr) } };
}
export async function perform(action: string, req: any): Promise<any> {
  const b = req.body || {};
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
    // Persistent, shared rate limit; no in-memory bypass on worker restart.
    const key = digest(`${req.ip}:${email}`);
    const {
      rows: [limit],
    } = await db.query(
      `INSERT INTO didar_login_attempt(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN didar_login_attempt.reset_at<now() THEN 1 ELSE didar_login_attempt.attempts+1 END,reset_at=CASE WHEN didar_login_attempt.reset_at<now() THEN now()+interval '15 minutes' ELSE didar_login_attempt.reset_at END RETURNING attempts`,
      [key],
    );
    if (limit.attempts > 20) throw new Error("RATE_LIMIT");
    if (action === "register")
      await db.query(
        "INSERT INTO didar_user(id,email,name,password,role) VALUES($1,$2,$3,$4,'customer')",
        [uid(), email, text(b.name, 100), hashPassword(password)],
      );
    const {
      rows: [u],
    } = await db.query("SELECT * FROM didar_user WHERE email=$1", [email]);
    if (!u || !verifyPassword(password, u.password))
      throw new Error("UNAUTHORIZED");
    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO didar_session VALUES($1,$2,now()+interval '12 hours')",
      [digest(token), u.id],
    );
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
      const snapshots: any[] = [];
      let total = 0;
      for (const l of lines) {
        const {
          rows: [o],
        } = await c.query(
          "SELECT o.*,p.title,p.purity,p.active,s.active supplier_active FROM didar_offer o JOIN didar_product p ON p.id=o.product_id JOIN didar_supplier s ON s.id=o.supplier_id WHERE o.id=$1 FOR UPDATE OF o",
          [l.offer_id],
        );
        if (!o || !o.active || !o.supplier_active || o.quantity < l.quantity)
          throw new Error("CONFLICT_STOCK");
        if (o.version !== l.version) throw new Error("CONFLICT_OFFER_CHANGED");
        const breakdown = price({
          ...o,
          labor_irr: Number(o.labor_irr),
          rate_irr: Number(rate.rate_irr),
          tax_bps: rate.tax_bps,
        });
        total += breakdown.total_irr * l.quantity;
        snapshots.push({ ...o, quantity: l.quantity, breakdown });
      }
      integer(total, "TOTAL", 1, Number.MAX_SAFE_INTEGER);
      const id = uid();
      const {
        rows: [order],
      } = await c.query(
        "INSERT INTO didar_order(id,customer_id,idempotency_key,total_irr,status,address,rate_snapshot) VALUES($1,$2,$3,$4,'pending',$5,$6) RETURNING *",
        [id, u.id, key, total, JSON.stringify(address), JSON.stringify(rate)],
      );
      for (const l of snapshots) {
        await c.query(
          "INSERT INTO didar_order_line VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            uid(),
            id,
            l.id,
            l.supplier_id,
            l.title,
            l.weight_mg,
            l.quantity,
            JSON.stringify(l.breakdown),
          ],
        );
        await c.query(
          "UPDATE didar_offer SET quantity=quantity-$1,version=version+1 WHERE id=$2",
          [l.quantity, l.id],
        );
      }
      await audit(c, u.id, "checkout", { order_id: id, total_irr: total });
      return { order };
    });
  }
  if (action === "payment") {
    const u = await requireUser(req, ["customer"]);
    if (process.env.DIDAR_PAYMENT_MODE !== "sandbox")
      throw new Error("PAYMENTS_DISABLED");
    const id = text(b.order_id, 100);
    if (!["success", "failure"].includes(b.outcome))
      throw new Error("INVALID_OUTCOME");
    return transaction(async (c) => {
      const {
        rows: [o],
      } = await c.query(
        "SELECT * FROM didar_order WHERE id=$1 AND customer_id=$2 FOR UPDATE",
        [id, u.id],
      );
      if (!o) throw new Error("NOT_FOUND");
      if (o.status !== "pending") return { order: o };
      const expired = new Date(o.expires_at).getTime() <= Date.now();
      const status = expired
        ? "expired"
        : b.outcome === "success"
          ? "paid"
          : "failed";
      if (status !== "paid") {
        const { rows } = await c.query(
          "SELECT * FROM didar_order_line WHERE order_id=$1 ORDER BY offer_id",
          [id],
        );
        for (const l of rows)
          await c.query(
            "UPDATE didar_offer SET quantity=quantity+$1,version=version+1 WHERE id=$2",
            [l.quantity, l.offer_id],
          );
      }
      const {
        rows: [order],
      } = await c.query(
        "UPDATE didar_order SET status=$1 WHERE id=$2 RETURNING *",
        [status, id],
      );
      await audit(c, u.id, "sandbox_payment", { order_id: id, status });
      return { order };
    });
  }
  if (action === "orders") {
    const u = await requireUser(req, ["customer", "supplier", "admin"]);
    await expireOrders();
    const { rows: orders } = await db.query(
      `SELECT o.id,o.status,o.created_at,o.expires_at,${u.role === "supplier" ? "NULL" : "o.total_irr"} total_irr,${u.role === "supplier" ? "'{}'::jsonb" : "o.address"} address,json_agg(json_build_object('title',l.title,'quantity',l.quantity,'weight_mg',l.weight_mg,'breakdown',l.breakdown,'supplier_id',l.supplier_id)) lines FROM didar_order o JOIN didar_order_line l ON l.order_id=o.id WHERE ($1='admin' OR ($1='customer' AND o.customer_id=$2) OR ($1='supplier' AND l.supplier_id=$3)) GROUP BY o.id ORDER BY o.created_at DESC LIMIT 100`,
      [u.role, u.id, u.supplier_id],
    );
    return { orders };
  }
  if (action === "manage") {
    const u = await requireUser(req, ["supplier", "admin"]);
    if (req.method === "GET") {
      const data = await catalog();
      if (u.role === "supplier")
        for (const p of data.products)
          p.offers = p.offers.filter(
            (o: any) => o.supplier_id === u.supplier_id,
          );
      const { rows: suppliers } = await db.query(
        "SELECT * FROM didar_supplier WHERE $1='admin' OR id=$2",
        [u.role, u.supplier_id],
      );
      return { ...data, suppliers };
    }
    if (b.kind === "offer") {
      const quantity = integer(b.quantity, "QUANTITY", 0, 100000);
      const labor = integer(b.labor_irr, "LABOR");
      const margin = integer(b.margin_bps, "MARGIN", 0, 10000);
      return transaction(async (c) => {
        const {
          rows: [o],
        } = await c.query("SELECT * FROM didar_offer WHERE id=$1 FOR UPDATE", [
          text(b.id),
        ]);
        if (!o) throw new Error("NOT_FOUND");
        if (u.role === "supplier" && o.supplier_id !== u.supplier_id)
          throw new Error("FORBIDDEN");
        if (o.version !== b.version) throw new Error("CONFLICT_VERSION");
        await c.query(
          "UPDATE didar_offer SET quantity=$1,labor_irr=$2,margin_bps=$3,version=version+1 WHERE id=$4",
          [quantity, labor, margin, o.id],
        );
        await audit(c, u.id, "offer_updated", {
          id: o.id,
          quantity,
          labor_irr: labor,
          margin_bps: margin,
        });
        return { ok: true };
      });
    }
    if (b.kind === "new_offer") {
      const id = uid();
      await db.query(
        "INSERT INTO didar_offer(id,product_id,supplier_id,weight_mg,quantity,labor_irr,margin_bps) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          text(b.product_id),
          u.role === "supplier" ? u.supplier_id : text(b.supplier_id),
          integer(b.weight_mg, "WEIGHT", 1, 1000000),
          integer(b.quantity, "QUANTITY", 0, 100000),
          integer(b.labor_irr, "LABOR"),
          integer(b.margin_bps, "MARGIN", 0, 10000),
        ],
      );
      await audit(db, u.id, "offer_created", { id });
      return { id };
    }
    if (u.role !== "admin") throw new Error("FORBIDDEN");
    if (b.kind === "rate") {
      await db.query(
        "UPDATE didar_rate SET rate_irr=$1,tax_bps=$2,version=version+1,updated_at=now() WHERE id=1",
        [integer(b.rate_irr, "RATE", 1), integer(b.tax_bps, "TAX", 0, 10000)],
      );
      await audit(db, u.id, "rate_updated", {
        rate_irr: b.rate_irr,
        tax_bps: b.tax_bps,
      });
      return { ok: true };
    }
    if (b.kind === "supplier") {
      const id = uid();
      await db.query("INSERT INTO didar_supplier(id,name) VALUES($1,$2)", [
        id,
        text(b.name, 100),
      ]);
      await audit(db, u.id, "supplier_created", { id });
      return { id };
    }
    if (b.kind === "product") {
      const id = uid();
      const title = text(b.title, 150);
      const purity = integer(b.purity, "PURITY", 1, 1000);
      const { createProductsWorkflow } =
        await import("@mercurjs/core/workflows");
      const { result } = await createProductsWorkflow(req.scope).run({
        input: {
          created_by: u.id,
          products: [
            {
              title,
              handle: `didar-${id}`,
              status: "published",
              variants: [{ title: "Standard" }],
            },
          ],
        },
      });
      await db.query(
        "INSERT INTO didar_product(id,title,category,purity,native_id) VALUES($1,$2,$3,$4,$5)",
        [id, title, text(b.category, 100), purity, result[0].id],
      );
      return { id };
    }
    throw new Error("INVALID_KIND");
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
              : msg.startsWith("CONFLICT") || e.code === "23505"
                ? 409
                : msg.startsWith("INVALID") || msg === "METHOD_NOT_ALLOWED"
                  ? 400
                  : 500;
    if (status === 500)
      console.error("Didar request failed", e.code || e.message);
    res.status(status).json({
      message:
        status === 500
          ? "INTERNAL_ERROR"
          : e.code === "23505"
            ? "CONFLICT_DUPLICATE"
            : msg,
    });
  }
}
