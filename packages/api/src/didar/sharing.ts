import { randomUUID, randomBytes } from "node:crypto";
import { transaction } from "./db";
import { sessionUser, digest } from "./auth";
import { clean, merchantAccess, storeScope } from "./storefront";
import { audit } from "./permissions";
const eligibility = `p.active AND p.published AND p.approved AND didar_public_taxonomy(p.id,p.category_id) AND EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=p.id AND o.supplier_id=$1 AND o.active AND o.quantity>0)`;
export async function attribution(req: any, c: any, scope: any) {
  const token = req.headers?.["x-didar-visit"];
  if (!scope || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    return null;
  return (
    (
      await c.query(
        `SELECT v.id visit_id,p.id page_id FROM didar_share_visit v JOIN didar_share_page p ON p.id=v.page_id WHERE v.token_hash=$1 AND v.expires_at>now() AND p.supplier_id=$2 AND p.published`,
        [digest(token), scope.supplier_id],
      )
    ).rows[0] || null
  );
}
export async function sharing(req: any) {
  const b = req.body || {},
    q = req.query || {};
  if (
    (req.method === "GET" && q.slug) ||
    (req.method === "POST" && b.kind === "visit")
  ) {
    return transaction(async (c) => {
      const scope = await storeScope(req, c);
      if (!scope) throw new Error("NOT_FOUND");
      const page = (
        await c.query(
          "SELECT id,supplier_id,slug,title,intro,kind FROM didar_share_page WHERE supplier_id=$1 AND slug=$2 AND published",
          [scope.supplier_id, clean(q.slug || b.slug, 80)],
        )
      ).rows[0];
      if (!page) throw new Error("NOT_FOUND");
      if (req.method === "GET") {
        const { rows } = await c.query(
          `SELECT p.id FROM didar_share_product cp JOIN didar_product p ON p.id=cp.product_id WHERE cp.page_id=$2 AND ${eligibility} ORDER BY cp.position`,
          [scope.supplier_id, page.id],
        );
        return { page: { ...page, product_ids: rows.map((p: any) => p.id) } };
      }
      const old = await attribution(req, c, scope);
      if (old?.page_id === page.id) return { recorded: true };
      const contextHash = digest(req.headers["x-didar-context"]);
      const n = (
        await c.query(
          "SELECT count(*)::int n FROM didar_share_visit WHERE context_hash=$1 AND created_at>now()-interval '1 day'",
          [contextHash],
        )
      ).rows[0].n;
      if (n >= 100) throw new Error("RATE_LIMIT");
      const token = randomBytes(32).toString("hex");
      await c.query(
        "INSERT INTO didar_share_visit(id,token_hash,page_id,context_hash) VALUES($1,$2,$3,$4)",
        [randomUUID(), digest(token), page.id, contextHash],
      );
      return { recorded: true, visit_token: token };
    });
  }
  const u = await sessionUser(req);
  if (!u) throw new Error("UNAUTHORIZED");
  return transaction(async (c) => {
    const sid = clean(b.supplier_id || q.supplier_id || u.supplier_id, 100);
    await merchantAccess(c, u, sid, "SHARE");
    if (req.method === "GET") {
      const { rows: pages } = await c.query(
        `SELECT p.*,coalesce((SELECT json_agg(cp.product_id ORDER BY cp.position) FROM didar_share_product cp WHERE cp.page_id=p.id),'[]') product_ids,(SELECT count(*)::int FROM didar_share_visit v WHERE v.page_id=p.id) visits,(SELECT count(*)::int FROM didar_order o WHERE o.share_page_id=p.id AND o.origin_supplier_id=p.supplier_id AND o.status='paid') paid_orders,(SELECT coalesce(sum(o.total_irr),0)::text FROM didar_order o WHERE o.share_page_id=p.id AND o.origin_supplier_id=p.supplier_id AND o.status='paid') gross_paid_irr FROM didar_share_page p WHERE p.supplier_id=$1 ORDER BY p.created_at DESC LIMIT 100`,
        [sid],
      );
      const { rows: products } = await c.query(
        `SELECT p.id,p.title FROM didar_product p WHERE ${eligibility} ORDER BY p.title,p.id LIMIT 1000`,
        [sid],
      );
      const f = (
        await c.query(
          "SELECT handle FROM didar_storefront WHERE supplier_id=$1",
          [sid],
        )
      ).rows[0];
      return { pages, products, handle: f?.handle };
    }
    if (b.kind !== "save") throw new Error("INVALID_ACTION");
    const old = b.id
      ? (
          await c.query(
            "SELECT * FROM didar_share_page WHERE id=$1 AND supplier_id=$2 FOR UPDATE",
            [clean(b.id), sid],
          )
        ).rows[0]
      : null;
    if (b.id && !old) throw new Error("NOT_FOUND");
    if (old && old.version !== b.version)
      throw new Error("CONFLICT_SHARE_CHANGED");
    if (
      !Array.isArray(b.product_ids) ||
      b.product_ids.length > 20 ||
      new Set(b.product_ids).size !== b.product_ids.length ||
      b.product_ids.some((x: any) => typeof x !== "string" || x.length > 100) ||
      typeof b.published !== "boolean"
    )
      throw new Error("INVALID_SHARE_PRODUCTS");
    const kind = old?.kind || b.page_kind || "CURATED";
    if (!["CURATED", "PRODUCT"].includes(kind))
      throw new Error("INVALID_SHARE_KIND");
    if (
      b.published &&
      (kind === "PRODUCT"
        ? b.product_ids.length !== 1
        : b.product_ids.length < 10)
    )
      throw new Error("INVALID_SHARE_SIZE");
    if (
      !(
        await c.query("SELECT 1 FROM didar_storefront WHERE supplier_id=$1", [
          sid,
        ])
      ).rowCount
    )
      throw new Error("INVALID_STOREFRONT_REQUIRED");
    const valid = (
      await c.query(
        `SELECT p.id FROM didar_product p WHERE p.id=ANY($2::text[]) AND EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=p.id AND o.supplier_id=$1) ${b.published ? `AND ${eligibility}` : ""}`,
        [sid, b.product_ids],
      )
    ).rows;
    if (valid.length !== b.product_ids.length)
      throw new Error("INVALID_SHARE_OWNERSHIP");
    const id = old?.id || randomUUID(),
      slug = old?.slug || "s-" + randomBytes(12).toString("hex");
    await c.query(
      `INSERT INTO didar_share_page(id,supplier_id,slug,title,intro,published,created_by,updated_by,kind) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,intro=EXCLUDED.intro,published=EXCLUDED.published,updated_by=EXCLUDED.updated_by,version=didar_share_page.version+1,updated_at=now()`,
      [
        id,
        sid,
        slug,
        clean(b.title, 120),
        b.intro ? clean(b.intro, 2000) : "",
        b.published,
        u.id,
        kind,
      ],
    );
    await c.query("DELETE FROM didar_share_product WHERE page_id=$1", [id]);
    for (const [position, pid] of b.product_ids.entries())
      await c.query(
        "INSERT INTO didar_share_product(page_id,product_id,position) VALUES($1,$2,$3)",
        [id, pid, position],
      );
    await audit(c, u.id, "share_page_saved", {
      id,
      supplier_id: sid,
      published: b.published,
      product_ids: b.product_ids,
    });
    return { id, slug };
  });
}
