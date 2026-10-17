import { errorHandler } from "@medusajs/framework/http";
import { db } from "./db";
const fallback = errorHandler();
/** Mercur 2.3.7 ensureSeller dereferences a deleted related Seller before
 * extension handlers run. Normalize only a verified revoked relationship;
 * preserve the framework's error handling for all other failures. */
export async function nativeErrorHandler(
  error: any,
  req: any,
  res: any,
  next: any,
) {
  const path = String(req.originalUrl || req.path).split("?")[0];
  if (
    path.startsWith("/vendor/") &&
    req.auth_context?.actor_type === "member"
  ) {
    const seller = req.get("x-seller-id") || req.session?.seller_id;
    if (seller) {
      try {
        const current = await db.query(
          "SELECT 1 FROM seller_member sm JOIN member m ON m.id=sm.member_id JOIN seller s ON s.id=sm.seller_id WHERE sm.member_id=$1 AND sm.seller_id=$2 AND sm.deleted_at IS NULL AND m.deleted_at IS NULL AND s.deleted_at IS NULL",
          [req.auth_context.actor_id, seller],
        );
        if (!current.rowCount)
          return res
            .status(403)
            .json({ message: "FORBIDDEN", type: "not_allowed" });
      } catch {
        /* Preserve the actual database/framework failure, never grant access. */
      }
    }
  }
  return fallback(error, req, res, next);
}
