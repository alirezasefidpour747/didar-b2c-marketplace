import { test, expect, beforeAll, afterAll } from "bun:test";
import sharp from "../packages/api/node_modules/sharp";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import {
  financeFixture,
  finDB as db,
  finOK as ok,
  finAPI as api,
} from "./financial-helpers";
import {
  validateBlocks,
  starterPreset,
} from "../packages/api/src/didar/content-blocks";
import { processVideo } from "../packages/api/src/didar/video-processing";
let a: any,
  b: any,
  global: any,
  own: any,
  image = "",
  movie = "",
  ownImage = "",
  version2 = "",
  ctx = "";
const tag = "cms-" + crypto.randomUUID().slice(0, 8),
  reason = "Synthetic CMS integration fixture";
async function call(action: string, body?: any, token = "", context = "") {
  const r = await fetch(
    (process.env.TEST_API_URL || "http://localhost:9000") + "/didar/" + action,
    {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token,
        ...(context ? { "x-didar-context": context } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  return { http: r.status, ...(await r.json()) };
}
async function media(
  id: string,
  token = "",
  context = "",
  video = false,
  range = "",
) {
  const r = await fetch(
    (process.env.TEST_API_URL || "http://localhost:9000") +
      "/didar/" +
      (video ? "media-file" : "image") +
      "?id=" +
      id,
    {
      headers: {
        authorization: "Bearer " + token,
        ...(context ? { "x-didar-context": context } : {}),
        ...(range ? { range } : {}),
      },
    },
  );
  return {
    status: r.status,
    headers: r.headers,
    data: Buffer.from(await r.arrayBuffer()),
  };
}
const m = (asset_id: string) => ({
  asset_id,
  alt: "تصویر آزمایشی مستقل دیدار",
  fit: "CONTAIN",
});
const draft = (
  supplier_id: string,
  kind: string,
  title: string,
  blocks: any[],
  extra: any = {},
) =>
  ok(
    "pages",
    { operation: "draft", supplier_id, kind, title, blocks, ...extra },
    a.admin,
  );
const publish = async (p: any, token = a.admin, extra: any = {}) => {
  await ok(
    "pages",
    {
      operation: "review",
      page_id: p.page_id,
      version_id: p.version_id,
      approved: true,
      reason,
    },
    token,
  );
  return ok(
    "pages",
    {
      operation: "publish",
      page_id: p.page_id,
      version_id: p.version_id,
      reason,
      idempotency_key: crypto.randomUUID(),
      ...extra,
    },
    token,
  );
};
beforeAll(async () => {
  a = await financeFixture();
  b = await financeFixture();
  for (const f of [a, b]) {
    await ok(
      "manage",
      {
        kind: "new_offer",
        supplier_id: f.sid,
        product_id: f.pid,
        weight_mg: 2350,
        quantity: 3,
        labor_irr: 0,
        margin_bps: 0,
      },
      a.admin,
    );
    await ok(
      "storefront",
      {
        kind: "save",
        supplier_id: f.sid,
        handle: f === a ? tag : tag + "-b",
        name: tag,
        visibility: f === a ? "UNLISTED_LINK" : "INVITE_ONLY",
        published: true,
        approved: true,
      },
      a.admin,
    );
  }
  ctx = (await call("storefront", { kind: "enter", handle: tag }))
    .context_token;
  const photo = await sharp({
    create: { width: 1000, height: 700, channels: 3, background: "#142d50" },
  })
    .png()
    .toBuffer();
  for (const sid of ["DIDAR", a.sid]) {
    const x = await ok(
      "content-media",
      {
        operation: "upload",
        supplier_id: sid,
        idempotency_key: crypto.randomUUID(),
        mime_type: "image/png",
        data: photo.toString("base64"),
        alt: "تصویر آزمایشی دیدار",
      },
      a.admin,
    );
    await ok(
      "content-media",
      {
        operation: "review",
        asset_id: x.id,
        approved: true,
        visibility: sid === "DIDAR" ? "SHARED_MASTER" : "MERCHANT_ONLY",
        reason,
      },
      a.admin,
    );
    if (sid === "DIDAR") image = x.id;
    else ownImage = x.id;
  }
  const dir = mkdtempSync(join(tmpdir(), "didar-cms-fixture-"));
  try {
    const path = join(dir, "fixture.mp4"),
      r = spawnSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x142d50:s=640x360:d=1",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-threads",
        "1",
        "-y",
        path,
      ]);
    expect(r.status).toBe(0);
    movie = (
      await ok(
        "content-media",
        {
          operation: "upload",
          supplier_id: "DIDAR",
          idempotency_key: crypto.randomUUID(),
          mime_type: "video/mp4",
          data: readFileSync(path).toString("base64"),
          alt: "ویدیوی آزمایشی تولیدشده",
        },
        a.admin,
      )
    ).id;
    await ok(
      "content-media",
      {
        operation: "review",
        asset_id: movie,
        approved: true,
        visibility: "SHARED_MASTER",
        reason,
      },
      a.admin,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);
afterAll(async () => {
  for (const p of [global, own])
    if (p)
      await ok(
        "pages",
        { operation: "pause", page_id: p.page_id, reason },
        a.admin,
      );
  await db.query(
    "UPDATE didar_supplier SET active=false WHERE id=ANY($1::text[])",
    [[a.sid, b.sid]],
  );
  await db.query(
    "UPDATE didar_product SET active=false,published=false WHERE id=ANY($1::text[])",
    [[a.pid, b.pid]],
  );
});
test("typed blocks reject scripts, unsafe paths, tenant dot escapes and unbounded layout; starter is structural only", () => {
  expect(starterPreset()).toHaveLength(6);
  for (const blocks of [
    [{ type: "HTML", body: "<script>" }],
    [{ type: "BRAND_STORY", body: "<script>alert(1)</script>" }],
    [{ type: "BRAND_STORY", cta: { label: "x", path: "javascript:alert(1)" } }],
    [{ type: "BRAND_STORY", cta: { label: "x", path: "//evil.test" } }],
    [{ type: "BRAND_STORY", css: "color:red" }],
    [{ type: "SPACER_DIVIDER", height: 100000 }],
  ])
    expect(() => validateBlocks(blocks)).toThrow("INVALID_");
  expect(
    validateBlocks([
      { type: "BRAND_STORY", cta: { label: "x", path: "/m/a/%2e%2e/b" } },
    ])[0].cta.path,
  ).toBe("/m/b");
});
test("editorial media is real decoded, approved but private until publication, and video is normalized silent with immutable bytes", async () => {
  expect((await media(image)).status).toBe(404);
  expect((await media(movie, "", "", true)).status).toBe(404);
  expect((await media(image, a.admin)).status).toBe(200);
  const v = (
    await db.query("SELECT * FROM didar_media_video WHERE asset_id=$1", [movie])
  ).rows[0];
  expect(v.validation.audio_removed).toBe(true);
  expect(v.validation.codec).toBe("h264");
  expect(v.duration_ms).toBeLessThanOrEqual(45000);
  const photo = (await media(image, a.admin)).data;
  expect((await sharp(photo).metadata()).format).toBe("webp");
  expect((await sharp(photo).metadata()).exif).toBeUndefined();
  await expect(
    db.query("UPDATE didar_media_video SET data=data WHERE asset_id=$1", [
      movie,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_");
  await expect(
    processVideo({
      mime_type: "video/mp4",
      data: Buffer.alloc(100).toString("base64"),
    }),
  ).rejects.toThrow("INVALID_VIDEO_TYPE");
});
test("all block types persist, draft/preview isolation, approval/publish uses live public product truth, range is bounded", async () => {
  const cat = await ok("catalog"),
    p = cat.products.find((p: any) => p.offers.length),
    c = cat.collections[0];
  expect(p).toBeTruthy();
  expect(c).toBeTruthy();
  const blocks = [
    { type: "HERO_VIDEO", title: "خانه محتوای آزمایشی", media: m(movie) },
    { type: "HERO_MEDIA_SLIDER", slides: [m(image), m(movie)] },
    {
      type: "EDITORIAL_MOSAIC",
      layout: "LARGE_TWO",
      tiles: [m(image), m(image), m(image)],
    },
    { type: "SPLIT_STORY", media: m(image), title: "داستان" },
    { type: "COLLECTION_SPOTLIGHT", collection_id: c.id },
    { type: "FEATURED_PRODUCT_GRID", product_ids: [p.id] },
    { type: "PRODUCT_CAROUSEL", product_ids: [p.id] },
    { type: "FULL_BLEED_MEDIA", media: m(image) },
    { type: "CATEGORY_FACET_DISCOVERY", category_id: "ring" },
    { type: "BRAND_STORY", body: "داستان\nدیدار" },
    { type: "SPACER_DIVIDER", height: 32 },
  ];
  global = await draft("DIDAR", "DIDAR_HOME", "خانه محتوای آزمایشی", blocks);
  expect((await api("pages?kind=DIDAR_HOME")).http).toBe(404);
  expect(
    (
      await api("pages", {
        operation: "preview",
        version_id: global.version_id,
      })
    ).http,
  ).toBe(401);
  const preview = await ok(
    "pages",
    { operation: "preview", version_id: global.version_id },
    a.admin,
  );
  expect(preview.blocks).toHaveLength(11);
  expect(preview.assets[image].private).toBe(true);
  expect(preview.catalog.products.some((p: any) => p.id === a.pid)).toBe(false);
  await publish(global);
  const pub = await ok("pages?kind=DIDAR_HOME");
  expect(pub.version.id).toBe(global.version_id);
  expect(pub.blocks).toHaveLength(11);
  expect(JSON.stringify(pub)).not.toMatch(
    /source_digest|uploaded_by|sanitized_data|password/,
  );
  expect((await media(image)).status).toBe(200);
  const part = await media(movie, "", "", true, "bytes=0-63");
  expect(part.status).toBe(206);
  expect(part.data.length).toBe(64);
  expect(part.headers.get("content-range")).toMatch(/^bytes 0-63\//);
  expect((await media(movie, "", "", true, "bytes=100000000000-")).status).toBe(
    416,
  );
  expect((await media(movie, "", "", true, "bytes=0-2,5-7")).status).toBe(416);
});
test("immutable versions, concurrent revisions, scheduled cutover, idempotency, pause and rollback preserve URL and audit", async () => {
  const d = await ok("pages?page_id=" + global.page_id, undefined, a.admin);
  const body = {
    operation: "draft",
    page_id: global.page_id,
    revision: d.page.revision,
    title: "عنوان خصوصی نسخه دوم",
    blocks: [{ type: "BRAND_STORY", title: "نسخه دوم" }],
  };
  const results = await Promise.all([
    api("pages", body, a.admin),
    api("pages", body, a.admin),
  ]);
  expect(results.map((x) => x.http).sort()).toEqual([200, 409]);
  const v = results.find((x) => x.http === 200)!;
  version2 = v.version_id;
  expect((await ok("pages?kind=DIDAR_HOME")).page.title).toBe(
    "خانه محتوای آزمایشی",
  );
  await ok(
    "pages",
    {
      operation: "review",
      page_id: global.page_id,
      version_id: version2,
      approved: true,
      reason,
    },
    a.admin,
  );
  const intent = crypto.randomUUID(),
    at = new Date(Date.now() + 1200).toISOString(),
    p = {
      operation: "publish",
      page_id: global.page_id,
      version_id: version2,
      reason,
      idempotency_key: intent,
      at,
    };
  const scheduled = await ok("pages", p, a.admin);
  expect((await ok("pages", p, a.admin)).id).toBe(scheduled.id);
  expect((await ok("pages?kind=DIDAR_HOME")).version.id).toBe(
    global.version_id,
  );
  await new Promise((r) => setTimeout(r, 1400));
  expect((await ok("pages?kind=DIDAR_HOME")).version.id).toBe(version2);
  await expect(
    db.query("UPDATE didar_content_version SET blocks='[]' WHERE id=$1", [
      version2,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_CONTENT");
  await expect(
    db.query("UPDATE didar_content_page SET route_key='new' WHERE id=$1", [
      global.page_id,
    ]),
  ).rejects.toThrow("CONFLICT_STABLE_CONTENT_ROUTE");
  await ok(
    "pages",
    {
      operation: "rollback",
      page_id: global.page_id,
      version_id: global.version_id,
      reason,
      idempotency_key: crypto.randomUUID(),
    },
    a.admin,
  );
  expect((await ok("pages?kind=DIDAR_HOME")).version.id).toBe(
    global.version_id,
  );
  await ok(
    "pages",
    { operation: "pause", page_id: global.page_id, reason },
    a.admin,
  );
  expect((await api("pages?kind=DIDAR_HOME")).http).toBe(404);
  expect((await media(image)).status).toBe(404);
  const events = (
    await ok("pages?page_id=" + global.page_id, undefined, a.admin)
  ).events;
  expect(events.some((x: any) => x.action === "CONTENT_ROLLED_BACK")).toBe(
    true,
  );
});
test("merchant A media/pages cannot leak to B, global or anonymous invite readers; fresh grant revocation and unsafe CTA rejected", async () => {
  own = await draft(a.sid, "MERCHANT_HOME", "ویترین محتوای الف", [
    { type: "SPLIT_STORY", media: m(ownImage) },
    { type: "FEATURED_PRODUCT_GRID", product_ids: [a.pid] },
  ]);
  await publish(own);
  const pub = await call("pages?kind=MERCHANT_HOME", undefined, "", ctx);
  expect(pub.http).toBe(200);
  expect(pub.page.supplier_id).toBe(a.sid);
  expect((await media(ownImage)).status).toBe(404);
  expect((await media(ownImage, "", ctx)).status).toBe(200);
  expect(
    (await api("pages?page_id=" + own.page_id, undefined, b.seller)).http,
  ).toBe(403);
  expect(
    (await api("pages?kind=MERCHANT_HOME&handle=" + tag + "-b")).http,
  ).toBe(401);
  expect(
    (
      await api(
        "pages",
        {
          operation: "draft",
          page_id: own.page_id,
          revision: own.revision,
          title: "evil",
          blocks: [
            {
              type: "BRAND_STORY",
              cta: {
                label: "escape",
                path: "/m/" + tag + "/%2e%2e/" + tag + "-b",
              },
            },
          ],
        },
        a.seller,
      )
    ).http,
  ).toBe(400);
  expect(
    (
      await api(
        "pages",
        {
          operation: "draft",
          supplier_id: "DIDAR",
          kind: "CATEGORY_LANDING",
          route_key: "ring",
          title: "denied",
          blocks: [{ type: "BRAND_STORY" }],
        },
        a.seller,
      )
    ).http,
  ).toBe(403);
  await ok(
    "storefront",
    {
      kind: "member",
      supplier_id: a.sid,
      email: (await ok("me", undefined, b.buyer)).user.email,
      permission: "CONTENT_EDIT",
      active: true,
    },
    a.admin,
  );
  expect(
    (await api("pages?page_id=" + own.page_id, undefined, b.buyer)).http,
  ).toBe(200);
  expect(
    (
      await api(
        "pages",
        { operation: "pause", page_id: own.page_id, reason },
        b.buyer,
      )
    ).http,
  ).toBe(403);
  await ok(
    "storefront",
    {
      kind: "member",
      supplier_id: a.sid,
      email: (await ok("me", undefined, b.buyer)).user.email,
      permission: "CONTENT_EDIT",
      active: false,
    },
    a.admin,
  );
  expect(
    (
      await api(
        "pages",
        { operation: "preview", version_id: own.version_id },
        b.buyer,
      )
    ).http,
  ).toBe(403);
  expect((await media(ownImage, b.buyer)).status).toBe(404);
  const ownCat = await ok(
    "pages?options=1&supplier_id=" + a.sid,
    undefined,
    a.seller,
  );
  expect(
    ownCat.products.every((p: any) =>
      p.offers.every((o: any) => o.supplier_id === a.sid),
    ),
  ).toBe(true);
});
test("additive media/content migration replays retain bytes, immutable UID stock, paid snapshots and publications", async () => {
  const hash = async () =>
    (
      await db.query(
        "SELECT md5((SELECT jsonb_agg(to_jsonb(v) ORDER BY id)::text FROM didar_content_version v)) versions,md5((SELECT jsonb_agg(to_jsonb(p) ORDER BY id)::text FROM didar_content_publication p)) pubs,md5((SELECT jsonb_agg(json_build_array(asset_id,md5(data)) ORDER BY asset_id)::text FROM didar_media_video)) videos,md5((SELECT jsonb_agg(to_jsonb(i) ORDER BY id)::text FROM didar_inventory_item i)) uids,md5((SELECT jsonb_agg(to_jsonb(l) ORDER BY id)::text FROM didar_order_line l)) orders",
      )
    ).rows[0];
  const before = await hash();
  for (let i = 0; i < 2; i++)
    for (const f of ["onboarding-schema", "content-schema"])
      await db.query(
        readFileSync("packages/api/src/didar/" + f + ".sql", "utf8"),
      );
  expect(await hash()).toEqual(before);
});

test("published CMS survives a real disposable PostgreSQL restart and a fresh compiled API process", async () => {
  const url = new URL(process.env.DATABASE_URL!);
  expect(process.env.DIDAR_DISPOSABLE_QA).toBe("true");
  expect(url.pathname).toBe("/didar_qa");
  const docker = (args: string[]) => {
    const r = spawnSync("docker", args, { encoding: "utf8" });
    if (r.status !== 0) throw Error("Disposable CMS restart failed");
    return r.stdout.trim();
  };
  const names = docker([
    "ps",
    "-q",
    "--filter",
    "label=didar.disposable-qa=true",
  ]).split("\n");
  const container = names
    .map((n) => JSON.parse(docker(["inspect", n]))[0])
    .find(
      (x) =>
        x.Config.Labels["didar.disposable-qa"] === "true" &&
        x.NetworkSettings.Ports["5432/tcp"]?.some(
          (p: any) => p.HostIp === "127.0.0.1" && p.HostPort === url.port,
        ),
    );
  expect(container).toBeTruthy();
  const before = (
    await db.query(
      "SELECT md5(jsonb_agg(to_jsonb(v) ORDER BY id)::text) hash FROM didar_content_version v",
    )
  ).rows[0].hash;
  docker(["restart", container.Id]);
  for (let i = 0; ; i++) {
    try {
      await db.query("SELECT 1");
      break;
    } catch {
      if (i > 60) throw Error("Disposable database unavailable");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  expect(
    (
      await db.query(
        "SELECT md5(jsonb_agg(to_jsonb(v) ORDER BY id)::text) hash FROM didar_content_version v",
      )
    ).rows[0].hash,
  ).toBe(before);
  const socket = createServer();
  await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
  const port = (socket.address() as any).port;
  await new Promise<void>((r, e) => socket.close((x) => (x ? e(x) : r())));
  const child = spawn(
    "node",
    [
      resolve("packages/api/node_modules/@medusajs/cli/cli.js"),
      "start",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: resolve("packages/api/.medusa/server"),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw Error("Fresh API exited");
      try {
        const r = await fetch("http://127.0.0.1:" + port + "/health", {
          signal: AbortSignal.timeout(500),
        });
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(ready).toBe(true);
    const r = await fetch(
      "http://127.0.0.1:" +
        port +
        "/didar/pages?kind=MERCHANT_HOME&handle=" +
        tag,
    );
    expect(r.status).toBe(200);
    const data: any = await r.json();
    expect(data.version.id).toBe(own.version_id);
    expect(data.page.title).toBe("ویترین محتوای الف");
    const poster = await fetch(
      "http://127.0.0.1:" +
        port +
        "/didar/image?id=" +
        ownImage +
        "&preview_store=" +
        tag,
    );
    expect(poster.status).toBe(200);
    expect(
      (await sharp(Buffer.from(await poster.arrayBuffer())).metadata()).format,
    ).toBe("webp");
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((r) => {
      if (child.exitCode !== null) return r();
      child.once("exit", () => r());
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        r();
      }, 1500).unref();
    });
  }
}, 60000);

test("central content capability, sanitized immutable presets and future campaign adapters cannot widen merchant authority", async () => {
  const email = (await ok("me", undefined, b.buyer)).user.email;
  await ok("pages", { operation: "operator", email, active: true }, a.admin);
  expect((await ok("me", undefined, b.buyer)).user.content_operator).toBe(true);
  expect((await ok("pages", undefined, b.buyer)).scopes.global).toBe(true);
  expect(
    (await api("pages?page_id=" + own.page_id, undefined, b.buyer)).http,
  ).toBe(403);
  const code = "cms_" + crypto.randomUUID().slice(0, 8);
  await ok(
    "pages",
    {
      operation: "preset",
      code,
      name: "قالب کنترل‌شده",
      approved: true,
      blocks: [
        {
          type: "SPLIT_STORY",
          media: {
            ...m(ownImage),
            cta: { label: "private", path: "/m/" + tag + "/products" },
          },
          cta: { label: "private", path: "/m/" + tag + "/products" },
        },
      ],
    },
    b.buyer,
  );
  const preset = (await ok("pages", undefined, b.buyer)).presets.find(
    (p: any) => p.code === code,
  );
  expect(preset.blocks[0].media.asset_id).toBe("");
  expect(preset.blocks[0].media.cta).toBeUndefined();
  expect(preset.blocks[0].cta).toBeUndefined();
  await expect(
    db.query("UPDATE didar_content_preset SET blocks='[]' WHERE code=$1", [
      code,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_PRESET");
  const future = await draft(
    a.sid,
    "MERCHANT_CAMPAIGN",
    "توسعه آتی کمپین",
    [{ type: "BRAND_STORY", title: "بدون موتور جعلی کمپین" }],
    { route_key: "future" },
  );
  expect(
    (
      await api(
        "pages",
        {
          operation: "review",
          page_id: future.page_id,
          version_id: future.version_id,
          approved: true,
          reason,
        },
        a.admin,
      )
    ).http,
  ).toBe(400);
  await ok("pages", { operation: "operator", email, active: false }, a.admin);
  expect(
    (await api("pages?page_id=" + global.page_id, undefined, b.buyer)).http,
  ).toBe(403);
});
test("CMS upgrades the exact existing share slug and preserves original visit attribution without cloning masters", async () => {
  const count = Number(
    (await db.query("SELECT count(*) n FROM didar_product")).rows[0].n,
  );
  const share = await ok(
    "sharing",
    {
      kind: "save",
      supplier_id: a.sid,
      title: "منتخب محتوای الف",
      intro: "صفحه اشتراک اصلی",
      page_kind: "PRODUCT",
      published: true,
      product_ids: [a.pid],
    },
    a.admin,
  );
  const previous = (
    await call("sharing?slug=" + share.slug, undefined, "", ctx)
  ).page;
  const cms = await draft(
    a.sid,
    "MERCHANT_CURATED",
    "محتوای منتخب الف",
    [
      { type: "SPLIT_STORY", media: m(ownImage) },
      { type: "FEATURED_PRODUCT_GRID", product_ids: [a.pid] },
    ],
    { route_key: share.slug },
  );
  await publish(cms);
  const current = (await call("sharing?slug=" + share.slug, undefined, "", ctx))
    .page;
  expect(current.id).toBe(previous.id);
  expect(current.slug).toBe(share.slug);
  expect(
    (
      await call(
        "pages?kind=MERCHANT_CURATED&route_key=" + share.slug,
        undefined,
        "",
        ctx,
      )
    ).version.id,
  ).toBe(cms.version_id);
  const visit = await call(
    "sharing",
    { kind: "visit", slug: share.slug },
    "",
    ctx,
  );
  expect(visit.http).toBe(200);
  expect(
    Number(
      (
        await db.query(
          "SELECT count(*) n FROM didar_share_visit WHERE page_id=$1",
          [share.id],
        )
      ).rows[0].n,
    ),
  ).toBe(1);
  expect(
    Number((await db.query("SELECT count(*) n FROM didar_product")).rows[0].n),
  ).toBe(count);
  await ok(
    "pages",
    { operation: "pause", page_id: cms.page_id, reason },
    a.admin,
  );
});
