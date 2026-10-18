import { test, expect, type Page } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
import sharp from "../../packages/api/node_modules/sharp";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// This suite writes synthetic editorial fixtures only to the owned disposable QA DB.
const safe =
  process.env.DIDAR_DISPOSABLE_QA === "true" &&
  process.env.DIDAR_ENVIRONMENT === "local" &&
  /^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:\d+\/didar_qa$/.test(
    process.env.DATABASE_URL || "",
  );
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const origin = process.env.TEST_API_URL!;
const evidence = ".local/evidence/pre-rollout";
test.use({ locale: "fa-IR", timezoneId: "UTC" });
let homeId = "",
  collectionId = "",
  merchantPageId = "";
const selectedSellers = new Map<string, string>();
async function http(path: string, token = "", data?: unknown, expected = 200) {
  const r = await fetch(origin + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      ...(selectedSellers.has(token)
        ? { "x-seller-id": selectedSellers.get(token)! }
        : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await r.json();
  expect(r.status, JSON.stringify(body)).toBe(expected);
  return body;
}
async function nativeToken(
  surface: "admin" | "vendor",
  email: string,
  canonicalEmail: string,
) {
  const token = (
    await http(
      `/auth/${surface === "admin" ? "user" : "member"}/emailpass`,
      "",
      {
        email,
        password: "DidarNative2026!",
      },
    )
  ).token;
  if (surface === "vendor") {
    const stores = await http("/vendor/sellers", token);
    const seller = stores.seller_members
      .map((membership: any) => membership.seller)
      .find((s: any) => s.name.includes(email.includes("rival") ? "s2" : "s1"));
    expect(seller).toBeTruthy();
    const selected = await http("/vendor/sellers/select", token, {
      seller_id: seller.id,
    });
    // Version-matched Mercur requires x-seller-id for token-based selection.
    expect(selected.seller_id).toBe(seller.id);
    const selectedToken = token;
    selectedSellers.set(selectedToken, seller.id);
    const legacy = (
      await http("/didar/login", "", {
        email: canonicalEmail,
        password: "DidarDemo2026!",
      })
    ).token;
    await http(`/${surface}/didar/connect`, selectedToken, {
      didar_token: legacy,
    });
    return selectedToken;
  }
  const legacy = (
    await http("/didar/login", "", {
      email: canonicalEmail,
      password: "DidarDemo2026!",
    })
  ).token;
  await http(`/${surface}/didar/connect`, token, { didar_token: legacy });
  return token;
}
async function login(
  page: Page,
  surface: "dashboard" | "seller",
  email: string,
) {
  await page.goto(`${origin}/${surface}/login`);
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill("DidarNative2026!");
  await page.locator("button[type=submit]").click();
  if (surface === "seller") {
    await page.waitForURL((u) => u.pathname === "/seller/store-select");
    await page.getByRole("button", { name: /دیدار s1/ }).click();
  }
  await page.waitForURL(
    (u) =>
      !u.pathname.endsWith("/login") && !u.pathname.endsWith("/store-select"),
  );
  await page.goto(`${origin}/${surface}/didar/pages`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex.*nofollow/,
  );
  await expect(
    page.getByRole("heading", { name: "صفحه‌ساز دیدار", exact: true }),
  ).toBeVisible();
}
test.afterAll(async () => {
  if (safe) {
    for (const id of [homeId, merchantPageId].filter(Boolean)) {
      await db.query(
        "UPDATE didar_content_publication SET cancelled=true WHERE page_id=$1 AND effective_from>now()",
        [id],
      );
      await db.query(
        "UPDATE didar_content_publication SET effective_to=now() WHERE page_id=$1 AND NOT cancelled AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now())",
        [id],
      );
    }
    if (collectionId)
      await db.query(
        "UPDATE didar_collection SET active=false,published=false WHERE id=$1",
        [collectionId],
      );
    await db.query(
      "DELETE FROM didar_native_actor WHERE user_id IN ('demo-admin','demo-supplier')",
    );
    await db.query("DELETE FROM didar_login_attempt");
  }
  await db.end();
});

test("native CMS publishes eleven live blocks, schedules immutable versions, rolls back, and degrades safely on desktop/mobile", async ({
  page,
  browser,
}) => {
  if (!safe) throw Error("Disposable loopback QA required");
  test.setTimeout(240000);
  mkdirSync(evidence, { recursive: true });
  const errors: string[] = [];
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = await nativeToken(
    "admin",
    "native-admin@didar.test",
    "admin@didar.test",
  );
  const n = (action: string, data?: unknown) =>
    http("/admin/didar/" + action, admin, data);
  const options = await n("pages?options=1&supplier_id=DIDAR");
  const products = options.products
    .filter((p: any) =>
      p.offers.some((o: any) => o.quantity > 0 && o.price?.total_irr > 0),
    )
    .slice(0, 3);
  expect(products.length).toBeGreaterThan(0);
  collectionId = (
    await n("manage", {
      kind: "collection",
      name: "مجموعه ساختگی آزمون بسته‌شدن یکپارچگی",
      slug: "closure-" + crypto.randomUUID().slice(0, 8),
      type_code: "signature",
      active: true,
      published: true,
      approved: true,
      product_ids: products.map((p: any) => p.id),
    })
  ).id;
  const photo = await sharp({
    create: { width: 960, height: 640, channels: 3, background: "#EEE6D9" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="960" height="640"><circle cx="480" cy="320" r="180" fill="none" stroke="#C5A46A" stroke-width="30"/><text x="330" y="330" fill="#142D50" font-size="30">SYNTHETIC QA</text></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  const portrait = await sharp(photo)
    .resize(640, 960, { fit: "contain", background: "#EEE6D9" })
    .png()
    .toBuffer();
  const temp = mkdtempSync(join(tmpdir(), "didar-closure-video-"));
  let video: Buffer;
  try {
    const file = join(temp, "synthetic.mp4");
    const result = spawnSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x142d50:s=960x540:d=2",
      "-vf",
      "drawbox=x=340:y=140:w=280:h=260:color=0xc5a46a:t=12",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "1",
      "-y",
      file,
    ]);
    expect(result.status, String(result.stderr)).toBe(0);
    video = readFileSync(file);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  const assets: string[] = [];
  for (const [mime_type, bytes] of [
    ["image/png", photo],
    ["image/png", portrait],
    ["video/mp4", video!],
  ] as const) {
    const uploaded = await n("content-media", {
      operation: "upload",
      supplier_id: "DIDAR",
      idempotency_key: crypto.randomUUID(),
      mime_type,
      data: bytes.toString("base64"),
      alt: "رسانه ساختگی آزمون یکپارچگی",
      allow_shared: true,
    });
    assets.push(uploaded.id);
    await n("content-media", {
      operation: "review",
      asset_id: uploaded.id,
      approved: true,
      visibility: "SHARED_MASTER",
      reason: "Synthetic disposable QA only",
    });
  }
  const media = (id: string, mobile = "") => ({
    asset_id: id,
    mobile_asset_id: mobile,
    alt: "رسانه ساختگی آزمون",
    fit: "CONTAIN",
  });
  const block = (type: string, extra = {}) => ({
    id: crypto.randomUUID(),
    type,
    title: "",
    theme: "WHITE",
    ...extra,
  });
  const blocks = [
    block("HERO_VIDEO", {
      title: "نمایش ساختگی آزمون یکپارچگی",
      theme: "NAVY",
      media: media(assets[2]),
    }),
    block("HERO_MEDIA_SLIDER", {
      slides: [media(assets[0], assets[1]), media(assets[2])],
    }),
    block("EDITORIAL_MOSAIC", {
      layout: "LARGE_TWO",
      tiles: [media(assets[0]), media(assets[1]), media(assets[0])],
    }),
    block("SPLIT_STORY", {
      theme: "CHAMPAGNE",
      body: "رسانه آزمایشی و غیرتجاری",
      media: media(assets[1]),
    }),
    block("FULL_BLEED_MEDIA", { media: media(assets[0]) }),
    block("COLLECTION_SPOTLIGHT", { collection_id: collectionId }),
    block("FEATURED_PRODUCT_GRID", {
      product_ids: products.map((p: any) => p.id),
    }),
    block("PRODUCT_CAROUSEL", { product_ids: products.map((p: any) => p.id) }),
    block("CATEGORY_FACET_DISCOVERY", { category_id: products[0].category_id }),
    block("BRAND_STORY", {
      title: "داستان ساختگی آزمون",
      body: "هیچ رسانه تجاری یا موجودی تازه‌ای ایجاد نشده است.",
    }),
    block("SPACER_DIVIDER", { height: 40 }),
  ];
  const index = await n("pages");
  const existing = index.pages.find(
    (p: any) => p.kind === "DIDAR_HOME" && !p.supplier_id,
  );
  await n("pages", {
    operation: "draft",
    supplier_id: "DIDAR",
    kind: "DIDAR_HOME",
    title: "صفحه ساختگی آزمون یکپارچگی",
    route_key: "",
    blocks,
    ...(existing ? { page_id: existing.id, revision: existing.revision } : {}),
  });
  homeId = (await n("pages")).pages.find(
    (p: any) => p.kind === "DIDAR_HOME" && !p.supplier_id,
  ).id;
  await login(page, "dashboard", "native-admin@didar.test");
  await page
    .locator(".cms-editor-list button")
    .filter({ hasText: "صفحه ساختگی آزمون یکپارچگی" })
    .click();
  await expect(page.locator("[data-editor-block]")).toHaveCount(11);
  // A genuine native editor save, review, and publish: API fixtures are not the final version.
  await page
    .getByLabel("عنوان صفحه", { exact: true })
    .fill("نسخه نخست ساختگی آزمون");
  await page
    .getByRole("button", { name: "پایین بردن بلوک 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "بالا بردن بلوک 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ذخیره نسخه پیش‌نویس", exact: true })
    .click();
  await expect(page.getByLabel("نسخه صفحه")).toBeEnabled();
  const first = await page.getByLabel("نسخه صفحه").inputValue();
  await page
    .getByRole("button", { name: "پیش‌نمایش همین نسخه", exact: true })
    .click();
  await expect(page.locator(".cms-preview [data-block-type]")).toHaveCount(11);
  const privateSlide = page.locator(".cms-preview .cms-slider");
  await privateSlide.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      privateSlide
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  // Mobile preview changes the same private ImageAsset from landscape to portrait.
  // Deny the next asset: the previous blob must disappear immediately, then a
  // terminal accessible failure replaces the loading state.
  await page.route("**/admin/didar/image?**", (route) =>
    new URL(route.request().url()).searchParams.get("id") === assets[1]
      ? route.fulfill({
          status: 403,
          contentType: "application/json",
          body: '{"message":"FORBIDDEN"}',
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "نمای موبایل ۳۹۰", exact: true })
    .click();
  await expect(privateSlide.locator(".photo-placeholder")).toHaveText(
    "تصویر در دسترس نیست",
  );
  await expect(privateSlide.locator("img")).toHaveCount(0);
  await page.screenshot({
    path: evidence + "/native-private-image-403-fallback.png",
    fullPage: true,
  });
  await page.unroute("**/admin/didar/image?**");
  await page.getByRole("button", { name: "تأیید نسخه", exact: true }).click();
  // A click dispatches the asynchronous publication. Observe its real committed
  // response before asserting the public read, which may legitimately be 404
  // while the first publication is still pending.
  const [publication] = await Promise.all([
    page.waitForResponse((response) => {
      const request = response.request();
      if (
        new URL(response.url()).pathname !== "/admin/didar/pages" ||
        request.method() !== "POST"
      )
        return false;
      const body = request.postDataJSON();
      return body.operation === "publish" && body.version_id === first;
    }),
    page.getByRole("button", { name: "انتشار صفحه", exact: true }).click(),
  ]);
  expect(publication.status()).toBe(200);
  expect(await publication.finished()).toBe(null);
  await expect
    .poll(async () => (await http("/didar/pages?kind=DIDAR_HOME")).version.id)
    .toBe(first);
  await page.screenshot({
    path: evidence + "/native-admin-cms-published-1440.png",
    fullPage: true,
  });
  await page
    .getByRole("heading", { name: "صفحه‌ساز دیدار", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: evidence + "/native-admin-cms-editor-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: evidence + "/native-admin-cms-editor-390.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const shopper = await browser.newPage({
    baseURL: process.env.TEST_STOREFRONT_URL,
    viewport: { width: 1440, height: 1000 },
  });
  shopper.on("pageerror", (e) => errors.push(e.message));
  await shopper.goto("/");
  await expect(shopper.locator(".cms-page")).toHaveAttribute(
    "data-version-id",
    first,
  );
  await expect(shopper.locator("[data-block-type]")).toHaveCount(11);
  const hero = shopper.locator(".cms-hero_video");
  await expect
    .poll(() =>
      hero.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThan(1);
  await hero.getByRole("button", { name: "توقف ویدیو", exact: true }).click();
  await expect(
    hero.getByRole("button", { name: "پخش ویدیو", exact: true }),
  ).toBeVisible();
  const slider = shopper.locator(".cms-slider");
  await slider.scrollIntoViewIfNeeded();
  await slider.focus();
  await shopper.keyboard.press("ArrowLeft");
  await expect(slider.getByText("2 / 2", { exact: true })).toBeVisible();
  await shopper.keyboard.press("ArrowRight");
  await expect(slider.getByText("1 / 2", { exact: true })).toBeVisible();
  const desktop = await shopper.locator(".cms-mosaic>div").evaluateAll((xs) =>
    xs.map((x) => {
      const b = x.getBoundingClientRect();
      return { x: b.x, width: b.width, y: b.y };
    }),
  );
  expect(desktop[0].width).toBeGreaterThan(desktop[1].width);
  await expect(
    shopper.locator(".cms-featured_product_grid .offer").first(),
  ).toBeVisible();
  await expect(
    shopper.locator(".cms-collection_spotlight .product"),
  ).toHaveCount(products.length);
  await shopper.screenshot({
    path: evidence + "/cms-published-1440.png",
    fullPage: true,
  });
  await shopper.setViewportSize({ width: 390, height: 844 });
  await shopper.reload();
  await expect(
    shopper.locator(".cms-featured_product_grid .product"),
  ).toHaveCount(products.length);
  const mobile = await shopper.locator(".cms-mosaic>div").evaluateAll((xs) =>
    xs.map((x) => {
      const b = x.getBoundingClientRect();
      return { x: b.x, y: b.y };
    }),
  );
  expect(Math.abs(mobile[0].x - mobile[1].x)).toBeLessThan(2);
  expect(mobile[1].y).toBeGreaterThan(mobile[0].y);
  expect(
    await shopper.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await shopper.screenshot({
    path: evidence + "/cms-published-390.png",
    fullPage: true,
  });
  // A missing clip must retain its decoded poster and an explicit fallback; no uncaught error.
  await shopper.route("**/api/didar/media-file?**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: '{"message":"NOT_FOUND"}',
    }),
  );
  await shopper.reload();
  await expect(
    hero.getByText("تصویر جایگزین ویدیو", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      hero.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await shopper.unroute("**/api/didar/media-file?**");
  await shopper.route("**/api/didar/image?**", (route) =>
    new URL(route.request().url()).searchParams.get("id") === assets[0]
      ? route.fulfill({
          status: 404,
          contentType: "application/json",
          body: '{"message":"NOT_FOUND"}',
        })
      : route.continue(),
  );
  const deniedImage = shopper.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/didar/image" &&
      url.searchParams.get("id") === assets[0] &&
      response.status() === 404
    );
  });
  await shopper.reload();
  await shopper.locator(".cms-full_bleed_media").scrollIntoViewIfNeeded();
  await deniedImage;
  await expect(
    shopper
      .locator(".cms-full_bleed_media")
      .getByRole("img", { name: "رسانه ساختگی آزمون", exact: true }),
  ).toBeVisible();
  await shopper.screenshot({
    path: evidence + "/image-404-fallback-390.png",
    fullPage: true,
  });
  await expect(shopper.locator(".cms-full_bleed_media img")).toHaveCount(0);
  await shopper.unroute("**/api/didar/image?**");
  await shopper.emulateMedia({ reducedMotion: "reduce" });
  await shopper.reload();
  await expect(
    hero.getByText("تصویر ثابت · کاهش حرکت یا مصرف داده", { exact: true }),
  ).toBeVisible();
  await expect(hero.locator("video")).toHaveCount(0);
  // Reviewed assets can be withdrawn without a broken image or a private-data leak.
  await n("content-media", {
    operation: "review",
    asset_id: assets[0],
    approved: false,
    reason: "Synthetic withdrawal acceptance",
  });
  await shopper.reload();
  await expect(
    shopper.locator(".cms-full_bleed_media .cms-media-placeholder"),
  ).toBeVisible();
  await n("content-media", {
    operation: "review",
    asset_id: assets[0],
    approved: true,
    visibility: "SHARED_MASTER",
    reason: "Synthetic acceptance restore",
  });
  await page
    .getByLabel("عنوان صفحه", { exact: true })
    .fill("نسخه دوم ساختگی زمان‌بندی");
  await page
    .getByRole("button", { name: "ذخیره نسخه پیش‌نویس", exact: true })
    .click();
  await expect
    .poll(() => page.getByLabel("نسخه صفحه").inputValue())
    .not.toBe(first);
  const second = await page.getByLabel("نسخه صفحه").inputValue();
  expect((await http("/didar/pages?kind=DIDAR_HOME")).version.id).toBe(first);
  await page.getByRole("button", { name: "تأیید نسخه", exact: true }).click();
  const scheduled = new Date(Date.now() + 12000).toISOString().slice(0, 19);
  await page.getByLabel("زمان انتشار", { exact: true }).fill(scheduled);
  await page
    .getByRole("button", { name: "زمان‌بندی انتشار", exact: true })
    .click();
  expect((await http("/didar/pages?kind=DIDAR_HOME")).version.id).toBe(first);
  await expect
    .poll(async () => (await http("/didar/pages?kind=DIDAR_HOME")).version.id, {
      timeout: 25000,
    })
    .toBe(second);
  await page.getByLabel("زمان انتشار", { exact: true }).fill("");
  await page.getByLabel("نسخه صفحه").selectOption(first);
  await page
    .getByRole("button", { name: "بازگشت به این نسخه", exact: true })
    .click();
  await expect
    .poll(async () => (await http("/didar/pages?kind=DIDAR_HOME")).version.id)
    .toBe(first);
  // Native Vendor owns its draft; a native token cannot switch its requested tenant.
  const storefronts = await n("storefront");
  if (!storefronts.stores.some((s: any) => s.supplier_id === "s1"))
    await n("storefront", {
      kind: "save",
      supplier_id: "s1",
      handle: "synthetic-closure-s1",
      name: "ویترین خصوصی ساختگی آزمون",
      visibility: "UNLISTED_LINK",
      published: false,
      approved: false,
    });
  const vendor = await nativeToken(
    "vendor",
    "native-supplier@didar.test",
    "supplier@didar.test",
  );
  const v = (action: string, data?: unknown) =>
    http("/vendor/didar/" + action, vendor, data);
  const ownIndex = await v("pages");
  expect(ownIndex.scopes.global).toBe(false);
  expect(ownIndex.scopes.suppliers.every((s: any) => s.id === "s1")).toBe(true);
  await http("/vendor/didar/pages?page_id=" + homeId, vendor, undefined, 403);
  await http(
    "/vendor/didar/content-media?supplier_id=s2",
    vendor,
    undefined,
    403,
  );
  const existingMerchant = ownIndex.pages.find(
    (p: any) => p.kind === "MERCHANT_HOME",
  );
  merchantPageId = (
    await v("pages", {
      operation: "draft",
      supplier_id: "s1",
      kind: "MERCHANT_HOME",
      title: "پیش‌نویس خصوصی ساختگی همکار",
      route_key: "",
      blocks: [block("BRAND_STORY", { title: "پیش‌نویس خصوصی آزمون" })],
      ...(existingMerchant
        ? { page_id: existingMerchant.id, revision: existingMerchant.revision }
        : {}),
    })
  ).page_id;
  const vendorPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  vendorPage.on("pageerror", (e) => errors.push(e.message));
  await login(vendorPage, "seller", "native-supplier@didar.test");
  await vendorPage
    .locator(".cms-editor-list button")
    .filter({ hasText: "پیش‌نویس خصوصی ساختگی همکار" })
    .click();
  await vendorPage
    .getByLabel("عنوان بلوک", { exact: true })
    .fill("داستان خصوصی ویرایش‌شده بومی");
  await vendorPage
    .getByRole("button", { name: "ذخیره نسخه پیش‌نویس", exact: true })
    .click();
  await vendorPage
    .getByRole("button", { name: "پیش‌نمایش همین نسخه", exact: true })
    .click();
  await expect(vendorPage.locator(".cms-preview")).toContainText(
    "داستان خصوصی ویرایش‌شده بومی",
  );
  await vendorPage
    .getByRole("heading", { name: "پیش‌نمایش خصوصی", exact: true })
    .scrollIntoViewIfNeeded();
  await vendorPage.screenshot({
    path: evidence + "/native-vendor-cms-private-1440.png",
    fullPage: true,
  });
  await vendorPage.setViewportSize({ width: 390, height: 844 });
  expect(
    await vendorPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await vendorPage.screenshot({
    path: evidence + "/native-vendor-cms-private-390.png",
    fullPage: true,
  });
  const merchantVersion = await vendorPage.getByLabel("نسخه صفحه").inputValue();
  await http(
    "/didar/pages",
    "",
    { operation: "preview", version_id: merchantVersion },
    401,
  );
  // Real native pause makes the public CMS unavailable; Home intentionally shows DefaultHome.
  await page
    .getByRole("button", { name: "توقف انتشار صفحه", exact: true })
    .click();
  await expect
    .poll(
      async () => (await fetch(origin + "/didar/pages?kind=DIDAR_HOME")).status,
    )
    .toBe(404);
  await shopper.reload();
  await expect(shopper.locator(".cms-page")).toHaveCount(0);
  await shopper.screenshot({
    path: evidence + "/cms-unpublished-fallback-390.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await vendorPage.close();
  await shopper.close();
});
