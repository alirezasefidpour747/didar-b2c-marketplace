import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { sessionUser } from "./auth";
import {
  clean,
  storeScope,
  publicPreviewStore,
  storeProjection,
} from "./storefront";
import { contentAccess, contentScopes } from "./content-permissions";
import {
  validateBlocks,
  blockReferences,
  PAGE_KINDS,
  starterPreset,
} from "./content-blocks";
import { publicCollectionCondition } from "./discovery";
import { catalog } from "./catalog";
const log = (
  c: any,
  u: any,
  page: string | null,
  action: string,
  details: any,
) =>
  c.query(
    "INSERT INTO didar_content_event(actor_id,page_id,action,details) VALUES($1,$2,$3,$4)",
    [u.id, page, action, JSON.stringify(details)],
  );
const privateOwner = (b: any, u: any) =>
  b.supplier_id === "DIDAR" ? null : clean(b.supplier_id || u.supplier_id, 100);
async function pageFor(c: any, u: any, id: any, publish = false, lock = false) {
  const page = (
    await c.query("SELECT * FROM didar_content_page WHERE id=$1", [clean(id)])
  ).rows[0];
  if (!page) throw new Error("NOT_FOUND");
  await contentAccess(c, u, page.supplier_id, publish);
  return lock
    ? (
        await c.query(
          "SELECT * FROM didar_content_page WHERE id=$1 FOR UPDATE",
          [page.id],
        )
      ).rows[0]
    : page;
}
async function target(c: any, page: any, publishing = false) {
  if (["DIDAR_CAMPAIGN", "MERCHANT_CAMPAIGN"].includes(page.kind) && publishing)
    throw new Error("INVALID_CONTENT_FUTURE_KIND");
  if (page.supplier_id) {
    const f = (
      await c.query(
        "SELECT f.* FROM didar_storefront f JOIN didar_supplier s ON s.id=f.supplier_id WHERE f.supplier_id=$1 AND s.active AND s.status='approved'",
        [page.supplier_id],
      )
    ).rows[0];
    if (!f || (publishing && (!f.approved || !f.published)))
      throw new Error("CONFLICT_CONTENT_STOREFRONT");
  }
  if (
    page.kind === "MERCHANT_CURATED" &&
    !(
      await c.query(
        "SELECT 1 FROM didar_share_page WHERE supplier_id=$1 AND slug=$2 AND ($3::boolean=false OR published)",
        [page.supplier_id, page.route_key, publishing],
      )
    ).rowCount
  )
    throw new Error("INVALID_CONTENT_SHARE");
  if (
    page.kind === "CATEGORY_LANDING" &&
    !(
      await c.query("SELECT 1 FROM didar_category WHERE slug=$1 AND active", [
        page.route_key,
      ])
    ).rowCount
  )
    throw new Error("INVALID_CONTENT_CATEGORY");
  if (
    page.kind === "COLLECTION_LANDING" &&
    !(
      await c.query(
        `SELECT 1 FROM didar_collection c WHERE c.slug=$1 AND ${publicCollectionCondition} AND (c.owner_supplier_id IS NULL OR c.owner_supplier_id=$2 OR ($2::text IS NULL AND didar_global_supplier(c.owner_supplier_id)))`,
        [page.route_key, page.supplier_id],
      )
    ).rowCount
  )
    throw new Error("INVALID_CONTENT_COLLECTION");
}
async function resources(c: any, page: any, blocks: any[], publishing = false) {
  const refs = blockReferences(blocks),
    sid = page.supplier_id;
  const assets = (
    await c.query(
      `SELECT a.id,a.supplier_id,a.status,a.purpose,a.visibility,a.allow_shared,a.source_mime FROM didar_media_asset a WHERE a.id=ANY($1::text[])`,
      [refs.assets],
    )
  ).rows;
  for (const id of refs.assets) {
    const a = assets.find((a: any) => a.id === id);
    if (
      !a ||
      (publishing && a.status !== "approved") ||
      !(
        a.supplier_id === sid ||
        (a.visibility === "SHARED_MASTER" && a.allow_shared)
      )
    )
      throw new Error("INVALID_CONTENT_MEDIA");
  }
  const products = (
    await c.query(
      `SELECT p.id,p.active,p.approved,p.published,didar_public_taxonomy(p.id,p.category_id) classified,didar_visible_product(p.id,$2) visible FROM didar_product p WHERE p.id=ANY($1::text[])`,
      [refs.products, sid],
    )
  ).rows;
  for (const id of refs.products) {
    const p = products.find((p: any) => p.id === id);
    const own = sid
      ? (
          await c.query(
            `SELECT 1 FROM didar_offer WHERE product_id=$1 AND supplier_id=$2 UNION SELECT 1 FROM didar_product_request WHERE product_id=$1 AND supplier_id=$2 AND status='approved'`,
            [id, sid],
          )
        ).rowCount
      : false;
    if (
      !p ||
      (!p.visible && !own) ||
      (publishing &&
        (!p.visible ||
          !p.active ||
          !p.approved ||
          !p.published ||
          !p.classified ||
          !(
            await c.query(
              `SELECT 1 FROM didar_offer o JOIN didar_supplier s ON s.id=o.supplier_id WHERE o.product_id=$1 AND o.active AND s.active AND s.status='approved' AND (($2::text IS NULL AND didar_global_supplier(o.supplier_id)) OR o.supplier_id=$2)`,
              [id, sid],
            )
          ).rowCount))
    )
      throw new Error("INVALID_CONTENT_PRODUCT");
  }
  if (page.kind === "MERCHANT_CURATED" && refs.products.length) {
    const allowed = (
      await c.query(
        "SELECT cp.product_id FROM didar_share_product cp JOIN didar_share_page s ON s.id=cp.page_id WHERE s.slug=$1 AND s.supplier_id=$2",
        [page.route_key, sid],
      )
    ).rows.map((r: any) => r.product_id);
    if (refs.products.some((id) => !allowed.includes(id)))
      throw new Error("INVALID_CONTENT_CURATED_PRODUCT");
  }
  for (const b of blocks) {
    if (publishing) {
      if (
        ["HERO_VIDEO", "SPLIT_STORY", "FULL_BLEED_MEDIA"].includes(b.type) &&
        !b.media.asset_id
      )
        throw new Error("INVALID_CONTENT_MEDIA_REQUIRED");
      for (const m of [...(b.slides || []), ...(b.tiles || [])])
        if (!m.asset_id || !m.alt)
          throw new Error("INVALID_CONTENT_MEDIA_REQUIRED");
      if (
        ["HERO_VIDEO", "SPLIT_STORY", "FULL_BLEED_MEDIA"].includes(b.type) &&
        !b.media.alt
      )
        throw new Error("INVALID_CONTENT_ALT");
      if (
        ["FEATURED_PRODUCT_GRID", "PRODUCT_CAROUSEL"].includes(b.type) &&
        !b.product_ids.length
      )
        throw new Error("INVALID_CONTENT_PRODUCT");
      if (b.type === "COLLECTION_SPOTLIGHT" && !b.collection_id)
        throw new Error("INVALID_CONTENT_COLLECTION");
    }
    if (
      b.type === "HERO_VIDEO" &&
      b.media.asset_id &&
      !assets
        .find((a: any) => a.id === b.media.asset_id)
        ?.source_mime.startsWith("video/")
    )
      throw new Error("INVALID_CONTENT_VIDEO");
    if (
      b.type === "EDITORIAL_MOSAIC" &&
      b.tiles.some((m: any) =>
        [m.asset_id, m.mobile_asset_id]
          .filter(Boolean)
          .some((id) =>
            assets
              .find((a: any) => a.id === id)
              ?.source_mime.startsWith("video/"),
          ),
      )
    )
      throw new Error("INVALID_CONTENT_MOSAIC");
    if (
      b.collection_id &&
      !(
        await c.query(
          `SELECT 1 FROM didar_collection c WHERE c.id=$1 AND ${publicCollectionCondition} AND (c.owner_supplier_id IS NULL OR c.owner_supplier_id=$2 OR ($2::text IS NULL AND didar_global_supplier(c.owner_supplier_id)))`,
          [b.collection_id, sid],
        )
      ).rowCount
    )
      throw new Error("INVALID_CONTENT_COLLECTION");
    if (
      b.category_id &&
      !(
        await c.query("SELECT 1 FROM didar_category WHERE id=$1 AND active", [
          b.category_id,
        ])
      ).rowCount
    )
      throw new Error("INVALID_CONTENT_CATEGORY");
    if (
      b.facet &&
      !(
        await c.query(
          `SELECT 1 FROM didar_facet f JOIN didar_facet_value v ON v.facet_code=f.code WHERE f.code=$1 AND v.code=$2 AND f.active AND f.visible AND v.active AND v.visible`,
          [b.facet, b.value],
        )
      ).rowCount
    )
      throw new Error("INVALID_CONTENT_FACET");
  }
  for (const cta of refs.ctas) {
    if (sid) {
      const handle = (
        await c.query(
          "SELECT handle FROM didar_storefront WHERE supplier_id=$1",
          [sid],
        )
      ).rows[0]?.handle;
      const base = "/m/" + handle;
      if (cta.path !== base && !cta.path.startsWith(base + "/"))
        throw new Error("INVALID_CONTENT_CTA_SCOPE");
    } else if (
      !/^\/(?:$|products(?:\/|\?|$)|fa\/products\/|categories\/|collections\/|discover\/|cart$|login$)/.test(
        cta.path,
      )
    )
      throw new Error("INVALID_CONTENT_CTA_SCOPE");
  }
  return refs;
}
async function payload(page: any, version: any, _req: any, preview = false) {
  const refs = blockReferences(version.blocks);
  const { rows: rows } = await db.query(
    `SELECT a.id,a.alt,a.status,a.purpose,a.supplier_id,a.visibility,a.allow_shared,a.source_mime,v.width,v.height,v.duration_ms,coalesce((SELECT json_agg(json_build_object('kind',iv.kind,'width',iv.width,'height',iv.height)) FROM didar_media_variant iv WHERE iv.asset_id=a.id),'[]') variants FROM didar_media_asset a LEFT JOIN didar_media_video v ON v.asset_id=a.id WHERE a.id=ANY($1::text[])`,
    [refs.assets],
  );
  const assets: any = {};
  for (const a of rows) {
    if (!preview) {
      if (a.status !== "approved") continue;
      const ok =
        a.purpose === "EDITORIAL"
          ? (
              await db.query("SELECT didar_editorial_visible($1,$2) ok", [
                a.id,
                page.supplier_id,
              ])
            ).rows[0].ok
          : (
              await db.query(
                "SELECT didar_media_visible($1,$2) AND EXISTS(SELECT 1 FROM didar_media_asset a JOIN didar_product p ON p.id=a.product_id WHERE a.id=$1 AND p.active AND p.published AND p.approved AND didar_public_taxonomy(p.id,p.category_id) AND didar_visible_product(p.id,$2)) ok",
                [a.id, page.supplier_id],
              )
            ).rows[0].ok;
      if (!ok) continue;
    }
    assets[a.id] = {
      id: a.id,
      alt: a.alt,
      type: a.source_mime.startsWith("video/") ? "VIDEO" : "IMAGE",
      width: a.width || a.variants.at(-1)?.width,
      height: a.height || a.variants.at(-1)?.height,
      duration_ms: a.duration_ms,
      private: preview || !!page.supplier_id,
      url: "/api/didar/image?id=" + a.id,
      video_url: a.source_mime.startsWith("video/")
        ? "/api/didar/media-file?id=" + a.id
        : null,
      variants: a.variants,
    };
  }
  let blocks = version.blocks;
  if (page.kind === "MERCHANT_CURATED") {
    const allowed = (
      await db.query(
        "SELECT cp.product_id FROM didar_share_product cp JOIN didar_share_page s ON s.id=cp.page_id WHERE s.slug=$1 AND s.supplier_id=$2",
        [page.route_key, page.supplier_id],
      )
    ).rows.map((p: any) => p.product_id);
    blocks = blocks.map((b: any) => ({
      ...b,
      ...(b.product_ids
        ? {
            product_ids: b.product_ids.filter((id: string) =>
              allowed.includes(id),
            ),
          }
        : {}),
    }));
  }
  return {
    page: {
      id: page.id,
      title: version.title,
      kind: page.kind,
      route_key: page.route_key,
      supplier_id: page.supplier_id,
    },
    version: { id: version.id, number: version.number },
    blocks,
    assets,
    preview,
  };
}
async function publicRead(req: any, q: any) {
  if (
    !PAGE_KINDS.includes(q.kind) ||
    ["DIDAR_CAMPAIGN", "MERCHANT_CAMPAIGN"].includes(q.kind)
  )
    throw new Error("NOT_FOUND");
  const scope = q.handle
      ? await publicPreviewStore(q.handle)
      : await storeScope(req),
    sid = scope?.supplier_id || null;
  if (
    (q.kind === "DIDAR_HOME" && sid) ||
    (q.kind.startsWith("MERCHANT") && !sid)
  )
    throw new Error("NOT_FOUND");
  const row = (
    await db.query(
      `SELECT p.*,v.id version_id,v.number,v.title version_title,v.blocks FROM didar_content_page p JOIN didar_content_publication pub ON pub.page_id=p.id JOIN didar_content_version v ON v.id=pub.version_id AND v.status='approved' WHERE p.kind=$1 AND p.supplier_id IS NOT DISTINCT FROM $2 AND p.route_key=$3 AND NOT pub.cancelled AND pub.effective_from<=now() AND (pub.effective_to IS NULL OR pub.effective_to>now()) ORDER BY pub.effective_from DESC LIMIT 1`,
      [q.kind, sid, q.route_key || ""],
    )
  ).rows[0];
  if (!row) throw new Error("NOT_FOUND");
  await target(db, row, true);
  return payload(
    row,
    {
      id: row.version_id,
      number: row.number,
      title: row.version_title,
      blocks: row.blocks,
    },
    req,
  );
}
export async function content(req: any) {
  const b = req.body || {},
    q = req.query || {};
  if (req.method === "GET" && q.kind) return publicRead(req, q);
  const u = await sessionUser(req);
  if (!u) throw new Error("UNAUTHORIZED");
  if (req.method === "GET" && q.options) {
    const sid = privateOwner(q, u);
    await transaction((c) => contentAccess(c, u, sid));
    const scope = sid
      ? (
          await db.query(
            "SELECT * FROM didar_storefront WHERE supplier_id=$1",
            [sid],
          )
        ).rows[0]
      : null;
    if (sid && !scope) throw new Error("NOT_FOUND");
    const result = await catalog(
      undefined,
      undefined,
      undefined,
      scope ? storeProjection(scope) : undefined,
    );
    await transaction((c) => contentAccess(c, u, sid));
    return {
      products: result.products,
      collections: result.collections,
      categories: result.categories,
      facets: result.facets,
    };
  }
  if (req.method === "GET") {
    if (q.page_id)
      return transaction(async (c) => {
        const page = await pageFor(c, u, q.page_id);
        return {
          page,
          versions: (
            await c.query(
              "SELECT * FROM didar_content_version WHERE page_id=$1 ORDER BY number DESC LIMIT 30",
              [page.id],
            )
          ).rows,
          publications: (
            await c.query(
              "SELECT * FROM didar_content_publication WHERE page_id=$1 ORDER BY effective_from DESC LIMIT 50",
              [page.id],
            )
          ).rows,
          events: (
            await c.query(
              "SELECT * FROM didar_content_event WHERE page_id=$1 ORDER BY id DESC LIMIT 100",
              [page.id],
            )
          ).rows,
        };
      });
    const scopes = await contentScopes(u),
      ids = scopes.suppliers.map((s: any) => s.id);
    const { rows: pages } = await db.query(
      "SELECT * FROM didar_content_page WHERE (supplier_id IS NULL AND $1::boolean) OR supplier_id=ANY($2::text[]) ORDER BY updated_at DESC LIMIT 100",
      [scopes.global, ids],
    );
    const presets = (
      await db.query(
        "SELECT code,name,blocks,status,active FROM didar_content_preset WHERE status='approved' AND active ORDER BY name",
      )
    ).rows;
    return { scopes, pages, presets, preset: starterPreset() };
  }
  if (b.operation === "preview") {
    const prepared = await transaction(async (c) => {
      const v = (
        await c.query("SELECT * FROM didar_content_version WHERE id=$1", [
          clean(b.version_id),
        ])
      ).rows[0];
      if (!v) throw new Error("NOT_FOUND");
      const p = await pageFor(c, u, v.page_id);
      return { p, v };
    });
    const scope = prepared.p.supplier_id
      ? (
          await db.query(
            "SELECT * FROM didar_storefront WHERE supplier_id=$1",
            [prepared.p.supplier_id],
          )
        ).rows[0]
      : null;
    const data = await payload(prepared.p, prepared.v, req, true);
    const cat = await catalog(
      undefined,
      undefined,
      undefined,
      scope ? storeProjection(scope) : undefined,
    );
    await transaction((c) => contentAccess(c, u, prepared.p.supplier_id));
    return { ...data, catalog: cat };
  }
  return transaction(async (c) => {
    if (b.operation === "operator") {
      if (u.role !== "admin") throw new Error("FORBIDDEN");
      const who = (
        await c.query("SELECT id FROM didar_user WHERE email=$1", [
          clean(b.email, 150).toLowerCase(),
        ])
      ).rows[0];
      if (!who) throw new Error("NOT_FOUND");
      if (typeof b.active !== "boolean") throw new Error("INVALID_PERMISSION");
      await c.query(
        "INSERT INTO didar_content_operator(user_id,active,granted_by) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET active=EXCLUDED.active,granted_by=EXCLUDED.granted_by",
        [who.id, b.active, u.id],
      );
      await log(c, u, null, "CONTENT_OPERATOR_CHANGED", {
        user_id: who.id,
        active: b.active,
      });
      return { ok: true };
    }
    if (b.operation === "preset") {
      await contentAccess(c, u, null, true);
      const code = clean(b.code, 80);
      if (!/^[a-z][a-z0-9_]{1,79}$/.test(code))
        throw new Error("INVALID_CONTENT_PRESET");
      const blocks = validateBlocks(b.blocks);
      for (const block of blocks) {
        if (block.media) {
          block.media.asset_id = "";
          block.media.mobile_asset_id = "";
          delete block.media.cta;
        }
        for (const m of [...(block.slides || []), ...(block.tiles || [])]) {
          m.asset_id = "";
          m.mobile_asset_id = "";
          delete m.cta;
        }
        if (block.product_ids) block.product_ids = [];
        if (block.collection_id) block.collection_id = "";
        delete block.cta;
      }
      const old = (
        await c.query(
          "SELECT status FROM didar_content_preset WHERE code=$1 FOR UPDATE",
          [code],
        )
      ).rows[0];
      if (old?.status === "approved")
        throw new Error("CONFLICT_IMMUTABLE_CONTENT");
      await c.query(
        "INSERT INTO didar_content_preset(code,name,blocks,status,active,created_by,reviewed_by) VALUES($1,$2,$3,$4,true,$5,$6) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,blocks=EXCLUDED.blocks,status=EXCLUDED.status,reviewed_by=EXCLUDED.reviewed_by",
        [
          code,
          clean(b.name, 100),
          JSON.stringify(blocks),
          b.approved === true ? "approved" : "draft",
          u.id,
          b.approved === true ? u.id : null,
        ],
      );
      await log(c, u, null, "CONTENT_PRESET_SAVED", { code });
      return { ok: true };
    }
    if (b.operation === "draft") {
      let page: any;
      if (b.page_id) {
        page = await pageFor(c, u, b.page_id, false, true);
        if (b.revision !== page.revision)
          throw new Error("CONFLICT_CONTENT_REVISION");
      } else {
        const sid = privateOwner(b, u);
        await contentAccess(c, u, sid);
        if (!PAGE_KINDS.includes(b.kind))
          throw new Error("INVALID_CONTENT_KIND");
        const key = b.route_key ? clean(b.route_key, 100) : "";
        if (["DIDAR_HOME", "MERCHANT_HOME"].includes(b.kind) && key)
          throw new Error("INVALID_CONTENT_ROUTE");
        page = {
          id: randomUUID(),
          kind: b.kind,
          supplier_id: sid,
          route_key: key,
          title: clean(b.title, 160),
          revision: 1,
        };
        await target(c, page);
        await c.query(
          "INSERT INTO didar_content_page(id,kind,supplier_id,route_key,title,created_by) VALUES($1,$2,$3,$4,$5,$6)",
          [page.id, page.kind, sid, key, page.title, u.id],
        );
      }
      const blocks = validateBlocks(b.blocks);
      const refs = await resources(c, page, blocks);
      const id = randomUUID(),
        number = (
          await c.query(
            "SELECT coalesce(max(number),0)+1 number FROM didar_content_version WHERE page_id=$1",
            [page.id],
          )
        ).rows[0].number;
      await c.query(
        "INSERT INTO didar_content_version(id,page_id,number,blocks,created_by,title) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          page.id,
          number,
          JSON.stringify(blocks),
          u.id,
          clean(b.title || page.title, 160),
        ],
      );
      for (const asset of refs.assets)
        await c.query(
          "INSERT INTO didar_content_asset(version_id,asset_id) VALUES($1,$2)",
          [id, asset],
        );
      await c.query(
        "UPDATE didar_content_page SET title=$1,revision=revision+1,updated_at=now() WHERE id=$2",
        [clean(b.title || page.title, 160), page.id],
      );
      await log(c, u, page.id, "CONTENT_DRAFT_SAVED", {
        version_id: id,
        number,
      });
      return { page_id: page.id, version_id: id, revision: page.revision + 1 };
    }
    const page = await pageFor(c, u, b.page_id, true, true);
    if (b.operation === "pause") {
      await c.query(
        "UPDATE didar_content_publication SET cancelled=true WHERE page_id=$1 AND effective_from>now() AND NOT cancelled",
        [page.id],
      );
      await c.query(
        "UPDATE didar_content_publication SET effective_to=now() WHERE page_id=$1 AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now()) AND NOT cancelled",
        [page.id],
      );
      await log(c, u, page.id, "CONTENT_PAUSED", {
        reason: clean(b.reason, 1000),
      });
      return { ok: true };
    }
    const v = (
      await c.query(
        "SELECT * FROM didar_content_version WHERE id=$1 AND page_id=$2",
        [clean(b.version_id), page.id],
      )
    ).rows[0];
    if (!v) throw new Error("NOT_FOUND");
    if (b.operation === "review") {
      if (typeof b.approved !== "boolean") throw new Error("INVALID_DECISION");
      if (v.status !== "draft") {
        if (v.status === (b.approved ? "approved" : "rejected"))
          return { ok: true };
        throw new Error("CONFLICT_IMMUTABLE_CONTENT");
      }
      if (b.approved) {
        await target(c, page, true);
        await resources(c, page, v.blocks, true);
      }
      await c.query(
        "UPDATE didar_content_version SET status=$1,reviewed_by=$2,review_reason=$3,reviewed_at=now() WHERE id=$4",
        [
          b.approved ? "approved" : "rejected",
          u.id,
          clean(b.reason, 1000),
          v.id,
        ],
      );
      await log(c, u, page.id, "CONTENT_REVIEWED", {
        version_id: v.id,
        approved: b.approved,
      });
      return { ok: true };
    }
    if (!["publish", "rollback"].includes(b.operation))
      throw new Error("INVALID_ACTION");
    if (v.status !== "approved") throw new Error("INVALID_CONTENT_APPROVAL");
    await target(c, page, true);
    await resources(c, page, v.blocks, true);
    const key = clean(b.idempotency_key, 100),
      reason = clean(b.reason, 1000);
    const prior = (
      await c.query(
        "SELECT * FROM didar_content_publication WHERE page_id=$1 AND intent_key=$2",
        [page.id, key],
      )
    ).rows[0];
    if (prior) {
      if (
        prior.version_id !== v.id ||
        (b.at &&
          new Date(b.at).getTime() !== new Date(prior.effective_from).getTime())
      )
        throw new Error("CONFLICT_CONTENT_INTENT");
      return { id: prior.id };
    }
    const at = b.at ? new Date(b.at) : new Date();
    if (
      !Number.isFinite(at.getTime()) ||
      (b.at && at.getTime() < Date.now()) ||
      at.getTime() > Date.now() + 366 * 86400000
    )
      throw new Error("INVALID_CONTENT_SCHEDULE");
    await c.query(
      "UPDATE didar_content_publication SET cancelled=true WHERE page_id=$1 AND effective_from>=$2 AND NOT cancelled",
      [page.id, at],
    );
    await c.query(
      "UPDATE didar_content_publication SET effective_to=$2 WHERE page_id=$1 AND effective_from<$2 AND (effective_to IS NULL OR effective_to>$2) AND NOT cancelled",
      [page.id, at],
    );
    const id = randomUUID();
    await c.query(
      "INSERT INTO didar_content_publication(id,page_id,version_id,effective_from,created_by,reason,intent_key) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [id, page.id, v.id, at, u.id, reason, key],
    );
    await log(
      c,
      u,
      page.id,
      b.operation === "rollback" ? "CONTENT_ROLLED_BACK" : "CONTENT_PUBLISHED",
      { version_id: v.id, publication_id: id, at },
    );
    return { id };
  });
}
