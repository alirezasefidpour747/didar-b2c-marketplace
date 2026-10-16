import { randomBytes } from "node:crypto";
import { db, transaction } from "./db";
import { digest, sessionUser } from "./auth";
import { audit, authorize } from "./permissions";
export const clean = (v: any, max = 100) => {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[\u0000-\u001f<>]/.test(v)
  )
    throw new Error("INVALID_TEXT");
  return v.trim();
};
export async function merchantAccess(
  c: any,
  u: any,
  sid: string,
  permission: string,
) {
  if (!u) throw new Error("UNAUTHORIZED");
  if (u.role === "admin" || (u.role === "supplier" && u.supplier_id === sid))
    return authorize(c, u, sid);
  const s = (
    await c.query(
      "SELECT active,status FROM didar_supplier WHERE id=$1 FOR SHARE",
      [sid],
    )
  ).rows[0];
  const m = (
    await c.query(
      "SELECT 1 FROM didar_merchant_member WHERE supplier_id=$1 AND user_id=$2 AND permission=$3 AND active FOR SHARE",
      [sid, u.id, permission],
    )
  ).rowCount;
  if (!s?.active || s.status !== "approved" || !m) throw new Error("FORBIDDEN");
}
export async function storeAllowed(c: any, f: any, u: any, lock = false) {
  if (!f || !f.published || !f.approved || !f.active || f.status !== "approved")
    throw new Error("NOT_FOUND");
  if (f.visibility !== "INVITE_ONLY") return;
  if (!u) throw new Error("UNAUTHORIZED");
  if (
    u.role === "admin" ||
    (u.role === "supplier" && u.supplier_id === f.supplier_id)
  )
    return;
  const ok = (
    await c.query(
      "SELECT 1 FROM didar_store_invite WHERE supplier_id=$1 AND user_id=$2 AND active AND expires_at>now()" +
        (lock ? " FOR SHARE" : ""),
      [f.supplier_id, u.id],
    )
  ).rowCount;
  if (!ok) throw new Error("FORBIDDEN");
}
export const storeProjection = (f: any) => ({
  supplier_id: f.supplier_id,
  handle: f.handle,
  name: f.name,
  intro: f.intro,
  contact: f.contact,
  visibility: f.visibility,
  version: f.version,
  logo_url: f.logo_image_id
    ? `/api/didar/image?id=${encodeURIComponent(f.logo_image_id)}`
    : null,
});
export async function storeScope(req: any, c: any = db, lock = false) {
  const token = req.headers?.["x-didar-context"];
  if (token === undefined || token === "") {
    if (
      req.headers?.["x-didar-store"] &&
      req.headers["x-didar-store"] !== "global"
    )
      throw new Error("CONFLICT_STORE_SCOPE");
    return null;
  }
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("FORBIDDEN");
  const f = (
    await c.query(
      `SELECT f.*,s.active,s.status FROM didar_store_context x JOIN didar_storefront f ON f.supplier_id=x.supplier_id JOIN didar_supplier s ON s.id=f.supplier_id WHERE x.token_hash=$1 AND x.expires_at>now() ${lock ? "FOR SHARE OF f" : ""}`,
      [digest(token)],
    )
  ).rows[0];
  if (
    req.headers?.["x-didar-store"] &&
    req.headers["x-didar-store"] !== f?.handle
  )
    throw new Error("CONFLICT_STORE_SCOPE");
  await storeAllowed(c, f, await sessionUser(req), lock);
  return storeProjection(f);
}
export async function assertOfferScope(c: any, o: any, scope: any) {
  if (
    scope
      ? o.supplier_id !== scope.supplier_id
      : !(await c.query("SELECT didar_global_supplier($1) ok", [o.supplier_id]))
          .rows[0].ok
  )
    throw new Error("CONFLICT_STORE_SCOPE");
}
export async function storefront(req: any) {
  const b = req.body || {},
    q = req.query || {},
    u = await sessionUser(req);
  if (req.method === "GET" && q.handle) {
    const f = (
      await db.query(
        "SELECT f.*,s.active,s.status FROM didar_storefront f JOIN didar_supplier s ON s.id=f.supplier_id WHERE handle=$1",
        [clean(q.handle, 60)],
      )
    ).rows[0];
    await storeAllowed(db, f, u);
    let preview: any = null;
    if (q.product_key) {
      const p = (
        await db.query(
          `SELECT p.id,p.title,p.description FROM didar_product p WHERE p.public_key=$1 AND p.active AND p.approved AND p.published AND didar_public_taxonomy(p.id,p.category_id) AND didar_visible_product(p.id,$2)`,
          [clean(q.product_key, 32), f.supplier_id],
        )
      ).rows[0];
      if (!p) throw new Error("NOT_FOUND");
      preview = {
        title: p.title,
        description: p.description,
        image_url: await previewImage(p.id, f.supplier_id, f.handle),
      };
    }
    if (q.share_slug) {
      const p = (
        await db.query(
          "SELECT id,title,intro FROM didar_share_page WHERE supplier_id=$1 AND slug=$2 AND published",
          [f.supplier_id, clean(q.share_slug, 80)],
        )
      ).rows[0];
      if (!p) throw new Error("NOT_FOUND");
      const first = (
        await db.query(
          `SELECT cp.product_id FROM didar_share_product cp JOIN didar_product m ON m.id=cp.product_id WHERE cp.page_id=$1 AND m.active AND m.approved AND m.published AND didar_public_taxonomy(m.id,m.category_id) AND EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=m.id AND o.supplier_id=$2 AND o.active AND o.quantity>0) ORDER BY cp.position LIMIT 1`,
          [p.id, f.supplier_id],
        )
      ).rows[0];
      preview = {
        title: p.title,
        description: p.intro,
        image_url: first
          ? await previewImage(first.product_id, f.supplier_id, f.handle)
          : null,
      };
    }
    return { store: storeProjection(f), preview };
  }
  if (req.method === "POST" && b.kind === "enter") {
    return transaction(async (c) => {
      const f = (
        await c.query(
          "SELECT f.*,s.active,s.status FROM didar_storefront f JOIN didar_supplier s ON s.id=f.supplier_id WHERE handle=$1 FOR SHARE OF f,s",
          [clean(b.handle, 60)],
        )
      ).rows[0];
      await storeAllowed(c, f, u);
      const token = randomBytes(32).toString("hex");
      await c.query("DELETE FROM didar_store_context WHERE expires_at<=now()");
      await c.query(
        "INSERT INTO didar_store_context(token_hash,supplier_id) VALUES($1,$2)",
        [digest(token), f.supplier_id],
      );
      return { context_token: token, store: storeProjection(f) };
    });
  }
  if (req.method === "POST" && b.kind === "leave") return { left: true };
  if (!u) throw new Error("UNAUTHORIZED");
  if (req.method === "GET") {
    const { rows: stores } = await db.query(
      `SELECT f.*,s.name supplier_name FROM didar_storefront f JOIN didar_supplier s ON s.id=f.supplier_id WHERE $1='admin' OR f.supplier_id=$2 OR EXISTS(SELECT 1 FROM didar_merchant_member m WHERE m.supplier_id=f.supplier_id AND m.user_id=$3 AND m.active) ORDER BY f.handle`,
      [u.role, u.supplier_id || null, u.id],
    );
    const { rows: suppliers } = await db.query(
      `SELECT s.id,s.name,s.active,s.status FROM didar_supplier s WHERE $1='admin' OR s.id=$2 OR EXISTS(SELECT 1 FROM didar_merchant_member m WHERE m.supplier_id=s.id AND m.user_id=$3 AND m.active) ORDER BY s.name`,
      [u.role, u.supplier_id || null, u.id],
    );
    const { rows: members } = await db.query(
      `SELECT m.supplier_id,m.user_id,m.permission,m.active FROM didar_merchant_member m WHERE $1='admin' OR m.supplier_id=$2 OR m.user_id=$3`,
      [u.role, u.supplier_id || null, u.id],
    );
    return { stores, suppliers, members };
  }
  return transaction(async (c) => {
    const sid = clean(b.supplier_id, 100);
    await merchantAccess(c, u, sid, "STOREFRONT");
    if (b.kind === "member") {
      if (u.role !== "admin") throw new Error("FORBIDDEN");
      if (
        !["STOREFRONT", "SHARE", "ONBOARDING"].includes(b.permission) ||
        typeof b.active !== "boolean"
      )
        throw new Error("INVALID_PERMISSION");
      const target = (
        await c.query("SELECT id FROM didar_user WHERE email=$1", [
          clean(b.email, 150).toLowerCase(),
        ])
      ).rows[0];
      if (!target) throw new Error("NOT_FOUND");
      await c.query(
        "INSERT INTO didar_merchant_member(supplier_id,user_id,permission,active,granted_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(supplier_id,user_id,permission) DO UPDATE SET active=EXCLUDED.active,granted_by=EXCLUDED.granted_by",
        [sid, target.id, b.permission, b.active, u.id],
      );
    } else if (b.kind === "invite") {
      if (
        typeof b.active !== "boolean" ||
        !Number.isInteger(b.days) ||
        b.days < 1 ||
        b.days > 365
      )
        throw new Error("INVALID_INVITE");
      const target = (
        await c.query(
          "SELECT id FROM didar_user WHERE email=$1 AND role='customer'",
          [clean(b.email, 150).toLowerCase()],
        )
      ).rows[0];
      if (!target) throw new Error("NOT_FOUND");
      await c.query(
        "INSERT INTO didar_store_invite(supplier_id,user_id,active,expires_at,granted_by) VALUES($1,$2,$3,now()+$4*interval '1 day',$5) ON CONFLICT(supplier_id,user_id) DO UPDATE SET active=EXCLUDED.active,expires_at=EXCLUDED.expires_at,granted_by=EXCLUDED.granted_by",
        [sid, target.id, b.active, b.days, u.id],
      );
    } else if (b.kind === "save") {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `didar:storefront:${sid}`,
      ]);
      const old = (
        await c.query(
          "SELECT * FROM didar_storefront WHERE supplier_id=$1 FOR UPDATE",
          [sid],
        )
      ).rows[0];
      if (old && b.version !== old.version)
        throw new Error("CONFLICT_STORE_CHANGED");
      const handle = clean(b.handle, 60);
      if (
        !/^[a-z0-9][a-z0-9-]{2,59}$/.test(handle) ||
        (old && old.handle !== handle)
      )
        throw new Error("INVALID_STABLE_HANDLE");
      if (
        !["PUBLIC_MARKETPLACE", "UNLISTED_LINK", "INVITE_ONLY"].includes(
          b.visibility,
        ) ||
        typeof b.published !== "boolean"
      )
        throw new Error("INVALID_VISIBILITY");
      const approved =
        u.role === "admin"
          ? b.approved === true
          : old?.approved === true && old.visibility === b.visibility;
      const logo = b.logo_image_id || null;
      if (
        logo &&
        !(
          await c.query(
            "SELECT 1 FROM didar_product_image i JOIN didar_offer o ON o.product_id=i.product_id WHERE i.id=$1 AND o.supplier_id=$2",
            [logo, sid],
          )
        ).rowCount
      )
        throw new Error("INVALID_IMAGE");
      await c.query(
        `INSERT INTO didar_storefront(supplier_id,handle,name,intro,contact,logo_image_id,visibility,published,approved,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(supplier_id) DO UPDATE SET name=EXCLUDED.name,intro=EXCLUDED.intro,contact=EXCLUDED.contact,logo_image_id=EXCLUDED.logo_image_id,visibility=EXCLUDED.visibility,published=EXCLUDED.published,approved=EXCLUDED.approved,version=didar_storefront.version+1,updated_at=now()`,
        [
          sid,
          handle,
          clean(b.name),
          b.intro ? clean(b.intro, 2000) : "",
          b.contact ? clean(b.contact, 300) : "",
          logo,
          b.visibility,
          b.published,
          approved,
          u.id,
        ],
      );
    } else throw new Error("INVALID_ACTION");
    await audit(c, u.id, `storefront_${b.kind}`, { supplier_id: sid });
    return { ok: true };
  });
}

/** Public image previews resolve an approved route; they never grant private or checkout access. */
export async function publicPreviewStore(handle: any, c: any = db) {
  const f = (
    await c.query(
      "SELECT f.*,s.active,s.status FROM didar_storefront f JOIN didar_supplier s ON s.id=f.supplier_id WHERE f.handle=$1",
      [clean(handle, 60)],
    )
  ).rows[0];
  await storeAllowed(c, f, null);
  return storeProjection(f);
}
async function previewImage(pid: string, sid: string, handle: string) {
  const i = (
    await db.query(
      `SELECT i.id FROM didar_product_image i WHERE i.product_id=$1 AND (i.media_asset_id IS NULL OR didar_media_visible(i.media_asset_id,$2)) ORDER BY i.position,i.id LIMIT 1`,
      [pid, sid],
    )
  ).rows[0];
  return i
    ? `/api/didar/image?id=${encodeURIComponent(i.id)}&variant=medium&preview_store=${encodeURIComponent(handle)}`
    : null;
}
