import { test, expect } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const suppliers: string[] = [],
  products: string[] = [];
test.afterAll(async () => {
  if (suppliers.length)
    await db.query(
      "UPDATE didar_supplier SET active=false WHERE id=ANY($1::text[])",
      [suppliers],
    );
  if (products.length)
    await db.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=ANY($1::text[])",
      [products],
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
test("Merchant A entry survives central registration, PDP, quote and sandbox purchase; Merchant B stays inaccessible", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const admin = (
    await api(page, "login", {
      email: "admin@didar.test",
      password: "DidarDemo2026!",
    })
  ).token;
  const tag = "store-ui-" + crypto.randomUUID().slice(0, 8),
    handle = tag;
  const sid = (
    await api(
      page,
      "manage",
      { kind: "supplier", name: "گالری اختصاصی الف " + tag },
      admin,
    )
  ).id;
  const rival = (
    await api(
      page,
      "manage",
      { kind: "supplier", name: "رقیب محرمانه ب " + tag },
      admin,
    )
  ).id;
  suppliers.push(sid, rival);
  const own = (
    await api(
      page,
      "manage",
      {
        kind: "product",
        title: "دستبند انتخاب الف " + tag,
        category_id: "bracelet",
        purity: 750,
        published: true,
      },
      admin,
    )
  ).id;
  const other = (
    await api(
      page,
      "manage",
      {
        kind: "product",
        title: "محصول محرمانه رقیب " + tag,
        category_id: "ring",
        purity: 750,
        published: true,
      },
      admin,
    )
  ).id;
  products.push(own, other);
  for (const [supplier_id, product_id] of [
    [sid, own],
    [rival, other],
  ])
    await api(
      page,
      "manage",
      {
        kind: "new_offer",
        supplier_id,
        product_id,
        weight_mg: 100000,
        quantity: 3,
        making_mode: "percent",
        making_bps: 1200,
        labor_irr: 0,
        margin_bps: 0,
      },
      admin,
    );
  for (const [supplier_id, visibility, storeHandle] of [
    [sid, "UNLISTED_LINK", handle],
    [rival, "INVITE_ONLY", handle + "-private"],
  ])
    await api(
      page,
      "storefront",
      {
        kind: "save",
        supplier_id,
        handle: storeHandle,
        name: supplier_id === sid ? "گالری الف" : "رقیب محرمانه ب",
        intro: "انتخاب‌های ماندگار، با قیمت شفاف و تأمین تأییدشده",
        visibility,
        published: true,
        approved: true,
      },
      admin,
    );
  const mp = async (body: any) =>
    api(
      page,
      "merchant-pricing",
      { reason: "Approved synthetic Phase 2 acceptance", ...body },
      admin,
    );
  const taxPolicy = await mp({
    operation: "tax_policy_save",
    code: tag.replaceAll("-", "_"),
    name: "Phase 2 tax",
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
    name: "پروفایل خرده‌فروش الف",
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
  const selected = [own];
  for (let i = 1; i < 10; i++) {
    const id = (
      await api(
        page,
        "manage",
        {
          kind: "product",
          title: "انتخاب " + i + " " + tag,
          category_id: "ring",
          purity: 750,
          published: true,
        },
        admin,
      )
    ).id;
    products.push(id);
    selected.push(id);
    await api(
      page,
      "manage",
      {
        kind: "new_offer",
        supplier_id: sid,
        product_id: id,
        weight_mg: 1000 + i * 100,
        quantity: 2,
        making_mode: "percent",
        making_bps: 1200,
        labor_irr: 0,
        margin_bps: 0,
      },
      admin,
    );
  }
  await page.goto("/login");
  await page.evaluate((t) => sessionStorage.setItem("didar-session", t), admin);
  await page.goto("/manage/sharing");
  await page.getByLabel("فروشگاه اشتراک").selectOption(sid);
  await page
    .getByLabel("نام صفحه منتخب", { exact: true })
    .fill("منتخب ده‌قطعه‌ای الف");
  await page
    .getByLabel("معرفی صفحه", { exact: true })
    .fill("ده انتخاب از موجودی واقعی گالری الف");
  for (const title of [
    "دستبند انتخاب الف " + tag,
    ...Array.from({ length: 9 }, (_, i) => "انتخاب " + (i + 1) + " " + tag),
  ])
    await page.getByLabel(title, { exact: true }).check();
  await page.getByLabel("انتشار صفحه منتخب", { exact: true }).check();
  await page
    .getByRole("button", { name: "ذخیره صفحه منتخب", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        (
          await db.query(
            "SELECT count(*) n FROM didar_share_page WHERE supplier_id=$1 AND published",
            [sid],
          )
        ).rows[0].n,
      ),
    )
    .toBe(1);
  const share = (
    await db.query(
      "SELECT id,slug FROM didar_share_page WHERE supplier_id=$1",
      [sid],
    )
  ).rows[0];
  const shopper = await browser.newContext();
  page = await shopper.newPage();
  const evidence = ".local/evidence/merchant-phase2";
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [name, url] of [
      ["homepage", "/"],
      ["merchant", "/m/" + handle],
      ["catalog", "/m/" + handle + "/products"],
    ]) {
      await page.goto(url);
      await expect(page.locator(".product").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: evidence + "/" + name + "-" + width + ".png",
        fullPage: false,
      });
    }
    const key = (
      await db.query("SELECT public_key FROM didar_product WHERE id=$1", [own])
    ).rows[0].public_key;
    await page.goto("/m/" + handle + "/products/" + key);
    await expect(
      page.getByRole("heading", {
        name: "دستبند انتخاب الف " + tag,
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: evidence + "/pdp-" + width + ".png",
      fullPage: false,
    });
    if (width === 390) {
      await page.getByRole("button", { name: "فهرست +", exact: true }).click();
      await expect(
        page.getByRole("link", { name: "ویترین طلا", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "فهرست +", exact: true }),
      ).toHaveAttribute("aria-expanded", "false");
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/m/" + handle + "/c/" + share.slug);
  await expect(
    page.getByRole("heading", { name: "منتخب ده‌قطعه‌ای الف", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".product")).toHaveCount(10);
  await expect(
    page.getByRole("link", { name: "WhatsApp", exact: true }),
  ).toHaveAttribute("href", /wa.me/);
  await expect
    .poll(async () =>
      Number(
        (
          await db.query(
            "SELECT count(*) n FROM didar_share_visit WHERE page_id=$1",
            [share.id],
          )
        ).rows[0].n,
      ),
    )
    .toBe(1);
  await page.goto("/m/" + handle);
  await expect(
    page.getByRole("heading", { name: "گالری الف", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "دستبند انتخاب الف " + tag,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("رقیب محرمانه ب", { exact: true })).toHaveCount(
    0,
  );
  const scoped = await page.request.get("/api/didar/catalog");
  const data = await scoped.json();
  expect(data.products.length).toBe(10);
  const priced = data.products.find((p: any) => p.id === own).offers[0].price;
  expect(priced.merchant_profile.version_id).toBe(version.id);
  expect(priced.credit_irr).toBeGreaterThan(0);
  expect(data.products[0].offers.every((o: any) => o.supplier_id === sid)).toBe(
    true,
  );
  await page
    .getByRole("link", { name: "مشاهده دستبند انتخاب الف " + tag })
    .click();
  await expect(page).toHaveURL(new RegExp("/m/" + handle + "/products/"));
  await page
    .getByRole("button", { name: "افزودن به سبد +", exact: true })
    .click();
  await page
    .getByRole("link", { name: "مشاهده سبد خرید", exact: true })
    .click();
  await page
    .getByRole("link", { name: "ورود / عضویت", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "حساب ندارید؟ عضویت", exact: true })
    .click();
  await page.getByLabel("نام کامل / کسب‌وکار").fill("مشتری فروشگاه الف");
  await page.getByLabel("ایمیل", { exact: true }).fill(tag + "@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarStore2026!");
  await page.getByRole("button", { name: "ایجاد حساب", exact: true }).click();
  await expect(page).toHaveURL("/m/" + handle + "/account");
  await page.goto("/m/" + handle + "/cart");
  await page.getByLabel("نام گیرنده").fill("مشتری الف");
  await page.getByLabel("شماره همراه (09…)").fill("09123456789");
  await page.getByLabel("شهر", { exact: true }).fill("تهران");
  await page.getByLabel("نشانی کامل").fill("نشانی آزمایشی");
  await page.getByLabel("کد پستی ۱۰ رقمی").fill("1234567890");
  await page
    .getByRole("button", { name: "ثبت و تأیید قیمت سفارش", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("/m/" + handle + "/orders/"));
  await page
    .getByRole("button", { name: "شبیه‌سازی پرداخت موفق", exact: true })
    .click();
  await expect(page.getByText("پرداخت شده", { exact: true })).toBeVisible();
  const saved = (
    await db.query(
      "SELECT origin_supplier_id,storefront_snapshot,share_page_id FROM didar_order WHERE id=$1",
      [page.url().split("/").at(-1)],
    )
  ).rows[0];
  expect(saved.origin_supplier_id).toBe(sid);
  expect(saved.storefront_snapshot.handle).toBe(handle);
  expect(saved.share_page_id).toBe(share.id);

  const direct = await page.request.get("/api/didar/product-link?id=" + other);
  expect(direct.status()).toBe(404);
  await page.goto("/m/" + handle + "-private");
  await expect(
    page.getByRole("heading", { name: "ورود به فروشگاه", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("محصول محرمانه رقیب " + tag, { exact: true }),
  ).toHaveCount(0);
  await shopper.close();
});
