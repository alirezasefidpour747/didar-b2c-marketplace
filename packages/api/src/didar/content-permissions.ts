import { db } from "./db";
import { merchantAccess } from "./storefront";
export async function contentAccess(
  c: any,
  u: any,
  sid: string | null,
  publish = false,
) {
  if (!u) throw new Error("UNAUTHORIZED");
  if (sid === null) {
    if (u.role === "admin") return;
    const ok = (
      await c.query(
        "SELECT 1 FROM didar_content_operator WHERE user_id=$1 AND active FOR SHARE",
        [u.id],
      )
    ).rowCount;
    if (!ok) throw new Error("FORBIDDEN");
    return;
  }
  return merchantAccess(
    c,
    u,
    sid,
    publish ? "CONTENT_PUBLISH" : "CONTENT_EDIT",
  );
}
export async function contentScopes(u: any) {
  if (!u) throw new Error("UNAUTHORIZED");
  const global =
    u.role === "admin" ||
    !!(
      await db.query(
        "SELECT 1 FROM didar_content_operator WHERE user_id=$1 AND active",
        [u.id],
      )
    ).rowCount;
  const { rows: suppliers } = await db.query(
    `SELECT s.id,s.name,f.handle FROM didar_supplier s LEFT JOIN didar_storefront f ON f.supplier_id=s.id WHERE s.active AND s.status='approved' AND ($1='admin' OR ($1='supplier' AND s.id=$2) OR EXISTS(SELECT 1 FROM didar_merchant_member m WHERE m.supplier_id=s.id AND m.user_id=$3 AND m.permission IN ('CONTENT_EDIT','CONTENT_PUBLISH') AND m.active)) ORDER BY s.name`,
    [u.role, u.supplier_id || null, u.id],
  );
  return { global, suppliers };
}
