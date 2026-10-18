// Diagnostic only: real production Next SSR with a synthetic read-only API.
// This is not the real DB-backed native CMS acceptance journey.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { browserLaunchOptions } from '../../scripts/local/browser-options.mjs';
const root = resolve(process.env.CMS_PROBE_ROOT || '.');
const requireWeb = createRequire(root + '/apps/storefront/package.json');
const media = (id = 'landscape', mobile = '') => ({ asset_id: id, mobile_asset_id: mobile, alt: 'Synthetic CMS', fit: 'CONTAIN' });
const block = (type, extra = {}) => ({ id: type, type, title: '', theme: 'WHITE', ...extra });
const data = {
  page: { id: 'synthetic', title: 'Synthetic CMS' }, version: { id: 'synthetic' },
  assets: Object.fromEntries(['landscape', 'portrait', 'video'].map(id => [id, { id, type: id === 'video' ? 'VIDEO' : 'IMAGE', url: '/api/didar/image?id=' + id, width: id === 'portrait' ? 640 : 960, height: id === 'portrait' ? 960 : 640, alt: 'Synthetic CMS', variants: [{ width: 640, kind: 'medium' }, { width: 960, kind: 'zoom' }], ...(id === 'video' ? { video_url: '/api/didar/media-file?id=video' } : {}) }])),
  blocks: [block('HERO_VIDEO', { title: 'Synthetic CMS', media: media('video') }), block('HERO_MEDIA_SLIDER', { slides: [media('landscape', 'portrait'), media('video')] }), block('EDITORIAL_MOSAIC', { layout: 'LARGE_TWO', tiles: [media(), media('portrait'), media()] }), block('SPLIT_STORY', { body: 'Synthetic story', media: media('portrait') }), block('FULL_BLEED_MEDIA', { media: media() }), block('COLLECTION_SPOTLIGHT', { collection_id: 'synthetic' }), block('FEATURED_PRODUCT_GRID', { product_ids: [] }), block('PRODUCT_CAROUSEL', { product_ids: [] }), block('CATEGORY_FACET_DISCOVERY', { category_id: 'synthetic' }), block('BRAND_STORY', { title: 'Synthetic brand' }), block('SPACER_DIVIDER', { height: 40 })],
};
let published = true, missing = false;
const api = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/didar/image') {
    if (missing) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', 'image/svg+xml'); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="gold"/></svg>');
  }
  res.setHeader('content-type', 'application/json');
  if (path === '/didar/pages') { if (!published) res.statusCode = 404; return res.end(JSON.stringify(published ? data : { message: 'NOT_FOUND' })); }
  if (path === '/didar/media-file') { res.statusCode = 404; return res.end('{}'); }
  res.end(JSON.stringify({ store: null, products: [], categories: [], collections: [], rate: {} }));
});
await new Promise(r => api.listen(0, '127.0.0.1', r));
const reserve = createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise(r => reserve.close(r));
let output = '';
const next = spawn(process.execPath, [requireWeb.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root + '/apps/storefront', env: { ...process.env, MEDUSA_BACKEND_URL: `http://127.0.0.1:${api.address().port}`, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
next.stdout.on('data', d => { output += d; }); next.stderr.on('data', d => { output += d; });
const nextExit = new Promise(r => next.once('exit', (code, signal) => r({ code, signal })));
const errors = [], observations = [];
let browser;
try {
  await expect.poll(async () => { try { return (await fetch(`http://127.0.0.1:${port}`)).status; } catch { return 0; } }).toBe(200);
  browser = await chromium.launch({ headless: true, ...browserLaunchOptions() });
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push({ message: e.message, stack: e.stack }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const phase of ['available', 'missing', 'recovered', 'unpublished']) {
      published = phase !== 'unpublished'; missing = phase === 'missing';
      let releaseScripts;
      if (process.env.CMS_PROBE_DELAY_HYDRATION === '1') {
        const scriptsReady = new Promise(r => { releaseScripts = r; });
        await page.route('**/_next/static/**/*.js', async route => { await scriptsReady; await route.continue(); });
      }
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: releaseScripts ? 'commit' : 'load' });
      if (releaseScripts) {
        if (published) {
          await page.locator('.cms-full_bleed_media').scrollIntoViewIfNeeded();
          await expect.poll(() => page.locator('.cms-full_bleed_media img').evaluate(i => i.complete)).toBe(true);
        }
        releaseScripts();
        await page.waitForLoadState('load');
        await page.unroute('**/_next/static/**/*.js');
      }
      if (published) {
        await expect(page.locator('[data-block-type]')).toHaveCount(11);
        await page.locator('.cms-full_bleed_media').scrollIntoViewIfNeeded();
        if (missing) await expect(page.locator('.cms-full_bleed_media img')).toHaveCount(0);
        // Width-descriptor srcSet adjusts intrinsic CSS width for density.
        else await expect.poll(() => page.locator('.cms-full_bleed_media img').evaluate(i => i.naturalWidth)).toBeGreaterThan(0);
      } else await expect(page.locator('.cms-page')).toHaveCount(0);
      observations.push({ width, phase, errors: errors.length });
    }
    published = true;
  }
  expect(errors).toEqual([]);
} finally {
  await browser?.close(); next.kill('SIGTERM');
  const next_exit = await nextExit;
  api.closeAllConnections(); await new Promise(r => api.close(r));
  writeFileSync(resolve('.local/ci-evidence/next-hydration-probe.json'), JSON.stringify({ browser: browser?.version(), observations, errors, next_exit, output }, null, 2));
}
console.log(JSON.stringify({ observations, errors }, null, 2));
