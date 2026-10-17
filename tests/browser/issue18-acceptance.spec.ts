import { test, expect, type Page } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
import { mkdirSync } from "node:fs";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const origin = process.env.TEST_API_URL!;
const evidence = ".local/evidence/issue18-independent";
const disposable =
  process.env.DIDAR_DISPOSABLE_QA === "true" &&
  process.env.DIDAR_ENVIRONMENT === "local" &&
  /^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:\d+\/didar_qa$/.test(
    process.env.DATABASE_URL || "",
  );
const reason =
  "Independent native browser agency proof; synthetic sandbox only";
let supplierId = "";
async function api(path: string, token = "", body?: any, selected?: string) {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
      ...(selected ? { "x-seller-id": selected } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  expect([200, 201], JSON.stringify(data)).toContain(r.status);
  return data;
}
async function signIn(
  page: Page,
  surface: "dashboard" | "seller",
  email: string,
  store?: string,
) {
  await page.goto(origin + "/" + surface + "/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill("DidarNative2026!");
  await page.locator("button[type=submit]").click();
  if (surface === "seller") {
    await page.waitForURL((u) => u.pathname === "/seller/store-select");
    // The version-matched native store selector includes Avatar/status/handle
    // inside its button; the unique actual store name selects that real button.
    await page.getByRole("button").filter({ hasText: store! }).click();
  }
  await page.waitForURL(
    (u) =>
      u.pathname !== "/" + surface + "/login" &&
      u.pathname !== "/seller/store-select",
  );
}
test.afterAll(async () => {
  if (disposable) {
    if (supplierId)
      await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [
        supplierId,
      ]);
    await db.query("DELETE FROM didar_native_actor WHERE user_id='demo-admin'");
    // Separate acceptance suites have separate synthetic login-attempt budgets.
    // Production throttling is unchanged and covered by the existing HTTP suite.
    await db.query("DELETE FROM didar_login_attempt");
  }
  await db.end();
});

test("I18 independent native Admin mandate form, managed agency checkout/invoice, and original merchant Vendor read", async ({
  page,
  browser,
}) => {
  if (!disposable || process.env.DIDAR_AGENCY_MODE !== "sandbox")
    throw Error("Explicit disposable agency sandbox required");
  test.setTimeout(210000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  mkdirSync(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const invalid of [
    "",
    "?order_id=a&order_id=b",
    "?order_id=" + "a".repeat(101),
    "?order_id=a&seller_id=forged",
  ]) {
    const rejected = await page.request.get("/api/didar/invoice" + invalid);
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).message).toBe("INVALID_INVOICE");
  }
  const tag = "i18-browser-" + crypto.randomUUID().slice(0, 8),
    password = "IndependentBrowser2026!";
  const nativeAdmin = (
    await api("/auth/user/emailpass", "", {
      email: "native-admin@didar.test",
      password: "DidarNative2026!",
    })
  ).token;
  const proof = (
    await api("/didar/login", "", {
      email: "admin@didar.test",
      password: "DidarDemo2026!",
    })
  ).token;
  await api("/admin/didar/connect", nativeAdmin, { didar_token: proof });
  const n = (action: string, body?: any) =>
    api("/admin/didar/" + action, nativeAdmin, body);
  supplierId = (
    await n("manage", {
      kind: "supplier",
      name: "فروشنده مستقل " + tag,
      email: tag + "@didar.test",
      password,
    })
  ).id;
  const title = "طلای آزمون مستقل نمایندگی " + tag;
  const product = (
    await n("manage", {
      kind: "product",
      category_id: "ring",
      title,
      purity: 750,
      description: reason,
      published: true,
    })
  ).id;
  const contract = (
    await n("finance", {
      operation: "contract_request",
      supplier_id: supplierId,
      mode: "MIXED",
      gold_bps: 5000,
      ownership: "CONSIGNMENT",
      effective_at: "2020-01-01T00:00:00Z",
      due_days: 7,
      reason,
    })
  ).id;
  await n("finance", {
    operation: "contract_review",
    contract_id: contract,
    approved: true,
    reason,
  });
  const batch = (
    await n("intake", {
      operation: "create",
      supplier_id: supplierId,
      invoice_number: tag,
      reference_purity: 750,
    })
  ).id;
  const line = (
    await n("intake", {
      operation: "line",
      batch_id: batch,
      product_id: product,
      description: reason,
      quantity: 1,
      total_weight_mg: 100000,
      purity: 750,
      making_mode: "percent",
      making_bps: 1200,
    })
  ).id;
  await n("intake", {
    operation: "item",
    batch_id: batch,
    line_id: line,
    weight_mg: 100000,
  });
  await n("intake", { operation: "verify", batch_id: batch });
  await n("intake", { operation: "post", batch_id: batch });
  const uid = (await n("intake?id=" + batch)).items[0].uid;
  await signIn(page, "dashboard", "native-admin@didar.test");
  await page.goto(origin + "/dashboard/didar/agency");
  await expect(
    page.getByRole("heading", {
      name: "مجوز فروش و اسناد نیابتی",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "کسب‌وکار / منبع موجودی", exact: true })
    .selectOption(supplierId);
  await page
    .getByRole("combobox", { name: "نقش فروش", exact: true })
    .selectOption("AGENCY");
  await page
    .getByRole("combobox", { name: "نسخه قرارداد مصوب", exact: true })
    .selectOption(contract);
  await page.getByLabel("شروع اثر", { exact: true }).fill("2020-01-01T00:00");
  await page.getByLabel("پایان اثر", { exact: true }).fill("2099-01-01T00:00");
  await page
    .getByLabel("مرجع توافق و دلیل درخواست", { exact: true })
    .fill(reason);
  await page
    .getByRole("button", { name: "ثبت درخواست مجوز", exact: true })
    .click();
  const article = page
    .locator("article[data-mandate-id]")
    .filter({ hasText: tag })
    .first();
  await expect(article).toBeVisible();
  await article
    .getByRole("combobox", { name: "تصمیم بررسی", exact: true })
    .selectOption("approve");
  await article.getByLabel("مستند تصمیم", { exact: true }).fill(reason);
  await article
    .getByRole("button", { name: "ثبت بررسی مجوز", exact: true })
    .click();
  await expect(article).toContainText("تأییدشده؛ در بازه اثر");
  await article.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: evidence + "/native-admin-agency-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await article.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: evidence + "/native-admin-agency-390.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/dashboard/didar/storefront");
  await page
    .getByLabel("فروشنده ویترین", { exact: true })
    .selectOption(supplierId);
  await page.getByLabel("شناسه پیوند ثابت", { exact: true }).fill(tag);
  await page
    .getByLabel("نام ویترین", { exact: true })
    .fill("ویترین نمایندگی مستقل");
  await page.locator('select[name="visibility"]').selectOption("UNLISTED_LINK");
  await page.getByLabel("منتشر شود", { exact: true }).check();
  await page.getByLabel("تأیید دیدار", { exact: true }).check();
  await page.getByRole("button", { name: "ذخیره ویترین", exact: true }).click();
  await expect(
    page.getByText("وضعیت: تأیید شده", { exact: false }),
  ).toBeVisible();
  expect(
    (
      await db.query("SELECT 1 FROM didar_native_seller WHERE supplier_id=$1", [
        supplierId,
      ])
    ).rowCount,
  ).toBe(0);

  const customer = await browser.newPage();
  await customer.setViewportSize({ width: 1440, height: 1000 });
  customer.on("pageerror", (error) => errors.push(error.message));
  await customer.goto("/m/" + tag + "/products");
  await customer
    .getByRole("heading", { name: title, exact: true })
    .getByRole("link")
    .click();
  await customer
    .getByRole("button", { name: "افزودن به سبد +", exact: true })
    .click();
  await customer
    .getByRole("link", { name: "مشاهده سبد خرید", exact: true })
    .click();
  await customer
    .getByRole("link", { name: "ورود / عضویت", exact: true })
    .first()
    .click();
  await customer
    .getByRole("button", { name: "حساب ندارید؟ عضویت", exact: true })
    .click();
  await customer.getByLabel("نام کامل / کسب‌وکار").fill("خریدار آزمون مستقل");
  await customer
    .getByLabel("ایمیل", { exact: true })
    .fill(tag + "-buyer@didar.test");
  await customer.getByLabel("رمز عبور", { exact: true }).fill(password);
  await customer
    .getByRole("button", { name: "ایجاد حساب", exact: true })
    .click();
  await expect(customer).toHaveURL("/m/" + tag + "/account");
  await customer.goto("/m/" + tag + "/cart");
  const beforePayment = customer.getByRole("region", {
    name: "نقش فروشنده پیش از پرداخت",
    exact: true,
  });
  await expect(
    beforePayment.locator('[data-sale-mode="AGENCY"]'),
  ).toContainText("فروشنده مستقل " + tag);
  await expect(beforePayment).toContainText("به نیابت");
  await customer.screenshot({
    path: evidence + "/customer-agency-before-payment-1440.png",
    fullPage: true,
  });
  await customer.getByLabel("نام گیرنده").fill("خریدار آزمایشی مستقل");
  await customer.getByLabel("شماره همراه (09…)").fill("09123456789");
  await customer.getByLabel("شهر", { exact: true }).fill("تهران");
  await customer.getByLabel("نشانی کامل").fill("نشانی آزمایشی مستقل");
  await customer.getByLabel("کد پستی ۱۰ رقمی").fill("1234567890");
  await customer
    .getByRole("button", { name: "ثبت و تأیید قیمت سفارش", exact: true })
    .click();
  await expect(customer).toHaveURL(new RegExp("/m/" + tag + "/orders/"));
  await customer
    .getByRole("button", { name: "شبیه‌سازی پرداخت موفق", exact: true })
    .click();
  await expect(customer.getByText("پرداخت شده", { exact: true })).toBeVisible();
  const order = new URL(customer.url()).pathname.split("/").pop()!;
  await customer
    .getByRole("link", { name: "فاکتور و اسناد اصلاحی سفارش", exact: true })
    .click();
  await expect(customer).toHaveURL(
    new RegExp("/m/" + tag + "/orders/" + order + "/invoice$"),
  );
  const customerInvoice = customer.getByRole("region", {
    name: "اسناد سفارش",
    exact: true,
  });
  await expect(
    customerInvoice.locator("article[data-document-id]"),
  ).toHaveCount(1);
  await expect(customerInvoice).toContainText(uid);
  await expect(customerInvoice).toContainText("فروشنده مستقل " + tag);
  await expect(customerInvoice).toContainText("SANDBOX_PROVISIONAL");
  await customer.screenshot({
    path: evidence + "/customer-agency-invoice-1440.png",
    fullPage: true,
  });
  await customer.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      customer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    .toBe(true);
  await customer.screenshot({
    path: evidence + "/customer-agency-invoice-390.png",
    fullPage: true,
  });

  // Real native Member starts self-service after the managed sale, preserving
  // the original business, paid order, offer and physical UID references.
  const registered = await api("/auth/member/emailpass/register", "", {
    email: tag + "@didar.test",
    password: "DidarNative2026!",
  });
  const seller = (
    await api("/vendor/sellers", registered.token, {
      name: tag,
      email: tag + "@didar.test",
      member_email: tag + "@didar.test",
      currency_code: "irr",
    })
  ).seller.id;
  await api("/admin/sellers/" + seller + "/approve", nativeAdmin, {});
  await n("seller-links", { seller_id: seller, supplier_id: supplierId });
  const member = (
    await api("/auth/member/emailpass", "", {
      email: tag + "@didar.test",
      password: "DidarNative2026!",
    })
  ).token;
  const merchantProof = (
    await api("/didar/login", "", { email: tag + "@didar.test", password })
  ).token;
  await api(
    "/vendor/didar/connect",
    member,
    { didar_token: merchantProof },
    seller,
  );
  const vendor = await browser.newPage();
  await vendor.setViewportSize({ width: 1440, height: 1000 });
  vendor.on("pageerror", (error) => errors.push(error.message));
  await signIn(vendor, "seller", tag + "@didar.test", tag);
  await vendor.goto(origin + "/seller/didar/agency");
  await expect(
    vendor.getByRole("heading", {
      name: "مجوز فروش و اسناد نیابتی",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    vendor.getByRole("button", { name: "ثبت درخواست مجوز", exact: true }),
  ).toHaveCount(0);
  await expect(vendor.locator("article[data-mandate-id]")).toHaveCount(1);
  await vendor.getByLabel("شناسه سفارش", { exact: true }).fill(order);
  await vendor
    .getByRole("button", { name: "دریافت سند سفارش", exact: true })
    .click();
  const vendorInvoice = vendor.getByRole("region", {
    name: "اسناد سفارش",
    exact: true,
  });
  await expect(vendorInvoice).toContainText(uid);
  await expect(vendorInvoice).not.toContainText("QA_PRIVATE_NATIVE_BANK");
  await expect(vendorInvoice).not.toContainText("cost_basis_irr");
  await vendorInvoice
    .locator("article[data-document-id]")
    .scrollIntoViewIfNeeded();
  await vendor.screenshot({
    path: evidence + "/native-vendor-agency-invoice-1440.png",
    fullPage: true,
  });
  await vendor.setViewportSize({ width: 390, height: 844 });
  await vendorInvoice
    .locator("article[data-document-id]")
    .scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      vendor.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await vendor.screenshot({
    path: evidence + "/native-vendor-agency-invoice-390.png",
    fullPage: true,
  });
  await vendor.setViewportSize({ width: 1440, height: 1000 });
  await vendor.goto(origin + "/seller/didar/finance");
  await expect(
    vendor.getByRole("heading", { name: "هسته مالی دیدار", exact: true }),
  ).toBeVisible();
  await expect(vendor.locator(".didar-extension")).toContainText(uid);
  await vendor
    .locator(".didar-extension article")
    .filter({ hasText: uid })
    .scrollIntoViewIfNeeded();
  await vendor.screenshot({
    path: evidence + "/native-vendor-agency-finance-1440.png",
    fullPage: true,
  });
  await api("/admin/sellers/" + seller + "/suspend", nativeAdmin, { reason });
  try {
    await vendor.goto(origin + "/seller/didar/history");
    await expect(
      vendor.getByRole("heading", {
        name: "سوابق مجاز فروشنده · فقط خواندنی",
        exact: true,
      }),
    ).toBeVisible();
    await expect(vendor.locator(".didar-extension")).toContainText(order);
    await expect(vendor.locator(".didar-extension")).toContainText(uid);
    await vendor.screenshot({
      path: evidence + "/native-vendor-agency-suspended-history-1440.png",
      fullPage: true,
    });
    await vendor
      .getByRole("link", { name: order + " · اسناد مجاز", exact: true })
      .click();
    await expect(vendor).toHaveURL(
      new RegExp("/seller/didar/invoices\\?order_id=" + order),
    );
    await expect(
      vendor.getByRole("heading", {
        name: "اسناد مجاز فروشنده · فقط خواندنی",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      vendor.getByRole("region", { name: "اسناد سفارش", exact: true }),
    ).toContainText(uid);
    await vendor.screenshot({
      path: evidence + "/native-vendor-suspended-invoice-1440.png",
      fullPage: true,
    });
  } finally {
    await api("/admin/sellers/" + seller + "/unsuspend", nativeAdmin, {});
  }
  const saved = (
    await db.query(
      "SELECT origin_supplier_id,status FROM didar_order WHERE id=$1",
      [order],
    )
  ).rows[0];
  expect(saved).toEqual({ origin_supplier_id: supplierId, status: "paid" });
  expect(
    (
      await db.query(
        `SELECT i.uid FROM didar_item_reservation r JOIN didar_inventory_item i ON i.id=r.item_id
    JOIN didar_order_line l ON l.id=r.order_line_id WHERE l.order_id=$1 AND r.status='sold'`,
        [order],
      )
    ).rows,
  ).toEqual([{ uid }]);
  expect(errors).toEqual([]);
  await vendor.close();
  await customer.close();
});
