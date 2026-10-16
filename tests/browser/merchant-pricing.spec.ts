import { test, expect } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const products: string[] = [],
  suppliers: string[] = [];
test.afterAll(async () => {
  if (products.length)
    await db.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=ANY($1::text[])",
      [products],
    );
  if (suppliers.length)
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
  await page.waitForURL((url: URL) => url.pathname !== "/login");
  if (
    await page.getByRole("button", { name: "فهرست +", exact: true }).isVisible()
  )
    await page.getByRole("button", { name: "فهرست +", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "سفارش‌ها", exact: true }),
  ).toBeVisible();
  return page.evaluate(() => sessionStorage.getItem("didar-session"));
}
async function api(page: any, token: string, action: string, body?: any) {
  const r = await page.request.fetch("/api/didar/" + action, {
    method: body ? "POST" : "GET",
    headers: { authorization: "Bearer " + token },
    ...(body ? { data: body } : {}),
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
const fillReason = async (form: any) =>
  form.locator("[name=reason]").fill("تأیید نمونه مالک در محیط آزمایش خودکار");
test("Persian admin creates and approves tax/profile versions, assigns two merchant types and customer pays the exact merchant-specific cash prices", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const token = await login(page),
    tag = "profiles-ui-" + crypto.randomUUID(),
    code = tag.replaceAll("-", "_"),
    sid1 = (
      await api(page, token, "manage", {
        kind: "supplier",
        name: tag + " تولیدکننده",
      })
    ).id,
    sid2 = (
      await api(page, token, "manage", {
        kind: "supplier",
        name: tag + " خرده‌فروش",
      })
    ).id;
  suppliers.push(sid1, sid2);
  const pid = (
    await api(page, token, "manage", {
      kind: "product",
      title: tag,
      category_id: "bracelet",
      purity: 750,
      published: true,
    })
  ).id;
  products.push(pid);
  const offers = [];
  for (const sid of [sid1, sid2])
    offers.push(
      (
        await api(page, token, "manage", {
          kind: "new_offer",
          supplier_id: sid,
          product_id: pid,
          weight_mg: 100000,
          quantity: 3,
          making_mode: "percent",
          making_bps: 1200,
          labor_irr: 0,
          margin_bps: 9999,
        })
      ).id,
    );
  await page.goto("/manage/pricing");
  await page
    .locator("summary")
    .filter({ hasText: "سیاست مالیات و نسخه‌های مصوب" })
    .click();
  const taxForm = page.getByTestId("tax-policy-create");
  await taxForm.locator("[name=code]").fill(code);
  await taxForm.locator("[name=name]").fill("مالیات " + tag);
  await fillReason(taxForm);
  await taxForm
    .getByRole("button", { name: "ذخیره سیاست مالیات", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db.query(
            "SELECT count(*)::int n FROM didar_merchant_tax_policy WHERE code=$1",
            [code],
          )
        ).rows[0].n,
    )
    .toBe(1);
  const taxPolicy = (
    await db.query("SELECT id FROM didar_merchant_tax_policy WHERE code=$1", [
      code,
    ])
  ).rows[0].id;
  const tvForm = page.getByTestId("tax-version-create");
  await tvForm.locator("[name=policy_id]").selectOption(taxPolicy);
  await tvForm.locator("[name=bps]").fill("1000");
  for (const c of ["making", "distribution", "retail", "credit"])
    await tvForm.locator(`[name=taxable_components][value=${c}]`).check();
  await fillReason(tvForm);
  await tvForm
    .getByRole("button", { name: "ثبت پیش‌نویس مالیات", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await db.query(
            "SELECT count(*)::int n FROM didar_merchant_tax_version WHERE policy_id=$1",
            [taxPolicy],
          )
        ).rows[0].n,
    )
    .toBe(1);
  const tax = (
    await db.query(
      "SELECT id FROM didar_merchant_tax_version WHERE policy_id=$1",
      [taxPolicy],
    )
  ).rows[0].id;
  const reviewTax = page.getByTestId("tax-review-" + tax);
  await fillReason(reviewTax);
  await reviewTax
    .getByRole("button", { name: "بررسی نسخه مالیات", exact: true })
    .click();
  await expect(reviewTax).toHaveCount(0);
  await page
    .locator("summary")
    .filter({ hasText: "ثبت و ویرایش پروفایل‌ها" })
    .click();
  const profiles: any[] = [];
  for (const [i, type] of ["MANUFACTURER", "RETAILER"].entries()) {
    const form = page.getByTestId("profile-create");
    await form.locator("[name=code]").fill(code + "_" + i);
    await form.locator("[name=name]").fill(tag + " " + type);
    await form.locator("[name=merchant_types]").selectOption(type);
    await fillReason(form);
    await form
      .getByRole("button", { name: "ذخیره پروفایل", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT count(*)::int n FROM didar_merchant_profile WHERE code=$1",
              [code + "_" + i],
            )
          ).rows[0].n,
      )
      .toBe(1);
    profiles.push(
      (
        await db.query("SELECT id FROM didar_merchant_profile WHERE code=$1", [
          code + "_" + i,
        ])
      ).rows[0].id,
    );
  }
  await page
    .locator("summary")
    .filter({ hasText: "ساخت نسخه و قواعد مستقل D / R / C" })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: "تاریخچه نسخه‌ها و بررسی" })
    .click();
  const versions: any[] = [];
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", {
        name:
          i === 0
            ? "نمونه تولیدکننده ۳٪ + ۷٪"
            : "نمونه خرده‌فروش ۳٪ + ۲٫۵٪؛ همیشه",
        exact: true,
      })
      .click();
    const f = page.getByTestId("profile-version-create");
    await f
      .getByLabel("پروفایل نسخه جدید", { exact: true })
      .selectOption(profiles[i]);
    await f.getByLabel("نسخه مصوب مالیات", { exact: true }).selectOption(tax);
    await fillReason(f);
    await f
      .getByRole("button", { name: "ثبت پیش‌نویس نسخه پروفایل", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT count(*)::int n FROM didar_merchant_profile_version WHERE profile_id=$1",
              [profiles[i]],
            )
          ).rows[0].n,
      )
      .toBe(1);
    const v = (
      await db.query(
        "SELECT id FROM didar_merchant_profile_version WHERE profile_id=$1",
        [profiles[i]],
      )
    ).rows[0].id;
    versions.push(v);
    const review = page.getByTestId("profile-review-" + v);
    await fillReason(review);
    await review
      .getByRole("button", { name: "بررسی نسخه پروفایل", exact: true })
      .click();
    await expect(review).toHaveCount(0);
  }
  for (const [i, sid] of [sid1, sid2].entries()) {
    const typeForm = page.getByTestId("merchant-type-" + sid);
    await typeForm.locator("..").locator("summary").first().click();
    await typeForm
      .locator("[name=commercial_type]")
      .selectOption(i === 0 ? "MANUFACTURER" : "RETAILER");
    await fillReason(typeForm);
    await typeForm
      .getByRole("button", { name: "ثبت نوع تأمین‌کننده", exact: true })
      .click();
    const assign = page.getByTestId("merchant-assignment-" + sid);
    await assign.locator("[name=profile_version_id]").selectOption(versions[i]);
    await fillReason(assign);
    await assign
      .getByRole("button", { name: "ثبت تخصیص پروفایل", exact: true })
      .click();
  }
  const sim = page.getByTestId("merchant-price-preview");
  await sim.locator("[name=offer_id]").selectOption(offers[1]);
  await sim
    .getByRole("button", { name: "محاسبه قیمت عرضه", exact: true })
    .click();
  await expect(page.getByTestId("price-preview-result")).toContainText(
    tag + " RETAILER",
  );
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    shop = await context.newPage();
  await shop.goto("/products/" + pid);
  await expect(
    shop.getByRole("heading", { name: tag, exact: true }),
  ).toBeVisible();
  await shop
    .getByLabel("روش محاسبه قیمت", { exact: true })
    .selectOption("CASH");
  const p = await api(page, token, "catalog"),
    o = p.products.find((p: any) => p.id === pid).offers;
  const manufacturer = o.find((o: any) => o.id === offers[0]),
    retailer = o.find((o: any) => o.id === offers[1]);
  expect(manufacturer.price.total_irr).toBe(8073000000);
  expect(retailer.price.total_irr).toBe(7751250000);
  for (const id of offers) {
    const card = shop.locator(`[data-offer-id="${id}"]`);
    await card
      .getByRole("button", { name: "افزودن به سبد +", exact: true })
      .click();
  }
  await login(shop, "customer@didar.test");
  await shop.goto("/cart");
  await expect(shop.locator(".cart-line")).toHaveCount(2);
  await expect(shop.locator(".checkout")).toContainText("۱۵٬۸۲۴٬۲۵۰٬۰۰۰");
  await shop
    .getByLabel("نام گیرنده", { exact: true })
    .fill("مشتری آزمایش پروفایل");
  await shop
    .getByLabel("شماره همراه (09…)", { exact: true })
    .fill("09123456789");
  await shop.getByLabel("شهر", { exact: true }).fill("تهران");
  await shop.getByLabel("نشانی کامل", { exact: true }).fill("نشانی آزمایشی");
  await shop.getByLabel("کد پستی ۱۰ رقمی", { exact: true }).fill("1234567890");
  await shop
    .getByRole("button", { name: "ثبت و تأیید قیمت سفارش", exact: true })
    .click();
  await expect(shop).toHaveURL(/\/orders\//);
  await shop
    .getByRole("button", { name: "شبیه‌سازی پرداخت موفق", exact: true })
    .click();
  await expect(
    shop.getByText("پرداخت شده", { exact: true }).first(),
  ).toBeVisible();
  const order = (
    await db.query(
      "SELECT o.* FROM didar_order o JOIN didar_order_line l ON l.order_id=o.id WHERE l.offer_id=$1 ORDER BY o.created_at DESC LIMIT 1",
      [offers[0]],
    )
  ).rows[0];
  expect(order.payment_method).toBe("CASH");
  expect(Number(order.total_irr)).toBe(15824250000);
  expect(order.status).toBe("paid");
  expect(
    await shop.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await context.close();
});

test("merchant sees only own terms; customer switches cash/credit rules and freezes the selected method in checkout", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const token = await login(page),
    tag = "method-ui-" + crypto.randomUUID(),
    password = "DidarProfiles2026!",
    email = tag + "@didar.test",
    reason = "QA owner approved method-specific profile";
  const sid = (
    await api(page, token, "manage", {
      kind: "supplier",
      name: tag,
      email,
      password,
    })
  ).id;
  suppliers.push(sid);
  const pid = (
    await api(page, token, "manage", {
      kind: "product",
      title: tag,
      category_id: "ring",
      purity: 750,
      published: true,
    })
  ).id;
  products.push(pid);
  const offer = (
    await api(page, token, "manage", {
      kind: "new_offer",
      supplier_id: sid,
      product_id: pid,
      weight_mg: 100000,
      quantity: 3,
      making_mode: "percent",
      making_bps: 1200,
    })
  ).id;
  const cmd = (body: any) =>
    api(page, token, "merchant-pricing", { reason, ...body });
  const policy = (
      await cmd({
        operation: "tax_policy_save",
        code: tag.replaceAll("-", "_"),
        name: tag,
      })
    ).id,
    tax = (
      await cmd({
        operation: "tax_draft",
        policy_id: policy,
        bps: 1000,
        taxable_components: ["making", "distribution", "retail", "credit"],
      })
    ).id;
  await cmd({ operation: "tax_review", id: tax, approved: true });
  const profile = (
    await cmd({
      operation: "profile_save",
      code: tag.replaceAll("-", "_"),
      name: "پروفایل مستقل " + tag,
      merchant_types: ["RETAILER"],
    })
  ).id;
  const rules = ["distribution", "retail", "credit"].map((code) => ({
    code,
    label: code,
    component: code,
    mode: "PERCENT",
    basis: "GOLD_BASE_750_IRR",
    value: 0,
    payer: "CUSTOMER",
    recipient: "DIDAR",
    scope: "ITEM",
    application_mode: code === "credit" ? "BY_PAYMENT_METHOD" : "ALWAYS",
    cash_rule: { mode: "PERCENT", basis: "GOLD_BASE_750_IRR", value: 100 },
    credit_rule: { mode: "PERCENT", basis: "GOLD_BASE_750_IRR", value: 400 },
  }));
  const version = (
    await cmd({
      operation: "version_draft",
      profile_id: profile,
      tax_version_id: tax,
      rules,
    })
  ).id;
  await cmd({ operation: "version_review", id: version, approved: true });
  await cmd({
    operation: "classify",
    supplier_id: sid,
    commercial_type: "RETAILER",
    revision: 1,
  });
  await cmd({
    operation: "assign",
    supplier_id: sid,
    profile_version_id: version,
  });
  const merchant = await browser.newContext(),
    seller = await merchant.newPage();
  await login(seller, email, password);
  await seller.goto("/manage/pricing");
  await expect(
    seller.getByRole("heading", {
      name: "پروفایل قیمت‌گذاری تأمین‌کننده",
      exact: true,
    }),
  ).toBeVisible();
  await expect(seller.getByTestId("profile-create")).toHaveCount(0);
  await expect(seller.getByTestId("tax-policy-create")).toHaveCount(0);
  await expect(seller.locator(".merchant-pricing")).toContainText(tag);
  await expect(seller.locator(".merchant-pricing")).not.toContainText(
    "profiles-ui-",
  );
  const sim = seller.getByTestId("merchant-price-preview");
  await sim.locator("[name=offer_id]").selectOption(offer);
  await sim.locator("[name=payment_method]").selectOption("CREDIT");
  await sim
    .getByRole("button", { name: "محاسبه قیمت عرضه", exact: true })
    .click();
  await expect(seller.getByTestId("price-preview-result")).toContainText(
    "۲۶۰٬۰۰۰٬۰۰۰",
  );
  await merchant.close();
  const ctx = await browser.newContext(),
    shop = await ctx.newPage();
  await shop.goto("/products/" + pid);
  const card = shop.locator(`[data-offer-id="${offer}"]`);
  await expect(card).toContainText("۷٬۴۲۹٬۵۰۰٬۰۰۰");
  await shop
    .getByLabel("روش محاسبه قیمت", { exact: true })
    .selectOption("CREDIT");
  await expect(card).toContainText("۷٬۶۴۴٬۰۰۰٬۰۰۰");
  await card
    .getByRole("button", { name: "افزودن به سبد +", exact: true })
    .click();
  await login(shop, "customer@didar.test");
  await shop.goto("/cart");
  await expect(shop.locator(".checkout")).toContainText("۷٬۶۴۴٬۰۰۰٬۰۰۰");
  await shop.getByLabel("نام گیرنده", { exact: true }).fill("آزمون روش پرداخت");
  await shop
    .getByLabel("شماره همراه (09…)", { exact: true })
    .fill("09123456789");
  await shop.getByLabel("شهر", { exact: true }).fill("تهران");
  await shop
    .getByLabel("نشانی کامل", { exact: true })
    .fill("نشانی آزمایش روش پرداخت");
  await shop.getByLabel("کد پستی ۱۰ رقمی", { exact: true }).fill("1234567890");
  await shop
    .getByRole("button", { name: "ثبت و تأیید قیمت سفارش", exact: true })
    .click();
  await expect(shop).toHaveURL(/\/orders\//);
  await shop
    .getByRole("button", { name: "شبیه‌سازی پرداخت موفق", exact: true })
    .click();
  await expect(
    shop.getByText("پرداخت شده", { exact: true }).first(),
  ).toBeVisible();
  const line = (
    await db.query(
      "SELECT o.payment_method,l.breakdown FROM didar_order o JOIN didar_order_line l ON l.order_id=o.id WHERE l.offer_id=$1 ORDER BY o.created_at DESC LIMIT 1",
      [offer],
    )
  ).rows[0];
  expect(line.payment_method).toBe("CREDIT");
  expect(line.breakdown.credit_irr).toBe(260000000);
  expect(line.breakdown.merchant_profile.version_id).toBe(version);
  expect(
    line.breakdown.profile_charges.find((r: any) => r.code === "credit")
      .application_mode,
  ).toBe("BY_PAYMENT_METHOD");
  await ctx.close();
});
