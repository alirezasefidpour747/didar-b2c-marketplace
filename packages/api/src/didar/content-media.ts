import { randomUUID, createHash } from "node:crypto";
import { db, transaction } from "./db";
import { sessionUser } from "./auth";
import { clean, storeScope, publicPreviewStore } from "./storefront";
import { contentAccess } from "./content-permissions";
import { processProductPhoto } from "./media-processing";
import { processVideo } from "./video-processing";
const owner = (b: any, u: any) =>
  b.supplier_id === "DIDAR" ? null : clean(b.supplier_id || u.supplier_id, 100);
const event = (c: any, u: any, action: string, details: any) =>
  c.query(
    "INSERT INTO didar_content_event(actor_id,action,details) VALUES($1,$2,$3)",
    [u.id, action, JSON.stringify(details)],
  );
export async function contentMedia(req: any) {
  const u = await sessionUser(req);
  if (!u) throw new Error("UNAUTHORIZED");
  const b = req.body || {},
    q = req.query || {};
  if (req.method === "GET") {
    const sid = owner(q, u);
    await transaction((c) => contentAccess(c, u, sid));
    const { rows: assets } = await db.query(
      `SELECT a.id,a.supplier_id,a.source_mime,a.alt,a.status,a.allow_shared,a.visibility,a.receipt,a.created_by,a.approved_by,v.duration_ms,v.width,v.height FROM didar_media_asset a LEFT JOIN didar_media_video v ON v.asset_id=a.id WHERE a.purpose='EDITORIAL' AND a.supplier_id IS NOT DISTINCT FROM $1 ORDER BY a.created_at DESC LIMIT 100`,
      [sid],
    );
    return {
      assets,
      policy: (await db.query("SELECT * FROM didar_media_policy WHERE id=1"))
        .rows[0],
    };
  }
  if (b.operation === "review")
    return transaction(async (c) => {
      const a = (
        await c.query(
          "SELECT * FROM didar_media_asset WHERE id=$1 AND purpose='EDITORIAL'",
          [clean(b.asset_id)],
        )
      ).rows[0];
      if (!a) throw new Error("NOT_FOUND");
      await contentAccess(c, u, a.supplier_id, true);
      if (typeof b.approved !== "boolean") throw new Error("INVALID_DECISION");
      if (b.visibility === "SHARED_MASTER" && a.supplier_id !== null)
        await contentAccess(c, u, null, true);
      if (
        b.approved &&
        (!["SHARED_MASTER", "MERCHANT_ONLY"].includes(b.visibility) ||
          (b.visibility === "SHARED_MASTER" && !a.allow_shared))
      )
        throw new Error("INVALID_MEDIA_VISIBILITY");
      await c.query(
        "UPDATE didar_media_asset SET status=$1,visibility=$2,approved_by=CASE WHEN $3 THEN $4 ELSE approved_by END,review_reason=$5,reviewed_at=now() WHERE id=$6",
        [
          b.approved ? "approved" : "rejected",
          b.approved ? b.visibility : a.visibility,
          b.approved,
          u.id,
          clean(b.reason, 1000),
          a.id,
        ],
      );
      await event(
        c,
        u,
        b.approved ? "EDITORIAL_APPROVED" : "EDITORIAL_WITHDRAWN",
        { asset_id: a.id, supplier_id: a.supplier_id, reason: b.reason },
      );
      return { ok: true };
    });
  if (b.operation !== "upload") throw new Error("INVALID_ACTION");
  const sid = owner(b, u),
    key = clean(b.idempotency_key, 100),
    alt = clean(b.alt, 300),
    digest = createHash("sha256")
      .update(
        JSON.stringify([
          sid,
          alt,
          b.mime_type,
          b.allow_shared === true,
          b.data,
        ]),
      )
      .digest("hex");
  const first = await transaction(async (c) => {
    await contentAccess(c, u, sid);
    const old = (
      await c.query(
        "SELECT id,source_digest,receipt FROM didar_media_asset WHERE purpose='EDITORIAL' AND supplier_id IS NOT DISTINCT FROM $1 AND intent_key=$2",
        [sid, key],
      )
    ).rows[0];
    if (old && old.source_digest !== digest)
      throw new Error("CONFLICT_MEDIA_INTENT");
    return {
      old,
      policy: (await c.query("SELECT * FROM didar_media_policy WHERE id=1"))
        .rows[0],
    };
  });
  if (first.old)
    return { id: first.old.id, receipt: first.old.receipt, replayed: true };
  const video = String(b.mime_type).startsWith("video/")
    ? await processVideo(b)
    : null;
  const photo = await processProductPhoto(
    video
      ? { mime_type: "image/png", data: video.poster.toString("base64") }
      : b,
    first.policy,
  );
  return transaction(async (c) => {
    await contentAccess(c, u, sid);
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "didar:editorial:" + String(sid),
    ]);
    const old = (
      await c.query(
        "SELECT id,source_digest,receipt FROM didar_media_asset WHERE purpose='EDITORIAL' AND supplier_id IS NOT DISTINCT FROM $1 AND intent_key=$2",
        [sid, key],
      )
    ).rows[0];
    if (old) {
      if (old.source_digest !== digest)
        throw new Error("CONFLICT_MEDIA_INTENT");
      return { id: old.id, receipt: old.receipt, replayed: true };
    }
    const count = (
      await c.query(
        "SELECT count(*)::int n FROM didar_media_asset WHERE purpose='EDITORIAL' AND supplier_id IS NOT DISTINCT FROM $1 AND status IN ('pending','approved')",
        [sid],
      )
    ).rows[0].n;
    if (count >= 100) throw new Error("INVALID_CONTENT_MEDIA_LIMIT");
    const id = randomUUID(),
      receipt = {
        source: video ? video.receipt : photo.source,
        normalized: photo.normalized,
        metadata_removed: true,
        orientation_applied: true,
        variants: photo.variants.map(({ data, ...v }: any) => v),
        video: video?.receipt,
      };
    await c.query(
      `INSERT INTO didar_media_asset(id,supplier_id,source_mime,source_width,source_height,original_bytes,sanitized_data,alt,created_by,uploaded_by,policy_snapshot,receipt,intent_key,source_digest,allow_shared,purpose) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,'EDITORIAL')`,
      [
        id,
        sid,
        b.mime_type,
        video ? video.receipt.source_width : photo.source.width,
        video ? video.receipt.source_height : photo.source.height,
        video ? video.receipt.source_bytes : photo.source.bytes,
        photo.sanitized,
        alt,
        u.id,
        JSON.stringify(first.policy),
        JSON.stringify(receipt),
        key,
        digest,
        sid === null || b.allow_shared === true,
      ],
    );
    for (const v of photo.variants)
      await c.query(
        "INSERT INTO didar_media_variant(asset_id,kind,width,height,data) VALUES($1,$2,$3,$4,$5)",
        [id, v.kind, v.width, v.height, v.data],
      );
    if (video)
      await c.query(
        "INSERT INTO didar_media_video(asset_id,data,width,height,duration_ms,validation) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          video.data,
          video.width,
          video.height,
          video.duration_ms,
          JSON.stringify(video.receipt),
        ],
      );
    await event(c, u, "EDITORIAL_UPLOADED", {
      asset_id: id,
      supplier_id: sid,
      receipt,
    });
    return { id, receipt };
  });
}
export async function editorialReadable(req: any, a: any) {
  const preview = req.query?.preview_store
    ? await publicPreviewStore(req.query.preview_store)
    : null;
  if (!preview) {
    const u = await sessionUser(req);
    try {
      await transaction((c) => contentAccess(c, u, a.supplier_id));
      return;
    } catch {}
  }
  const scope = preview || (await storeScope(req));
  if (
    a.status !== "approved" ||
    !(
      await db.query("SELECT didar_editorial_visible($1,$2) ok", [
        a.id,
        scope?.supplier_id || null,
      ])
    ).rows[0].ok
  )
    throw new Error("NOT_FOUND");
}
export async function mediaFile(req: any, res: any) {
  const id = req.query.id;
  if (typeof id !== "string" || !/^[-\w]{1,100}$/.test(id))
    return res.status(404).json({ message: "NOT_FOUND" });
  const a = (
    await db.query(
      "SELECT a.id,a.supplier_id,a.status,a.purpose,octet_length(v.data) bytes FROM didar_media_asset a JOIN didar_media_video v ON v.asset_id=a.id WHERE a.id=$1",
      [id],
    )
  ).rows[0];
  if (!a) return res.status(404).json({ message: "NOT_FOUND" });
  try {
    await editorialReadable(req, a);
  } catch {
    return res.status(404).json({ message: "NOT_FOUND" });
  }
  const size = a.bytes;
  let start = 0,
    end = size - 1,
    partial = false;
  if (req.headers.range) {
    const m = String(req.headers.range).match(/^bytes=(\d*)-(\d*)$/);
    if (!m || (!m[1] && !m[2])) return res.status(416).end();
    partial = true;
    if (!m[1]) {
      const suffix = Number(m[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0)
        return res.status(416).end();
      start = Math.max(0, size - suffix);
    } else {
      start = Number(m[1]);
      end = m[2] ? Number(m[2]) : end;
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= size ||
      end < start
    )
      return res.status(416).end();
    end = Math.min(end, size - 1);
  }
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", String(end - start + 1));
  if (partial) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  if (req.method === "HEAD") return res.end();
  const data = (
    await db.query(
      "SELECT substring(data FROM $2 FOR $3) data FROM didar_media_video WHERE asset_id=$1",
      [id, start + 1, end - start + 1],
    )
  ).rows[0];
  return res.send(data.data);
}
