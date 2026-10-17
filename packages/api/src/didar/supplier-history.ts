import { requireUser } from "./auth";
import { transaction } from "./db";
import { audit } from "./permissions";
/** Explicit lawful read-only exception after commercial suspension. Never calls
 * expiry, reservation, projection or settlement writers. No customer address,
 * competitor lines, payment authority, banking or current-stock editor data. */
export async function supplierHistory(req: any) {
  const u = await requireUser(req, ["supplier"]);
  if (req.method !== "GET") throw Error("FORBIDDEN");
  return transaction(async (c) => {
    const supplier = (
      await c.query(
        "SELECT id,name,status,active FROM didar_supplier WHERE id=$1",
        [u.supplier_id],
      )
    ).rows[0];
    if (
      !supplier ||
      (u.native_supplier_id && u.native_supplier_id !== supplier.id)
    )
      throw Error("FORBIDDEN");
    const orders = (
      await c.query(
        `SELECT o.id,o.status,o.created_at,l.id line_id,l.title,l.quantity,l.weight_mg,l.fulfillment_status,
      (SELECT json_agg(json_build_object('uid',i.uid,'weight_mg',i.weight_mg,'status',r.status))
       FROM didar_item_reservation r JOIN didar_inventory_item i ON i.id=r.item_id WHERE r.order_line_id=l.id) items
      FROM didar_order o JOIN didar_order_line l ON l.order_id=o.id
      WHERE l.supplier_id=$1 AND o.status='paid' ORDER BY o.created_at DESC,l.id LIMIT 200`,
        [supplier.id],
      )
    ).rows;
    const balances = (
      await c.query(
        `SELECT account,instrument,sum(delta)::text balance
      FROM didar_fin_posting WHERE party=$1 GROUP BY account,instrument ORDER BY account,instrument`,
        ["supplier:" + supplier.id],
      )
    ).rows;
    await audit(c, u.id, "supplier_history_read", {
      real_actor_id: u.id,
      target_merchant_id: supplier.id,
      supplier_id: supplier.id,
      surface: u.native_supplier_id ? "vendor" : "legacy",
      read_only: true,
    });
    return { supplier, orders, balances, read_only: true };
  });
}
