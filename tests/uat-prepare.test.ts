import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { finDB } from "./financial-helpers";
import { number } from "../apps/storefront/src/components/didar/locale";
test("Gate 5 Mac UAT preparation creates an isolated exact 20-UID dataset and repeat keeps business records unchanged", async () => {
  mkdirSync(".local", { recursive: true });
  const cwd = mkdtempSync(".local/uat-prepare-test-");
  const prepare = () =>
    spawnSync("node", [resolve("scripts/uat-prepare.mjs")], {
      cwd,
      env: { ...process.env, DIDAR_UAT_API_URL: process.env.TEST_API_URL },
      encoding: "utf8",
    });
  const first = prepare();
  expect(first.status, first.stderr).toBe(0);
  const manifest = JSON.parse(
    readFileSync(resolve(cwd, ".local/financial-uat.json"), "utf8"),
  );
  expect(manifest.items).toHaveLength(20);
  expect(new Set(manifest.items.map((i: any) => i.uid)).size).toBe(20);
  expect(manifest.grouped_product).not.toBe(manifest.example_product);
  const before = (
    await finDB.query(
      "SELECT i.* FROM didar_inventory_item i JOIN didar_intake_line l ON l.id=i.line_id WHERE l.batch_id=$1 ORDER BY i.id",
      [manifest.batch_id],
    )
  ).rows;
  const lines = (
    await finDB.query(
      "SELECT quantity,total_weight_mg FROM didar_intake_line WHERE batch_id=$1 ORDER BY quantity",
      [manifest.batch_id],
    )
  ).rows;
  expect(lines).toEqual([
    { quantity: 1, total_weight_mg: 100000 },
    { quantity: 2, total_weight_mg: 127000 },
    { quantity: 5, total_weight_mg: 135000 },
    { quantity: 12, total_weight_mg: 117000 },
  ]);
  expect(prepare().status).toBe(0);
  expect(
    (
      await finDB.query(
        "SELECT i.* FROM didar_inventory_item i JOIN didar_intake_line l ON l.id=i.line_id WHERE l.batch_id=$1 ORDER BY i.id",
        [manifest.batch_id],
      )
    ).rows,
  ).toEqual(before);
  const binding = (
    await finDB.query(
      "SELECT count(*)::int n FROM didar_item_rfid_binding b JOIN didar_inventory_item i ON i.id=b.item_id JOIN didar_intake_line l ON l.id=i.line_id WHERE l.batch_id=$1 AND b.active",
      [manifest.batch_id],
    )
  ).rows[0].n;
  expect(binding).toBe(20);
  const obligations = (
    await finDB.query(
      "SELECT count(*)::int n FROM didar_fin_event WHERE supplier_id=$1 AND kind='SALE_EXPOSURE'",
      [manifest.supplier_id],
    )
  ).rows[0].n;
  expect(obligations).toBe(0);
}, 15000);
test("Gate 5 Persian integer formatting preserves IRR beyond JavaScript safe-number precision", () => {
  expect(number("900000000000000001")).toBe(
    new Intl.NumberFormat("fa-IR").format(BigInt("900000000000000001")),
  );
  expect(number("-900000000000000001")).toBe(
    new Intl.NumberFormat("fa-IR").format(BigInt("-900000000000000001")),
  );
});
