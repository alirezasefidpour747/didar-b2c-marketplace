import { db } from "./db";
import { sessionUser } from "./auth";
/** A handoff hint, never an authentication token or a grant of native rights. */
export async function workspace(req: any) {
  if (req.method !== "GET") throw Error("METHOD_NOT_ALLOWED");
  const u = await sessionUser(req);
  if (!u) throw Error("UNAUTHORIZED");
  const links = (
    await db.query(
      `SELECT n.actor_type FROM didar_native_actor n
    WHERE n.user_id=$1 AND n.active AND (
    (n.actor_type='user' AND EXISTS(SELECT 1 FROM "user" a WHERE a.id=n.actor_id AND a.deleted_at IS NULL)
      AND ($2='admin' OR EXISTS(SELECT 1 FROM didar_content_operator WHERE user_id=$1 AND active)))
    OR (n.actor_type='member' AND EXISTS(SELECT 1 FROM member m JOIN seller_member sm ON sm.member_id=m.id
      JOIN didar_native_seller ns ON ns.seller_id=sm.seller_id JOIN seller se ON se.id=ns.seller_id
      WHERE m.id=n.actor_id AND m.deleted_at IS NULL AND sm.deleted_at IS NULL AND ns.active AND se.deleted_at IS NULL
      AND (($2='supplier' AND ns.supplier_id=$3) OR EXISTS(SELECT 1 FROM didar_merchant_member mm WHERE mm.user_id=$1 AND mm.supplier_id=ns.supplier_id AND mm.active)))))`,
      [u.id, u.role, u.supplier_id || null],
    )
  ).rows;
  const surfaces = links.map((n: any) =>
    n.actor_type === "user" ? "admin" : "vendor",
  );
  const surface = surfaces.includes("admin")
    ? "admin"
    : surfaces.includes("vendor")
      ? "vendor"
      : null;
  return { ready: !!surface, surface };
}
