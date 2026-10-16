import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Pool } from "../packages/api/node_modules/pg";
test("clean and repeat additive migrations preserve legacy stock and paid snapshots without invented units", async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await db.connect();
  const schema = "qa_migration_" + crypto.randomUUID().replaceAll("-", "");
  try {
    await c.query("CREATE SCHEMA " + schema);
    await c.query("SET search_path TO " + schema);
    for (const file of ["schema.sql", "commerce-schema.sql"])
      await c.query(readFileSync("packages/api/src/didar/" + file, "utf8"));
    await c.query(
      "INSERT INTO didar_supplier(id,name) VALUES('legacy','legacy')",
    );
    await c.query(
      "INSERT INTO didar_product(id,title,category,purity) VALUES('p','historic','gold',750)",
    );
    await c.query(
      "INSERT INTO didar_offer(id,product_id,supplier_id,weight_mg,quantity,labor_irr,margin_bps) VALUES('o','p','legacy',1000,7,123,700)",
    );
    await c.query(
      "INSERT INTO didar_user(id,email,name,password,role) VALUES('u','migration@example.test','legacy','not-a-real-password-hash','customer')",
    );
    await c.query(
      `INSERT INTO didar_order(id,customer_id,idempotency_key,total_irr,status,address,rate_snapshot) VALUES('old','u','old',123,'paid','{}','{"historic_rate":123}')`,
    );
    await c.query(
      `INSERT INTO didar_order_line(id,order_id,offer_id,supplier_id,title,weight_mg,quantity,breakdown) VALUES('l','old','o','legacy','historic',1000,1,'{"historic_price":123}')`,
    );
    for (let n = 0; n < 2; n++)
      for (const file of [
        "schema.sql",
        "commerce-schema.sql",
        "phase1-schema.sql",
        "taxonomy-schema.sql",
      ])
        await c.query(readFileSync("packages/api/src/didar/" + file, "utf8"));
    expect(
      (
        await c.query(
          "SELECT quantity,stock_mode FROM didar_offer WHERE id='o'",
        )
      ).rows[0],
    ).toEqual({ quantity: 7, stock_mode: "legacy" });
    expect(
      (
        await c.query(
          "SELECT breakdown,stock_mode FROM didar_order_line WHERE id='l'",
        )
      ).rows[0],
    ).toEqual({ breakdown: { historic_price: 123 }, stock_mode: "legacy" });
    expect(
      (await c.query("SELECT published FROM didar_product WHERE id='p'"))
        .rows[0].published,
    ).toBe(false);
    expect(
      (await c.query("SELECT product_id FROM didar_taxonomy_migration_draft"))
        .rows,
    ).toEqual([{ product_id: "p" }]);
    expect(
      (await c.query("SELECT count(*)::int n FROM didar_inventory_item"))
        .rows[0].n,
    ).toBe(0);
    expect(
      (await c.query("SELECT count(*)::int n FROM didar_supplier_permission"))
        .rows[0].n,
    ).toBe(0);
  } finally {
    await c.query("ROLLBACK");
    await c.query("SET search_path TO public");
    await c.query("DROP SCHEMA " + schema + " CASCADE");
    c.release();
    await db.end();
  }
});
