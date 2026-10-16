import { db, transaction } from "./db";
import { sessionUser } from "./auth";
import { clean, merchantAccess } from "./storefront";
import { effectiveProfile, pricingLock } from "./merchant-profiles";
import { submitProductRequest } from "./catalog";
export async function onboarding(req: any) {
  const u = await sessionUser(req);
  if (!u) throw new Error("UNAUTHORIZED");
  const b = req.body || {},
    q = req.query || {};
  if (req.method === "POST") {
    if (b.operation !== "request") throw new Error("INVALID_ACTION");
    clean(b.sku, 80);
    return submitProductRequest(req, u, {
      ...b,
      supplier_id: clean(b.supplier_id || u.supplier_id),
    });
  }
  const { rows: suppliers } = await db.query(
    `SELECT id,name,status,active,commercial_type,pricing_revision FROM didar_supplier s WHERE $1='admin' OR ($1='supplier' AND s.id=$2) OR EXISTS(SELECT 1 FROM didar_merchant_member m WHERE m.supplier_id=s.id AND m.user_id=$3 AND m.permission='ONBOARDING' AND m.active) ORDER BY name`,
    [u.role, u.supplier_id || null, u.id],
  );
  const sid = q.supplier_id || u.supplier_id || suppliers[0]?.id;
  if (!sid) return { suppliers, requests: [], products: [], assets: [] };
  const supplier = suppliers.find((s: any) => s.id === sid);
  if (!supplier) throw new Error("FORBIDDEN");
  if (
    u.role !== "admin" &&
    (!supplier.active || supplier.status !== "approved")
  )
    return {
      suppliers,
      supplier,
      requests: [],
      products: [],
      pending_approval: true,
    };
  return transaction(async (c) => {
    // Profile lock precedes supplier locks, as in checkout/control-plane readers.
    await pricingLock(c);
    await merchantAccess(c, u, sid, "ONBOARDING");
    let profile: any = null,
      profile_error = "";
    try {
      profile = await effectiveProfile(c, sid);
    } catch (e: any) {
      if (!e.message?.startsWith("CONFLICT_")) throw e;
      profile_error = e.message;
    }
    const requests = (
      await c.query(
        "SELECT * FROM didar_product_request WHERE supplier_id=$1 ORDER BY created_at DESC LIMIT 100",
        [sid],
      )
    ).rows;
    const products = (
      await c.query(
        `SELECT p.id,p.title,p.public_key,p.category_id,p.active,p.approved,p.published,coalesce((SELECT json_agg(json_build_object('id',o.id,'stock_mode',o.stock_mode,'quantity',o.quantity,'weight_mg',o.weight_mg,'making_mode',o.making_mode,'making_bps',o.making_bps)) FROM didar_offer o WHERE o.product_id=p.id AND o.supplier_id=$1),'[]') offers,(SELECT count(*)::int FROM didar_inventory_item i WHERE i.product_id=p.id AND i.supplier_id=$1 AND i.status='available') accepted_uids FROM didar_product p WHERE EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=p.id AND o.supplier_id=$1) OR EXISTS(SELECT 1 FROM didar_product_request r WHERE r.supplier_id=$1 AND r.product_id=p.id) ORDER BY p.title LIMIT 200`,
        [sid],
      )
    ).rows;
    const { rows: masters } = await c.query(
      `SELECT p.id,p.title,p.category_id FROM didar_product p WHERE p.active AND p.published AND p.approved AND didar_public_taxonomy(p.id,p.category_id) AND didar_visible_product(p.id,NULL) ORDER BY p.title LIMIT 500`,
    );
    const { rows: categories } = await c.query(
      "SELECT id,name,parent_id,kind,active FROM didar_category WHERE active AND kind IN ('family','category','subcategory') ORDER BY name",
    );
    const store = (
      await c.query(
        "SELECT handle,name,approved,published,visibility FROM didar_storefront WHERE supplier_id=$1",
        [sid],
      )
    ).rows[0];
    const permissions = (
      await c.query(
        "SELECT permission,granted FROM didar_supplier_permission WHERE supplier_id=$1",
        [sid],
      )
    ).rows;
    const events = (
      await c.query(
        "SELECT actor_id,action,request_id,asset_id,details,created_at FROM didar_onboarding_event WHERE supplier_id=$1 ORDER BY id DESC LIMIT 100",
        [sid],
      )
    ).rows;
    return {
      suppliers,
      supplier,
      requests,
      products,
      masters,
      categories,
      store,
      profile: profile
        ? { id: profile.id, name: profile.name, version_id: profile.version_id }
        : null,
      profile_error,
      permissions,
      events,
    };
  });
}
