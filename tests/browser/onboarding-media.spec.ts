import { test, expect } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
import sharp from "../../packages/api/node_modules/sharp";
import { randomBytes } from "node:crypto";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const supplierIds: string[] = [],
  productIds: string[] = [];
test.afterAll(async () => {
  if (supplierIds.length)
    await db.query(
      "UPDATE didar_supplier SET active=false WHERE id=ANY($1::text[])",
      [supplierIds],
    );
  if (productIds.length)
    await db.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=ANY($1::text[])",
      [productIds],
    );
  await db.end();
});
async function api(page: any, action: string, body?: any, token = "") {
  const r = await page.request.fetch("/api/didar/" + action, {
    method: body ? "POST" : "GET",
    headers: { authorization: "Bearer " + token },
    ...(body ? { data: body } : {}),
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
async function login(page: any, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
  return page.evaluate(() => sessionStorage.getItem("didar-session"));
}
test("Persian assisted wizard registers a merchant, proposes one shared master, processes a large camera file, approves real WebP media and preserves private store access", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const admin = await login(page, "admin@didar.test", "DidarDemo2026!");
  const tag = "onboarding-ui-" + crypto.randomUUID().slice(0, 8),
    email = tag + "@didar.test",
    password = "DidarOnboarding2026!";
  const reg = await api(page, "register", {
    name: "فروشنده تصویر " + tag,
    supplier_name: "گالری تصویر " + tag,
    email,
    password,
    role: "supplier",
  });
  const sid = reg.user.supplier_id;
  supplierIds.push(sid);
  const merchantContext = await browser.newContext(),
    merchant = await merchantContext.newPage();
  await login(merchant, email, password);
  await merchant.goto("/manage/onboarding");
  await expect(
    merchant.getByText("درخواست عضویت شما ثبت شده است.", { exact: false }),
  ).toBeVisible();
  await api(
    page,
    "manage",
    { kind: "supplier_state", id: sid, status: "approved", active: true },
    admin,
  );
  await api(
    page,
    "permissions",
    { supplier_id: sid, permission: "REQUEST_PRODUCT_CREATION", granted: true },
    admin,
  );
  await merchant.reload();
  await expect(
    merchant.getByRole("heading", {
      name: "۱. انتخاب محصول مشترک یا پیشنهاد محصول جدید",
      exact: true,
    }),
  ).toBeVisible();
  const form = merchant.locator("form").filter({
    has: merchant.getByRole("button", {
      name: "ارسال برای بررسی دیدار",
      exact: true,
    }),
  });
  await form.getByLabel("نام", { exact: true }).fill("محصول تصویر " + tag);
  await form
    .getByLabel("توضیحات", { exact: true })
    .fill("تصویر آزمایشی رنگ و جهت، بدون عکس تجاری");
  await form.getByLabel("خانواده", { exact: true }).selectOption("jewelry");
  await form.getByLabel("دسته اصلی", { exact: true }).selectOption("rings");
  await form.getByLabel("زیردسته", { exact: true }).selectOption("ring");
  await form.getByLabel("SKU فروشنده", { exact: true }).fill("QA-CAMERA-UID");
  await form
    .getByRole("button", { name: "ارسال برای بررسی دیدار", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        (
          await db.query(
            "SELECT count(*) n FROM didar_product_request WHERE supplier_id=$1",
            [sid],
          )
        ).rows[0].n,
      ),
    )
    .toBe(1);
  const request = (
    await db.query(
      "SELECT id FROM didar_product_request WHERE supplier_id=$1",
      [sid],
    )
  ).rows[0];
  // Actual JPEG larger than the ordinary JSON proxy budget; synthetic noise, not commercial jewelry photography.
  const file = await sharp(randomBytes(1800 * 1200 * 3), {
    raw: { width: 1800, height: 1200, channels: 3 },
  })
    .jpeg({ quality: 92 })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Artist: "PRIVATE QA CAMERA" } })
    .toBuffer();
  expect(file.length).toBeGreaterThan(1_200_000);
  await merchant
    .getByLabel("محصول یا درخواست تصویر", { exact: true })
    .selectOption("r:" + request.id);
  await merchant.getByLabel("فایل تصویر", { exact: true }).setInputFiles({
    name: "qa-camera.jpg",
    mimeType: "image/jpeg",
    buffer: file,
  });
  await merchant
    .getByLabel("شرح دسترس‌پذیر تصویر", { exact: true })
    .fill("آزمون رنگ و جهت تصویر " + tag);
  await merchant
    .getByRole("button", { name: "پردازش و ذخیره تصویر", exact: true })
    .click();
  await expect(merchant.getByTestId("media-receipt")).toContainText(
    "تصویر دریافت و بهینه شد",
  );
  const asset = (
    await db.query(
      "SELECT id,receipt,uploaded_by,status FROM didar_media_asset WHERE supplier_id=$1",
      [sid],
    )
  ).rows[0];
  expect(asset.status).toBe("pending");
  expect(asset.receipt.source.bytes).toBe(file.length);
  expect(asset.receipt.normalized.width).toBe(1200);
  expect(asset.receipt.normalized.height).toBe(1800);
  expect(asset.receipt.variants.length).toBe(3);
  const anonymous = await browser.newContext(),
    shop = await anonymous.newPage();
  expect(
    (await shop.request.get("/api/didar/image?id=" + asset.id)).status(),
  ).toBe(404);
  await page.goto("/manage/onboarding");
  await page
    .getByLabel("فروشنده برای همراهی", { exact: true })
    .selectOption(sid);
  const row = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "محصول تصویر " + tag,
        exact: true,
      }),
    })
    .first();
  await row
    .getByLabel("دلیل بررسی محصول", { exact: true })
    .fill("بازبینی واقعی محصول آزمایشی");
  await row
    .getByRole("button", { name: "ثبت بررسی محصول", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db.query(
            "SELECT status FROM didar_product_request WHERE id=$1",
            [request.id],
          )
        ).rows[0].status,
    )
    .toBe("approved");
  const pid = (
    await db.query("SELECT product_id FROM didar_product_request WHERE id=$1", [
      request.id,
    ])
  ).rows[0].product_id;
  productIds.push(pid);
  const mediaRow = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "آزمون رنگ و جهت تصویر " + tag,
      exact: true,
    }),
  });
  await mediaRow
    .getByLabel("دلیل بررسی تصویر", { exact: true })
    .fill("تأیید تصویر بهینه بدون EXIF");
  await mediaRow
    .getByRole("button", { name: "ثبت بررسی تصویر", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db.query("SELECT status FROM didar_media_asset WHERE id=$1", [
            asset.id,
          ])
        ).rows[0].status,
    )
    .toBe("approved");
  const mp = (body: any) =>
    api(
      page,
      "merchant-pricing",
      { reason: "Explicit synthetic onboarding profile approval", ...body },
      admin,
    );
  const taxPolicy = await mp({
    operation: "tax_policy_save",
    code: tag.replaceAll("-", "_"),
    name: tag,
  });
  const tax = await mp({
    operation: "tax_draft",
    policy_id: taxPolicy.id,
    bps: 1000,
    taxable_components: ["making", "distribution", "retail", "credit"],
  });
  await mp({ operation: "tax_review", id: tax.id, approved: true });
  const profile = await mp({
    operation: "profile_save",
    code: tag.replaceAll("-", "_"),
    name: "پروفایل خرده‌فروش تصویر",
    merchant_types: ["RETAILER"],
  });
  const version = await mp({
    operation: "version_draft",
    profile_id: profile.id,
    tax_version_id: tax.id,
    rules: ["distribution", "retail", "credit"].map((code) => ({
      code,
      label: code,
      component: code,
      mode: "PERCENT",
      basis: "GOLD_BASE_750_IRR",
      value: code === "distribution" ? 300 : code === "credit" ? 250 : 0,
      scope: "ITEM",
      payer: "CUSTOMER",
      recipient: "DIDAR",
      application_mode: "ALWAYS",
    })),
  });
  await mp({ operation: "version_review", id: version.id, approved: true });
  await mp({
    operation: "classify",
    supplier_id: sid,
    commercial_type: "RETAILER",
    revision: 1,
  });
  await mp({
    operation: "assign",
    supplier_id: sid,
    profile_version_id: version.id,
  });
  const batch = (
    await api(
      page,
      "intake",
      {
        operation: "create",
        supplier_id: sid,
        invoice_number: tag,
        reference_purity: 750,
      },
      admin,
    )
  ).id;
  const line = (
    await api(
      page,
      "intake",
      {
        operation: "line",
        batch_id: batch,
        product_id: pid,
        description: "Actual measured onboarding piece",
        quantity: 1,
        total_weight_mg: 2350,
        purity: 750,
        making_mode: "percent",
        making_bps: 1200,
        details: {
          supplier_sku: "QA-CAMERA-UID",
          onboarding_request_id: request.id,
        },
      },
      admin,
    )
  ).id;
  await api(
    page,
    "intake",
    { operation: "item", batch_id: batch, line_id: line, weight_mg: 2350 },
    admin,
  );
  await api(page, "intake", { operation: "verify", batch_id: batch }, admin);
  await api(page, "intake", { operation: "post", batch_id: batch }, admin);
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM didar_inventory_item WHERE supplier_id=$1 AND product_id=$2 AND status='available'",
        [sid, pid],
      )
    ).rows[0].n,
  ).toBe(1);
  const handle = "media-" + crypto.randomUUID().slice(0, 8);
  await api(
    page,
    "storefront",
    {
      kind: "save",
      supplier_id: sid,
      handle,
      name: "گالری تصویر",
      intro: "ویترین پردازش‌شده آزمایشی",
      visibility: "UNLISTED_LINK",
      approved: true,
      published: true,
    },
    admin,
  );
  await shop.goto(
    "/m/" +
      handle +
      "/products/" +
      (
        await db.query("SELECT public_key FROM didar_product WHERE id=$1", [
          pid,
        ])
      ).rows[0].public_key,
  );
  await expect(
    shop.getByRole("heading", { name: "محصول تصویر " + tag, exact: true }),
  ).toBeVisible();
  const scopedCatalog = await (
    await shop.request.get("/api/didar/catalog")
  ).json();
  const offer = scopedCatalog.products.find((p: any) => p.id === pid).offers[0];
  expect(offer.stock_mode).toBe("itemized");
  expect(offer.price.merchant_profile.version_id).toBe(version.id);
  expect(offer.price.credit_irr).toBeGreaterThan(0);
  const img = shop.locator(".gallery-main img");
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("srcset", /variant=card/);
  await expect
    .poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  const response = await shop.request.get(
    "/api/didar/image?id=" + asset.id + "&variant=zoom",
  );
  expect(response.headers()["content-type"]).toContain("image/webp");
  const meta = await sharp(await response.body()).metadata();
  expect(meta.exif).toBeUndefined();
  expect(meta.orientation).toBeUndefined();
  const og = await shop
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(og).toContain("preview_store=" + handle);
  const previewPath = new URL(og!, shop.url());
  const bot = await browser.newContext();
  const publicImage = await bot.request.get(
    previewPath.pathname + previewPath.search,
  );
  expect(publicImage.status()).toBe(200);
  expect(publicImage.headers()["content-type"]).toContain("image/webp");
  await bot.close();
  await shop.setViewportSize({ width: 390, height: 844 });
  await expect(img).toBeVisible();
  expect(
    await shop.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await shop.screenshot({
    path: ".local/evidence/merchant-phase3/onboarding-pdp-390.png",
    fullPage: false,
  });
  await merchant.goto("/manage/onboarding");
  await expect(
    merchant.getByRole("heading", {
      name: "رویدادهای همراهی واقعی",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    merchant.getByText("MEDIA_APPROVED", { exact: false }),
  ).toBeVisible();
  await merchant.screenshot({
    path: ".local/evidence/merchant-phase3/onboarding-merchant.png",
    fullPage: false,
  });
  expect(
    (await shop.request.get("/api/didar/media?supplier_id=" + sid)).status(),
  ).toBe(401);
  await merchantContext.close();
  await anonymous.close();
});
