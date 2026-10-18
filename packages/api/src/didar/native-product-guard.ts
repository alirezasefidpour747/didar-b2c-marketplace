import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { db } from "./db";
import { nativeProductTargets } from "./native-product-targets";

/** A linked Medusa product is a projection of the Didar master. Its authoritative
 * update workflow writes both records; generic HTTP editors must not diverge it.
 * Resolve actual native child ownership, not the caller's claimed URL parent.
 * Internal native projection workflows do not pass through this HTTP guard.
 */
export async function nativeProductGuard(req: any, res: any, next: any) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const path = String(req.originalUrl || req.path).split("?")[0];
  const conflict = () =>
    res.status(409).json({
      message: "CONFLICT_USE_DIDAR_PRODUCT_EDITOR",
      type: "not_allowed",
    });
  // Seller gold requests always use the governed Didar workflow. A uniform
  // response also prevents probing another merchant's private native product ID.
  if (/^\/vendor\/products(?:\/|$)/.test(path)) return conflict();
  let targets: ReturnType<typeof nativeProductTargets>;
  try {
    targets = nativeProductTargets(path, req.body);
  } catch {
    return res.status(400).json({ message: "INVALID_PRODUCT_ID" });
  }
  const linked = async () =>
    targets.products.size &&
    (
      await db.query(
        "SELECT id FROM didar_product WHERE native_id=ANY($1::text[]) LIMIT 1",
        [[...targets.products]],
      )
    ).rowCount;
  if (await linked()) return conflict();
  // Native Query is read-only here. Resolve each installed module relationship;
  // options may belong to MANY products and images can affect linked variants.
  // Explicit bounded pages prevent the default list limit hiding a late target.
  const owners = [
    [
      targets.variants,
      "variant",
      ["id", "product_id"],
      (row: any) => [row.product_id],
    ],
    [
      targets.images,
      "product_image",
      ["id", "product_id", "variants.product_id"],
      (row: any) => [
        row.product_id,
        ...(row.variants || []).map((v: any) => v.product_id),
      ],
    ],
    [
      targets.options,
      "product_option",
      ["id", "products.id"],
      (row: any) => (row.products || []).map((p: any) => p.id),
    ],
    [
      targets.values,
      "product_option_value",
      ["id", "option.products.id"],
      (row: any) => (row.option?.products || []).map((p: any) => p.id),
    ],
  ] as const;
  for (const [ids, entity, fields, parentIds] of owners) {
    const all = [...ids];
    for (let offset = 0; offset < all.length; offset += 100) {
      const page = all.slice(offset, offset + 100);
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data } = await query.graph({
        entity,
        fields: [...fields],
        filters: { id: page },
        pagination: { skip: 0, take: page.length },
      });
      for (const row of data)
        for (const id of parentIds(row))
          if (typeof id === "string") targets.products.add(id);
      // Failures propagate to the native error handler; never fall through on
      // an unverified relationship. No workflow has run, so mixed batches reject
      // atomically rather than mutating the unlinked portion first.
      if (await linked()) return conflict();
    }
  }
  return next();
}
