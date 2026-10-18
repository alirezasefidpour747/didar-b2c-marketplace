/** Versioned presentation permission. Physical supplier, actual seller and stock IDs never change. */
import { createHash, randomUUID } from "node:crypto";
import { agencyEnabled, currentMandate } from "./agency";
import { requireUser } from "./auth";
import { transaction } from "./db";
import { audit } from "./permissions";
const text = (v: any, max = 1000) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw Error("INVALID_TEXT");
  return v.trim();
};
export async function curationFact(c: any, offer: any, scope: any) {
  if (!scope || scope.supplier_id === offer.supplier_id) return null;
  if (!agencyEnabled()) throw Error("CONFLICT_STORE_SCOPE");
  const a = (
    await c.query(
      `SELECT a.* FROM didar_curation_agreement a WHERE a.offer_id=$1 AND a.store_supplier_id=$2 AND didar_curated_offer(a.offer_id,a.store_supplier_id) ORDER BY a.version DESC LIMIT 1`,
      [offer.id, scope.supplier_id],
    )
  ).rows[0];
  if (!a || a.seller_supplier_id !== offer.supplier_id)
    throw Error("CONFLICT_STORE_SCOPE");
  const mandate = await currentMandate(c, offer.supplier_id);
  if (mandate?.mode !== "AGENCY") throw Error("CONFLICT_STORE_SCOPE");
  return {
    agreement_id: a.id,
    version: a.version,
    store_supplier_id: a.store_supplier_id,
    seller_supplier_id: a.seller_supplier_id,
    actual_seller_id: a.seller_supplier_id,
    role: "CURATOR_ONLY",
    curator_fee_irr: "0",
    effective_at: a.effective_at,
    expires_at: a.expires_at,
  };
}
export async function curationQuote(
  c: any,
  offer: any,
  scope: any,
  price: any,
) {
  const fact = await curationFact(c, offer, scope);
  return fact
    ? {
        ...price,
        curation: fact,
        quote_key: createHash("sha256")
          .update(
            JSON.stringify({ price_key: price.quote_key, curation: fact }),
          )
          .digest("hex"),
      }
    : price;
}
export async function assertCurationPayment(c: any, order: any) {
  const { rows } = await c.query(
    "SELECT l.offer_id,l.supplier_id,l.breakdown FROM didar_order_line l WHERE l.order_id=$1 ORDER BY l.id",
    [order.id],
  );
  for (const l of rows) {
    const fact = await curationFact(
      c,
      { id: l.offer_id, supplier_id: l.supplier_id },
      order.origin_supplier_id
        ? { supplier_id: order.origin_supplier_id }
        : null,
    );
    if (JSON.stringify(fact) !== JSON.stringify(l.breakdown.curation ?? null)) {
      // jsonb reorders keys. Compare immutable identity and version rather than serialized key order.
      const old = l.breakdown.curation;
      if (
        !fact ||
        !old ||
        fact.agreement_id !== old.agreement_id ||
        fact.version !== old.version ||
        fact.actual_seller_id !== old.actual_seller_id
      )
        throw Error("CONFLICT_CURATION_CHANGED");
    }
  }
}
export async function curation(req: any) {
  const u = await requireUser(req, ["admin", "supplier"]);
  if (req.method === "GET")
    return transaction(async (c) => {
      const sid = u.role === "supplier" ? u.supplier_id : null;
      const agreements = (
        await c.query(
          `SELECT a.*,st.name store_name,s.name seller_name,p.title,r.approved,rv.agreement_id IS NOT NULL revoked FROM didar_curation_agreement a JOIN didar_supplier st ON st.id=a.store_supplier_id JOIN didar_supplier s ON s.id=a.seller_supplier_id JOIN didar_offer o ON o.id=a.offer_id JOIN didar_product p ON p.id=o.product_id LEFT JOIN didar_curation_review r ON r.agreement_id=a.id LEFT JOIN didar_curation_revocation rv ON rv.agreement_id=a.id WHERE ($1::text IS NULL OR a.store_supplier_id=$1 OR a.seller_supplier_id=$1) ORDER BY a.created_at DESC,a.version DESC`,
          [sid],
        )
      ).rows;
      const safe = agreements.map((a: any) => ({
        id: a.id,
        store_supplier_id: a.store_supplier_id,
        seller_supplier_id: a.seller_supplier_id,
        offer_id: a.offer_id,
        version: a.version,
        effective_at: a.effective_at,
        expires_at: a.expires_at,
        approved: a.approved,
        revoked: a.revoked,
        store_name: a.store_name,
        seller_name: a.seller_name,
        title: a.title,
        ...(u.role === "admin"
          ? { reason: a.reason, actor_id: a.actor_id }
          : {}),
      }));
      return {
        enabled: agencyEnabled(),
        agreements: safe,
        suppliers:
          u.role === "admin"
            ? (
                await c.query(
                  "SELECT id,name FROM didar_supplier WHERE active AND status='approved' ORDER BY name",
                )
              ).rows
            : [],
        offers:
          u.role === "admin"
            ? (
                await c.query(
                  "SELECT o.id,o.supplier_id,p.title,o.product_id FROM didar_offer o JOIN didar_product p ON p.id=o.product_id WHERE o.active ORDER BY p.title",
                )
              ).rows
            : [],
      };
    });
  if (req.method !== "POST") throw Error("METHOD_NOT_ALLOWED");
  if (u.role !== "admin" || !agencyEnabled()) throw Error("FORBIDDEN");
  const b = req.body || {};
  return transaction(async (c) => {
    await c.query(
      "SELECT pg_advisory_xact_lock(hashtext('didar:financial-core'))",
    );
    if (b.operation === "request") {
      const store = text(b.store_supplier_id, 100),
        seller = text(b.seller_supplier_id, 100),
        offer = text(b.offer_id, 100);
      if (store === seller) throw Error("INVALID_CURATION_PARTIES");
      if (
        !(
          await c.query(
            "SELECT 1 FROM didar_supplier WHERE id=$1 AND active AND status='approved' AND didar_native_saleable_supplier(id)",
            [store],
          )
        ).rowCount
      )
        throw Error("INVALID_CURATION_STORE");
      const m = await currentMandate(c, seller);
      if (m?.mode !== "AGENCY") throw Error("INVALID_CURATION_SELLER");
      if (
        !(
          await c.query(
            "SELECT 1 FROM didar_offer o JOIN didar_supplier s ON s.id=o.supplier_id WHERE o.id=$1 AND o.supplier_id=$2 AND o.active AND s.active AND s.status='approved' AND didar_native_saleable_supplier(s.id)",
            [offer, seller],
          )
        ).rowCount
      )
        throw Error("INVALID_CURATION_OFFER");
      const effective = new Date(b.effective_at),
        expires = new Date(b.expires_at);
      if (
        !Number.isFinite(+effective) ||
        !Number.isFinite(+expires) ||
        expires <= effective
      )
        throw Error("INVALID_CURATION_DATES");
      const version = (
          await c.query(
            "SELECT COALESCE(max(version),0)+1 n FROM didar_curation_agreement WHERE store_supplier_id=$1 AND offer_id=$2",
            [store, offer],
          )
        ).rows[0].n,
        id = randomUUID();
      await c.query(
        "INSERT INTO didar_curation_agreement(id,store_supplier_id,seller_supplier_id,offer_id,version,effective_at,expires_at,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          store,
          seller,
          offer,
          version,
          effective,
          expires,
          text(b.reason),
          u.id,
        ],
      );
      await audit(c, u.id, "curation_requested", {
        id,
        store_supplier_id: store,
        seller_supplier_id: seller,
        offer_id: offer,
        version,
        actual_seller_id: seller,
        curator_fee_irr: "0",
      });
      return { id, version };
    }
    const id = text(b.agreement_id, 100),
      a = (
        await c.query("SELECT * FROM didar_curation_agreement WHERE id=$1", [
          id,
        ])
      ).rows[0];
    if (!a) throw Error("NOT_FOUND");
    if (b.operation === "review") {
      if (typeof b.approved !== "boolean") throw Error("INVALID_APPROVAL");
      if (b.approved) {
        const m = await currentMandate(c, a.seller_supplier_id);
        if (m?.mode !== "AGENCY") throw Error("CONFLICT_CURATION_SELLER");
      }
      const old = (
        await c.query(
          "SELECT approved FROM didar_curation_review WHERE agreement_id=$1",
          [id],
        )
      ).rows[0];
      if (old && old.approved !== b.approved)
        throw Error("CONFLICT_IMMUTABLE_CURATION");
      await c.query(
        "INSERT INTO didar_curation_review(agreement_id,approved,actor_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [id, b.approved, u.id, text(b.reason)],
      );
    } else if (b.operation === "revoke")
      await c.query(
        "INSERT INTO didar_curation_revocation(agreement_id,actor_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [id, u.id, text(b.reason)],
      );
    else throw Error("INVALID_OPERATION");
    await audit(c, u.id, "curation_" + b.operation, {
      agreement_id: id,
      store_supplier_id: a.store_supplier_id,
      seller_supplier_id: a.seller_supplier_id,
    });
    return { ok: true };
  });
}
