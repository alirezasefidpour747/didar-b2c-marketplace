import { transaction } from "./db";
export type Breadcrumb = { id: string; name: string; slug: string };
export async function productPath(c: any, p: any) {
  const {
    rows: [valid],
  } = await c.query("SELECT didar_taxonomy_valid($1) valid", [p.category_id]);
  if (!valid.valid)
    return { canonical_path: null, breadcrumbs: [] as Breadcrumb[] };
  const { rows: breadcrumbs } = await c.query(
    `WITH RECURSIVE ancestors AS (
    SELECT id,name,slug,parent_id,0 depth FROM didar_category WHERE id=$1
    UNION ALL SELECT c.id,c.name,c.slug,c.parent_id,a.depth+1 FROM didar_category c JOIN ancestors a ON c.id=a.parent_id
  ) SELECT id,name,slug FROM ancestors ORDER BY depth DESC`,
    [p.category_id],
  );
  return {
    canonical_path:
      "/products/" +
      [...breadcrumbs.map((b: Breadcrumb) => b.slug), p.slug, p.id]
        .map(encodeURIComponent)
        .join("/"),
    breadcrumbs,
  };
}
export async function publicProductLink(query: any) {
  const byUID = query.uid !== undefined;
  const value = byUID ? query.uid : query.id;
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !(byUID ? /^[A-Z0-9][A-Z0-9_-]{2,79}$/ : /^[-a-zA-Z0-9_]+$/).test(value)
  )
    throw new Error("NOT_FOUND");
  // Return only public master identity. No item, supplier, invoice, EPC or ownership fields.
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const {
      rows: [p],
    } = await c.query(
      `SELECT p.id,p.title,p.category_id,p.slug FROM didar_product p WHERE p.active AND p.approved AND p.published AND didar_taxonomy_valid(p.category_id) AND ${byUID ? "EXISTS(SELECT 1 FROM didar_inventory_item i WHERE i.uid=$1 AND i.product_id=p.id AND i.status IN ('available','reserved','sold','returned','withdrawn'))" : "p.id=$1"}`,
      [value],
    );
    if (!p) throw new Error("NOT_FOUND");
    return { id: p.id, title: p.title, ...(await productPath(c, p)) };
  });
}
