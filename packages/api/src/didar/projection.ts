import { db, transaction } from "./db";
import { createHash } from "node:crypto";

/** Only mirrors descriptive Product fields. Never writes Offer, stock or commerce. */
export async function writeNativeProjection(
  scope: any,
  product: any,
  revision: string,
) {
  if (!product.native_id) throw Error("PROJECTION_MISSING_NATIVE_ID");
  const { ContainerRegistrationKeys } =
    await import("@medusajs/framework/utils");
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "metadata",
      "variants.id",
      "options.title",
      "options.values.value",
    ],
    filters: { id: product.native_id },
  });
  const metadata = {
    didar: true,
    didar_master_id: product.id,
    didar_projection_revision: revision,
    purity: product.purity,
    reference: product.reference,
    jewelry_type: product.jewelry_type,
    min_weight_mg: product.min_weight_mg,
    max_weight_mg: product.max_weight_mg,
  };
  const input: any = {
    id: product.native_id,
    title: product.title,
    description: product.description,
    status:
      product.active && product.published && product.approved
        ? "published"
        : "draft",
    metadata,
  };
  if (data.length) {
    const native = data[0];
    // Existing links predate master metadata; exact canonical native_id plus
    // original DIDAR marker is accepted. Never adopt a foreign Product by ID.
    if (
      native.metadata?.didar !== true ||
      (native.metadata?.didar_master_id &&
        native.metadata.didar_master_id !== product.id)
    )
      throw Error("PROJECTION_NATIVE_ID_COLLISION");
    const { updateProductsWorkflow } =
      await import("@medusajs/medusa/core-flows");
    await updateProductsWorkflow(scope).run({ input: { products: [input] } });
    // Mercur creates the Product before its Standard variant in a later step.
    // A process can die between those independent commits. Repair that narrow
    // partial projection through its original supported variant workflow.
    if (!(native.variants || []).length) {
      const option = (native.options || []).find(
        (o: any) => o.title === "__default__",
      );
      if (!option?.values?.some((v: any) => v.value === "__default__"))
        throw Error("PROJECTION_PARTIAL_NATIVE_OPTIONS");
      const { createProductVariantsWorkflow } =
        await import("@medusajs/medusa/core-flows");
      await createProductVariantsWorkflow(scope).run({
        input: {
          product_variants: [
            {
              id:
                "variant_didar_" +
                createHash("md5").update(product.id).digest("hex"),
              product_id: product.native_id,
              title: "Standard",
              manage_inventory: false,
              options: { __default__: "__default__" },
            } as any,
          ],
        },
      });
    }
  } else {
    const { createProductsWorkflow } = await import("@mercurjs/core/workflows");
    await createProductsWorkflow(scope).run({
      input: {
        // Service projection, not a new identity; original actual actor is in DIDAR audit.
        created_by: "didar-product-projection",
        products: [
          {
            ...input,
            handle: `didar-${product.id}`,
            variants: [{ title: "Standard" }],
          },
        ],
      },
    });
  }
}

export type ProjectionOptions = {
  productId?: string;
  limit?: number;
  /** Programmatic fault seam for disposable process tests; never HTTP/config input. */
  write?: typeof writeNativeProjection;
  afterNative?: (product: any, revision: string) => Promise<void>;
};
export async function runProductProjections(
  scope: any,
  options: ProjectionOptions = {},
) {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const result: any[] = [];
  for (let i = 0; i < limit; i++) {
    const processed = await transaction(async (c) => {
      // Source first in every path, matching Product writers. Crash drops this
      // lock; jobs need no volatile lease and are immediately retryable.
      const {
        rows: [p],
      } = await c.query(
        `SELECT p.* FROM didar_product p
        WHERE ($1::text IS NULL OR p.id=$1) AND EXISTS (
          SELECT 1 FROM didar_product_projection_job j JOIN didar_product_projection s USING(product_id)
          WHERE j.product_id=p.id AND j.revision=s.source_revision
            AND j.status IN ('PENDING','RETRY') AND j.available_at<=now())
        ORDER BY p.id LIMIT 1 FOR UPDATE OF p SKIP LOCKED`,
        [options.productId || null],
      );
      if (!p) return null;
      const {
        rows: [state],
      } = await c.query(
        "SELECT * FROM didar_product_projection WHERE product_id=$1 FOR UPDATE",
        [p.id],
      );
      const revision = String(state.source_revision);
      await c.query(
        `UPDATE didar_product_projection_job SET status='SUPERSEDED',updated_at=now()
        WHERE product_id=$1 AND revision<$2 AND status IN ('PENDING','RETRY','FAILED')`,
        [p.id, revision],
      );
      try {
        await (options.write || writeNativeProjection)(scope, p, revision);
        await options.afterNative?.(p, revision);
        await c.query(
          "UPDATE didar_product_projection SET projected_revision=$2,updated_at=now() WHERE product_id=$1",
          [p.id, revision],
        );
        await c.query(
          "UPDATE didar_product_projection_job SET status='DONE',error_code=NULL,updated_at=now() WHERE product_id=$1 AND revision=$2",
          [p.id, revision],
        );
        return { product_id: p.id, revision, status: "DONE" };
      } catch (error: any) {
        // No inverse write can race a newer source revision. Retry forward from
        // authoritative committed state. Persist only a code, never payload/secrets.
        const code =
          error?.message === "PROJECTION_NATIVE_ID_COLLISION"
            ? error.message
            : "NATIVE_PROJECTION_FAILED";
        const {
          rows: [job],
        } = await c.query(
          `UPDATE didar_product_projection_job
          SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'FAILED' ELSE 'RETRY' END,
          available_at=now()+make_interval(secs=>least(300,5*power(2,attempts)::integer)),
          error_code=$3,updated_at=now() WHERE product_id=$1 AND revision=$2 RETURNING status,attempts`,
          [p.id, revision, code],
        );
        return { product_id: p.id, revision, ...job, error_code: code };
      }
    });
    if (!processed) break;
    result.push(processed);
  }
  return result;
}

/** Explicit operator repair; does not touch source data or revive older revisions. */
export async function reconcileProductProjection(productId: string) {
  return transaction(async (c) => {
    const {
      rows: [p],
    } = await c.query("SELECT id FROM didar_product WHERE id=$1 FOR UPDATE", [
      productId,
    ]);
    if (!p) throw Error("NOT_FOUND");
    const {
      rows: [state],
    } = await c.query(
      "SELECT * FROM didar_product_projection WHERE product_id=$1 FOR UPDATE",
      [productId],
    );
    if (!state) throw Error("PROJECTION_NOT_TRACKED");
    await c.query(
      `UPDATE didar_product_projection_job SET status='PENDING',attempts=0,error_code=NULL,
      available_at=now(),updated_at=now() WHERE product_id=$1 AND revision=$2`,
      [productId, state.source_revision],
    );
    return { product_id: productId, revision: String(state.source_revision) };
  });
}
export async function productProjectionStatus() {
  return (
    await db.query(`SELECT s.*,j.status,j.attempts,j.available_at,j.error_code FROM didar_product_projection s
    JOIN didar_product_projection_job j ON j.product_id=s.product_id AND j.revision=s.source_revision
    ORDER BY s.updated_at DESC LIMIT 200`)
  ).rows;
}
