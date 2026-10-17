import { db } from "./db";
/** A linked Medusa product is a projection of the Didar master. Its authoritative
 * update workflow writes both records; generic HTTP editors must not diverge it. */
export async function nativeProductGuard(req: any, res: any, next: any) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const path = String(req.originalUrl || req.path).split("?")[0];
  // Seller gold requests always use the governed Didar workflow. A uniform
  // response also prevents probing another merchant's private native product ID.
  if (/^\/vendor\/products(?:\/|$)/.test(path))
    return res
      .status(409)
      .json({
        message: "CONFLICT_USE_DIDAR_PRODUCT_EDITOR",
        type: "not_allowed",
      });
  let id = path.match(/^\/(admin|vendor)\/products\/([^/]+)/)?.[2];
  if (!id) return next();
  try {
    id = decodeURIComponent(id);
  } catch {
    return res.status(400).json({ message: "INVALID_PRODUCT_ID" });
  }
  const ids =
    id === "batch"
      ? [
          ...(Array.isArray(req.body?.delete) ? req.body.delete : []),
          ...(Array.isArray(req.body?.update)
            ? req.body.update.map((p: any) => p?.id)
            : []),
        ].filter((id: any) => typeof id === "string")
      : [id];
  if (!ids.length) return next();
  const linked = await db.query(
    "SELECT id FROM didar_product WHERE native_id=ANY($1::text[]) LIMIT 1",
    [ids],
  );
  if (linked.rowCount)
    return res.status(409).json({
      message: "CONFLICT_USE_DIDAR_PRODUCT_EDITOR",
      type: "not_allowed",
    });
  return next();
}
