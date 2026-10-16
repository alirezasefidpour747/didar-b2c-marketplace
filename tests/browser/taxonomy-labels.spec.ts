import { test, expect } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
let pid = "",
  sid = "";
test.afterAll(async () => {
  if (pid)
    await db.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=$1",
      [pid],
    );
  if (sid)
    await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [sid]);
  await db.end();
});
test("Persian draft publication, optional-RFID bulk labels, print sizing, canonical breadcrumbs and QR continuity", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const tag = "labels-ui-" + crypto.randomUUID();
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill("admin@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  const token = await page.evaluate(() =>
    sessionStorage.getItem("didar-session"),
  );
  const api = async (action: string, body?: any) => {
    const r = await page.request.fetch("/api/didar/" + action, {
      method: body ? "POST" : "GET",
      headers: { authorization: "Bearer " + token },
      ...(body ? { data: body } : {}),
    });
    expect(r.status(), await r.text()).toBe(200);
    return r.json();
  };
  await page.goto("/manage");
  await page
    .getByRole("button", { name: "کاتالوگ و تصاویر", exact: true })
    .click();
  const form = page.getByTestId("product-form");
  await expect(form.locator('[name="published"]')).toBeDisabled();
  await expect(form.locator('[name="category_id"]')).toBeDisabled();
  await expect(form).toContainText("پیش‌نویس");
  await form.locator('[name="title"]').fill(tag);
  await form
    .getByRole("button", { name: "ثبت در کاتالوگ Mercur", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await db.query("SELECT id FROM didar_product WHERE title=$1", [tag]))
          .rowCount,
    )
    .toBe(1);
  pid = (await db.query("SELECT id FROM didar_product WHERE title=$1", [tag]))
    .rows[0].id;
  const editor = page.locator(`[data-product-id="${pid}"]`);
  await editor.locator("summary").click();
  await expect(editor).toContainText("پیش‌نویس");
  await editor.getByLabel("خانواده", { exact: true }).selectOption("jewelry");
  await editor.getByLabel("دسته اصلی", { exact: true }).selectOption("rings");
  await editor.locator('[name="category_id"]').selectOption("ring");
  await editor.locator('[name="slug"]').fill("label-product");
  await expect(editor.locator('[name="published"]')).toBeEnabled();
  await editor.locator('[name="published"]').check();
  await editor
    .getByRole("button", { name: "ذخیره محصول", exact: true })
    .click();
  await expect(editor.locator("summary")).toContainText("منتشر شده");
  sid = (await api("manage", { kind: "supplier", name: tag })).id;
  const batch = (
    await api("intake", {
      operation: "create",
      supplier_id: sid,
      invoice_number: tag,
      reference_purity: 750,
    })
  ).id;
  const line = (
    await api("intake", {
      operation: "line",
      making_mode: "percent",
      making_bps: 0,
      batch_id: batch,
      product_id: pid,
      description: "barcode pieces",
      quantity: 2,
      total_weight_mg: 3000,
      purity: 750,
    })
  ).id;
  for (const weight_mg of [1000, 2000])
    await api("intake", {
      operation: "item",
      batch_id: batch,
      line_id: line,
      weight_mg,
    });
  await api("intake", { operation: "verify", batch_id: batch });
  await api("intake", { operation: "post", batch_id: batch });
  const items = (await api("intake?id=" + batch)).items;
  expect(items.every((i: any) => !i.epc)).toBe(true);
  await page.goto("/manage/operations");
  await page.getByLabel("انتخاب پذیرش").selectOption(batch);
  const controls = page.getByTestId("uid-label-controls");
  await controls.locator("summary").click();
  await controls.getByLabel("نوع برچسب").selectOption("customer");
  await controls
    .getByRole("button", { name: "ساخت برچسب کل پذیرش", exact: true })
    .click();
  const sheet = page.getByTestId("uid-print-sheet");
  await expect(sheet.locator("article")).toHaveCount(2);
  await expect(sheet.locator('img[alt^="Code 128"]')).toHaveCount(2);
  await expect(sheet.locator('img[alt^="QR"]')).toHaveCount(2);
  const permanent = (await sheet.locator("article").first().innerText()).match(
    /https:\/\/[^\s]+/,
  )![0];
  expect(permanent).toContain("/i/");
  expect(permanent).not.toContain("/products/");
  await controls.getByLabel("عرض برچسب (میلی‌متر)", { exact: true }).fill("50");
  await expect(
    controls.getByRole("button", { name: "چاپ برچسب‌ها", exact: true }),
  ).toBeDisabled();
  await controls
    .getByLabel("عرض برچسب (میلی‌متر)", { exact: true })
    .fill("190");
  await expect(
    controls.getByRole("button", { name: "چاپ برچسب‌ها", exact: true }),
  ).toBeEnabled();
  await page.emulateMedia({ media: "print" });
  await expect(sheet.locator("article").first()).toBeVisible();
  await expect(page.locator("header").first()).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  const context = await browser.newContext(),
    publicPage = await context.newPage();
  try {
    await publicPage.goto(new URL(permanent).pathname);
    await expect(publicPage).toHaveURL(
      new RegExp(`/fa/products/jewelry/rings/ring/label-product-[a-f0-9]{32}$`),
    );
    await expect(
      publicPage.locator('head link[rel="canonical"]'),
    ).toHaveAttribute(
      "href",
      `/fa/products/jewelry/rings/ring/label-product-${(await db.query("SELECT public_key FROM didar_product WHERE id=$1", [pid])).rows[0].public_key}`,
    );
    await expect(publicPage.locator(".breadcrumbs")).toContainText("زیورآلات");
    await expect(publicPage.locator(".breadcrumbs")).toContainText("انگشتر");
    await expect(
      publicPage.getByRole("heading", { name: tag, exact: true }),
    ).toBeVisible();
    await api("manage", {
      kind: "product",
      id: pid,
      slug: "renamed-product",
      category_id: "necklace",
    });
    await publicPage.goto(new URL(permanent).pathname);
    await expect(publicPage).toHaveURL(
      new RegExp(
        `/fa/products/jewelry/necklaces/necklace/renamed-product-[a-f0-9]{32}$`,
      ),
    );
    await expect(publicPage.locator(".breadcrumbs")).toContainText("گردنبند");
    const legacy = await publicPage.request.get("/products/" + pid, {
      maxRedirects: 0,
    });
    expect(legacy.status()).toBe(308);
    const hidden = await publicPage.request.post("/api/didar/labels", {
      data: { mode: "warehouse", batch_id: batch },
    });
    expect(hidden.status()).toBe(401);
    await api("manage", { kind: "product", id: pid, published: false });
    expect(
      (
        await publicPage.request.get(new URL(permanent).pathname, {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(404);
  } finally {
    await context.close();
  }
});
