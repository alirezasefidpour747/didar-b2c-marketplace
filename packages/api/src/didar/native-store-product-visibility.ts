import { db } from "./db";

/** Native public reads cannot publish a private DIDAR projection. Native-only
 * products retain Mercur's own rules; DIDAR-tagged orphans fail closed. This is
 * a read adapter, not a new Product, Offer, pricing or checkout authority. */
export async function hiddenNativeStoreProducts(): Promise<string[]> {
  return (
    await db.query(`SELECT p.id FROM product p
      LEFT JOIN didar_product d ON d.native_id=p.id
      LEFT JOIN didar_product_projection s ON s.product_id=d.id
      WHERE (d.id IS NOT NULL OR p.metadata->>'didar'='true')
      AND NOT COALESCE(d.active AND d.approved AND d.published
        AND didar_public_taxonomy(d.id,d.category_id)
        AND didar_visible_product(d.id,NULL)
        AND (s.product_id IS NULL OR (s.projected_revision=s.source_revision
          AND p.metadata->>'didar_projection_revision'=s.source_revision::text)),false)`)
  ).rows.map((p: any) => p.id);
}
