import { recordPage } from "./recording";
import { test, expect } from "@playwright/test";
import { Pool } from "../../packages/api/node_modules/pg";
import sharp from "../../packages/api/node_modules/sharp";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const evidence = ".local/evidence/merchant-phase4";
let pageId = "",
  token = "",
  collectionId = "";
async function api(page: any, action: string, body?: any, auth = token) {
  const r = await page.request.fetch("/api/didar/" + action, {
    method: body ? "POST" : "GET",
    headers: { authorization: "Bearer " + auth },
    ...(body ? { data: body } : {}),
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
test.afterAll(async () => {
  if (pageId)
    await db.query(
      "UPDATE didar_content_publication SET effective_to=now() WHERE page_id=$1 AND NOT cancelled AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now())",
      [pageId],
    );
  if (collectionId)
    await db.query(
      "UPDATE didar_collection SET active=false,published=false WHERE id=$1",
      [collectionId],
    );
  await db.end();
});
test("Persian page builder publishes the six core blocks, real video/slider/mosaic, responsive preview and live quote without a parallel cart", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  mkdirSync(evidence, { recursive: true });
  await page.goto("/login");
  await page.getByLabel("ایمیل", { exact: true }).fill("admin@didar.test");
  await page.getByLabel("رمز عبور", { exact: true }).fill("DidarDemo2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
  token =
    (await page.evaluate(() => sessionStorage.getItem("didar-session"))) || "";
  const available = await api(page, "pages?options=1&supplier_id=DIDAR");
  const eligible = available.products.find((p: any) =>
    p.offers.some((o: any) => o.quantity > 0 && o.price?.total_irr > 0),
  );
  expect(eligible).toBeTruthy();
  collectionId = (
    await api(page, "manage", {
      kind: "collection",
      name: "انتخاب آگاهانه دیدار",
      slug: "cms-" + crypto.randomUUID().slice(0, 8),
      type_code: "signature",
      active: true,
      published: true,
      approved: true,
      product_ids: [eligible.id],
    })
  ).id;
  await page.goto("/manage/pages");
  await expect(
    page.getByRole("heading", { name: "صفحه‌ساز دیدار", exact: true }),
  ).toBeVisible();
  const home = (
    await db.query(
      "SELECT * FROM didar_content_page WHERE kind='DIDAR_HOME' AND supplier_id IS NULL",
    )
  ).rows[0];
  if (home) {
    pageId = home.id;
    await page
      .getByRole("button", { name: home.title + " · خانه دیدار", exact: true })
      .click();
  }
  if (home)
    await expect(page.getByLabel("عنوان صفحه", { exact: true })).toHaveValue(
      home.title,
    );
  await page
    .getByLabel("عنوان صفحه", { exact: true })
    .fill("دیدار · زیبایی انتخاب آگاهانه");
  await page
    .getByLabel("قالب تأییدشده", { exact: true })
    .selectOption("didar_luxury");
  await page
    .getByRole("button", { name: "استفاده از قالب", exact: true })
    .click();
  await page
    .getByRole("button", { name: "پایین بردن بلوک 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "بالا بردن بلوک 2", exact: true })
    .click();
  await expect(page.locator("[data-editor-block]").first()).toHaveAttribute(
    "data-editor-block",
    "HERO_VIDEO",
  );
  const photo = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#EEE6D9" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="1200" height="800"><rect width="1200" height="800" fill="#EEE6D9"/><circle cx="600" cy="400" r="220" fill="none" stroke="#C5A46A" stroke-width="42"/><circle cx="600" cy="400" r="185" fill="none" stroke="#142D50" stroke-width="2"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  const portrait = await sharp(photo)
    .resize(700, 1000, { fit: "contain", background: "#EEE6D9" })
    .png()
    .toBuffer();
  const dir = mkdtempSync(join(tmpdir(), "didar-cms-browser-"));
  let video: Buffer;
  try {
    const file = join(dir, "fixture.mp4"),
      r = spawnSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x142d50:s=960x540:d=2",
        "-vf",
        "drawbox=x=350:y=150:w=260:h=240:color=0xc5a46a:t=12",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "1",
        "-y",
        file,
      ]);
    expect(r.status).toBe(0);
    video = readFileSync(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const assets: string[] = [];
  for (const [name, mime, buffer, alt] of [
    ["landscape.png", "image/png", photo, "حلقه هندسی آزمایشی"],
    ["portrait.png", "image/png", portrait, "نسخه عمودی حلقه آزمایشی"],
    ["video.mp4", "video/mp4", video!, "ویدیوی هندسی آزمایشی"],
  ] as const) {
    await page
      .getByLabel("فایل رسانه صفحه", { exact: true })
      .setInputFiles({ name, mimeType: mime, buffer });
    await page.getByLabel("متن جایگزین رسانه", { exact: true }).fill(alt);
    await page
      .getByRole("button", { name: "بارگذاری و پردازش رسانه", exact: true })
      .click();
    const card = page.locator("[data-editor-asset]").filter({
      has: page.getByText(alt + " · pending · " + mime, { exact: true }),
    });
    await expect(card).toBeVisible();
    const id = await card.getAttribute("data-editor-asset");
    assets.push(id!);
    const stable = page.locator('[data-editor-asset="' + id + '"]');
    await stable
      .getByRole("button", { name: "تأیید رسانه", exact: true })
      .click();
    await expect(
      stable.getByText(alt + " · approved · " + mime, { exact: true }),
    ).toBeVisible();
  }
  const selectMedia = async (block: any, id: string) => {
    await block
      .getByLabel("رسانه اصلی", { exact: true })
      .first()
      .selectOption(id);
    await block
      .getByLabel("توضیح جایگزین", { exact: true })
      .first()
      .fill("زیبایی هندسه · رسانه ساختگی آزمون");
  };
  const hero = page.locator("[data-editor-block=HERO_VIDEO]");
  await selectMedia(hero, assets[2]);
  await hero
    .getByLabel("عنوان بلوک", { exact: true })
    .fill("لحظه‌هایی که ماندگار می‌شوند");
  const slider = page.locator("[data-editor-block=HERO_MEDIA_SLIDER]");
  for (let i = 0; i < 2; i++) {
    await slider
      .getByLabel("رسانه اصلی", { exact: true })
      .nth(i)
      .selectOption(assets[i ? 2 : 0]);
    await slider
      .getByLabel("توضیح جایگزین", { exact: true })
      .nth(i)
      .fill("اسلاید آزمایشی " + i);
  }
  await slider
    .getByLabel("رسانه موبایل اختیاری", { exact: true })
    .first()
    .selectOption(assets[1]);
  const mosaic = page.locator("[data-editor-block=EDITORIAL_MOSAIC]");
  for (let i = 0; i < 3; i++) {
    await mosaic
      .getByLabel("رسانه اصلی", { exact: true })
      .nth(i)
      .selectOption(assets[i % 2]);
    await mosaic
      .getByLabel("توضیح جایگزین", { exact: true })
      .nth(i)
      .fill("تصویر موزاییک " + i);
  }
  const split = page.locator("[data-editor-block=SPLIT_STORY]");
  await selectMedia(split, assets[1]);
  await split
    .getByLabel("عنوان بلوک", { exact: true })
    .fill("داستان انتخاب ما");
  const collection = page.locator("[data-editor-block=COLLECTION_SPOTLIGHT]");
  await collection
    .getByLabel("مجموعه زنده", { exact: true })
    .selectOption(collectionId);
  const grid = page.locator("[data-editor-block=FEATURED_PRODUCT_GRID]");
  await grid
    .getByRole("checkbox", { name: eligible.title, exact: true })
    .check();
  for (const type of [
    "FULL_BLEED_MEDIA",
    "PRODUCT_CAROUSEL",
    "CATEGORY_FACET_DISCOVERY",
    "BRAND_STORY",
    "SPACER_DIVIDER",
  ]) {
    await page.getByLabel("بلوک جدید", { exact: true }).selectOption(type);
    await page
      .getByRole("button", { name: "افزودن بلوک", exact: true })
      .click();
  }
  await selectMedia(
    page.locator("[data-editor-block=FULL_BLEED_MEDIA]"),
    assets[0],
  );
  await page
    .locator("[data-editor-block=FULL_BLEED_MEDIA]")
    .getByLabel("عنوان بلوک", { exact: true })
    .fill("جزئیات ماندگار");
  const railProducts = available.products
    .filter((p: any) =>
      p.offers.some((o: any) => o.quantity > 0 && o.price?.total_irr > 0),
    )
    .slice(0, 3);
  expect(railProducts.length).toBeGreaterThan(1);
  for (const p of railProducts)
    await page
      .locator("[data-editor-block=PRODUCT_CAROUSEL]")
      .getByRole("checkbox", { name: p.title, exact: true })
      .check();
  await page
    .locator("[data-editor-block=BRAND_STORY]")
    .getByLabel("عنوان بلوک", { exact: true })
    .fill("هویت روشن هر قطعه");
  await page
    .getByRole("button", { name: "ذخیره نسخه پیش‌نویس", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "بررسی و انتشار نسخه", exact: true }),
  ).toBeVisible();
  pageId = (
    await db.query(
      "SELECT id FROM didar_content_page WHERE kind='DIDAR_HOME' AND supplier_id IS NULL",
    )
  ).rows[0].id;
  await page
    .getByRole("button", { name: "پیش‌نمایش همین نسخه", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "پیش‌نمایش خصوصی", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "نمای موبایل ۳۹۰", exact: true })
    .click();
  await expect(page.locator(".cms-preview-mobile .cms-mosaic")).toBeVisible();
  const mobilePreviewImage = page
    .locator(".cms-preview-mobile .cms-slider .cms-image img")
    .first();
  await expect(mobilePreviewImage).toBeVisible();
  expect(
    await mobilePreviewImage.evaluate(
      (img: any) =>
        Number(img.getAttribute("height")) > Number(img.getAttribute("width")),
    ),
  ).toBe(true);
  const bounds = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("main *")]
      .map((e) => {
        const b = e.getBoundingClientRect();
        return {
          tag: e.tagName,
          cls: e.className,
          x: b.x,
          right: b.right,
          width: b.width,
        };
      })
      .filter((x) => x.x < -1 || x.right > innerWidth + 1)
      .slice(0, 20),
  }));
  expect(bounds.scroll, JSON.stringify(bounds)).toBeLessThanOrEqual(
    bounds.viewport,
  );
  await page.screenshot({
    path: evidence + "/builder-private-preview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  writeFileSync(
    evidence + "/builder-mobile-bounds.json",
    JSON.stringify(
      await page.evaluate(() => ({
        viewport: innerWidth,
        scroll: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll("main *")]
          .map((e) => {
            const b = e.getBoundingClientRect();
            return {
              tag: e.tagName,
              cls: e.className,
              x: b.x,
              right: b.right,
              width: b.width,
            };
          })
          .filter((x) => x.x < -1 || x.right > innerWidth + 1)
          .slice(0, 20),
      })),
      null,
      2,
    ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: evidence + "/builder-mobile-390.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const version = (
    await db.query(
      "SELECT id FROM didar_content_version WHERE page_id=$1 ORDER BY number DESC LIMIT 1",
      [pageId],
    )
  ).rows[0].id;
  const anonymous = await browser.newContext({
    baseURL: process.env.TEST_STOREFRONT_URL,
  });
  const anon = await anonymous.newPage();
  const denied = await anon.request.post("/api/didar/pages", {
    data: { operation: "preview", version_id: version },
  });
  expect(denied.status()).toBe(401);
  await page.getByRole("button", { name: "تأیید نسخه", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "انتشار صفحه", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "انتشار صفحه", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        (
          await db.query(
            "SELECT count(*) n FROM didar_content_publication WHERE page_id=$1 AND version_id=$2 AND NOT cancelled AND effective_from<=now() AND (effective_to IS NULL OR effective_to>now())",
            [pageId, version],
          )
        ).rows[0].n,
      ),
    )
    .toBe(1);
  const recorded = await browser.newContext({
    baseURL: process.env.TEST_STOREFRONT_URL,
    viewport: { width: 1440, height: 1000 },
  });
  const shop = await recorded.newPage();
  const stopRecording = await recordPage(
    shop,
    evidence + "/cms-responsive-walkthrough.webm",
  );
  try {
    await shop.addInitScript(() => {
      (window as any).__cmsMetrics = { lcp: 0, cls: 0, interactions: [] };
      new PerformanceObserver((xs) => {
        for (const e of xs.getEntries())
          (window as any).__cmsMetrics.lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((xs) => {
        for (const e of xs.getEntries() as any)
          if (!e.hadRecentInput) (window as any).__cmsMetrics.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
      try {
        new PerformanceObserver((xs) => {
          for (const e of xs.getEntries())
            (window as any).__cmsMetrics.interactions.push({
              name: e.name,
              duration: e.duration,
            });
        }).observe({
          type: "event",
          buffered: true,
          durationThreshold: 16,
        } as any);
      } catch {}
    });
    await shop.goto("/");
    await expect(shop.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "دیدار · زیبایی انتخاب آگاهانه",
    );
    const og = await shop
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(og).toContain("/api/didar/image?id=");
    await expect(
      shop.getByRole("heading", {
        name: "لحظه‌هایی که ماندگار می‌شوند",
        exact: true,
      }),
    ).toBeVisible();
    await expect(shop.locator("[data-block-type]")).toHaveCount(11);
    await expect(shop.locator(".cms-hero_video video")).toBeVisible();
    await expect
      .poll(() =>
        shop
          .locator(".cms-hero_video video")
          .evaluate((v: any) => v.readyState),
      )
      .toBeGreaterThan(1);
    await shop
      .locator(".cms-hero_video")
      .getByRole("button", { name: "توقف ویدیو", exact: true })
      .click();
    await expect(
      shop
        .locator(".cms-hero_video")
        .getByRole("button", { name: "پخش ویدیو", exact: true }),
    ).toBeVisible();
    const slides = shop.locator(".cms-slider");
    await slides.scrollIntoViewIfNeeded();
    await slides
      .getByRole("button", { name: "اسلاید بعدی", exact: true })
      .click();
    await expect(slides.getByText("2 / 2", { exact: true })).toBeVisible();
    await slides.focus();
    await shop.keyboard.press("ArrowRight");
    await expect(slides.getByText("1 / 2", { exact: true })).toBeVisible();
    // Short presentation holds record the actual software; functional readiness is asserted separately.
    await shop.locator(".cms-mosaic").scrollIntoViewIfNeeded();
    await shop.waitForTimeout(700);
    const tiles = shop.locator(".cms-mosaic>div");
    const desktopBoxes = await tiles.evaluateAll((xs) =>
      xs.map((x) => {
        const b = x.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }),
    );
    expect(desktopBoxes[0].width).toBeGreaterThan(desktopBoxes[1].width);
    expect(Math.abs(desktopBoxes[1].x - desktopBoxes[2].x)).toBeLessThan(2);
    await expect(
      shop.locator(".cms-collection_spotlight .product"),
    ).toHaveCount(1);
    await shop.locator(".cms-featured_product_grid").scrollIntoViewIfNeeded();
    await expect(
      shop.locator(".cms-featured_product_grid .offer").first(),
    ).toBeVisible();
    const live = await api(shop, "catalog", undefined, "");
    const offerId = await shop
      .locator(".cms-featured_product_grid .offer")
      .first()
      .getAttribute("data-offer-id");
    expect(
      live.products
        .flatMap((p: any) => p.offers)
        .some((o: any) => o.id === offerId && o.price.total_irr > 0),
    ).toBe(true);
    await shop.screenshot({
      path: evidence + "/cms-desktop.png",
      fullPage: true,
    });
    writeFileSync(
      evidence + "/desktop-lab-metrics.json",
      JSON.stringify(
        await shop.evaluate(() => (window as any).__cmsMetrics),
        null,
        2,
      ),
    );
    await shop.setViewportSize({ width: 390, height: 844 });
    await shop.goto("/?cms_sample=mobile");
    await shop.bringToFront();
    await expect
      .poll(() => shop.evaluate(() => (window as any).__cmsMetrics.lcp))
      .toBeGreaterThan(0);
    await expect(shop.locator(".cms-mosaic")).toBeVisible();
    await shop.waitForTimeout(700);
    const mobileBoxes = await shop
      .locator(".cms-mosaic>div")
      .evaluateAll((xs) =>
        xs.map((x) => {
          const b = x.getBoundingClientRect();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        }),
      );
    expect(Math.abs(mobileBoxes[0].x - mobileBoxes[1].x)).toBeLessThan(2);
    expect(mobileBoxes[1].y).toBeGreaterThan(
      mobileBoxes[0].y + mobileBoxes[0].height,
    );
    expect(
      await shop.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await shop.screenshot({
      path: evidence + "/cms-mobile-390.png",
      fullPage: true,
    });
    writeFileSync(
      evidence + "/mobile-lab-metrics.json",
      JSON.stringify(
        await shop.evaluate(() => (window as any).__cmsMetrics),
        null,
        2,
      ),
    );
    const rail = shop.locator(".cms-product-rail");
    await rail.scrollIntoViewIfNeeded();
    const beforeScroll = await rail.evaluate((r: any) => r.scrollLeft);
    await shop
      .locator(".cms-product_carousel")
      .getByRole("button", { name: "محصولات بعدی", exact: true })
      .click();
    await expect
      .poll(() => rail.evaluate((r: any) => r.scrollLeft))
      .not.toBe(beforeScroll);
    await shop.locator(".cms-mosaic").scrollIntoViewIfNeeded();
    await shop.waitForTimeout(700);
    await shop.emulateMedia({ reducedMotion: "reduce" });
    await shop.reload();
    await expect(
      shop
        .locator(".cms-hero_video")
        .getByText("تصویر ثابت · کاهش حرکت یا مصرف داده", { exact: true }),
    ).toBeVisible();
    await expect(shop.locator(".cms-hero_video video")).toHaveCount(0);
  } finally {
    await stopRecording();
    await recorded.close();
    await anonymous.close();
  }
});
