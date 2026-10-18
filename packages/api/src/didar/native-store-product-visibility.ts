import { db } from "./db";

/** Native public reads cannot publish a private DIDAR projection. Native-only
 * products retain Mercur's own rules; DIDAR-tagged orphans fail closed. This is
 * a read adapter, not a new Product, Offer, pricing or checkout authority. */
export async function hiddenNativeStoreProducts(): Promise<string[]> {
  return (
    await db.query(`SELECT p.id FROM product p
      LEFT JOIN didar_product d ON d.native_id=p.id
      WHERE (d.id IS NOT NULL OR p.metadata->>'didar'='true')
      AND NOT COALESCE(d.active AND d.approved AND d.published
        AND didar_public_taxonomy(d.id,d.category_id)
        AND didar_visible_product(d.id,NULL),false)`)
  ).rows.map((p: any) => p.id);
}
