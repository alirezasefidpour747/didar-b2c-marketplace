import { test, expect, type Page, type Route } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
import { mkdirSync } from "node:fs";

// Reviewer-owned timing regressions: every response comes from the real native
// backend/PostgreSQL; routing only delays delivery, never substitutes API data.
const origin = process.env.TEST_API_URL!;
const safe = process.env.DIDAR_DISPOSABLE_QA === "true" &&
  process.env.DIDAR_ENVIRONMENT === "local" &&
  /^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:\d+\/didar_qa$/.test(process.env.DATABASE_URL || "");
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const suppliers: string[] = [], products: string[] = [];
const evidence = ".local/evidence/issue18";
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function request(path: string, token = "", body?: unknown, seller?: string) {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(seller ? { "x-seller-id": seller } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  expect(r.status, path + " " + JSON.stringify(data)).toBe(200);
  return data;
}
async function native(surface: "admin" | "vendor") {
  const role = surface === "admin" ? "user" : "member";
  const email = surface === "admin" ? "native-admin@didar.test" : "native-supplier@didar.test";
  const token = (await request(`/auth/${role}/emailpass`, "", { email, password: "DidarNative2026!" })).token;
  const canonical = (await request("/didar/login", "", { email: surface === "admin" ? "admin@didar.test" : "supplier@didar.test", password: "DidarDemo2026!" })).token;
  const seller = surface === "vendor" ? (await db.query("SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1' AND active")).rows[0].seller_id : undefined;
  if (seller) expect((await request("/vendor/sellers/select", token, { seller_id: seller })).seller_id).toBe(seller);
  await request(`/${surface}/didar/connect`, token, { didar_token: canonical }, seller);
  return { token, seller, call: (action: string, body?: unknown) => request(`/${surface}/didar/` + action, token, body, seller) };
}
async function login(page: Page, surface: "dashboard" | "seller") {
  await page.goto(origin + "/" + surface + "/login");
  await page.locator("input[name=email]").fill(surface === "dashboard" ? "native-admin@didar.test" : "native-supplier@didar.test");
  await page.locator("input[name=password]").fill("DidarNative2026!");
  await page.locator("button[type=submit]").click();
  if (surface === "seller") {
    await page.waitForURL(u => u.pathname === "/seller/store-select");
    await page.getByRole("button", { name: /دیدار s1/ }).click();
  }
  await page.waitForURL(u => !u.pathname.endsWith("/login") && !u.pathname.endsWith("/store-select"));
}
async function paints(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
test.afterAll(async () => {
  if (safe) {
    if (suppliers.length) await db.query("UPDATE didar_supplier SET active=false WHERE id=ANY($1::text[])", [suppliers]);
    if (products.length) await db.query("UPDATE didar_product SET active=false,published=false WHERE id=ANY($1::text[])", [products]);
    // Existing suite convention: synthetic bridge/login-window isolation only.
    await db.query("DELETE FROM didar_native_actor WHERE user_id IN ('demo-admin','demo-supplier')");
    await db.query("DELETE FROM didar_login_attempt");
  }
  await db.end();
});

test("I18 independent real Vendor CMS keeps pending operations disabled and previews the saved current version", async ({ page }) => {
  if (!safe) throw Error("Disposable loopback QA required");
  test.setTimeout(120000); mkdirSync(evidence, { recursive: true });
  const admin = await native("admin");
  const storefronts = await admin.call("storefront");
  // A native merchant-home draft requires a legitimate existing storefront.
  // Keep any stable existing handle/configuration; provision only a missing QA row.
  if (!storefronts.stores.some((s: any) => s.supplier_id === "s1"))
    await admin.call("storefront", { kind: "save", supplier_id: "s1", handle: "synthetic-closure-s1", name: "ویترین خصوصی ساختگی آزمون", visibility: "UNLISTED_LINK", published: false, approved: false });
  const vendor = await native("vendor"), tag = crypto.randomUUID().slice(0, 8);
  const index = await vendor.call("pages");
  const old = index.pages.find((p: any) => p.supplier_id === "s1" && p.kind === "MERCHANT_HOME" && p.route_key === "");
  const existing = old ? await vendor.call("pages?page_id=" + old.id) : null;
  const title = "پیش‌نویس مستقل هم‌زمان " + tag;
  const draft = await vendor.call("pages", { operation: "draft", supplier_id: "s1", kind: "MERCHANT_HOME", route_key: "", title,
    blocks: [{ id: crypto.randomUUID(), type: "BRAND_STORY", theme: "WHITE", title: "متن پیش از ویرایش", body: "" }],
    ...(existing ? { page_id: old.id, revision: existing.page.revision } : {}) });
  const optionsReady = gate(), releaseOptions = gate(), detailReady = gate(), releaseDetail = gate();
  const staleReady = gate(), releaseStale = gate(), staleDelivered = gate();
  let staleFetched = 0, staleFinished = 0, saved = false, heldDetail = false;
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await login(page, "seller");
  await page.route("**/vendor/didar/**", async (route: Route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.searchParams.get("supplier_id") === "DIDAR" &&
        ["/vendor/didar/pages", "/vendor/didar/content-media"].includes(url.pathname)) {
      const response = await route.fetch(); expect(response.status()).toBe(403);
      if (++staleFetched === 2) staleReady.release();
      await releaseStale.promise; await route.fulfill({ response });
      if (++staleFinished === 2) staleDelivered.release(); return;
    }
    if (route.request().method() === "GET" && url.searchParams.get("options") === "1" && url.searchParams.get("supplier_id") === "s1") {
      const response = await route.fetch(); expect(response.status()).toBe(200); optionsReady.release();
      await releaseOptions.promise; await route.fulfill({ response }); return;
    }
    if (saved && !heldDetail && route.request().method() === "GET" && url.searchParams.get("page_id") === draft.page_id) {
      heldDetail = true;
      const response = await route.fetch(); expect(response.status()).toBe(200); detailReady.release();
      await releaseDetail.promise; await route.fulfill({ response }); return;
    }
    await route.continue();
  });
  try {
    await page.goto(origin + "/seller/didar/pages");
    await optionsReady.promise; await staleReady.promise;
    releaseStale.release(); await staleDelivered.promise; await paints(page);
    const open = page.getByRole("button", { name: new RegExp(title) });
    await expect(open).toBeVisible();
    // The index request has completed, but the unrelated real options request
    // has not. One completion must not release all management controls.
    await expect(open).toBeDisabled();
    await expect(page.getByLabel("عنوان صفحه", { exact: true })).toBeDisabled();
    releaseOptions.release();
    await expect(open).toBeEnabled(); await open.click();
    const edited = "نسخه ذخیره‌شده بدون رقابت " + tag;
    await page.getByLabel("عنوان بلوک", { exact: true }).fill(edited);
    saved = true;
    await page.getByRole("button", { name: "ذخیره نسخه پیش‌نویس", exact: true }).click();
    await detailReady.promise;
    const preview = page.getByRole("button", { name: "پیش‌نمایش همین نسخه", exact: true });
    await expect(preview).toBeDisabled();
    releaseDetail.release();
    await expect(preview).toBeEnabled(); await preview.click();
    await expect(page.locator(".cms-preview")).toContainText(edited);
    await expect(page.getByLabel("عنوان بلوک", { exact: true })).toHaveValue(edited);
    await page.screenshot({ path: evidence + "/native-vendor-cms-race-1440.png", fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    releaseStale.release(); releaseOptions.release(); releaseDetail.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("I18 independent native Admin sharing ignores a late real response from the previously selected merchant", async ({ page }) => {
  if (!safe) throw Error("Disposable loopback QA required");
  test.setTimeout(120000); mkdirSync(evidence, { recursive: true });
  const admin = await native("admin"), tag = "uirace-" + crypto.randomUUID().slice(0, 8);
  async function merchant(suffix: string) {
    const sid = (await admin.call("manage", { kind: "supplier", name: tag + "-" + suffix })).id;
    suppliers.push(sid);
    const title = "محصول مستقل دامنه " + suffix + " " + tag;
    const pid = (await admin.call("manage", { kind: "product", title, category_id: "ring", purity: 750, published: true, approved: true, active: true })).id;
    products.push(pid);
    await admin.call("manage", { kind: "new_offer", supplier_id: sid, product_id: pid, weight_mg: 2350, quantity: 1, labor_mode: "fixed", labor_irr: 0, margin_bps: 700, active: true });
    await admin.call("storefront", { kind: "save", supplier_id: sid, handle: tag + "-" + suffix.toLowerCase(), name: title, visibility: "UNLISTED_LINK", published: true, approved: true });
    return { sid, pid, title };
  }
  const a = await merchant("A"), b = await merchant("B");
  await login(page, "dashboard");
  await page.goto(origin + "/dashboard/didar/sharing");
  const select = page.getByLabel("فروشگاه اشتراک", { exact: true });
  await select.selectOption(b.sid);
  await expect(page.getByRole("checkbox", { name: b.title, exact: true })).toBeVisible();
  const receivedA = gate(), releaseA = gate(), deliveredA = gate();
  let holdA = true;
  await page.route("**/admin/didar/sharing?*", async (route: Route) => {
    if (holdA && new URL(route.request().url()).searchParams.get("supplier_id") === a.sid) {
      holdA = false;
      const response = await route.fetch(); expect(response.status()).toBe(200);
      const realData = await response.json(); expect(realData.products.map((p: any) => p.id)).toContain(a.pid);
      receivedA.release(); await releaseA.promise; await route.fulfill({ response }); deliveredA.release(); return;
    }
    await route.continue();
  });
  try {
    await select.selectOption(a.sid); await receivedA.promise;
    await select.selectOption(b.sid);
    await expect(page.getByRole("checkbox", { name: b.title, exact: true })).toBeVisible();
    const late = page.waitForResponse(r => r.url().includes("/admin/didar/sharing?") && new URL(r.url()).searchParams.get("supplier_id") === a.sid);
    releaseA.release(); await deliveredA.promise; await (await late).finished(); await paints(page);
    await expect(select).toHaveValue(b.sid);
    await expect(page.getByRole("checkbox", { name: b.title, exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: a.title, exact: true })).toHaveCount(0);
    await page.screenshot({ path: evidence + "/native-admin-sharing-scope-race-1440.png", fullPage: true });
  } finally {
    releaseA.release(); await page.unrouteAll({ behavior: "wait" });
  }
});
