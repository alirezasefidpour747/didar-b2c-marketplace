import { test, expect } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const products: string[] = [],
  suppliers: string[] = [];
test.afterAll(async () => {
  await db.query(
    "UPDATE didar_product SET active=false,published=false WHERE id=ANY($1::text[])",
    [products],
  );
  await db.query(
    "UPDATE didar_supplier SET active=false WHERE id=ANY($1::text[])",
    [suppliers],
  );
  await db.end();
});
async function login(
  page: any,
  email = "admin@didar.test",
  password = "DidarDemo2026!",
) {
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill(email);
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  return page.evaluate(() => sessionStorage.getItem("didar-session"));
}
async function api(request: any, token: string, action: string, body?: any) {
  const r = await request.fetch("/api/didar/" + action, {
    method: body ? "POST" : "GET",
    headers: { authorization: "Bearer " + token },
    ...(body ? { data: body } : {}),
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
test("Persian product classification, F11 membership and server discovery persist into the same mobile and desktop PDP", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const tag = "facets-ui-" + crypto.randomUUID();
  const token = await login(page);
  const pid = (
    await api(page.request, token, "manage", {
      kind: "product",
      title: tag,
      category_id: "bracelet",
      purity: 750,
      published: true,
    })
  ).id;
  products.push(pid);
  await page.goto("/manage");
  await page
    .getByRole("button", { name: "طبقه‌بندی و پیشنهادها", exact: true })
    .click();
  await page.getByLabel("انتخاب محصول", { exact: true }).selectOption(pid);
  const editor = page.getByTestId("classification-editor");
  await expect(editor).toBeVisible();
  for (const [facet, value] of [
    ["usage", "everyday"],
    ["market_tier", "premium"],
    ["design_style", "minimalist"],
    ["occasion", "nowruz"],
  ]) {
    await editor
      .getByLabel("گروه طبقه‌بندی", { exact: true })
      .selectOption(facet);
    const form = editor.locator("form").first();
    await form.locator("[name=value_id]").selectOption(facet + "." + value);
    await form
      .locator("[name=reason]")
      .fill("تأیید طبقه‌بندی برای آزمون یکپارچه");
    await form
      .getByRole("button", { name: "تأیید و ثبت مقدار", exact: true })
      .click();
    await expect(editor.locator("article")).toContainText("تأیید شده");
  }
  await page.reload();
  await page
    .getByRole("button", { name: "طبقه‌بندی و پیشنهادها", exact: true })
    .click();
  await page.getByLabel("انتخاب محصول", { exact: true }).selectOption(pid);
  await expect(editor).toContainText("روزمره");
  await page
    .getByRole("button", { name: "کاتالوگ و تصاویر", exact: true })
    .click();
  const collection = page.getByTestId("collection-form");
  await collection
    .getByLabel("نام مجموعه", { exact: true })
    .fill("میراث آزمون");
  await collection.getByLabel("نشانی مجموعه (slug)", { exact: true }).fill(tag);
  await collection.locator("[name=type_code]").selectOption("heritage");
  await collection.locator("[name=product_ids]").selectOption(pid);
  await collection
    .getByRole("button", { name: "ثبت مجموعه", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db.query(
            "SELECT count(*)::int n FROM didar_collection WHERE slug=$1",
            [tag],
          )
        ).rows[0].n,
    )
    .toBe(1);
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    shop = await context.newPage();
  await shop.goto("/discover/everyday-gold");
  await shop.getByLabel("جستجوی محصول", { exact: true }).fill(tag);
  await expect(shop.locator(".product")).toHaveCount(1);
  await expect(
    shop.getByRole("heading", { name: tag, exact: true }),
  ).toBeVisible();
  await shop.getByRole("link", { name: tag, exact: true }).click();
  await expect(shop).toHaveURL(
    /\/fa\/products\/jewelry\/bracelets\/bracelet\//,
  );
  await expect(
    shop.getByRole("heading", { name: tag, exact: true }),
  ).toBeVisible();
  await expect(shop.locator(".detail-grid")).toContainText("مینیمال");
  expect(
    await shop.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await shop.goto("/discover/nowruz-gifts");
  await shop.getByLabel("جستجوی محصول", { exact: true }).fill(tag);
  await expect(shop.locator(".product")).toHaveCount(1);
  await shop.goto("/collections/" + tag);
  await expect(
    shop.getByRole("heading", { name: tag, exact: true }),
  ).toBeVisible();
  await expect(shop.locator(".product")).toHaveCount(1);
  const response = await shop.request.get(
    "/api/didar/catalog?usage=everyday&design_style=minimalist&occasion=nowruz&q=" +
      tag +
      "&page=1&limit=1",
  );
  const data = await response.json();
  expect(data.total).toBe(1);
  expect(data.products[0].id).toBe(pid);
  expect(data.storefront_locales).toEqual(["fa"]);
  await context.close();
});
test("supplier proposes own controlled classification and DIDAR reviews it through Persian UI", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const tag = "facets-supplier-" + crypto.randomUUID(),
    password = "DidarFacetDemo2026!";
  const token = await login(page);
  const sid = (
    await api(page.request, token, "manage", {
      kind: "supplier",
      name: tag,
      email: tag + "@didar.test",
      password,
    })
  ).id;
  suppliers.push(sid);
  const pid = (
    await api(page.request, token, "manage", {
      kind: "product",
      title: tag,
      category_id: "ring",
      purity: 750,
      published: true,
    })
  ).id;
  products.push(pid);
  await api(page.request, token, "manage", {
    kind: "new_offer",
    supplier_id: sid,
    product_id: pid,
    weight_mg: 1000,
    quantity: 2,
    labor_irr: 0,
    margin_bps: 0,
  });
  await api(page.request, token, "permissions", {
    supplier_id: sid,
    permission: "SUGGEST_OWN_CLASSIFICATION",
    granted: true,
  });
  const supplier = await browser.newContext(),
    seller = await supplier.newPage();
  await login(seller, tag + "@didar.test", password);
  await seller.goto("/manage");
  await seller
    .getByRole("button", { name: "طبقه‌بندی و پیشنهادها", exact: true })
    .click();
  await seller.getByLabel("انتخاب محصول", { exact: true }).selectOption(pid);
  const editor = seller.getByTestId("classification-editor");
  await editor
    .getByLabel("گروه طبقه‌بندی", { exact: true })
    .selectOption("audience");
  expect(await editor.locator("option[value=merchandising]").count()).toBe(0);
  await editor
    .locator("form")
    .first()
    .locator("[name=value_id]")
    .selectOption("audience.unisex");
  await editor
    .locator("[name=reason]")
    .fill("پیشنهاد تأمین‌کننده برای بررسی دیدار");
  await editor
    .getByRole("button", { name: "ارسال پیشنهاد به دیدار", exact: true })
    .click();
  await expect(editor).toContainText("در انتظار تأیید دیدار");
  expect(
    (
      await api(
        page.request,
        token,
        "catalog?q=" + tag + "&audience=unisex&page=1",
      )
    ).total,
  ).toBe(0);
  await page.goto("/manage");
  await page
    .getByRole("button", { name: "طبقه‌بندی و پیشنهادها", exact: true })
    .click();
  await page.getByLabel("انتخاب محصول", { exact: true }).selectOption(pid);
  const adminEditor = page.getByTestId("classification-editor");
  await adminEditor
    .getByLabel("گروه طبقه‌بندی", { exact: true })
    .selectOption("audience");
  const review = adminEditor.locator("article form");
  await review
    .locator("[name=reason]")
    .fill("دیدار پیشنهاد تأمین‌کننده را بررسی کرد");
  await review.getByRole("button", { name: "ثبت بررسی", exact: true }).click();
  await expect(adminEditor.locator("article")).toContainText("تأیید شده");
  expect(
    (
      await api(
        page.request,
        token,
        "catalog?q=" + tag + "&audience=unisex&page=1",
      )
    ).total,
  ).toBe(1);
  await seller.reload();
  await seller
    .getByRole("button", { name: "طبقه‌بندی و پیشنهادها", exact: true })
    .click();
  await seller.getByLabel("انتخاب محصول", { exact: true }).selectOption(pid);
  await editor
    .getByLabel("گروه طبقه‌بندی", { exact: true })
    .selectOption("audience");
  await expect(editor).toContainText("تأیید شده");
  await supplier.close();
});

test("DIDAR vocabulary drafts/reviews, retirement, timed merchandising and curated pages use persisted Persian controls", async ({
  page,
}) => {
  test.setTimeout(120000);
  const token = await login(page),
    tag = "facets-governance-" + crypto.randomUUID(),
    code = "qa_" + crypto.randomUUID().replaceAll("-", "");
  const pid = (
    await api(page.request, token, "manage", {
      kind: "product",
      title: tag,
      category_id: "bracelet",
      purity: 750,
      published: true,
    })
  ).id;
  products.push(pid);
  await page.goto("/manage");
  await page
    .getByRole("button", { name: "طبقه‌بندی و پیشنهادها", exact: true })
    .click();
  await page.getByLabel("انتخاب محصول", { exact: true }).selectOption(pid);
  const editor = page.getByTestId("classification-editor");
  await editor
    .getByLabel("گروه طبقه‌بندی", { exact: true })
    .selectOption("merchandising");
  const assign = editor.locator("form").first();
  await assign
    .locator("[name=value_id]")
    .selectOption("merchandising.editors_pick");
  await assign
    .locator("[name=reason]")
    .fill("انتخاب تحریریه دیدار برای آزمون رابط");
  await assign.locator("[name=starts_at]").fill("2020-01-01T00:00");
  await assign
    .getByRole("button", { name: "تأیید و ثبت مقدار", exact: true })
    .click();
  await expect(editor.locator("article")).toContainText("تأیید شده");
  await page
    .locator("summary")
    .filter({ hasText: "واژگان کنترل‌شده، ترجمه و بازبینی" })
    .click();
  const create = page.locator("form").filter({
    has: page.getByRole("heading", {
      name: "افزودن مقدار کنترل‌شده",
      exact: true,
    }),
  });
  await create.locator("[name=code]").fill(code);
  await create
    .getByRole("button", { name: "ایجاد مقدار؛ سپس ثبت ترجمه", exact: true })
    .click();
  const draft = page.locator("form").filter({
    has: page.getByRole("heading", { name: "پیش‌نویس ترجمه", exact: true }),
  });
  await draft
    .locator("select")
    .first()
    .selectOption("value:usage." + code);
  await draft.locator("[name=locale]").selectOption("fa");
  await draft.locator("[name=label]").fill("کاربرد آزمون واژه");
  await draft.locator("[name=source_ref]").fill("Disposable Persian UI review");
  await draft
    .getByRole("button", { name: "ثبت پیش‌نویس", exact: true })
    .click();
  const review = page
    .locator("form")
    .filter({ hasText: "usage." + code + " · fa · کاربرد آزمون واژه" });
  await review
    .locator("[name=reason]")
    .fill("بررسی و تأیید فارسی در محیط آزمایش");
  await review
    .getByRole("button", { name: "ثبت بررسی ترجمه", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  const meta = await api(page.request, token, "catalog?page=1");
  expect(
    meta.facets
      .find((f: any) => f.code === "usage")
      .values.find((v: any) => v.code === code).label,
  ).toBe("کاربرد آزمون واژه");
  await draft.locator("[name=locale]").selectOption("fr");
  await draft.locator("[name=label]").fill("Usage en attente de validation");
  await draft
    .getByRole("button", { name: "ثبت پیش‌نویس", exact: true })
    .click();
  expect(
    (await api(page.request, token, "catalog?locale=fr&page=1")).facets,
  ).toEqual([]);
  const value = page
    .locator("details")
    .filter({
      has: page.locator("summary").filter({ hasText: "کاربرد آزمون واژه" }),
    })
    .last();
  await value.locator("summary").click();
  await value.locator("[name=active]").uncheck();
  await value.locator("[name=reason]").fill("بازنشستگی واژه آزمایشی از رابط");
  await value.getByRole("button", { name: "ذخیره وضعیت", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await db.query("SELECT active FROM didar_facet_value WHERE id=$1", [
            "usage." + code,
          ])
        ).rows[0].active,
    )
    .toBe(false);
  const pages = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: "صفحات سبک زندگی، مناسبت، میراث و منتخب" }),
  });
  await pages.locator("summary").first().click();
  const form = pages.locator("form").first();
  await form.locator("[name=name]").fill("منتخب آزمون تحریریه");
  await form.locator("[name=slug]").fill(tag);
  await form
    .locator("[name=query]")
    .fill(JSON.stringify({ merchandising: ["editors_pick"] }));
  await form
    .locator("[name=reason]")
    .fill("صفحه منتخب با همان محصول و بدون تکرار");
  await form
    .getByRole("button", { name: "ذخیره صفحه منتخب", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db.query(
            "SELECT count(*)::int n FROM didar_discovery_page WHERE slug=$1",
            [tag],
          )
        ).rows[0].n,
    )
    .toBe(1);
  await page.goto("/discover/" + tag);
  await page.getByLabel("جستجوی محصول", { exact: true }).fill(tag);
  await expect(page.locator(".product")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "منتخب آزمون تحریریه", exact: true }),
  ).toBeVisible();
});
