import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { Pool } from "../../packages/api/node_modules/pg";
const fixtureDB = new Pool({ connectionString: process.env.DATABASE_URL });
test.afterAll(async () => {
  if (process.env.DIDAR_DISPOSABLE_QA === "true")
    await fixtureDB.query(
      "DELETE FROM didar_native_actor WHERE user_id IN ('demo-admin','demo-supplier','native-staff-canonical')",
    );
  await fixtureDB.end();
});
test.use({ locale: "fa-IR" });
const origin = process.env.TEST_API_URL || "http://localhost:9000";
const evidence = ".local/evidence/mercur-native";
async function signIn(page: any, base: string, email: string) {
  await page.goto(origin + base + "/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill("DidarNative2026!");
  await page.locator("button[type=submit]").click();
  if (base === "/seller") {
    await page.waitForURL((u: URL) => u.pathname === "/seller/store-select");
    await page
      .getByRole("button", {
        name: email.includes("rival") ? /دیدار s2/ : /دیدار s1/,
      })
      .click();
    await page.waitForURL(
      (u: URL) => u.pathname === "/seller" || u.pathname === "/seller/",
    );
  } else await page.waitForURL((u: URL) => u.pathname !== base + "/login");
}
test("real native Admin and Vendor shells navigate connected Didar products, pricing, UID, CMS and storefront; customer remains B2C", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  mkdirSync(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e: any) => errors.push(e.message));
  await signIn(page, "/dashboard", "native-admin@didar.test");
  await page.goto(origin + "/dashboard/didar");
  await expect(
    page.getByRole("heading", { name: "اتصال حساب موجود دیدار", exact: true }),
  ).toBeVisible();
  await page.getByLabel("ایمیل حساب دیدار").fill("admin@didar.test");
  await page.getByLabel("رمز حساب دیدار").fill("DidarDemo2026!");
  await page
    .getByRole("button", { name: "اتصال امن حساب", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "دیدار · مدیریت مرکزی", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
  await expect(page.locator(".didar-extension")).toContainText("کاتالوگ");
  await page.screenshot({
    path: evidence + "/admin-products.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "پروفایل قیمت طلا", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/didar\/pricing/);
  await expect(page.locator(".didar-extension")).toContainText("پروفایل");
  await page
    .getByRole("link", { name: "موجودی و UID / RFID", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/didar\/operations/);
  await expect(page.locator(".didar-extension")).toContainText("UID");
  await page.getByRole("link", { name: "صفحه‌ساز بصری", exact: true }).click();
  await expect(page.getByLabel("عنوان صفحه", { exact: true })).toBeEnabled();
  await page.locator(".cms-editor-list button").first().click();
  await expect(page.getByLabel("عنوان صفحه", { exact: true })).toBeEnabled();
  const title = "قالب بومی دیدار " + crypto.randomUUID().slice(0, 8);
  await page.getByLabel("عنوان صفحه", { exact: true }).fill(title);
  // Earlier suites deliberately retire referenced collections. Create a new draft
  // from current approved media without altering the already published version.
  while (
    await page.getByRole("button", { name: "حذف بلوک", exact: true }).count()
  )
    await page
      .getByRole("button", { name: "حذف بلوک", exact: true })
      .first()
      .click();
  await page.getByRole("button", { name: "افزودن بلوک", exact: true }).click();
  await page
    .getByLabel("عنوان بلوک", { exact: true })
    .last()
    .fill("داستان بومی دیدار");
  await page
    .getByLabel("بلوک جدید", { exact: true })
    .selectOption("FULL_BLEED_MEDIA");
  await page.getByRole("button", { name: "افزودن بلوک", exact: true }).click();
  await page
    .getByLabel("رسانه اصلی", { exact: true })
    .selectOption({ label: "حلقه هندسی آزمایشی · approved · image/png" });
  await page
    .getByLabel("توضیح جایگزین", { exact: true })
    .fill("رسانه تأییدشده در فضای بومی");
  await page
    .getByRole("button", { name: "ذخیره نسخه پیش‌نویس", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: new RegExp(title) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "پیش‌نمایش همین نسخه", exact: true })
    .click();
  await expect(page.locator(".cms-page")).toBeVisible();
  const previewImage = page.locator(".cms-page img").first();
  await expect
    .poll(() =>
      previewImage.evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await previewImage.scrollIntoViewIfNeeded();
  await page.screenshot({ path: evidence + "/admin-cms.png", fullPage: true });
  await page
    .getByRole("link", { name: "اتصال فروشگاه بومی", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "دسترسی بومی همکاران", exact: true }),
  ).toBeVisible();
  const ownAccess = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", {
        name: "مدیر دیدار · admin@didar.test",
        exact: true,
      }),
    });
  await ownAccess.getByLabel("محدودیت ورود بومی").selectOption("READ_ONLY");
  await ownAccess
    .getByLabel("دلیل ثبت تغییر")
    .fill("QA last administrator restriction guard");
  await ownAccess
    .getByRole("button", { name: "ثبت محدودیت ورود", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("حداقل یک مدیر بومی");
  await page.screenshot({
    path: evidence + "/admin-native-access.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "کیف پول آزمایشی", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "مانده‌ها", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "ثبت عملیات داخلی آزمایشی",
      exact: true,
    }),
  ).toBeVisible();
  const vendor = await browser.newPage();
  const vendorErrors: string[] = [];
  vendor.on("pageerror", (e: any) => vendorErrors.push(e.message));
  await signIn(vendor, "/seller", "native-supplier@didar.test");
  await vendor.goto(origin + "/seller/didar");
  await expect(
    vendor.getByRole("heading", {
      name: "اتصال حساب موجود دیدار",
      exact: true,
    }),
  ).toBeVisible();
  await vendor.getByLabel("ایمیل حساب دیدار").fill("supplier@didar.test");
  await vendor.getByLabel("رمز حساب دیدار").fill("DidarDemo2026!");
  await vendor
    .getByRole("button", { name: "اتصال امن حساب", exact: true })
    .click();
  await expect(
    vendor.getByRole("heading", {
      name: "اتصال حساب موجود دیدار",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(vendor.locator(".didar-extension")).toContainText("عرضه");
  await vendor.screenshot({
    path: evidence + "/vendor-products.png",
    fullPage: true,
  });
  await vendor
    .getByRole("link", { name: "ویترین فروشگاه", exact: true })
    .click();
  await expect(
    vendor.getByLabel("شناسه پیوند ثابت", { exact: true }),
  ).toBeVisible();
  const handle = vendor.getByLabel("شناسه پیوند ثابت", { exact: true });
  if (!(await handle.inputValue()))
    await handle.fill("native-qa-" + crypto.randomUUID().slice(0, 8));
  await vendor
    .getByLabel("نام ویترین", { exact: true })
    .fill("ویترین بومی دیدار");
  await vendor
    .getByRole("button", { name: "ذخیره ویترین", exact: true })
    .click();
  await expect(
    vendor.getByText("در انتظار تأیید", { exact: false }),
  ).toBeVisible();
  await vendor.screenshot({
    path: evidence + "/vendor-storefront.png",
    fullPage: true,
  });
  // The actual native Admin approves the draft saved by the native Vendor.
  await page.getByRole("link", { name: "ویترین فروشگاه", exact: true }).click();
  await page.getByLabel("فروشنده ویترین", { exact: true }).selectOption("s1");
  await page.getByLabel("منتشر شود", { exact: true }).check();
  await page.getByLabel("تأیید دیدار", { exact: true }).check();
  await page.getByRole("button", { name: "ذخیره ویترین", exact: true }).click();
  await expect(
    page.getByText("وضعیت: تأیید شده", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: evidence + "/admin-storefront-approval.png",
    fullPage: true,
  });
  await vendor.getByRole("link", { name: "پذیرش محصول", exact: true }).click();
  await expect(vendor.locator(".didar-extension")).toContainText("محصول");
  const forbidden = await vendor.request.get(origin + "/admin/didar/manage");
  expect(forbidden.status()).toBe(401);
  const customer = await browser.newPage();
  await customer.goto("/login");
  await customer
    .getByLabel("ایمیل", { exact: true })
    .fill("customer@didar.test");
  await customer.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await customer.getByRole("button", { name: "ورود", exact: true }).click();
  await customer.waitForURL((u: URL) => u.pathname !== "/login");
  await customer.goto("/orders");
  await expect(
    customer.getByRole("heading", { name: /سفارش‌های/ }),
  ).toBeVisible();
  await customer.screenshot({
    path: evidence + "/customer-orders.png",
    fullPage: true,
  });
  for (const [target, name] of [
    [page, "admin"],
    [vendor, "vendor"],
    [customer, "customer"],
  ] as const) {
    await target.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        target.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await target.screenshot({
      path: evidence + "/" + name + "-390.png",
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
  expect(vendorErrors).toEqual([]);
  await vendor.close();
  await customer.close();
});

test("native Admin publishes a classified master, prints real permanent UID labels and the customer resolves the current PDP", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  mkdirSync(evidence, { recursive: true });
  await signIn(page, "/dashboard", "native-admin@didar.test");
  await page.goto(origin + "/dashboard/didar");
  const token = await page.evaluate(() =>
    localStorage.getItem("mercur_admin_auth_token"),
  );
  async function api(action: string, body?: any) {
    const r = await page.request.fetch(origin + "/admin/didar/" + action, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: "Bearer " + token },
      ...(body === undefined ? {} : { data: body }),
    });
    expect(r.status(), await r.text()).toBe(200);
    return r.json();
  }
  const tag = "native-uid-" + crypto.randomUUID().slice(0, 8);
  await page
    .getByRole("button", { name: "کاتالوگ و تصاویر", exact: true })
    .click();
  const form = page.getByTestId("product-form");
  await expect(form.locator("[name=published]")).toBeDisabled();
  await form.locator("[name=title]").fill(tag);
  await form
    .getByRole("button", { name: "ثبت در کاتالوگ Mercur", exact: true })
    .click();
  let product: any;
  await expect
    .poll(async () => {
      product = (await api("manage")).products.find(
        (p: any) => p.title === tag,
      );
      return !!product;
    })
    .toBe(true);
  const editor = page.locator(`[data-product-id="${product.id}"]`);
  await editor.locator("summary").click();
  await editor.getByLabel("خانواده", { exact: true }).selectOption("jewelry");
  await editor.getByLabel("دسته اصلی", { exact: true }).selectOption("rings");
  await editor.locator("[name=category_id]").selectOption("ring");
  await editor.locator("[name=slug]").fill(tag);
  await editor.locator("[name=published]").check();
  await editor
    .getByRole("button", { name: "ذخیره محصول", exact: true })
    .click();
  await expect(editor.locator("summary")).toContainText("منتشر شده");
  await page.goto(origin + "/dashboard/products/" + product.native_id);
  await expect(
    page.getByRole("link", {
      name: "پرونده معتبر محصول، طبقه‌بندی و عرضه ←",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", {
      name: "پرونده معتبر محصول، طبقه‌بندی و عرضه ←",
      exact: true,
    })
    .click();
  await expect(
    page.locator(`[data-product-id="${product.id}"]`),
  ).toHaveAttribute("open", "");
  const sid = (await api("manage", { kind: "supplier", name: tag })).id;
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
      product_id: product.id,
      description: "native printable pieces",
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
  await page.goto(origin + "/dashboard/didar/operations");
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
  await controls
    .getByLabel("عرض برچسب (میلی‌متر)", { exact: true })
    .fill("190");
  await expect(
    controls.getByRole("button", { name: "چاپ برچسب‌ها", exact: true }),
  ).toBeEnabled();
  const permanent = (await sheet.locator("article").first().innerText()).match(
    /https:\/\/[^\s]+/,
  )![0];
  await page.emulateMedia({ media: "print" });
  await expect(sheet.locator("article").first()).toBeVisible();
  await page.screenshot({
    path: evidence + "/admin-uid-print.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  const customer = await browser.newPage();
  await customer.goto(new URL(permanent).pathname);
  await expect(customer).toHaveURL(
    new RegExp("/fa/products/jewelry/rings/ring/" + tag + "-"),
  );
  await expect(
    customer.getByRole("heading", { name: tag, exact: true }),
  ).toBeVisible();
  await customer.close();
  await api("manage", {
    kind: "product",
    id: product.id,
    title: tag,
    purity: 750,
    category_id: "ring",
    published: false,
    active: false,
  });
});

test("native staff and global editor see only authorized sidebar routes and persist scoped CMS drafts without becoming administrators", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  mkdirSync(evidence, { recursive: true });
  await signIn(page, "/seller", "native-staff@didar.test");
  await page.goto(origin + "/seller/didar/connect");
  await expect(page.getByLabel("ایمیل حساب دیدار")).toBeVisible();
  await page
    .getByLabel("ایمیل حساب دیدار")
    .fill("native-staff-didar@didar.test");
  await page.getByLabel("رمز حساب دیدار").fill("DidarStaff2026!");
  await page
    .getByRole("button", { name: "اتصال امن حساب", exact: true })
    .click();
  await expect(
    page.getByText("حساب موجود متصل است.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "دفتر حسابداری", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "محصول و عرضه دیدار", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "صفحه‌ساز بصری", exact: true }).click();
  await expect(page.getByLabel("دامنه صفحه", { exact: true })).toHaveValue(
    "s1",
  );
  expect(
    await page
      .getByLabel("دامنه صفحه", { exact: true })
      .locator("option")
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      ),
  ).toEqual(["s1"]);
  const title = "پیش‌نویس همکار بومی " + crypto.randomUUID().slice(0, 8);
  await page.getByLabel("عنوان صفحه", { exact: true }).fill(title);
  await page.getByRole("button", { name: "افزودن بلوک", exact: true }).click();
  await page
    .getByLabel("عنوان بلوک", { exact: true })
    .last()
    .fill("محتوای مجاز فروشگاه");
  await page
    .getByRole("button", { name: "ذخیره نسخه پیش‌نویس", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: new RegExp(title) }),
  ).toBeVisible();
  const statuses = await page.evaluate(async () => {
    const headers = {
      authorization:
        "Bearer " + localStorage.getItem("mercur_vendor_auth_token"),
      "x-seller-id": localStorage.getItem("mercur_vendor_seller_id") || "",
    };
    const results = [];
    for (const path of [
      "/vendor/didar/ledger",
      "/vendor/customers",
      "/vendor/didar/pages?options=1&supplier_id=s2",
    ])
      results.push((await fetch(path, { headers })).status);
    return results;
  });
  expect(statuses).toEqual([403, 403, 403]);
  await page.screenshot({
    path: evidence + "/vendor-staff-cms.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: evidence + "/vendor-staff-390.png",
    fullPage: true,
  });
  const editor = await browser.newPage();
  await signIn(editor, "/dashboard", "native-content@didar.test");
  await editor.goto(origin + "/dashboard/didar/pages");
  await expect(editor.getByLabel("دامنه صفحه", { exact: true })).toHaveValue(
    "DIDAR",
  );
  await expect(
    editor.getByRole("link", { name: "دفتر حسابداری", exact: true }),
  ).toHaveCount(0);
  await expect(
    editor.getByRole("link", { name: "محصول و عرضه دیدار", exact: true }),
  ).toHaveCount(0);
  await editor.screenshot({
    path: evidence + "/admin-content-operator.png",
    fullPage: true,
  });
  await editor.close();
});

test("protected legacy deep links resume through actual native login and seller selection without exposing credentials", async ({
  browser,
}) => {
  test.setTimeout(120000);
  for (const [email, nativeEmail, base, target] of [
    [
      "admin@didar.test",
      "native-admin@didar.test",
      "/dashboard",
      "/pricing?product_id=ring",
    ],
    [
      "supplier@didar.test",
      "native-supplier@didar.test",
      "/seller",
      "/storefront",
    ],
    ["admin@didar.test", "native-admin@didar.test", "/dashboard", "/wallet"],
  ]) {
    const context = await browser.newContext(),
      page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("ایمیل", { exact: true }).fill(email);
    await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
    await page.getByRole("button", { name: "ورود", exact: true }).click();
    await page.waitForURL((u) => u.pathname !== "/login");
    await expect(
      page.getByRole("link", { name: "مدیریت طلا", exact: true }),
    ).toHaveCount(0);
    // Independent setup: another failed browser worker can clean prior links.
    // Prove both identities over the real API without installing native browser
    // credentials; the journey below must still perform native UI login.
    const didarToken = await page.evaluate(() =>
      sessionStorage.getItem("didar-session"),
    );
    const auth = await page.request.post(
      origin +
        "/auth/" +
        (base === "/dashboard" ? "user" : "member") +
        "/emailpass",
      { data: { email: nativeEmail, password: "DidarNative2026!" } },
    );
    expect(auth.status()).toBe(200);
    const nativeToken = (await auth.json()).token;
    const seller =
      base === "/seller"
        ? (
            await fixtureDB.query(
              "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1'",
            )
          ).rows[0].seller_id
        : null;
    const connection = await page.request.post(
      origin +
        (base === "/dashboard" ? "/admin" : "/vendor") +
        "/didar/connect",
      {
        headers: {
          authorization: "Bearer " + nativeToken,
          ...(seller ? { "x-seller-id": seller } : {}),
        },
        data: { didar_token: didarToken },
      },
    );
    expect(connection.status()).toBe(200);
    await page.goto(
      target === "/wallet" ? "/account/wallet" : "/manage" + target,
    );
    await expect(page).toHaveURL(new RegExp(base + "/login"));
    await page.locator("input[name=email]").fill(nativeEmail);
    await page.locator("input[name=password]").fill("DidarNative2026!");
    await page.locator("button[type=submit]").click();
    if (base === "/seller") {
      await page.waitForURL((u) => u.pathname === "/seller/store-select");
      await page.getByRole("button", { name: /دیدار s1/ }).click();
    }
    await expect(page).toHaveURL(origin + base + "/didar" + target);
    await expect(page.locator(".didar-extension")).toBeVisible();
    expect(page.url()).not.toMatch(/token|password|Bearer/);
    await page.screenshot({
      path:
        evidence +
        (base === "/dashboard"
          ? "/admin-legacy-handoff.png"
          : "/vendor-legacy-handoff.png"),
      fullPage: true,
    });
    await context.close();
  }
});
