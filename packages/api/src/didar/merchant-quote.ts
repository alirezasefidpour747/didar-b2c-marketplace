import { curationQuote } from "./curation";
import { storeScope, assertOfferScope } from "./storefront";
import { transaction } from "./db";
import { integer, withPolicy } from "./pricing";
import {
  pricingLock,
  quoteOffer,
  publicPrice,
  cartPrice,
} from "./merchant-profiles";
export function paymentMethod(v: any) {
  const m = v ?? "CASH";
  if (!["CASH", "CREDIT"].includes(m))
    throw new Error("INVALID_PAYMENT_METHOD");
  return m;
}
export async function cartQuote(b: any, req: any = { headers: {} }) {
  if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 30)
    throw new Error("INVALID_LINES");
  const method = paymentMethod(b.payment_method);
  const seen = new Set();
  const input = b.lines
    .map((l: any) => {
      if (
        typeof l.offer_id !== "string" ||
        l.offer_id.length > 120 ||
        seen.has(l.offer_id)
      )
        throw new Error("INVALID_LINES");
      seen.add(l.offer_id);
      return {
        id: l.offer_id,
        quantity: integer(l.quantity, "QUANTITY", 1, 100),
      };
    })
    .sort((a: any, b: any) => a.id.localeCompare(b.id));
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await pricingLock(c);
    const scope = await storeScope(req, c);
    const raw = (await c.query("SELECT * FROM didar_rate WHERE id=1")).rows[0];
    if (Date.now() - new Date(raw.updated_at).getTime() > 86400000)
      throw new Error("CONFLICT_RATE_STALE");
    const rate = await withPolicy(c, raw);
    const lines: any[] = [];
    for (const l of input) {
      const {
        rows: [o],
      } = await c.query(
        `SELECT o.*,p.purity,p.title FROM didar_offer o JOIN didar_product p ON p.id=o.product_id JOIN didar_supplier s ON s.id=o.supplier_id WHERE o.id=$1 AND o.active AND o.quantity>=$2 AND s.active AND s.status='approved' AND p.active AND p.published AND p.approved AND didar_public_taxonomy(p.id,p.category_id)`,
        [l.id, l.quantity],
      );
      if (!o) throw new Error("CONFLICT_STOCK");
      await assertOfferScope(c, o, scope);
      lines.push({
        ...l,
        offer_id: o.id,
        version: o.version,
        supplier_id: o.supplier_id,
        title: o.title,
        breakdown: await curationQuote(
          c,
          o,
          scope,
          await quoteOffer(c, rate, o, method),
        ),
      });
    }
    const summary = cartPrice(lines, method);
    return {
      ...summary,
      rate_version: raw.version,
      order_charges: summary.order_charges.filter(
        (r: any) => r.payer === "CUSTOMER",
      ),
      lines: lines.map((l) => ({ ...l, breakdown: publicPrice(l.breakdown) })),
    };
  });
}
