import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { Pool } from "../../packages/api/node_modules/pg";

const env =
  process.env.DATABASE_URL ||
  readFileSync("packages/api/.env", "utf8")
    .match(/^DATABASE_URL=(.+)$/m)?.[1]
    ?.replace(/^['"]|['"]$/g, "");
const db = new Pool({ connectionString: env });
const apiBase = process.env.TEST_API_URL || "http://localhost:9000";
const tag = `e2e-${crypto.randomUUID()}`;
const password = "DidarBrowserFixture2026!";
const title = `انگشتر آزمون ${tag}`;
const supplierEmail = `${tag}-supplier@didar.test`,
  customerEmail = `${tag}-customer@didar.test`;
let productId = "",
  supplierId = "",
  categoryId = "",
  subcategoryId = "",
  collectionId = "";

async function login(page: Page, email: string, pwd = password) {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill(pwd);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "حساب من", exact: true }).first(),
  ).toBeVisible();
}
async function register(page: Page, email: string, supplier: boolean) {
  await page.goto(supplier ? "/login?register=supplier" : "/login");
  if (!supplier)
    await page.getByRole("button", { name: "حساب ندارید؟ عضویت" }).click();
  await page
    .getByLabel("نام کامل / کسب‌وکار")
    .fill(supplier ? `تأمین آزمون ${tag}` : `مشتری آزمون ${tag}`);
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ایجاد حساب", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "حساب من", exact: true }).first(),
  ).toBeVisible();
}
async function post(action: string, body: unknown, token: string) {
  const response = await fetch(`${apiBase}/didar/${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, ...(await response.json()) };
}

test.afterAll(async () => {
  try {
    if (productId)
      await db.query(
        "UPDATE didar_product SET active=false,published=false WHERE id=$1",
        [productId],
      );
    if (supplierId)
      await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [
        supplierId,
      ]);
  } finally {
    await db.end();
  }
});

test("admin approves supplier, publishes imaged product; exact-weight purchase is paid once, allocated and delivered", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const adminContext = await browser.newContext(),
    supplierContext = await browser.newContext(),
    customerContext = await browser.newContext();
  const admin = await adminContext.newPage(),
    supplier = await supplierContext.newPage(),
    customer = await customerContext.newPage();
  try {
    await register(supplier, supplierEmail, true);
    supplierId = (
      await db.query("SELECT supplier_id FROM didar_user WHERE email=$1", [
        supplierEmail,
      ])
    ).rows[0].supplier_id;
    await expect(supplier.getByText(/در انتظار تأیید/).first()).toBeVisible();
    await login(admin, "admin@didar.test", "DidarDemo2026!");
    await admin.goto("/manage");
    await admin
      .getByRole("button", { name: "تأمین‌کنندگان", exact: true })
      .click();
    await admin
      .locator(`[data-supplier-id="${supplierId}"]`)
      .getByRole("button", { name: "تأیید تأمین‌کننده" })
      .click();
    await expect(
      admin.locator(`[data-supplier-id="${supplierId}"]`),
    ).toContainText("تأیید شده");

    // Supplier is read-only until an administrator delegates each required action in the UI.
    await admin.goto("/manage/operations");
    await admin
      .getByRole("button", { name: "مجوز تأمین‌کننده", exact: true })
      .click();
    for (const permission of ["CREATE_OWN_OFFER", "UPDATE_OWN_FULFILLMENT"]) {
      await admin
        .getByLabel(`تأمین آزمون ${tag} ` + permission, { exact: true })
        .check();
      await expect(
        admin.getByLabel(`تأمین آزمون ${tag} ` + permission, { exact: true }),
      ).toBeEnabled();
    }
    await admin.goto("/manage");
    await admin
      .getByRole("button", { name: "کاتالوگ و تصاویر", exact: true })
      .click();
    const category = admin.getByTestId("category-form");
    await category.locator('[name="name"]').fill(`حلقه آزمون ${tag}`);
    await category.locator('[name="slug"]').fill(tag);
    await category.getByRole("button", { name: /ثبت/ }).click();
    await expect
      .poll(
        async () =>
          (await db.query("SELECT id FROM didar_category WHERE slug=$1", [tag]))
            .rowCount,
      )
      .toBe(1);
    categoryId = (
      await db.query("SELECT id FROM didar_category WHERE slug=$1", [tag])
    ).rows[0].id;
    await category.locator('[name="name"]').fill(`زیرگروه آزمون ${tag}`);
    await category.locator('[name="slug"]').fill(`${tag}-child`);
    await category.locator('[name="parent_id"]').selectOption(categoryId);
    await category.getByRole("button", { name: /ثبت/ }).click();
    await expect
      .poll(
        async () =>
          (
            await db.query("SELECT id FROM didar_category WHERE slug=$1", [
              `${tag}-child`,
            ])
          ).rowCount,
      )
      .toBe(1);
    subcategoryId = (
      await db.query("SELECT id FROM didar_category WHERE slug=$1", [
        `${tag}-child`,
      ])
    ).rows[0].id;
    const form = admin.getByTestId("product-form");
    await form.locator('[name="title"]').fill(title);
    await form
      .locator('[name="description"]')
      .fill("محصول خودکار آزمون با تصویر سادهٔ تست، بدون عکس ساختگی طلا");
    await form.locator('[name="reference"]').fill(tag);
    await form.locator('[name="jewelry_type"]').fill("انگشتر");
    await form.locator('[name="purity"]').fill("750");
    await form.locator('[name="min_weight_mg"]').fill("6000");
    await form.locator('[name="max_weight_mg"]').fill("8000");
    await form
      .getByLabel("دسته اصلی", { exact: true })
      .selectOption(categoryId);
    await form.locator('[name="category_id"]').selectOption(subcategoryId);
    await form.locator('[name="published"]').check();
    await form.getByRole("button", { name: "ثبت در کاتالوگ Mercur" }).click();
    await expect
      .poll(
        async () =>
          (
            await db.query("SELECT id FROM didar_product WHERE reference=$1", [
              tag,
            ])
          ).rowCount,
      )
      .toBe(1);
    productId = (
      await db.query("SELECT id FROM didar_product WHERE reference=$1", [tag])
    ).rows[0].id;
    const collectionForm = admin.getByTestId("collection-form");
    await collectionForm.locator('[name="name"]').fill(`مجموعه آزمون ${tag}`);
    await collectionForm.locator('[name="slug"]').fill(`${tag}-collection`);
    await collectionForm
      .locator('[name="product_ids"]')
      .selectOption(productId);
    await collectionForm.getByRole("button", { name: "ثبت مجموعه" }).click();
    await expect
      .poll(
        async () =>
          (
            await db.query("SELECT id FROM didar_collection WHERE slug=$1", [
              `${tag}-collection`,
            ])
          ).rowCount,
      )
      .toBe(1);
    collectionId = (
      await db.query("SELECT id FROM didar_collection WHERE slug=$1", [
        `${tag}-collection`,
      ])
    ).rows[0].id;
    const editor = admin.locator(`[data-product-id="${productId}"]`);
    await editor.locator("summary").click();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWu0AAAAASUVORK5CYII=",
      "base64",
    );
    for (let i = 0; i < 2; i++) {
      await editor.getByLabel(`بارگذاری تصاویر ${title}`).setInputFiles({
        name: `test-fixture-${i}.png`,
        mimeType: "image/png",
        buffer: png,
      });
      await editor
        .locator(".image-manager > form")
        .getByLabel("توضیح تصویر")
        .fill(`تصویر ساده آزمون ${i + 1}`);
      await editor
        .getByRole("button", { name: "بارگذاری تصویر", exact: true })
        .click();
      await expect
        .poll(async () =>
          Number(
            (
              await db.query(
                "SELECT count(*) FROM didar_product_image WHERE product_id=$1",
                [productId],
              )
            ).rows[0].count,
          ),
        )
        .toBe(i + 1);
    }

    await supplier.reload();
    await expect(
      supplier.getByRole("heading", { name: "پنل تأمین‌کننده" }),
    ).toBeVisible();
    for (const [weight, quantity] of [
      [6200, 2],
      [6400, 1],
    ]) {
      const form = supplier.getByTestId("new-offer-form");
      await form.locator('[name="product_id"]').selectOption(productId);
      await form.locator('[name="weight_mg"]').fill(String(weight));
      await form.locator('[name="quantity"]').fill(String(quantity));
      await form.locator('[name="making_bps"]').fill("1200");
      await form.locator('[name="terms"]').fill("آماده‌سازی دو روزه");
      await form.getByRole("button", { name: "ثبت عرضه من" }).click();
      await expect
        .poll(
          async () =>
            (
              await db.query(
                "SELECT id FROM didar_offer WHERE product_id=$1 AND weight_mg=$2",
                [productId, weight],
              )
            ).rowCount,
        )
        .toBe(1);
    }

    await register(customer, customerEmail, false);
    await customer.goto(`/collections/${tag}-collection`);
    await expect(
      customer.getByRole("heading", {
        name: `مجموعه آزمون ${tag}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(customer.getByRole("heading", { name: title })).toBeVisible();
    await customer.goto(`/categories/${tag}`);
    await expect(customer.getByRole("heading", { name: title })).toBeVisible();
    await customer.getByLabel("وزن دقیق (گرم)").fill("6.2");
    const card = customer
      .locator(".product")
      .filter({ has: customer.getByRole("heading", { name: title }) });
    await expect(card.locator(".offer")).toHaveCount(1);
    await card.getByRole("heading", { name: title }).getByRole("link").click();
    await expect(customer).toHaveURL(
      new RegExp(`/products/${tag}/${tag}-child/product/${productId}$`),
    );
    await expect(customer.locator(".gallery-thumbs button")).toHaveCount(2);
    await expect(customer.locator(".gallery-main img")).toBeVisible();
    expect(
      await customer
        .locator(".gallery-main img")
        .evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0),
    ).toBe(true);
    await expect(customer.getByText(tag, { exact: true })).toBeVisible();
    await customer.screenshot({
      path: "/tmp/didar-evidence/desktop-product.png",
      fullPage: true,
    });
    await customer
      .locator(".offer")
      .filter({ hasText: "۶٫۲۰۰" })
      .getByRole("button", { name: "افزودن به سبد +" })
      .click();
    await customer
      .getByRole("link", { name: /سبد خرید/ })
      .first()
      .click();
    await customer.getByLabel("نام گیرنده").fill("مشتری آزمون");
    await customer.getByLabel("شماره همراه").fill("09123456789");
    await customer.getByLabel("شهر", { exact: true }).fill("تهران");
    await customer.getByLabel("نشانی کامل").fill("خیابان آزمون، پلاک ۱");
    await customer.getByLabel("کد پستی").fill("1234567890");
    await customer
      .getByRole("button", { name: "ثبت و تأیید قیمت سفارش" })
      .click();
    await expect(
      customer.getByRole("heading", { name: "درگاه پرداخت آزمایشی" }),
    ).toBeVisible();
    const orderId = new URL(customer.url()).pathname.split("/").pop()!;
    await customer
      .getByRole("button", { name: "شبیه‌سازی پرداخت موفق", exact: true })
      .click();
    await expect(
      customer.locator(`[data-order-id="${orderId}"]`),
    ).toContainText("پرداخت شده");
    const customerId = (
      await db.query("SELECT id FROM didar_user WHERE email=$1", [
        customerEmail,
      ])
    ).rows[0].id;
    expect(
      Number(
        (
          await db.query(
            "SELECT count(*) FROM didar_order WHERE customer_id=$1",
            [customerId],
          )
        ).rows[0].count,
      ),
    ).toBe(1);
    expect(
      (
        await db.query(
          "SELECT quantity FROM didar_offer WHERE product_id=$1 AND weight_mg=6200",
          [productId],
        )
      ).rows[0].quantity,
    ).toBe(1);
    expect(
      (
        await db.query(
          "SELECT quantity FROM didar_offer WHERE product_id=$1 AND weight_mg=6400",
          [productId],
        )
      ).rows[0].quantity,
    ).toBe(1);

    await supplier.goto(`/orders/${orderId}`);
    await expect(
      supplier.locator(`[data-order-id="${orderId}"]`),
    ).toContainText(title);
    await expect(
      supplier.locator(`[data-order-id="${orderId}"]`),
    ).toContainText("تخصیص به تأمین‌کننده");
    await admin.goto(`/orders/${orderId}`);
    const order = admin.locator(`[data-order-id="${orderId}"]`);
    await order
      .getByRole("button", { name: "ثبت وضعیت: در حال آماده‌سازی" })
      .click();
    await expect(order).toContainText("در حال آماده‌سازی");
    await order.getByLabel("کد رهگیری").fill(`TRACK-${tag}`);
    await order.getByLabel("شرکت حمل").fill("پست آزمایشی");
    await order.getByRole("button", { name: "ثبت وضعیت: ارسال شده" }).click();
    await expect(order).toContainText(`TRACK-${tag}`);
    await order.getByRole("button", { name: "ثبت وضعیت: تحویل شده" }).click();
    await expect(order).toContainText("تحویل شده");
    await customer.reload();
    await expect(
      customer.locator(`[data-order-id="${orderId}"]`),
    ).toContainText("تحویل شده");
    await expect(
      customer.locator(`[data-order-id="${orderId}"]`),
    ).toContainText(`TRACK-${tag}`);
    await customer.screenshot({
      path: "/tmp/didar-evidence/desktop-delivered-order.png",
      fullPage: true,
    });
  } finally {
    await Promise.all([
      adminContext.close(),
      supplierContext.close(),
      customerContext.close(),
    ]);
  }
});
