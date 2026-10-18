// Actual shared components, React 19 SSR/hydration, real Chromium and HTTP images.
// Separate from the existing 32 end-to-end cases; no database or owner server.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { browserLaunchOptions } from "../local/browser-options.mjs";
const directory = resolve(".local/ci-evidence/cms-media");
mkdirSync(directory, { recursive: true });
const baseline = process.argv.includes('--baseline') ? 'b9c1daea959cfc4c942206e6cc6aa6bd5302e566' : null;
const catalogPath = 'packages/didar-ui/src/catalog.tsx';
const catalogSource = baseline ? execFileSync('git', ['show', baseline + ':' + catalogPath], { encoding: 'utf8' }) : readFileSync(catalogPath, 'utf8');
const requireStorefront = createRequire(
  resolve("apps/storefront/package.json"),
);
const alias = Object.fromEntries(
  [
    "react",
    "react-dom",
    "react-dom/client",
    "react-dom/server",
    "react/jsx-runtime",
  ].map((name) => [name, requireStorefront.resolve(name)]),
);
const common = {
  entryPoints: ["tests/fixtures/cms-media.tsx"],
  bundle: true,
  jsx: "automatic",
  alias,
  loader: { ".css": "empty" },
  logLevel: "warning",
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production') },
  plugins: [{ name: 'catalog-under-test', setup(build) {
    build.onLoad({ filter: /packages\/didar-ui\/src\/catalog\.tsx$/ }, () => ({ contents: catalogSource, loader: 'tsx', resolveDir: resolve('packages/didar-ui/src') }));
  } }],
};
await build({
  ...common,
  platform: "node",
  format: "esm",
  outfile: directory + "/server.mjs",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
await build({
  ...common,
  alias: {
    ...alias,
    "react-dom/server": requireStorefront.resolve("react-dom/server.browser"),
  },
  platform: "browser",
  outfile: directory + "/client.js",
});
const { document } = await import(directory + "/server.mjs");
const requests = [];
let releaseSlow;
const slowResponseReleased = new Promise(resolve => { releaseSlow = resolve; });
let sendSlow;
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="gold"/></svg>';
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/client.js") {
    res.setHeader("content-type", "application/javascript");
    return res.end(readFileSync(directory + "/client.js"));
  }
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html");
    return res.end(document(JSON.parse(url.searchParams.get("settings"))));
  }
  requests.push({
    path: url.pathname,
    authorization: req.headers.authorization || null,
  });
  const send = () => {
    if (
      url.pathname.startsWith("/missing") ||
      req.headers.authorization === "denied"
    ) {
      res.statusCode = 404;
      return res.end("Unavailable");
    }
    res.setHeader("content-type", "image/svg+xml");
    res.end(svg);
  };
  if (req.headers.authorization === "slow") sendSlow = () => { send(); releaseSlow(); };
  else send();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
let browser;
async function check(name, fn) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await fn(page);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.recoverableErrors)).toEqual([]);
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({
      name,
      status: "FAIL",
      error: String(error),
      page_errors: errors,
      recoverable_errors: await page
        .evaluate(() => window.recoverableErrors)
        .catch(() => null),
    });
  } finally {
    await page.close();
  }
}
async function open(page, settings, hydrate = true) {
  await page.goto(
    origin + "/?settings=" + encodeURIComponent(JSON.stringify(settings)),
  );
  if (hydrate) await page.evaluate(() => window.startHydration());
}
try {
  browser = await chromium.launch({
    headless: true,
    ...browserLaunchOptions(),
  });
  await check(
    "404 before hydration becomes accessible fallback",
    async (page) => {
      await open(page, { src: "/missing-before" }, false);
      expect(
        await page
          .locator("img")
          .evaluate((img) => img.complete && img.naturalWidth === 0),
      ).toBe(true);
      await page.evaluate(() => window.startHydration());
      await expect(page.locator(".photo-placeholder")).toHaveText(
        "تصویر در دسترس نیست",
      );
      await expect(page.locator("img")).toHaveCount(0);
    },
  );
  await check(
    "successful SSR image and new source 404 after hydration",
    async (page) => {
      await open(page, { src: "/good" });
      await expect
        .poll(() => page.locator("img").evaluate((img) => img.naturalWidth))
        .toBe(40);
      await page.evaluate(() => window.updateMedia({ src: "/missing-after" }));
      await expect(page.locator(".photo-placeholder")).toHaveText(
        "تصویر در دسترس نیست",
      );
      await page.evaluate(() => window.updateMedia({ src: "/recovered" }));
      await expect
        .poll(() => page.locator("img").evaluate((img) => img.naturalWidth))
        .toBe(40);
    },
  );
  await check(
    "responsive srcSet failure recovers when descriptor changes",
    async (page) => {
      await open(page, { src: '/good', srcSet: '/good-responsive 1x' });
      await expect.poll(() => page.locator('img').evaluate(img => img.naturalWidth)).toBe(40);
      await page.evaluate(() => window.updateMedia({ src: '/good', srcSet: '/missing-responsive 1x' }));
      await expect(page.locator(".photo-placeholder")).toHaveText(
        "تصویر در دسترس نیست",
      );
      await page.evaluate(() =>
        window.updateMedia({
          src: "/good",
          srcSet: "/recovered-responsive 1x",
        }),
      );
      await expect
        .poll(() => page.locator("img").evaluate((img) => img.naturalWidth))
        .toBe(40);
    },
  );
  await check(
    "CMS server markup hydrates on desktop and mobile with pre-hydration 404",
    async (page) => {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await open(page, { src: "/missing-cms?id=fixture", cms: true }, false);
        await page.evaluate(() => window.startHydration());
        await expect(
          page.locator(".cms-full_bleed_media .photo-placeholder"),
        ).toHaveText("تصویر در دسترس نیست");
        await expect(page.locator(".cms-full_bleed_media img")).toHaveCount(0);
        expect(await page.evaluate(() => window.recoverableErrors)).toEqual([]);
      }
    },
  );
  await check(
    "private credentials isolate bytes, abort stale response and revoke object URLs",
    async (page) => {
      await open(page, { src: "/private", credential: "allowed" });
      await expect
        .poll(() => page.locator("img").evaluate((img) => img.naturalWidth))
        .toBe(40);
      const owned = await page.locator("img").getAttribute("src");
      expect(owned).toMatch(/^blob:/);
      await page.evaluate(() =>
        window.updateMedia({ src: "/private", credential: "denied" }),
      );
      await expect(page.locator("img")).toHaveCount(0);
      await expect(page.locator(".photo-placeholder")).toHaveText(
        "تصویر در دسترس نیست",
      );
      expect(
        await page.evaluate((url) => window.revoked.includes(url), owned),
      ).toBe(true);
      await page.evaluate(() =>
        window.updateMedia({ src: "/private", credential: "slow" }),
      );
      await expect
        .poll(() => requests.filter((r) => r.authorization === "slow").length)
        .toBe(1);
      await page.evaluate(() =>
        window.updateMedia({ src: "/private", credential: "allowed-again" }),
      );
      await expect
        .poll(() => page.locator("img").evaluate((img) => img.naturalWidth))
        .toBe(40);
      expect(
        requests
          .filter((r) => r.path === "/private")
          .every((r) => r.authorization),
      ).toBe(true);
      const current = await page.locator('img').getAttribute('src');
      sendSlow();
      await slowResponseReleased;
      await expect(page.locator('img')).toHaveAttribute('src', current);
    },
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  writeFileSync(
    directory + "/results.json",
    JSON.stringify(
      {
        results,
        requests,
        node: process.versions.node,
        browser: browser?.version(),
        react_mode: process.env.NODE_ENV || 'production',
        source_sha: process.env.GITHUB_SHA || null,
        baseline_source_override: baseline,
        source_hashes: Object.fromEntries(['packages/didar-ui/src/catalog.tsx', 'packages/didar-ui/src/content-page.tsx'].map(path => [path, createHash('sha256').update(path === catalogPath ? catalogSource : readFileSync(path)).digest('hex')])),
        failed: results.filter((r) => r.status === "FAIL").length,
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
