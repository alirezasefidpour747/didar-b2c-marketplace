import { storeScope } from "./storefront";
import { transaction } from "./db";
export type Breadcrumb = { id: string; name: string; slug: string };
export async function productPath(c: any, p: any) {
  const {
    rows: [valid],
  } = await c.query("SELECT didar_taxonomy_valid($1) valid", [p.category_id]);
  if (!valid.valid)
    return {
      canonical_path: "/products/" + encodeURIComponent(p.id),
      breadcrumbs: [] as Breadcrumb[],
      taxonomy_ready: false,
    };
  const { rows: breadcrumbs } = await c.query(
    `WITH RECURSIVE ancestors AS (
    SELECT id,name,slug,parent_id,0 depth FROM didar_category WHERE id=$1
    UNION ALL SELECT c.id,c.name,c.slug,c.parent_id,a.depth+1 FROM didar_category c JOIN ancestors a ON c.id=a.parent_id
  ) SELECT id,name,slug FROM ancestors ORDER BY depth DESC`,
    [p.category_id],
  );
  return {
    canonical_path:
      "/fa/products/" +
      [
        ...breadcrumbs.map((b: Breadcrumb) => b.slug),
        p.slug + "-" + p.public_key,
      ]
        .map(encodeURIComponent)
        .join("/"),
    breadcrumbs,
    taxonomy_ready: true,
  };
}
export async function publicProductLink(
  query: any,
  req: any = { headers: {} },
) {
  const byUID = query.uid !== undefined;
  const byKey = query.key !== undefined;
  const value = byUID ? query.uid : byKey ? query.key : query.id;
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !(byUID ? /^[A-Z0-9][A-Z0-9_-]{2,79}$/ : /^[-a-zA-Z0-9_]+$/).test(value)
  )
    throw new Error("NOT_FOUND");
  // Return only public master identity. No item, supplier, invoice, EPC or ownership fields.
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const scope = byUID ? null : await storeScope(req, c);
    const {
      rows: [p],
    } = await c.query(
      `SELECT p.id,p.title,p.category_id,p.slug,p.public_key,(SELECT i.id FROM didar_product_image i WHERE i.product_id=p.id AND (i.media_asset_id IS NULL OR didar_media_visible(i.media_asset_id,$2)) ORDER BY i.position,i.id LIMIT 1) image_id FROM didar_product p WHERE p.active AND p.approved AND p.published AND didar_visible_product(p.id,$2) AND ${byUID ? "didar_taxonomy_valid(p.category_id)" : "didar_public_taxonomy(p.id,p.category_id)"} AND ${byUID ? "EXISTS(SELECT 1 FROM didar_inventory_item i WHERE i.uid=$1 AND i.product_id=p.id AND didar_global_supplier(i.supplier_id) AND i.status IN ('available','reserved','sold','returned','withdrawn'))" : byKey ? "p.public_key=$1" : "p.id=$1"}`,
      [value, scope?.supplier_id || null],
    );
    if (!p) throw new Error("NOT_FOUND");
    return {
      id: p.id,
      title: p.title,
      ...(byUID
        ? {}
        : {
            image_url: p.image_id
              ? `/api/didar/image?id=${encodeURIComponent(p.image_id)}`
              : null,
          }),
      ...(await productPath(c, p)),
      ...(scope
        ? { canonical_path: `/m/${scope.handle}/products/${p.public_key}` }
        : {}),
    };
  });
}
