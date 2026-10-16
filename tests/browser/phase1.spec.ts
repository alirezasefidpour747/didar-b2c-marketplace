import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Pool } from "../../packages/api/node_modules/pg";
const db = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    readFileSync("packages/api/.env", "utf8")
      .match(/^DATABASE_URL=(.+)$/m)?.[1]
      ?.replace(/^['"]|['"]$/g, ""),
});
const tag = "physical-e2e-" + crypto.randomUUID(),
  password = "DidarPhysicalE2E2026!",
  email = tag + "@didar.test",
  buyer = tag + "-buyer@didar.test";
let product = "",
  supplierId = "";
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
}
async function getToken(page: Page) {
  return page.evaluate(() => sessionStorage.getItem("didar-session"));
}
const api = process.env.TEST_API_URL || "http://localhost:9000";
test.afterAll(async () => {
  // Physical identifiers/history are permanent: retire only these QA supplier/product records.
  if (product)
    await db.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=$1",
      [product],
    );
  if (supplierId)
    await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [
      supplierId,
    ]);
  await db.end();
});
test("admin UI creates supplier/product, weighs and tags units, posts stock; supplier read-only; real UID sale and RFID variance", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const a = await browser.newContext(),
    s = await browser.newContext(),
    c = await browser.newContext();
  const admin = await a.newPage(),
    supplier = await s.newPage(),
    customer = await c.newPage();
  try {
    await login(admin, "admin@didar.test", "DidarDemo2026!");
    await admin.goto("/manage");
    await admin
      .getByRole("button", { name: "کاتالوگ و تصاویر", exact: true })
      .click();
    const p = admin.getByTestId("product-form");
    await p.locator('[name="title"]').fill(tag);
    await p.locator('[name="purity"]').fill("750");
    await p.getByLabel("خانواده", { exact: true }).selectOption("jewelry");
    await p.getByLabel("دسته اصلی", { exact: true }).selectOption("rings");
    await p.locator('[name="category_id"]').selectOption("ring");
    await p.locator('[name="published"]').check();
    await p.locator('[name="attributes"]').fill('{"qa":"physical"}');
    await p.getByRole("button", { name: "ثبت در کاتالوگ Mercur" }).click();
    await expect
      .poll(
        async () =>
          (await db.query("SELECT id FROM didar_product WHERE title=$1", [tag]))
            .rows.length,
      )
      .toBe(1);
    product = (
      await db.query("SELECT id FROM didar_product WHERE title=$1", [tag])
    ).rows[0].id;
    await admin
      .getByRole("button", { name: "تأمین‌کنندگان", exact: true })
      .click();
    const sf = admin.locator("form").filter({
      has: admin.getByRole("heading", {
        name: "تأمین‌کننده جدید",
        exact: true,
      }),
    });
    await sf.locator('[name="name"]').fill(tag);
    await sf.locator('[name="email"]').fill(email);
    await sf.locator('[name="password"]').fill(password);
    await sf
      .getByRole("button", { name: "ثبت تأمین‌کننده", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.query("SELECT id FROM didar_supplier WHERE name=$1", [tag]))
            .rows.length,
      )
      .toBe(1);
    supplierId = (
      await db.query("SELECT id FROM didar_supplier WHERE name=$1", [tag])
    ).rows[0].id;
    await admin.goto("/manage/operations");
    const header = admin.getByTestId("intake-header");
    await header.locator('[name="supplier_id"]').selectOption(supplierId);
    await header.locator('[name="invoice_number"]').fill(tag);
    await header
      .getByRole("button", { name: "ایجاد پذیرش", exact: true })
      .click();
    const line = admin.getByTestId("intake-line");
    await expect(line).toBeVisible();
    await line.locator('[name="product_id"]').selectOption(product);
    await line
      .locator('[name="description"]')
      .fill("دو قطعه توزین واقعی آزمون");
    await line.locator('[name="quantity"]').fill("2");
    await line.locator('[name="total_weight_mg"]').fill("27000");
    await line.getByRole("button", { name: "افزودن ردیف" }).click();
    const weigh = admin.getByTestId("weigh-item");
    await expect(weigh).toBeVisible();
    for (const [n, mg] of [
      [1, 13000],
      [2, 14000],
    ]) {
      await weigh.locator('[name="weight_mg"]').fill(String(mg));
      await weigh.locator('[name="uid"]').fill(tag + "-" + n);
      await weigh.getByRole("button", { name: "ثبت قطعه با UID یکتا" }).click();
      const item = admin.locator(
        `[data-uid="${(tag + "-" + n).toUpperCase()}"]`,
      );
      await expect(item).toBeVisible();
      const pairing = item.getByTestId("epc-pair");
      await pairing
        .locator('[name="epc"]')
        .fill(
          "E299" +
            supplierId.replace(/-/g, "").slice(0, 10) +
            String(n).padStart(2, "0"),
        );
      await pairing
        .locator('[name="reason"]')
        .fill("Mock HID fixture; hardware unverified");
      await pairing.getByRole("button", { name: "اتصال / تعویض EPC" }).click();
      await expect(pairing.locator('[name="reason"]')).toBeEnabled();
    }
    await expect(admin.getByTestId("reconciliation")).toContainText(
      "اختلاف 0 میلی‌گرم",
    );
    await admin
      .getByRole("button", { name: "تأیید تطبیق پذیرش", exact: true })
      .click();
    await admin
      .getByRole("button", { name: "ثبت قطعی موجودی تأییدشده", exact: true })
      .click();
    await expect(admin.getByTestId("batch-detail")).toContainText(
      "ورود به موجودی",
    );
    await login(supplier, email, password);
    await supplier.goto("/manage/operations");
    await supplier
      .getByRole("button", { name: "قطعات و UID", exact: true })
      .click();
    await expect(supplier.locator("[data-uid]")).toHaveCount(2);
    await expect(supplier.getByTestId("epc-pair")).toHaveCount(0);
    await expect(supplier.getByTestId("intake-header")).toHaveCount(0);
    const registration = await fetch(api + "/didar/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: buyer, password, name: "Physical buyer" }),
    });
    expect(registration.status).toBe(200);
    await login(customer, buyer, password);
    await customer.goto("/products/" + product);
    const physical = (
      await db.query("SELECT * FROM didar_inventory_item WHERE uid=$1", [
        (tag + "-1").toUpperCase(),
      ])
    ).rows[0];
    await customer
      .locator(`[data-offer-id="${physical.offer_id}"]`)
      .getByRole("button", { name: "افزودن به سبد +" })
      .click();
    await customer
      .getByRole("link", { name: /سبد خرید/ })
      .first()
      .click();
    await customer.getByLabel("نام گیرنده").fill("خریدار قطعه واقعی");
    await customer.getByLabel("شماره همراه").fill("09123456789");
    await customer.getByLabel("شهر", { exact: true }).fill("تهران");
    await customer.getByLabel("نشانی کامل").fill("نشانی آزمایشی قطعه واقعی");
    await customer.getByLabel("کد پستی").fill("1234567890");
    await customer
      .getByRole("button", { name: "ثبت و تأیید قیمت سفارش" })
      .click();
    await expect(
      customer.getByText(physical.uid, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await db.query("SELECT status FROM didar_inventory_item WHERE id=$1", [
          physical.id,
        ])
      ).rows[0].status,
    ).toBe("reserved");
    await customer
      .getByRole("button", { name: "شبیه‌سازی پرداخت موفق", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT status FROM didar_inventory_item WHERE id=$1",
              [physical.id],
            )
          ).rows[0].status,
      )
      .toBe("sold");
    const order = (
      await db.query(
        "SELECT l.order_id FROM didar_item_reservation r JOIN didar_order_line l ON l.id=r.order_line_id WHERE r.item_id=$1",
        [physical.id],
      )
    ).rows[0].order_id;
    await admin.goto("/orders/" + order);
    await admin
      .getByRole("button", {
        name: "ثبت وضعیت: در حال آماده‌سازی",
        exact: true,
      })
      .click();
    await admin.getByLabel("کد رهگیری", { exact: true }).fill("PHYSICAL-QA");
    await admin.getByLabel("شرکت حمل", { exact: true }).fill("QA Carrier");
    await admin
      .getByRole("button", { name: "ثبت وضعیت: ارسال شده", exact: true })
      .click();
    await admin
      .getByRole("button", { name: "ثبت وضعیت: تحویل شده", exact: true })
      .click();
    await expect(admin.locator(".tracking")).toContainText("تحویل شده");
    await admin.goto("/manage/operations");
    await admin
      .getByRole("button", { name: "شمارش RFID", exact: true })
      .click();
    await admin
      .locator("form")
      .filter({
        has: admin.getByRole("button", { name: "شروع شمارش با تصویر موجودی" }),
      })
      .locator('[name="supplier_id"]')
      .selectOption(supplierId);
    await admin
      .getByRole("button", { name: "شروع شمارش با تصویر موجودی" })
      .click();
    const remaining = (
      await db.query(
        "SELECT uid FROM didar_inventory_item WHERE supplier_id=$1 AND status='available'",
        [supplierId],
      )
    ).rows[0].uid;
    const scan = admin.getByTestId("scan-form");
    await scan.locator('[name="scan"]').fill(remaining);
    await scan.locator('[name="scan"]').press("Enter");
    await expect(admin.getByTestId("count-summary")).toContainText(
      "دیده‌شده: 1",
    );
    await scan.locator('[name="scan"]').fill(remaining);
    await scan.locator('[name="scan"]').press("Enter");
    await expect(admin.getByTestId("count-summary")).toContainText(
      "تکرار خواندن: 1",
    );
    await scan.locator('[name="scan"]').fill(physical.uid);
    await scan.locator('[name="scan"]').press("Enter");
    await expect(
      admin.getByText("فروخته شده", { exact: false }).last(),
    ).toBeVisible();
    await scan.locator('[name="scan"]').fill("FFFFFFFFFFFFFFFF");
    await scan.locator('[name="scan"]').press("Enter");
    await expect(
      admin.getByText("ناشناخته", { exact: false }).last(),
    ).toBeVisible();
    await expect(admin.getByTestId("count-summary")).toContainText(
      "دیده‌نشده: 0",
    );
    await admin.screenshot({
      path: "/tmp/didar-phase1-evidence/count-journey.png",
      fullPage: true,
    });
  } finally {
    await Promise.all([a.close(), s.close(), c.close()]);
  }
});
