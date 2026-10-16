import vocabulary from "./facet-vocabulary.json";
const dimensions = new Set(vocabulary.map((f) => f.code));
const keys = new Set([
  "page",
  "payment_method",
  "limit",
  "q",
  "category",
  "category_slug",
  "collection_slug",
  "discovery_slug",
  "sort",
  "locale",
  "weight_min",
  "weight_max",
  "weight_exact",
  "price_min",
  "price_max",
  "purity",
  "in_stock",
  ...dimensions,
]);
const optionalNumber = (x: any, min: number, max: number) => {
  if (x === undefined) return undefined;
  if (!/^\d+$/.test(String(x))) throw new Error("INVALID_FILTER_NUMBER");
  const n = Number(x);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error("INVALID_FILTER_NUMBER");
  return n;
};
const string = (x: any, max = 150) => {
  if (
    typeof x !== "string" ||
    !x.trim() ||
    x.length > max ||
    /[\u0000-\u001f<>]/.test(x)
  )
    throw new Error("INVALID_FILTER");
  return x.trim();
};
export function parseDiscovery(q: any = {}, curation = false) {
  if (
    !q ||
    typeof q !== "object" ||
    Array.isArray(q) ||
    Object.keys(q).some(
      (k) =>
        !keys.has(k) ||
        (curation && ["page", "limit", "discovery_slug", "locale"].includes(k)),
    )
  )
    throw new Error("INVALID_FILTER");
  const filters: Record<string, string[]> = {};
  for (const f of dimensions)
    if (q[f] !== undefined) {
      const a = Array.isArray(q[f]) ? q[f] : string(q[f], 1500).split(",");
      if (
        !a.length ||
        a.length > 30 ||
        a.some(
          (s: any) =>
            typeof s !== "string" || !/^[_a-z][_a-z0-9]{1,79}$/.test(s),
        )
      )
        throw new Error("INVALID_FILTER_VALUE");
      filters[f] = [...new Set(a)] as string[];
    }
  if (
    q.payment_method !== undefined &&
    !["CASH", "CREDIT"].includes(q.payment_method)
  )
    throw new Error("INVALID_PAYMENT_METHOD");
  const locale = q.locale === undefined ? "fa" : string(q.locale, 2);
  if (!["fa", "en", "ar", "fr"].includes(locale))
    throw new Error("INVALID_LOCALE");
  const sort = q.sort === undefined ? "title" : string(q.sort, 20);
  if (
    !["title", "price_asc", "price_desc", "weight_asc", "weight_desc"].includes(
      sort,
    )
  )
    throw new Error("INVALID_SORT");
  const out: any = {
    filters,
    locale,
    sort,
    page: optionalNumber(q.page, 1, 10000) ?? 1,
    limit: optionalNumber(q.limit, 1, 48) ?? 12,
  };
  for (const k of [
    "q",
    "category",
    "category_slug",
    "collection_slug",
    "discovery_slug",
  ])
    if (q[k] !== undefined) out[k] = string(q[k]);
  for (const k of ["weight_min", "weight_max", "weight_exact"])
    out[k] = optionalNumber(q[k], 0, 1000000);
  for (const k of ["price_min", "price_max"])
    out[k] = optionalNumber(q[k], 0, Number.MAX_SAFE_INTEGER);
  out.purity = optionalNumber(q.purity, 1, 1000);
  if (
    q.in_stock !== undefined &&
    !["true", "false"].includes(String(q.in_stock))
  )
    throw new Error("INVALID_FILTER");
  out.in_stock = String(q.in_stock) === "true";
  if (
    (out.weight_min !== undefined &&
      out.weight_max !== undefined &&
      out.weight_min > out.weight_max) ||
    (out.price_min !== undefined &&
      out.price_max !== undefined &&
      out.price_min > out.price_max)
  )
    throw new Error("INVALID_FILTER_RANGE");
  return out;
}
export const publicCollectionCondition = `c.active AND c.published AND c.approved AND (c.owner_supplier_id IS NULL OR EXISTS(SELECT 1 FROM didar_supplier s WHERE s.id=c.owner_supplier_id AND s.active AND s.status='approved')) AND ((c.legacy_public AND c.type_id IS NULL) OR EXISTS(SELECT 1 FROM didar_facet_value cv JOIN didar_facet cf ON cf.code=cv.facet_code WHERE cv.id=c.type_id AND cv.active AND cv.visible AND cf.active AND cf.visible AND EXISTS(SELECT 1 FROM didar_catalog_translation ct WHERE ct.entity_type='value' AND ct.entity_id=cv.id AND ct.locale='fa' AND ct.status='approved')))`;
const publicProduct = `p.active AND p.published AND p.approved AND didar_public_taxonomy(p.id,p.category_id)`;
export async function discoverySelection(c: any, q: any) {
  const parsed = parseDiscovery(q),
    constraints = [parsed];
  let landing: any = null;
  if (parsed.discovery_slug) {
    const {
      rows: [page],
    } = await c.query(
      `SELECT p.*,t.label FROM didar_discovery_page p JOIN didar_catalog_translation t ON t.entity_type='page' AND t.entity_id=p.id AND t.locale=$2 AND t.status='approved' WHERE p.slug=$1 AND p.active AND (p.starts_at IS NULL OR p.starts_at<=now()) AND (p.ends_at IS NULL OR p.ends_at>now())`,
      [parsed.discovery_slug, parsed.locale],
    );
    if (!page) throw new Error("NOT_FOUND");
    constraints.push(parseDiscovery(page.query, true));
    landing = { slug: page.slug, name: page.label, kind: page.kind };
  }
  const values: any[] = [];
  const bind = (v: any) => {
    values.push(v);
    return "$" + values.length;
  };
  const clauses = [publicProduct];
  for (const f of constraints) {
    for (const [facet, codes] of Object.entries(f.filters)) {
      const { rowCount } = await c.query(
        "SELECT 1 FROM didar_facet_value WHERE facet_code=$1 AND code=ANY($2::text[])",
        [facet, codes],
      );
      if (rowCount !== (codes as string[]).length)
        throw new Error("INVALID_FILTER_VALUE");
      const k = bind(facet),
        v = bind(codes);
      if (facet === "collection_type")
        clauses.push(
          `EXISTS(SELECT 1 FROM didar_collection_product cp JOIN didar_collection c ON c.id=cp.collection_id JOIN didar_facet_value cv ON cv.id=c.type_id WHERE cp.product_id=p.id AND ${publicCollectionCondition} AND cv.facet_code=${k} AND cv.code=ANY(${v}::text[]))`,
        );
      else
        clauses.push(
          `EXISTS(SELECT 1 FROM didar_effective_classification a WHERE a.product_id=p.id AND a.facet_code=${k} AND a.code=ANY(${v}::text[]))`,
        );
    }
    if (f.q) {
      const q = bind(
        "%" +
          f.q
            .replace(/ي/g, "ی")
            .replace(/ك/g, "ک")
            .toLocaleLowerCase("fa-IR")
            .replace(/[\\%_]/g, "\\$&") +
          "%",
      );
      clauses.push(
        `lower(translate(concat_ws(' ',p.title,p.reference,p.description,p.jewelry_type,p.category),'يك','یک')) LIKE ${q} ESCAPE '\\'`,
      );
    }
    if (f.purity) clauses.push(`p.purity=${bind(f.purity)}`);
    for (const field of ["category", "category_slug"])
      if (f[field]) {
        const id =
          field === "category"
            ? `id=${bind(f[field])}`
            : `slug=${bind(f[field])}`;
        clauses.push(
          `p.category_id IN (WITH RECURSIVE tree AS (SELECT id FROM didar_category WHERE ${id} AND active UNION SELECT d.id FROM didar_category d JOIN tree t ON d.parent_id=t.id WHERE d.active) SELECT id FROM tree)`,
        );
      }
    if (f.collection_slug)
      clauses.push(
        `EXISTS(SELECT 1 FROM didar_collection_product cp JOIN didar_collection c ON c.id=cp.collection_id WHERE cp.product_id=p.id AND c.slug=${bind(f.collection_slug)} AND ${publicCollectionCondition})`,
      );
  }
  // All predicates are parameterized; EXISTS preserves one master product with any number of offers/tags.
  const { rows } = await c.query(
    `SELECT p.id FROM didar_product p WHERE ${clauses.join(" AND ")} ORDER BY p.id`,
    values,
  );
  return { parsed, constraints, landing, ids: rows.map((r: any) => r.id) };
}
function offerMatches(o: any, filters: any[]) {
  return filters.every(
    (f) =>
      (f.weight_min === undefined || o.weight_mg >= f.weight_min) &&
      (f.weight_max === undefined || o.weight_mg <= f.weight_max) &&
      (f.weight_exact === undefined || o.weight_mg === f.weight_exact) &&
      (f.price_min === undefined ||
        (o.price && o.price.total_irr >= f.price_min)) &&
      (f.price_max === undefined ||
        (o.price && o.price.total_irr <= f.price_max)) &&
      (!f.in_stock || o.quantity > 0),
  );
}
export async function classificationProjection(
  c: any,
  products: any[],
  locale = "fa",
) {
  const { rows } = await c.query(
    `SELECT a.product_id,a.facet_code,a.code,t.label FROM didar_effective_classification a JOIN didar_catalog_translation t ON t.entity_type='value' AND t.entity_id=a.value_id AND t.locale=$2 AND t.status='approved' WHERE a.product_id=ANY($1::text[]) ORDER BY a.sort_order,a.code`,
    [products.map((p) => p.id), locale],
  );
  for (const p of products) {
    p.classification = {};
    for (const v of rows.filter((r: any) => r.product_id === p.id))
      (p.classification[v.facet_code] ??= []).push({
        code: v.code,
        label: v.label,
      });
  }
}
export async function publicDiscoveryMetadata(
  c: any,
  locale = "fa",
  productIds?: string[],
) {
  const { rows: facets } = await c.query(
    `SELECT f.code,f.number,f.mode,f.target,t.label FROM didar_facet f JOIN didar_catalog_translation t ON t.entity_type='facet' AND t.entity_id=f.code AND t.locale=$1 AND t.status='approved' WHERE f.active AND f.visible ORDER BY f.sort_order,f.number`,
    [locale],
  );
  const { rows: values } = await c.query(
    `SELECT v.facet_code,v.code,t.label FROM didar_facet_value v JOIN didar_catalog_translation t ON t.entity_type='value' AND t.entity_id=v.id AND t.locale=$1 AND t.status='approved' WHERE v.active AND v.visible ORDER BY v.sort_order,v.code`,
    [locale],
  );
  let counts: any[] = [];
  if (productIds)
    counts = (
      await c.query(
        `SELECT facet_code,code,count(DISTINCT product_id)::int count FROM (SELECT a.product_id,a.facet_code,a.code FROM didar_effective_classification a WHERE a.product_id=ANY($1::text[]) UNION SELECT cp.product_id,'collection_type',v.code FROM didar_collection_product cp JOIN didar_collection c ON c.id=cp.collection_id JOIN didar_facet_value v ON v.id=c.type_id WHERE cp.product_id=ANY($1::text[]) AND ${publicCollectionCondition}) x GROUP BY facet_code,code`,
        [productIds],
      )
    ).rows;
  for (const f of facets)
    f.values = values
      .filter((v: any) => v.facet_code === f.code)
      .map((v: any) => ({
        code: v.code,
        label: v.label,
        ...(productIds
          ? {
              count:
                counts.find((r) => r.facet_code === f.code && r.code === v.code)
                  ?.count || 0,
            }
          : {}),
      }));
  const { rows: pages } = await c.query(
    `SELECT p.slug,t.label name,p.kind FROM didar_discovery_page p JOIN didar_catalog_translation t ON t.entity_type='page' AND t.entity_id=p.id AND t.locale=$1 AND t.status='approved' WHERE p.active AND (p.starts_at IS NULL OR p.starts_at<=now()) AND (p.ends_at IS NULL OR p.ends_at>now()) ORDER BY p.sort_order,p.slug`,
    [locale],
  );
  return {
    facets,
    pages,
    storefront_locales: ["fa"],
    vocabulary_locale: locale,
  };
}
export async function finishDiscovery(c: any, data: any, selection: any) {
  const { parsed: f, constraints, landing } = selection;
  const offerFiltered = constraints.some(
    (v: any) =>
      v.in_stock ||
      [
        "weight_min",
        "weight_max",
        "weight_exact",
        "price_min",
        "price_max",
      ].some((k) => v[k] !== undefined),
  );
  let products = data.products
    .map((p: any) => ({
      ...p,
      offers: offerFiltered
        ? p.offers.filter((o: any) => offerMatches(o, constraints))
        : p.offers,
    }))
    .filter((p: any) => !offerFiltered || p.offers.length);
  const score = (p: any, key: string, desc = false) => {
    const xs = p.offers
      .filter((o: any) => o.quantity > 0)
      .map((o: any) => (key === "price" ? o.price?.total_irr : o.weight_mg))
      .filter((n: any) => Number.isFinite(n));
    return xs.length ? Math.min(...xs) : desc ? -Infinity : Infinity;
  };
  products.sort((a: any, b: any) => {
    let d = 0;
    if (f.sort.startsWith("price"))
      d =
        score(a, "price", f.sort.endsWith("desc")) -
        score(b, "price", f.sort.endsWith("desc"));
    else if (f.sort.startsWith("weight"))
      d =
        score(a, "weight", f.sort.endsWith("desc")) -
        score(b, "weight", f.sort.endsWith("desc"));
    else d = a.title.localeCompare(b.title, "fa");
    if (f.sort.endsWith("desc")) d = -d;
    return (Number.isNaN(d) ? 0 : d) || a.id.localeCompare(b.id);
  });
  const total = products.length,
    ids = products.map((p: any) => p.id);
  const metadata = await publicDiscoveryMetadata(c, f.locale, ids);
  return {
    ...data,
    ...metadata,
    products: products.slice((f.page - 1) * f.limit, f.page * f.limit),
    total,
    page: f.page,
    limit: f.limit,
    total_pages: Math.ceil(total / f.limit),
    landing,
    count_semantics: "distinct_matching_products",
  };
}
