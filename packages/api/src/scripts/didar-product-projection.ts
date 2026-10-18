import type { ExecArgs } from "@medusajs/framework/types";
import {
  productProjectionStatus,
  reconcileProductProjection,
  runProductProjections,
} from "../didar/projection";
/** Explicit operator command. No HTTP exposure or automatic bulk historical backfill. */
export default async function project({ container }: ExecArgs) {
  if (process.env.DIDAR_PROJECTION_RECONCILE_ID)
    await reconcileProductProjection(process.env.DIDAR_PROJECTION_RECONCILE_ID);
  console.log(
    "DIDAR_PROJECTION_BATCH",
    JSON.stringify(await runProductProjections(container)),
  );
  console.log(
    "DIDAR_PROJECTION_STATUS",
    JSON.stringify(await productProjectionStatus()),
  );
}
