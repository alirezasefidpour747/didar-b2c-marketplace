import { MedusaError } from "@medusajs/framework/utils";
import { db } from "./db";
/** Preserve Mercur's native published/owned catalog rules, then narrow linked
 * DIDAR masters using the existing public/own business visibility authority. */
export async function allowedNativeProducts(req: any) {
  const supplier = (
    await db.query(
      `SELECT n.supplier_id FROM didar_native_seller n
    JOIN didar_native_actor a ON a.actor_type='member' AND a.actor_id=$1 AND a.active
    JOIN didar_user u ON u.id=a.user_id AND u.role='supplier' AND u.supplier_id=n.supplier_id
    WHERE n.seller_id=$2 AND n.active`,
      [req.auth_context?.actor_id, req.seller_context?.seller_id],
    )
  ).rows[0];
  if (!supplier)
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "FORBIDDEN");
  return (
    await db.query(
      `SELECT p.native_id FROM didar_product p
    LEFT JOIN didar_product_projection ps ON ps.product_id=p.id
    LEFT JOIN product np ON np.id=p.native_id
    WHERE p.native_id IS NOT NULL AND (ps.product_id IS NULL OR
      (ps.projected_revision=ps.source_revision AND np.metadata->>'didar_projection_revision'=ps.source_revision::text)) AND (
    EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=p.id AND o.supplier_id=$1)
    OR EXISTS(SELECT 1 FROM didar_intake_line l JOIN didar_intake_batch b ON b.id=l.batch_id WHERE l.product_id=p.id AND b.supplier_id=$1)
    OR COALESCE((p.active AND p.approved AND p.published AND didar_public_taxonomy(p.id,p.category_id) AND didar_visible_product(p.id,NULL)),false))`,
      [supplier.supplier_id],
    )
  ).rows.map((p: any) => p.native_id);
}
export async function nativeProductReadGuard(req: any, res: any, next: any) {
  if (!["GET", "HEAD"].includes(req.method) || !req.permissions?.products)
    return next();
  const path = String(req.originalUrl || req.path).split("?")[0];
  const id = path.match(/^\/vendor\/products\/([^/]+)/)?.[1];
  if (!id) return next();
  let decoded: string;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    return res.status(400).json({ message: "INVALID_PRODUCT_ID" });
  }
  const allowed = await allowedNativeProducts(req);
  if (!allowed.includes(decoded))
    return res.status(404).json({ message: "NOT_FOUND", type: "not_found" });
  return next();
}
