import { test, expect } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
import { mkdirSync } from "node:fs";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const disposableQA =
  process.env.DIDAR_DISPOSABLE_QA === "true" &&
  process.env.DIDAR_ENVIRONMENT === "local" &&
  /^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:\d+\/didar_qa$/.test(
    process.env.DATABASE_URL || "",
  );
const origin = process.env.TEST_API_URL!,
  evidence = ".local/evidence/issue13";
test.afterAll(async () => {
  if (disposableQA) {
    await db.query(
      "DELETE FROM didar_native_actor WHERE user_id IN ('demo-admin','demo-supplier')",
    );
    // Independent suites do not share a synthetic login-attempt budget. The
    // production limiter and its real HTTP security tests are unchanged.
    await db.query("DELETE FROM didar_login_attempt");
  }
  await db.end();
});
async function api(path: string, token = "", body?: any) {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  expect(r.status, JSON.stringify(d)).toBe(200);
  return d;
}
async function signIn(
  page: any,
  base: string,
  email: string,
  storeName?: string,
) {
  await page.goto(origin + base + "/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill("DidarNative2026!");
  await page.locator("button[type=submit]").click();
  if (base === "/seller") {
    await page.waitForURL((u: URL) => u.pathname === "/seller/store-select");
    await page.getByRole("button", { name: storeName || /دیدار s1/ }).click();
  }
  await page.waitForURL(
    (u: URL) =>
      u.pathname !== base + "/login" && u.pathname !== base + "/store-select",
  );
}
test("C01/C06/C07 real native Admin managed launch without Vendor login, Customer purchase, and suspended Vendor history", async ({
  page,
  browser,
}) => {
  if (!disposableQA) throw Error("Disposable loopback QA required");
  test.setTimeout(180000);
  mkdirSync(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = (
    await api("/auth/user/emailpass", "", {
      email: "native-admin@didar.test",
      password: "DidarNative2026!",
    })
  ).token;
  const canonical = (
    await api("/didar/login", "", {
      email: "admin@didar.test",
      password: "DidarDemo2026!",
    })
  ).token;
  await api("/admin/didar/connect", admin, { didar_token: canonical });
  const tag = "managed-browser-" + crypto.randomUUID().slice(0, 8),
    password = "ManagedPolicy2026!";
  const n = (action: string, body?: any) =>
    api("/admin/didar/" + action, admin, body);
  const sid = (
    await n("manage", {
      kind: "supplier",
      name: tag,
      email: tag + "@didar.test",
      password,
    })
  ).id;
  const pid = (
    await n("manage", {
      kind: "product",
      category_id: "ring",
      title: "طلای ویترین مدیریت‌شده " + tag,
      purity: 750,
      description: "آزمایش مدیریت واقعی",
      published: true,
    })
  ).id;
  const contract = (
    await n("finance", {
      operation: "contract_request",
      supplier_id: sid,
      mode: "MIXED",
      gold_bps: 5000,
      ownership: "CONSIGNMENT",
      effective_at: "2020-01-01T00:00:00Z",
      due_days: 7,
      reason: "Synthetic managed test",
    })
  ).id;
  await n("finance", {
    operation: "contract_review",
    contract_id: contract,
    approved: true,
    reason: "Synthetic approved test",
  });
  const batch = (
    await n("intake", {
      operation: "create",
      supplier_id: sid,
      invoice_number: tag,
      reference_purity: 750,
    })
  ).id;
  const line = (
    await n("intake", {
      operation: "line",
      batch_id: batch,
      product_id: pid,
      description: tag,
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
  expect(
    (
      await db.query("SELECT 1 FROM didar_native_seller WHERE supplier_id=$1", [
        sid,
      ])
    ).rowCount,
  ).toBe(0);
  await signIn(page, "/dashboard", "native-admin@didar.test");
  await page.goto(origin + "/dashboard/didar/storefront");
  await page.getByLabel("فروشنده ویترین", { exact: true }).selectOption(sid);
  await page.getByLabel("شناسه پیوند ثابت", { exact: true }).fill(tag);
  await page
    .getByLabel("نام ویترین", { exact: true })
    .fill("ویترین مدیریت دیدار");
  await page.locator('select[name="visibility"]').selectOption("UNLISTED_LINK");
  await page.getByLabel("منتشر شود", { exact: true }).check();
  await page.getByLabel("تأیید دیدار", { exact: true }).check();
  await page.getByRole("button", { name: "ذخیره ویترین", exact: true }).click();
  await expect(
    page.getByText("وضعیت: تأیید شده", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: evidence + "/admin-managed-launch.png",
    fullPage: true,
  });
  const customer = await browser.newPage();
  customer.on("pageerror", (e) => errors.push(e.message));
  await customer.goto("/m/" + tag + "/products");
  await customer
    .getByRole("heading", { name: "طلای ویترین مدیریت‌شده " + tag })
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
  await customer
    .getByLabel("نام کامل / کسب‌وکار")
    .fill("مشتری ویترین مدیریت‌شده");
  await customer
    .getByLabel("ایمیل", { exact: true })
    .fill(tag + "-buyer@didar.test");
  await customer.getByLabel("رمز عبور", { exact: true }).fill(password);
  await customer
    .getByRole("button", { name: "ایجاد حساب", exact: true })
    .click();
  await expect(customer).toHaveURL("/m/" + tag + "/account");
  await customer.goto("/m/" + tag + "/cart");
  await customer.getByLabel("نام گیرنده").fill("مشتری آزمایشی");
  await customer.getByLabel("شماره همراه (09…)").fill("09123456789");
  await customer.getByLabel("شهر", { exact: true }).fill("تهران");
  await customer.getByLabel("نشانی کامل").fill("نشانی آزمایشی");
  await customer.getByLabel("کد پستی ۱۰ رقمی").fill("1234567890");
  await customer
    .getByRole("button", { name: "ثبت و تأیید قیمت سفارش", exact: true })
    .click();
  await expect(customer).toHaveURL(new RegExp("/m/" + tag + "/orders/"));
  await customer
    .getByRole("button", { name: "شبیه‌سازی پرداخت موفق", exact: true })
    .click();
  await expect(customer.getByText("پرداخت شده", { exact: true })).toBeVisible();
  await customer.screenshot({
    path: evidence + "/customer-managed-paid-order.png",
    fullPage: true,
  });
  const orderId = new URL(customer.url()).pathname.split("/").pop();
  expect(
    (
      await db.query("SELECT origin_supplier_id FROM didar_order WHERE id=$1", [
        orderId,
      ])
    ).rows[0].origin_supplier_id,
  ).toBe(sid);
  expect(
    (
      await db.query("SELECT 1 FROM member WHERE email=$1", [
        tag + "@didar.test",
      ])
    ).rowCount,
  ).toBe(0);
  // The merchant starts native self-service only AFTER the managed sale. Link
  // the same canonical business; no stock, offers or orders are transferred.
  const ownerEmail = tag + "@didar.test";
  const registration = await fetch(origin + "/auth/member/emailpass/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: "DidarNative2026!" }),
  });
  expect([200, 201]).toContain(registration.status);
  const registrationToken = (await registration.json()).token;
  const sellerResponse = await fetch(origin + "/vendor/sellers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + registrationToken,
    },
    body: JSON.stringify({
      name: "دیدار مدیریت‌شده",
      email: ownerEmail,
      member_email: ownerEmail,
      currency_code: "irr",
    }),
  });
  expect(sellerResponse.status, await sellerResponse.clone().text()).toBe(201);
  const seller = (await sellerResponse.json()).seller.id;
  await api("/admin/sellers/" + seller + "/approve", admin, {});
  await n("seller-links", { seller_id: seller, supplier_id: sid });
  const vendorProof = (
    await api("/didar/login", "", { email: ownerEmail, password })
  ).token;
  const vendorToken = (
    await api("/auth/member/emailpass", "", {
      email: ownerEmail,
      password: "DidarNative2026!",
    })
  ).token;
  const connect = await fetch(origin + "/vendor/didar/connect", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + vendorToken,
      "x-seller-id": seller,
    },
    body: JSON.stringify({ didar_token: vendorProof }),
  });
  expect(connect.status).toBe(200);
  const vendor = await browser.newPage();
  vendor.on("pageerror", (e) => errors.push(e.message));
  await signIn(vendor, "/seller", ownerEmail, "دیدار مدیریت‌شده");
  await api("/admin/sellers/" + seller + "/suspend", admin, {
    reason: "Synthetic read-only acceptance",
  });
  try {
    await vendor.goto(origin + "/seller/didar/history");
    await expect(
      vendor.getByRole("heading", { name: "سوابق مجاز فروشنده · فقط خواندنی" }),
    ).toBeVisible();
    await expect(
      vendor.getByText("فعالیت تجاری متوقف است؛ سوابق مجاز فقط خواندنی است."),
    ).toBeVisible();
    await expect(vendor.locator(".didar-extension")).not.toContainText(
      "QA_PRIVATE_NATIVE_BANK",
    );
    await expect(vendor.locator(".didar-extension")).toContainText(orderId!);
    const uid = (
      await db.query(
        "SELECT i.uid FROM didar_item_reservation r JOIN didar_inventory_item i ON i.id=r.item_id JOIN didar_order_line l ON l.id=r.order_line_id WHERE l.order_id=$1",
        [orderId],
      )
    ).rows[0].uid;
    await expect(vendor.locator(".didar-extension")).toContainText(uid);
    await vendor.screenshot({
      path: evidence + "/vendor-suspended-history.png",
      fullPage: true,
    });
    await vendor.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        vendor.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await vendor.screenshot({
      path: evidence + "/vendor-suspended-history-390.png",
      fullPage: true,
    });
  } finally {
    await api("/admin/sellers/" + seller + "/unsuspend", admin, {});
  }
  expect(errors).toEqual([]);
  await vendor.close();
  await customer.close();
  await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [sid]);
});
