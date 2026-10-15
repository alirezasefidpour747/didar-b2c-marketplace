import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Pool } from "../../packages/api/node_modules/pg";

const connectionString =
  process.env.DATABASE_URL ||
  readFileSync("packages/api/.env", "utf8")
    .match(/^DATABASE_URL=(.+)$/m)?.[1]
    ?.replace(/^['"]|['"]$/g, "");
const db = new Pool({ connectionString });
const tag = `expiry-e2e-${crypto.randomUUID()}`,
  productId = tag,
  offerId = `${tag}-offer`,
  email = `${tag}@didar.test`;
const password = "DidarExpiryFixture2026!";
const apiBase = process.env.TEST_API_URL || "http://localhost:9000";
let customerId = "";

test.beforeAll(async () => {
  const response = await fetch(`${apiBase}/didar/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: "مشتری آزمون انقضا" }),
  });
  expect(response.status).toBe(200);
  customerId = (await response.json()).user.id;
  await db.query(
    "INSERT INTO didar_product(id,title,category,purity) VALUES($1,$2,'QA expiry',750)",
    [productId, tag],
  );
  await db.query(
    "INSERT INTO didar_offer(id,product_id,supplier_id,weight_mg,quantity,labor_irr,margin_bps) VALUES($1,$2,'s1',4567,2,100000,500)",
    [offerId, productId],
  );
});
test.afterAll(async () => {
  try {
    const orders = (
      await db.query("SELECT id FROM didar_order WHERE customer_id=$1", [
        customerId,
      ])
    ).rows.map((o: any) => o.id);
    await db.query(
      "DELETE FROM didar_order_line WHERE order_id=ANY($1::text[])",
      [orders],
    );
    await db.query("DELETE FROM didar_order WHERE id=ANY($1::text[])", [
      orders,
    ]);
    await db.query("DELETE FROM didar_offer WHERE id=$1", [offerId]);
    await db.query("DELETE FROM didar_product WHERE id=$1", [productId]);
    await db.query("DELETE FROM didar_audit WHERE actor_id=$1", [customerId]);
    await db.query("DELETE FROM didar_session WHERE user_id=$1", [customerId]);
    await db.query("DELETE FROM didar_user WHERE id=$1", [customerId]);
  } finally {
    await db.end();
  }
});

test("expired reservation is shown to the customer and restores available pieces", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  await page.goto("/account");
  await page.getByLabel("نام کامل", { exact: true }).fill("مشتری آزمون انقضا");
  await page.getByLabel("شماره همراه", { exact: true }).fill("09123456789");
  await page.getByLabel("شهر", { exact: true }).fill("تهران");
  await page
    .getByLabel("نشانی کامل", { exact: true })
    .fill("نشانی ذخیره‌شده آزمون");
  await page.getByLabel("کد پستی", { exact: true }).fill("1234567890");
  await page.getByRole("button", { name: "ذخیره اطلاعات حساب" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "اطلاعات حساب ذخیره شد." }),
  ).toBeVisible();
  expect(
    (await db.query("SELECT address FROM didar_user WHERE id=$1", [customerId]))
      .rows[0].address.city,
  ).toBe("تهران");
  await page.goto(`/products/${productId}`);
  await page.getByRole("button", { name: "افزودن به سبد +" }).click();
  await page
    .getByRole("link", { name: /سبد خرید/ })
    .first()
    .click();
  await page.getByLabel("نام گیرنده").fill("مشتری آزمون");
  await page.getByLabel("شماره همراه").fill("09123456789");
  await page.getByLabel("شهر", { exact: true }).fill("تهران");
  await page.getByLabel("نشانی کامل").fill("نشانی آزمون انقضا");
  await page.getByLabel("کد پستی").fill("1234567890");
  await page.getByRole("button", { name: "ثبت و تأیید قیمت سفارش" }).click();
  await expect(
    page.getByRole("heading", { name: "درگاه پرداخت آزمایشی" }),
  ).toBeVisible();
  const orderId = new URL(page.url()).pathname.split("/").pop()!;
  expect(
    (await db.query("SELECT quantity FROM didar_offer WHERE id=$1", [offerId]))
      .rows[0].quantity,
  ).toBe(1);
  await db.query(
    "UPDATE didar_order SET expires_at=now()-interval '1 second' WHERE id=$1 AND customer_id=$2",
    [orderId, customerId],
  );
  await page.reload();
  await expect(page.locator(`[data-order-id="${orderId}"]`)).toContainText(
    "منقضی شده",
  );
  await expect(
    page.getByRole("button", { name: "شبیه‌سازی پرداخت موفق" }),
  ).toHaveCount(0);
  expect(
    (await db.query("SELECT quantity FROM didar_offer WHERE id=$1", [offerId]))
      .rows[0].quantity,
  ).toBe(2);
  await page.reload();
  expect(
    (await db.query("SELECT quantity FROM didar_offer WHERE id=$1", [offerId]))
      .rows[0].quantity,
  ).toBe(2);
});
