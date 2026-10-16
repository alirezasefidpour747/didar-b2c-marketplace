import { contentAccess } from "./content-permissions";
import { editorialReadable } from "./content-media";
import { randomUUID, createHash } from "node:crypto";
import { db, transaction } from "./db";
import { sessionUser } from "./auth";
import {
  clean,
  merchantAccess,
  storeScope,
  publicPreviewStore,
} from "./storefront";
import { audit } from "./permissions";
import { integer } from "./pricing";
import { processProductPhoto } from "./media-processing";
export async function onboardingEvent(
  c: any,
  u: any,
  sid: string,
  action: string,
  details: any,
  requestId: string | null = null,
  assetId: string | null = null,
) {
  await c.query(
    "INSERT INTO didar_onboarding_event(supplier_id,actor_id,action,request_id,asset_id,details) VALUES($1,$2,$3,$4,$5,$6)",
    [sid, u.id, action, requestId, assetId, JSON.stringify(details)],
  );
}
export async function attachRequestedMedia(
  c: any,
  requestId: string,
  productId: string,
) {
  await c.query(
    "UPDATE didar_media_asset SET product_id=$1 WHERE request_id=$2 AND product_id IS NULL",
    [productId, requestId],
  );
}
async function resource(c: any, u: any, b: any) {
  const sid = clean(b.supplier_id || u.supplier_id);
  await merchantAccess(c, u, sid, "ONBOARDING");
  let pid = b.product_id ? clean(b.product_id) : null,
    rid = b.request_id ? clean(b.request_id) : null;
  if (rid) {
    const r = (
      await c.query(
        "SELECT product_id,status FROM didar_product_request WHERE id=$1 AND supplier_id=$2",
        [rid, sid],
      )
    ).rows[0];
    if (!r || r.status === "rejected") throw new Error("FORBIDDEN");
    if (pid && r.product_id !== pid) throw new Error("FORBIDDEN");
    pid = r.product_id || null;
  } else if (pid) {
    const own = (
      await c.query(
        `SELECT 1 FROM didar_offer WHERE product_id=$1 AND supplier_id=$2 UNION SELECT 1 FROM didar_intake_line l JOIN didar_intake_batch b ON b.id=l.batch_id WHERE l.product_id=$1 AND b.supplier_id=$2 UNION SELECT 1 FROM didar_product_request WHERE product_id=$1 AND supplier_id=$2 AND status='approved'`,
        [pid, sid],
      )
    ).rowCount;
    if (!own) throw new Error("FORBIDDEN");
  } else throw new Error("INVALID_MEDIA_RESOURCE");
  return { sid, pid, rid };
}
export async function media(req: any) {
  const u = await sessionUser(req);
  if (!u) throw new Error("UNAUTHORIZED");
  const b = req.body || {},
    q = req.query || {};
  if (req.method === "GET")
    return transaction(async (c) => {
      const sid = clean(q.supplier_id || u.supplier_id);
      await merchantAccess(c, u, sid, "ONBOARDING");
      const { rows: assets } = await c.query(
        `SELECT id,supplier_id,request_id,product_id,alt,status,visibility,allow_shared,created_by,uploaded_by,assisted_by_agent,approved_by,review_reason,receipt,created_at FROM didar_media_asset WHERE supplier_id=$1 AND purpose='PRODUCT' ORDER BY created_at DESC LIMIT 100`,
        [sid],
      );
      return {
        assets,
        policy: (await c.query("SELECT * FROM didar_media_policy WHERE id=1"))
          .rows[0],
      };
    });
  if (b.operation === "policy")
    return transaction(async (c) => {
      if (u.role !== "admin") throw new Error("FORBIDDEN");
      const old = (
        await c.query("SELECT * FROM didar_media_policy WHERE id=1 FOR UPDATE")
      ).rows[0];
      if (b.version !== old.version) throw new Error("CONFLICT_MEDIA_POLICY");
      const card = integer(b.card_width, "CARD_WIDTH", 160, 800),
        medium = integer(b.medium_width, "MEDIUM_WIDTH", 400, 1600),
        zoom = integer(b.zoom_width, "ZOOM_WIDTH", 800, 2400),
        quality = integer(b.quality, "QUALITY", 60, 90);
      if (!(card < medium && medium < zoom))
        throw new Error("INVALID_MEDIA_POLICY");
      const budget = integer(
        b.max_variant_bytes ?? old.max_variant_bytes,
        "MAX_VARIANT_BYTES",
        16384,
        786432,
      );
      await c.query(
        "UPDATE didar_media_policy SET card_width=$1,medium_width=$2,zoom_width=$3,quality=$4,max_variant_bytes=$5,version=version+1 WHERE id=1",
        [card, medium, zoom, quality, budget],
      );
      await audit(c, u.id, "media_policy_updated", {
        card,
        medium,
        zoom,
        quality,
      });
      return { ok: true };
    });
  if (b.operation === "review")
    return transaction(async (c) => {
      if (u.role !== "admin") throw new Error("FORBIDDEN");
      const reason = clean(b.reason, 1000);
      if (typeof b.approved !== "boolean") throw new Error("INVALID_DECISION");
      const a = (
        await c.query(
          "SELECT * FROM didar_media_asset WHERE id=$1 FOR UPDATE",
          [clean(b.asset_id)],
        )
      ).rows[0];
      if (!a) throw new Error("NOT_FOUND");
      if (b.approved) {
        if (!a.product_id) throw new Error("CONFLICT_MEDIA_PRODUCT_REQUIRED");
        if (
          !["MERCHANT_ONLY", "SHARED_MASTER"].includes(b.visibility) ||
          (b.visibility === "SHARED_MASTER" && !a.allow_shared)
        )
          throw new Error("INVALID_MEDIA_VISIBILITY");
        const p = (
          await c.query("SELECT id FROM didar_product WHERE id=$1 FOR UPDATE", [
            a.product_id,
          ])
        ).rows[0];
        if (!p) throw new Error("NOT_FOUND");
        const existing = (
          await c.query(
            "SELECT id FROM didar_product_image WHERE media_asset_id=$1",
            [a.id],
          )
        ).rows[0];
        if (!existing) {
          const count = (
            await c.query(
              "SELECT count(*)::int n FROM didar_product_image WHERE product_id=$1",
              [a.product_id],
            )
          ).rows[0].n;
          if (count >= 10) throw new Error("INVALID_IMAGE_LIMIT");
          const v = (
            await c.query(
              "SELECT data FROM didar_media_variant WHERE asset_id=$1 AND kind='medium'",
              [a.id],
            )
          ).rows[0];
          await c.query(
            "INSERT INTO didar_product_image(id,product_id,mime_type,data,alt,position,media_asset_id) VALUES($1,$2,'image/webp',$3,$4,(SELECT coalesce(max(position),-1)+1 FROM didar_product_image WHERE product_id=$2),$5)",
            [randomUUID(), a.product_id, v.data, a.alt, a.id],
          );
        }
      } else
        await c.query(
          "DELETE FROM didar_product_image WHERE media_asset_id=$1",
          [a.id],
        );
      await c.query(
        `UPDATE didar_media_asset SET status=$1,visibility=$2,approved_by=CASE WHEN $3 THEN $4 ELSE approved_by END,review_reason=$5,reviewed_at=now() WHERE id=$6`,
        [
          b.approved ? "approved" : "rejected",
          b.approved ? b.visibility : a.visibility,
          b.approved,
          u.id,
          reason,
          a.id,
        ],
      );
      await onboardingEvent(
        c,
        u,
        a.supplier_id,
        b.approved ? "MEDIA_APPROVED" : "MEDIA_REJECTED",
        { reason, visibility: b.visibility },
        a.request_id,
        a.id,
      );
      return { ok: true };
    });
  if (b.operation !== "upload") throw new Error("INVALID_ACTION");
  const alt = clean(b.alt, 300),
    intent = clean(b.idempotency_key, 100);
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        b.product_id || null,
        b.request_id || null,
        b.mime_type,
        alt,
        b.allow_shared === true,
        b.data,
      ]),
    )
    .digest("hex");
  const initial = await transaction(async (c) => {
    const r = await resource(c, u, b);
    const old = (
      await c.query(
        "SELECT id,receipt,source_digest FROM didar_media_asset WHERE supplier_id=$1 AND intent_key=$2",
        [r.sid, intent],
      )
    ).rows[0];
    if (old && old.source_digest !== digest)
      throw new Error("CONFLICT_MEDIA_INTENT");
    return {
      ...r,
      old,
      policy: (await c.query("SELECT * FROM didar_media_policy WHERE id=1"))
        .rows[0],
    };
  });
  if (initial.old)
    return { id: initial.old.id, receipt: initial.old.receipt, replayed: true };
  const result = await processProductPhoto(b, initial.policy);
  return transaction(async (c) => {
    const r = await resource(c, u, b);
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "didar:media:" + r.sid,
    ]);
    const old = (
      await c.query(
        "SELECT id,receipt,source_digest FROM didar_media_asset WHERE supplier_id=$1 AND intent_key=$2",
        [r.sid, intent],
      )
    ).rows[0];
    if (old) {
      if (old.source_digest !== digest)
        throw new Error("CONFLICT_MEDIA_INTENT");
      return { id: old.id, receipt: old.receipt, replayed: true };
    }
    const count = (
      await c.query(
        "SELECT count(*)::int n FROM didar_media_asset WHERE supplier_id=$1 AND status IN ('pending','approved') AND (($2::text IS NOT NULL AND request_id=$2) OR ($3::text IS NOT NULL AND product_id=$3))",
        [r.sid, r.rid, r.pid],
      )
    ).rows[0].n;
    if (count >= 10) throw new Error("INVALID_IMAGE_LIMIT");
    const id = randomUUID(),
      assisted = u.role !== "admin" && u.supplier_id !== r.sid ? u.id : null;
    const receipt = {
      source: result.source,
      normalized: result.normalized,
      metadata_removed: true,
      orientation_applied: true,
      variants: result.variants.map(({ data, ...v }: any) => v),
    };
    await c.query(
      `INSERT INTO didar_media_asset(id,supplier_id,request_id,product_id,source_mime,source_width,source_height,original_bytes,sanitized_data,alt,created_by,uploaded_by,assisted_by_agent,policy_snapshot,receipt,intent_key,source_digest,allow_shared) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        r.sid,
        r.rid,
        r.pid,
        result.source.mime,
        result.source.width,
        result.source.height,
        result.source.bytes,
        result.sanitized,
        alt,
        u.id,
        assisted,
        JSON.stringify(initial.policy),
        JSON.stringify(receipt),
        intent,
        digest,
        b.allow_shared === true,
      ],
    );
    for (const v of result.variants)
      await c.query(
        "INSERT INTO didar_media_variant(asset_id,kind,width,height,data) VALUES($1,$2,$3,$4,$5)",
        [id, v.kind, v.width, v.height, v.data],
      );
    await onboardingEvent(
      c,
      u,
      r.sid,
      "MEDIA_UPLOADED",
      { source_bytes: result.source.bytes, variants: receipt.variants },
      r.rid,
      id,
    );
    return { id, receipt };
  });
}
/** The old image route delegates processed assets here; originals never become public URLs. */
export async function processedImage(req: any, id: string) {
  const row = (
    await db.query(
      `SELECT a.id,a.supplier_id,a.product_id,a.purpose,a.status,a.visibility,v.data,v.mime_type FROM didar_media_asset a JOIN didar_media_variant v ON v.asset_id=a.id WHERE a.id=$1 AND v.kind=$2`,
      [
        id,
        ["card", "medium", "zoom"].includes(req.query.variant)
          ? req.query.variant
          : "medium",
      ],
    )
  ).rows[0];
  if (!row) return null;
  if (row.purpose === "EDITORIAL") {
    await editorialReadable(req, row);
    return { data: row.data, mime_type: row.mime_type };
  }
  const preview = req.query.preview_store
    ? await publicPreviewStore(req.query.preview_store)
    : null;
  const u = await sessionUser(req);
  let own = false;
  try {
    if (!preview) {
      try {
        await transaction((c) =>
          merchantAccess(c, u, row.supplier_id, "ONBOARDING"),
        );
      } catch {
        await transaction((c) => contentAccess(c, u, row.supplier_id));
      }
      own = true;
    }
  } catch {}
  if (!own) {
    const scope = preview || (await storeScope(req));
    const p = row.product_id
      ? (
          await db.query(
            "SELECT active AND published AND approved AND didar_public_taxonomy(id,category_id) AND didar_visible_product(id,$2) visible FROM didar_product WHERE id=$1",
            [row.product_id, scope?.supplier_id || null],
          )
        ).rows[0]
      : null;
    if (row.status !== "approved" || !p?.visible) throw new Error("NOT_FOUND");
    if (
      !(
        await db.query("SELECT didar_media_visible($1,$2) ok", [
          row.id,
          scope?.supplier_id || null,
        ])
      ).rows[0].ok
    )
      throw new Error("NOT_FOUND");
  }
  return { data: row.data, mime_type: row.mime_type };
}
