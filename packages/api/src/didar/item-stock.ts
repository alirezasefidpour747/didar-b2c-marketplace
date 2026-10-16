import { randomUUID } from "node:crypto";
/** Caller locks order then offers in sorted order, matching all release/payment paths. */
export async function reserveItems(
  c: any,
  line: any,
  orderLine: string,
  expires: any,
) {
  const { rows: items } = await c.query(
    "SELECT * FROM didar_inventory_item WHERE offer_id=$1 AND status='available' ORDER BY id FOR UPDATE",
    [line.id],
  );
  if (items.length < line.quantity) throw new Error("CONFLICT_STOCK");
  for (const item of items.slice(0, line.quantity)) {
    await c.query(
      "INSERT INTO didar_item_reservation(id,item_id,order_line_id,status,expires_at) VALUES($1,$2,$3,'reserved',$4)",
      [randomUUID(), item.id, orderLine, expires],
    );
    await c.query(
      "UPDATE didar_inventory_item SET status='reserved' WHERE id=$1",
      [item.id],
    );
  }
}
export async function finalizeItems(c: any, order: string, sold: boolean) {
  const { rows: lines } = await c.query(
    "SELECT * FROM didar_order_line WHERE order_id=$1 ORDER BY offer_id",
    [order],
  );
  for (const line of lines) {
    await c.query("SELECT id FROM didar_offer WHERE id=$1 FOR UPDATE", [
      line.offer_id,
    ]);
    if (line.stock_mode === "legacy") {
      if (!sold)
        await c.query(
          "UPDATE didar_offer SET quantity=quantity+$1,version=version+1 WHERE id=$2",
          [line.quantity, line.offer_id],
        );
      continue;
    }
    const { rows: reservations } = await c.query(
      "SELECT r.*,i.status item_status FROM didar_item_reservation r JOIN didar_inventory_item i ON i.id=r.item_id WHERE r.order_line_id=$1 AND r.status='reserved' ORDER BY i.id FOR UPDATE OF r,i",
      [line.id],
    );
    if (reservations.length !== line.quantity)
      throw new Error("CONFLICT_ITEM_RESERVATION");
    for (const r of reservations) {
      if (r.item_status !== "reserved") throw new Error("CONFLICT_ITEM_STATE");
      await c.query("UPDATE didar_inventory_item SET status=$1 WHERE id=$2", [
        sold ? "sold" : "available",
        r.item_id,
      ]);
      await c.query(
        "UPDATE didar_item_reservation SET status=$1,updated_at=now() WHERE id=$2",
        [sold ? "sold" : "released", r.id],
      );
    }
  }
}
