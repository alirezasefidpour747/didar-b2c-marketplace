import { nativeAccess } from "./native-access";
import { db, transaction } from "./db";
import { sessionUser, demoAccountAllowed } from "./auth";
import { nativeActors } from "./native-context";
import { catalog } from "./catalog";
import { handler } from "./service";
import { GET as image } from "../api/didar/image/route";
import { mediaFile } from "./content-media";

const domains: Record<string, string> = {
  permissions: "sellers",
  inventory: "inventory_items",
  orders: "orders",
  manage: "products",
  classification: "products",
  onboarding: "didar.onboarding",
  media: "products",
  image: "products",
  "content-media": "didar.content",
  "media-file": "didar.content",
  pages: "didar.content",
  "merchant-pricing": "products",
  storefront: "didar.storefront",
  sharing: "didar.sharing",
  operations: "inventory_items",
  intake: "inventory_items",
  items: "inventory_items",
  labels: "inventory_items",
  rfid: "inventory_items",
  returns: "orders",
  fulfillment: "orders",
  finance: "payments",
  treasury: "payments",
  ledger: "payments",
  tahesab: "payments",
  acceptance: "payments",
  "finance-uat": "payments",
  wallet: "payments",
};
function right(req: any, key: string, write: boolean) {
  if (!req.permissions_enforced) return;
  const allowed = req.permissions?.[key];
  const ranks: Record<string, number> = {
    none: 0,
    view: 1,
    edit: 2,
    manage: 3,
  };
  if ((ranks[allowed] || 0) < (write ? 2 : 1)) throw Error("FORBIDDEN");
}
async function actor(req: any) {
  const a = req.auth_context;
  const vendor =
    req.originalUrl?.startsWith("/vendor/") || req.path?.startsWith("/vendor/");
  if (!a?.actor_id || a.actor_type !== (vendor ? "member" : "user"))
    throw Error("UNAUTHORIZED");
  // Native core verifies the selected seller AND membership before this handler.
  if (vendor && !req.seller_context?.seller_id) throw Error("FORBIDDEN");
  return {
    type: a.actor_type,
    id: a.actor_id,
    seller: vendor ? req.seller_context.seller_id : null,
  };
}
async function canConnect(a: any, u: any) {
  if (a.type === "user")
    return (
      u.role === "admin" ||
      (u.role === "customer" &&
        !!(
          await db.query(
            "SELECT 1 FROM didar_content_operator WHERE user_id=$1 AND active",
            [u.id],
          )
        ).rowCount)
    );
  const mapping = (
    await db.query(
      "SELECT supplier_id FROM didar_native_seller WHERE seller_id=$1 AND active",
      [a.seller],
    )
  ).rows[0];
  if (!mapping) return false;
  if (u.role === "supplier") return mapping.supplier_id === u.supplier_id;
  return (
    u.role === "customer" &&
    !!(
      await db.query(
        "SELECT 1 FROM didar_merchant_member WHERE user_id=$1 AND supplier_id=$2 AND active",
        [u.id, mapping.supplier_id],
      )
    ).rowCount
  );
}
async function linked(a: any, action: string, method: string) {
  const u = (
    await db.query(
      `SELECT u.id,u.email,u.name,u.role,u.supplier_id FROM didar_native_actor n JOIN didar_user u ON u.id=n.user_id WHERE n.actor_type=$1 AND n.actor_id=$2 AND n.active`,
      [a.type, a.id],
    )
  ).rows[0];
  if (!u || !demoAccountAllowed(u.email) || !(await canConnect(a, u)))
    throw Error("FORBIDDEN");
  if (a.type === "member") {
    const scope = (
      await db.query(
        `SELECT n.supplier_id,s.active supplier_active,s.status supplier_status,se.status native_seller_status
   FROM seller_member sm JOIN member m ON m.id=sm.member_id JOIN seller se ON se.id=sm.seller_id
   JOIN didar_native_seller n ON n.seller_id=sm.seller_id JOIN didar_supplier s ON s.id=n.supplier_id
   WHERE sm.member_id=$1 AND sm.seller_id=$2 AND sm.deleted_at IS NULL AND m.deleted_at IS NULL AND se.deleted_at IS NULL AND n.active`,
        [a.id, a.seller],
      )
    ).rows[0];
    if (!scope) throw Error("FORBIDDEN");
    Object.assign(u, scope, { native_supplier_id: scope.supplier_id });
    if (
      (!scope.supplier_active ||
        scope.supplier_status !== "approved" ||
        scope.native_seller_status !== "open") &&
      !(action === "context" || (action === "onboarding" && method === "GET"))
    )
      throw Error("FORBIDDEN");
  } else if (
    !(
      await db.query(
        'SELECT 1 FROM "user" WHERE id=$1 AND deleted_at IS NULL',
        [a.id],
      )
    ).rowCount
  )
    throw Error("FORBIDDEN");
  return u;
}
export async function nativeHandler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const a = await actor(req),
      action = req.params.action;
    if (action === "connect") {
      if (req.method !== "POST") throw Error("METHOD_NOT_ALLOWED");
      // Connection grants no capability; both existing identities and scoped grants must be proven.
      // Dual authenticated proof, never email matching or client role assertions.
      const u = await sessionUser({
        headers: {
          authorization: "Bearer " + String(req.body?.didar_token || ""),
        },
      });
      if (!u || !demoAccountAllowed(u.email) || !(await canConnect(a, u)))
        throw Error("FORBIDDEN");
      await transaction(async (c) => {
        const prior = (
          await c.query(
            "SELECT user_id FROM didar_native_actor WHERE actor_type=$1 AND actor_id=$2 FOR UPDATE",
            [a.type, a.id],
          )
        ).rows[0];
        if (prior && prior.user_id !== u.id) throw Error("FORBIDDEN");
        await c.query(
          "INSERT INTO didar_native_actor(actor_type,actor_id,user_id) VALUES($1,$2,$3) ON CONFLICT(actor_type,actor_id) DO NOTHING",
          [a.type, a.id, u.id],
        );
        await c.query(
          "INSERT INTO didar_audit(actor_id,action,details) VALUES($1,$2,$3)",
          [
            u.id,
            "native_identity_connected",
            JSON.stringify({ actor_type: a.type, actor_id: a.id }),
          ],
        );
      });
      return res.json({ ok: true });
    }
    const u = await linked(a, action, req.method);
    nativeActors.set(req, u);
    if (action === "context")
      return res.json({
        user: u,
        seller_id: a.seller,
        can_catalog:
          !req.permissions_enforced ||
          ["view", "edit", "manage"].includes(req.permissions?.products),
        public_origin: (process.env.STORE_CORS || "").split(",")[0],
      });
    if (action === "access-links") {
      if (a.type !== "user") throw Error("FORBIDDEN");
      right(req, "users", req.method !== "GET");
      return res.json(await nativeAccess(req, u));
    }
    if (action === "seller-links") {
      if (a.type !== "user" || u.role !== "admin") throw Error("FORBIDDEN");
      right(req, "sellers", req.method !== "GET");
      if (req.method === "GET")
        return res.json({
          links: (
            await db.query(
              "SELECT n.*,s.name FROM didar_native_seller n JOIN didar_supplier s ON s.id=n.supplier_id ORDER BY n.linked_at",
            )
          ).rows,
        });
      const { seller_id, supplier_id } = req.body || {};
      await transaction(async (c) => {
        if (
          !(
            await c.query(
              "SELECT 1 FROM seller WHERE id=$1 AND deleted_at IS NULL",
              [seller_id],
            )
          ).rowCount
        )
          throw Error("INVALID_REFERENCE");
        await c.query(
          "INSERT INTO didar_native_seller(seller_id,supplier_id,approved_by) VALUES($1,$2,$3)",
          [seller_id, supplier_id, u.id],
        );
        await c.query(
          "INSERT INTO didar_audit(actor_id,action,details) VALUES($1,$2,$3)",
          [
            u.id,
            "native_seller_linked",
            JSON.stringify({ seller_id, supplier_id }),
          ],
        );
      });
      return res.json({ ok: true });
    }
    if (action === "product-record") {
      right(req, "products", false);
      const p = (
        await db.query(
          `SELECT p.id,p.title,p.public_key,p.purity,p.category_id,p.published,p.approved FROM didar_product p WHERE p.native_id=$1 AND ($2='admin' OR EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=p.id AND o.supplier_id=$3) OR EXISTS(SELECT 1 FROM didar_intake_line l JOIN didar_intake_batch b ON b.id=l.batch_id WHERE l.product_id=p.id AND b.supplier_id=$3))`,
          [String(req.query.native_id || ""), u.role, u.supplier_id],
        )
      ).rows[0];
      return res.json({ product: p || null });
    }
    if (!domains[action] && !["me", "catalog"].includes(action))
      throw Error("NOT_FOUND");
    if (
      u.role === "customer" &&
      ![
        "context",
        "me",
        "catalog",
        "onboarding",
        "media",
        "image",
        "pages",
        "content-media",
        "media-file",
        "storefront",
        "sharing",
      ].includes(action)
    )
      throw Error("FORBIDDEN");
    if (domains[action]) {
      let key = domains[action];
      if (a.type === "member" && key === "sellers") key = "store";
      if (action === "manage" && req.method === "POST")
        key =
          (
            {
              supplier: "sellers",
              supplier_state: "sellers.approval",
              category: "product_categories",
              collection: "product_collections",
              review_request: "products.review",
              rate: "price_preferences",
            } as Record<string, string>
          )[req.body?.kind] || key;
      if (action === "finance" && req.body?.operation === "refund")
        key = "orders.refunds";
      const write =
        !["GET", "HEAD"].includes(req.method) &&
        !(action === "pages" && req.body?.operation === "preview");
      if (["media", "image"].includes(action) && u.role === "customer") {
        if (
          !["didar.content", "didar.onboarding"].some((k) =>
            ["edit", "manage", ...(!write ? ["view"] : [])].includes(
              req.permissions?.[k],
            ),
          )
        )
          throw Error("FORBIDDEN");
      } else right(req, key, write);
    }
    if (action === "catalog") {
      right(req, "products", false);
      return res.json(await catalog(u));
    }
    if (action === "image") return await image(req, res);
    if (action === "media-file") return await mediaFile(req, res);
    return await handler(req, res);
  } catch (e: any) {
    const m = e.message;
    const status =
      m === "UNAUTHORIZED"
        ? 401
        : m === "FORBIDDEN"
          ? 403
          : m === "NOT_FOUND"
            ? 404
            : e.code === "23505" || m.startsWith("CONFLICT")
              ? 409
              : m.startsWith("INVALID") || m === "METHOD_NOT_ALLOWED"
                ? 400
                : 500;
    if (status === 500) console.error("Native Didar adapter", e.code || m);
    return res.status(status).json({
      message:
        status === 500
          ? "INTERNAL_ERROR"
          : e.code === "23505"
            ? "CONFLICT_DUPLICATE"
            : m,
    });
  } finally {
    nativeActors.delete(req);
  }
}
