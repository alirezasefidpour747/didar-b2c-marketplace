import bwipjs from "bwip-js/node";
import { isIP } from "node:net";
import { requireUser } from "./auth";
import { transaction } from "./db";

// The operator attests to an HTTPS origin they control after deployment validation.
// Request Host/X-Forwarded-Host and caller-supplied URLs never influence printed codes.
export function verifiedPublicOrigin(env = process.env): string | null {
  if (env.DIDAR_PUBLIC_ORIGIN_VERIFIED !== "true" || !env.DIDAR_PUBLIC_ORIGIN)
    return null;
  try {
    const url = new URL(env.DIDAR_PUBLIC_ORIGIN);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      isIP(host) ||
      host.includes(":") ||
      !host.includes(".") ||
      host.endsWith(".") ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) ||
      /(^|\.)(localhost|local|internal|lan|home|test|invalid|example)$/.test(
        host,
      ) ||
      /(^|\.)example\.(com|net|org)$/.test(host) ||
      /(^|[.-])(sandbox|staging|preview)([.-]|$)/.test(host)
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
export const labelSVG = (bcid: "code128" | "qrcode", text: string) =>
  "data:image/svg+xml;base64," +
  Buffer.from(
    bwipjs.toSVG({
      bcid,
      text,
      scale: 3,
      ...(bcid === "code128" ? { height: 12 } : {}),
      paddingwidth: bcid === "code128" ? 10 : 4,
      paddingheight: 4,
      ...(bcid === "qrcode" ? { eclevel: "M" } : {}),
    }),
  ).toString("base64");
export async function labels(req: any) {
  const user = await requireUser(req, ["admin"]);
  const origin = verifiedPublicOrigin();
  if (req.method === "GET")
    return {
      customer_qr_available: !!origin,
      public_origin: origin,
      reason: origin ? null : "INVALID_PUBLIC_ORIGIN",
      maximum_items: 100,
    };
  const b = req.body || {};
  if (!["warehouse", "customer"].includes(b.mode))
    throw new Error("INVALID_LABEL_MODE");
  if (b.mode === "customer" && !origin)
    throw new Error("INVALID_PUBLIC_ORIGIN");
  const ids = b.item_ids;
  if (
    (b.batch_id && ids) ||
    (!b.batch_id &&
      (!Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 100 ||
        new Set(ids).size !== ids.length ||
        ids.some((id: unknown) => typeof id !== "string" || id.length > 100)))
  )
    throw new Error("INVALID_LABEL_ITEMS");
  if (b.batch_id && (typeof b.batch_id !== "string" || b.batch_id.length > 100))
    throw new Error("INVALID_LABEL_ITEMS");
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const { rows } = await c.query(
      `SELECT i.id,i.uid,i.status,p.title,p.active,p.approved,p.published,didar_taxonomy_valid(p.category_id) classified,(didar_global_supplier(i.supplier_id) AND didar_visible_product(p.id,NULL)) global_visible FROM didar_inventory_item i JOIN didar_intake_line l ON l.id=i.line_id LEFT JOIN didar_product p ON p.id=i.product_id WHERE ${b.batch_id ? "l.batch_id=$1 AND i.status<>'void'" : "i.id=ANY($1::text[])"} ORDER BY i.uid LIMIT 101`,
      [b.batch_id || ids],
    );
    if (
      !rows.length ||
      rows.length > 100 ||
      (ids && rows.length !== ids.length)
    )
      throw new Error("INVALID_LABEL_ITEMS");
    if (rows.some((i) => i.status === "void"))
      throw new Error("INVALID_LABEL_ITEMS");
    if (
      b.mode === "customer" &&
      rows.some(
        (i) =>
          !i.active ||
          !i.approved ||
          !i.published ||
          !i.classified ||
          !i.global_visible ||
          !["available", "reserved", "sold", "returned", "withdrawn"].includes(
            i.status,
          ),
      )
    )
      throw new Error("INVALID_LABEL_VISIBILITY");
    const items = rows.map((i) => {
      const raw = bwipjs.raw({ bcid: "code128", text: i.uid })[0] as {
        sbs: number[];
      };
      // A conservative 0.33 mm/module plus 10-module quiet zones on each side.
      const barcode_width_mm = Math.ceil(
        (raw.sbs.reduce((a, b) => a + b, 0) + 20) * 0.33,
      );
      const resolver_url =
        b.mode === "customer"
          ? origin + "/i/" + encodeURIComponent(i.uid)
          : null;
      return {
        id: i.id,
        uid: i.uid,
        title: i.title || "قطعه در انتظار محصول",
        barcode_width_mm,
        barcode: labelSVG("code128", i.uid),
        resolver_url,
        qr: resolver_url ? labelSVG("qrcode", resolver_url) : null,
      };
    });
    await c.query(
      "INSERT INTO didar_audit(actor_id,action,details) VALUES($1,'uid_labels_generated',$2)",
      [
        user.id,
        JSON.stringify({
          mode: b.mode,
          item_ids: items.map((i) => i.id),
          public_origin: b.mode === "customer" ? origin : null,
        }),
      ],
    );
    return { mode: b.mode, items };
  });
}
