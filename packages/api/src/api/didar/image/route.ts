import { storeScope } from "../../../didar/storefront";
import { db } from "../../../didar/db";
import { sessionUser } from "../../../didar/auth";
export async function GET(req: any, res: any) {
  const id = req.query.id;
  if (typeof id !== "string" || id.length > 100)
    return res.status(400).json({ message: "INVALID_IMAGE" });
  const {
    rows: [image],
  } = await db.query(
    "SELECT i.data,i.mime_type,p.id product_id,p.active,p.published,p.approved FROM didar_product_image i JOIN didar_product p ON p.id=i.product_id WHERE i.id=$1",
    [id],
  );
  if (!image) return res.status(404).json({ message: "NOT_FOUND" });
  let scope;
  try {
    scope = await storeScope(req);
  } catch {
    return res.status(404).json({ message: "NOT_FOUND" });
  }
  const visible = (
    await db.query("SELECT didar_visible_product($1,$2) ok", [
      image.product_id,
      scope?.supplier_id || null,
    ])
  ).rows[0].ok;
  if (!visible || !image.active || !image.published || !image.approved) {
    const u = await sessionUser(req);
    let own = false;
    if (
      u?.role === "supplier" &&
      u.supplier_active &&
      u.supplier_status === "approved"
    ) {
      const { rowCount } = await db.query(
        "SELECT id FROM didar_offer WHERE product_id=$1 AND supplier_id=$2 UNION SELECT l.id FROM didar_intake_line l JOIN didar_intake_batch b ON b.id=l.batch_id WHERE l.product_id=$1 AND b.supplier_id=$2",
        [image.product_id, u.supplier_id],
      );
      own = !!rowCount;
    }
    if (u?.role !== "admin" && !own)
      return res.status(404).json({ message: "NOT_FOUND" });
  }
  res.setHeader("Content-Type", image.mime_type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Cache-Control", "no-store");
  return res.send(image.data);
}
