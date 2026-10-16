import { test, expect, beforeAll, afterAll } from "bun:test";
import sharp from "../packages/api/node_modules/sharp";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  financeFixture,
  finDB as db,
  finOK as ok,
  finAPI as api,
} from "./financial-helpers";
import { processProductPhoto } from "../packages/api/src/didar/media-processing";
let a: any,
  b: any,
  request = "",
  asset = "",
  pid = "",
  fixture: Buffer,
  secondRequest = "",
  assets: string[] = [];
const policy = {
  card_width: 400,
  medium_width: 900,
  zoom_width: 1600,
  quality: 82,
};
const tag = "onboard-" + crypto.randomUUID();
const photo = (data: Buffer) => ({
  data: data.toString("base64"),
  mime_type: "image/png",
});
async function image(id: string, token = "", context = "", variant = "medium") {
  const r = await fetch(
    (process.env.TEST_API_URL || "http://localhost:9000") +
      "/didar/image?id=" +
      id +
      "&variant=" +
      variant,
    {
      headers: {
        authorization: "Bearer " + token,
        ...(context ? { "x-didar-context": context } : {}),
      },
    },
  );
  return { status: r.status, data: Buffer.from(await r.arrayBuffer()) };
}
beforeAll(async () => {
  a = await financeFixture();
  b = await financeFixture();
  await ok(
    "permissions",
    {
      supplier_id: a.sid,
      permission: "REQUEST_PRODUCT_CREATION",
      granted: true,
    },
    a.admin,
  );
  fixture = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 4,
      background: { r: 185, g: 145, b: 56, alpha: 0.8 },
    },
  })
    .png()
    .toBuffer();
});
afterAll(async () => {
  await db.query(
    "UPDATE didar_supplier SET active=false WHERE id=ANY($1::text[])",
    [[a.sid, b.sid]],
  );
  if (pid)
    await db.query(
      "UPDATE didar_product SET active=false,published=false WHERE id=$1",
      [pid],
    );
});
test("bounded real decoding rejects disguised, oversized, corrupt and extreme-dimension images", async () => {
  for (const input of [
    {
      data: Buffer.from('<svg onload="alert(1)"></svg>').toString("base64"),
      mime_type: "image/png",
    },
    {
      data: Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        Buffer.alloc(64),
      ]).toString("base64"),
      mime_type: "image/png",
    },
    { ...photo(fixture), mime_type: "image/jpeg" },
    { data: "A".repeat(12_000_000), mime_type: "image/png" },
  ])
    await expect(processProductPhoto(input, policy)).rejects.toThrow(
      "INVALID_",
    );
  const wide = await sharp({
    create: { width: 12001, height: 2, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(processProductPhoto(photo(wide), policy)).rejects.toThrow(
    "INVALID_MEDIA_DIMENSIONS",
  );
});
test("orientation, color, transparency and private metadata normalize to proportional decoded WebP variants", async () => {
  const source = await sharp(fixture)
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Artist: "PRIVATE QA NAME" },
      IFD2: { UserComment: "PRIVATE GPS QA" },
    })
    .toBuffer();
  const r = await processProductPhoto(
    { data: source.toString("base64"), mime_type: "image/jpeg" },
    policy,
  );
  expect(r.normalized.width).toBe(800);
  expect(r.normalized.height).toBe(1200);
  for (const v of r.variants) {
    const m = await sharp(v.data).metadata();
    expect(m.format).toBe("webp");
    expect(m.exif).toBeUndefined();
    expect(m.orientation).toBeUndefined();
    expect(Math.abs(v.width / v.height - 2 / 3)).toBeLessThan(0.005);
    expect(v.bytes).toBeLessThanOrEqual(786432);
  }
  const alpha = await processProductPhoto(photo(fixture), policy);
  expect((await sharp(alpha.variants[0].data).metadata()).hasAlpha).toBe(true);
  const pixels = await sharp(alpha.variants[0].data)
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(Math.abs(pixels[0] - 185)).toBeLessThan(5);
  expect(Math.abs(pixels[1] - 145)).toBeLessThan(5);
});
test("merchant draft/join requests are idempotent and preserve actual creator/assistant identities with default-deny governance", async () => {
  const input = {
    operation: "request",
    supplier_id: a.sid,
    idempotency_key: crypto.randomUUID(),
    title: tag,
    category_id: "ring",
    purity: 750,
    sku: "OWN-SKU",
    making_mode: "percent",
    making_bps: 1200,
    created_by: "forged",
    assisted_by_agent: "forged",
  };
  expect(
    (await api("onboarding", { ...input, supplier_id: b.sid }, a.seller)).http,
  ).toBe(403);
  const r = await ok("onboarding", input, a.seller);
  request = r.id;
  expect((await ok("onboarding", input, a.seller)).id).toBe(request);
  expect(
    (await api("onboarding", { ...input, title: "different" }, a.seller)).http,
  ).toBe(409);
  const who = (
    await db.query("SELECT id FROM didar_user WHERE supplier_id=$1", [a.sid])
  ).rows[0].id;
  const row = (
    await db.query("SELECT * FROM didar_product_request WHERE id=$1", [request])
  ).rows[0];
  expect(row.created_by).toBe(who);
  expect(row.assisted_by_agent).toBeNull();
  expect(row.payload.published).toBe(false);
  const email = (
    await db.query("SELECT email FROM didar_user WHERE id=$1", [b.buyerId])
  ).rows[0].email;
  await ok(
    "storefront",
    {
      kind: "member",
      supplier_id: a.sid,
      email,
      permission: "ONBOARDING",
      active: true,
    },
    a.admin,
  );
  expect(
    (await ok("me", undefined, b.buyer)).user.merchant_memberships,
  ).toContainEqual({ supplier_id: a.sid, permission: "ONBOARDING" });
  secondRequest = (
    await ok(
      "onboarding",
      {
        operation: "request",
        supplier_id: a.sid,
        existing_product_id: a.pid,
        sku: "JOIN-SKU",
        making_mode: "percent",
        making_bps: 1200,
      },
      b.buyer,
    )
  ).id;
  expect(
    (
      await db.query(
        "SELECT assisted_by_agent FROM didar_product_request WHERE id=$1",
        [secondRequest],
      )
    ).rows[0].assisted_by_agent,
  ).toBe(b.buyerId);
  const before = (await db.query("SELECT count(*)::int n FROM didar_product"))
    .rows[0].n;
  const joined = await ok(
    "manage",
    {
      kind: "review_request",
      id: secondRequest,
      decision: "approved",
      reason: "Join the existing shared master",
    },
    a.admin,
  );
  expect(joined.product_id).toBe(a.pid);
  expect(
    (await db.query("SELECT count(*)::int n FROM didar_product")).rows[0].n,
  ).toBe(before);
  expect(
    (
      await api(
        "manage",
        { kind: "review_request", id: request, decision: "approved" },
        b.buyer,
      )
    ).http,
  ).toBe(403);
});
test("private merchant new-master approval remains hidden before its first eligible public Offer", async () => {
  const sid = (
    await ok(
      "manage",
      { kind: "supplier", name: tag + " private approval" },
      a.admin,
    )
  ).id;
  let product = "";
  try {
    const h = "private-" + crypto.randomUUID().slice(0, 8);
    await ok(
      "storefront",
      {
        kind: "save",
        supplier_id: sid,
        handle: h,
        name: h,
        visibility: "INVITE_ONLY",
        published: true,
        approved: true,
      },
      a.admin,
    );
    const r = await ok(
      "onboarding",
      {
        operation: "request",
        supplier_id: sid,
        title: tag + " PRIVATE",
        category_id: "ring",
        purity: 750,
        sku: "PRIVATE-SKU",
      },
      a.admin,
    );
    product = (
      await ok(
        "manage",
        {
          kind: "review_request",
          id: r.id,
          decision: "approved",
          reason: "Approve within private merchant context",
        },
        a.admin,
      )
    ).product_id;
    expect(
      (await ok("catalog")).products.some((p: any) => p.id === product),
    ).toBe(false);
    expect((await api("product-link?id=" + product)).http).toBe(404);
    await ok(
      "manage",
      {
        kind: "new_offer",
        supplier_id: "s1",
        product_id: product,
        weight_mg: 2346,
        quantity: 1,
        labor_irr: 0,
        margin_bps: 0,
      },
      a.admin,
    );
    expect(
      (await ok("catalog")).products
        .find((p: any) => p.id === product)
        .offers.every((o: any) => o.supplier_id === "s1"),
    ).toBe(true);
  } finally {
    if (product)
      await db.query(
        "UPDATE didar_product SET active=false,published=false WHERE id=$1",
        [product],
      );
    await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [sid]);
  }
});
test("central image size, quality and byte-budget policy is admin-only, validated and revision-checked", async () => {
  const old = (await ok("media?supplier_id=" + a.sid, undefined, a.seller))
    .policy;
  const body = {
    operation: "policy",
    version: old.version,
    card_width: 400,
    medium_width: 900,
    zoom_width: 1600,
    quality: 81,
    max_variant_bytes: 700000,
  };
  expect((await api("media", body, a.seller)).http).toBe(403);
  expect((await api("media", { ...body, card_width: 900 }, a.admin)).http).toBe(
    400,
  );
  await ok("media", body, a.admin);
  expect((await api("media", body, a.admin)).http).toBe(409);
  const changed = (await ok("media?supplier_id=" + a.sid, undefined, a.seller))
    .policy;
  expect(changed.quality).toBe(81);
  expect(changed.max_variant_bytes).toBe(700000);
  await ok(
    "media",
    {
      ...body,
      version: changed.version,
      quality: 82,
      max_variant_bytes: 786432,
    },
    a.admin,
  );
});
test("photo receipts and variants persist privately, upload replay does not duplicate, pending product requires approval", async () => {
  const input = {
    operation: "upload",
    supplier_id: a.sid,
    request_id: request,
    ...photo(fixture),
    alt: "QA product image",
    idempotency_key: crypto.randomUUID(),
    allow_shared: false,
    uploaded_by: "forged",
  };
  const out = await ok("media", input, a.seller);
  asset = out.id;
  assets.push(asset);
  expect(out.receipt.variants.length).toBe(3);
  expect(out.receipt.metadata_removed).toBe(true);
  expect((await ok("media", input, a.seller)).id).toBe(asset);
  expect(
    (await api("media", { ...input, alt: "different" }, a.seller)).http,
  ).toBe(409);
  expect(
    (
      await api(
        "media",
        { ...input, supplier_id: b.sid, idempotency_key: crypto.randomUUID() },
        a.seller,
      )
    ).http,
  ).toBe(403);
  expect((await image(asset)).status).toBe(404);
  expect((await image(asset, b.seller)).status).toBe(404);
  expect((await image(asset, a.seller)).status).toBe(200);
  expect(
    (
      await api(
        "media",
        {
          operation: "review",
          asset_id: asset,
          approved: true,
          visibility: "MERCHANT_ONLY",
          reason: "needs product",
        },
        a.admin,
      )
    ).http,
  ).toBe(409);
  pid = (
    await ok(
      "manage",
      {
        kind: "review_request",
        id: request,
        decision: "approved",
        reason: "Approved actual new master",
      },
      a.admin,
    )
  ).product_id;
  expect(
    (
      await db.query("SELECT product_id FROM didar_media_asset WHERE id=$1", [
        asset,
      ])
    ).rows[0].product_id,
  ).toBe(pid);
  expect(
    (
      await api(
        "media",
        {
          operation: "review",
          asset_id: asset,
          approved: true,
          visibility: "SHARED_MASTER",
          reason: "no uploader consent",
        },
        a.admin,
      )
    ).http,
  ).toBe(400);
  await ok(
    "media",
    {
      operation: "review",
      asset_id: asset,
      approved: true,
      visibility: "MERCHANT_ONLY",
      reason: "Approved own content",
    },
    a.admin,
  );
  expect((await image(asset)).status).toBe(404); // No eligible own offer yet.
  await ok(
    "manage",
    {
      kind: "new_offer",
      supplier_id: a.sid,
      product_id: pid,
      weight_mg: 1000,
      quantity: 2,
      labor_irr: 0,
      margin_bps: 0,
    },
    a.admin,
  );
  expect((await image(asset)).status).toBe(200);
  const who = (
    await db.query("SELECT id FROM didar_user WHERE supplier_id=$1", [a.sid])
  ).rows[0].id;
  const stored = (
    await db.query(
      "SELECT uploaded_by,approved_by,source_digest FROM didar_media_asset WHERE id=$1",
      [asset],
    )
  ).rows[0];
  expect(stored.uploaded_by).toBe(who);
  expect(stored.approved_by).toBeTruthy();
  await expect(
    db.query("UPDATE didar_media_asset SET uploaded_by=$1 WHERE id=$2", [
      b.buyerId,
      asset,
    ]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_MEDIA_SOURCE");
});
test("shared Master media remains merchant-owned across scoped/public image URLs and catalog projections", async () => {
  const h = "photo-" + crypto.randomUUID().slice(0, 8);
  await ok(
    "storefront",
    {
      kind: "save",
      supplier_id: a.sid,
      handle: h,
      name: h,
      visibility: "INVITE_ONLY",
      approved: true,
      published: true,
    },
    a.admin,
  );
  await ok(
    "manage",
    {
      kind: "new_offer",
      supplier_id: "s1",
      product_id: pid,
      weight_mg: 2345,
      quantity: 2,
      labor_irr: 0,
      margin_bps: 0,
    },
    a.admin,
  );
  const publicMaster = (await ok("catalog")).products.find(
    (p: any) => p.id === pid,
  );
  expect(publicMaster).toBeTruthy();
  expect(publicMaster.images.some((i: any) => i.media_asset_id === asset)).toBe(
    false,
  );
  expect((await image(asset)).status).toBe(404);
  const enter = await ok("storefront", { kind: "enter", handle: h }, a.seller);
  expect((await image(asset, a.seller, enter.context_token)).status).toBe(200);
  const base = process.env.TEST_API_URL || "http://localhost:9000";
  const publicPreview = () =>
    fetch(base + "/didar/image?id=" + asset + "&preview_store=" + h);
  expect((await publicPreview()).status).toBe(404);
  await ok(
    "storefront",
    {
      kind: "save",
      supplier_id: a.sid,
      handle: h,
      name: h,
      visibility: "UNLISTED_LINK",
      approved: true,
      published: true,
      version: 1,
    },
    a.admin,
  );
  const key = (
    await db.query("SELECT public_key FROM didar_product WHERE id=$1", [pid])
  ).rows[0].public_key;
  const preview = await ok("storefront?handle=" + h + "&product_key=" + key);
  expect(preview.preview.image_url).toContain("preview_store=" + h);
  expect((await publicPreview()).status).toBe(200);
  await ok(
    "storefront",
    {
      kind: "save",
      supplier_id: a.sid,
      handle: h,
      name: h,
      visibility: "INVITE_ONLY",
      approved: true,
      published: true,
      version: 2,
    },
    a.admin,
  );
  expect((await publicPreview()).status).toBe(404);

  const denied = await fetch(
    (process.env.TEST_API_URL || "http://localhost:9000") +
      "/didar/image?id=" +
      asset,
    { headers: { "x-didar-context": enter.context_token } },
  );
  expect(denied.status).toBe(404);
  // Explicit consent plus Didar approval is required before another merchant may reuse an upload.
  const shared = await ok(
    "media",
    {
      operation: "upload",
      supplier_id: a.sid,
      request_id: secondRequest,
      ...photo(fixture),
      alt: "Consented shared catalog fixture",
      allow_shared: true,
      idempotency_key: crypto.randomUUID(),
    },
    b.buyer,
  );
  assets.push(shared.id);
  expect(
    (
      await db.query(
        "SELECT assisted_by_agent,uploaded_by FROM didar_media_asset WHERE id=$1",
        [shared.id],
      )
    ).rows[0],
  ).toEqual({ assisted_by_agent: b.buyerId, uploaded_by: b.buyerId });
  await ok(
    "media",
    {
      operation: "review",
      asset_id: shared.id,
      approved: true,
      visibility: "SHARED_MASTER",
      reason: "Uploader explicitly permitted shared master imagery",
    },
    a.admin,
  );
  expect((await image(shared.id, a.seller)).status).toBe(200);
  await ok(
    "media",
    {
      operation: "review",
      asset_id: asset,
      approved: false,
      reason: "Withdraw own image from publication",
    },
    a.admin,
  );
  expect((await image(asset, b.seller)).status).toBe(404);
});
test("twenty real authorized image operations are decoded and persisted; quotas and revocation are enforced", async () => {
  // Two accepted requests cap their own ten assets; real processing is used on every distinct intent.
  for (let i = 0; i < 18; i++) {
    const r = i < 9 ? request : secondRequest;
    const out = await ok(
      "media",
      {
        operation: "upload",
        supplier_id: a.sid,
        request_id: r,
        ...photo(fixture),
        alt: "Processed QA " + i,
        idempotency_key: crypto.randomUUID(),
      },
      a.seller,
    );
    assets.push(out.id);
    expect(
      out.receipt.variants.every((v: any) => v.bytes > 0 && v.width > 0),
    ).toBe(true);
  }
  expect(assets.length).toBe(20);
  // Withdrawn evidence is retained privately but does not block a replacement active image.
  await ok(
    "media",
    {
      operation: "upload",
      supplier_id: a.sid,
      request_id: request,
      ...photo(fixture),
      alt: "Replacement after withdrawal",
      idempotency_key: crypto.randomUUID(),
    },
    a.seller,
  );
  // Both resources now contain ten active assets.
  expect(
    (
      await api(
        "media",
        {
          operation: "upload",
          supplier_id: a.sid,
          request_id: request,
          ...photo(fixture),
          alt: "Beyond quota",
          idempotency_key: crypto.randomUUID(),
        },
        a.seller,
      )
    ).http,
  ).toBe(400);
  const email = (
    await db.query("SELECT email FROM didar_user WHERE id=$1", [b.buyerId])
  ).rows[0].email;
  await ok(
    "storefront",
    {
      kind: "member",
      supplier_id: a.sid,
      email,
      permission: "ONBOARDING",
      active: false,
    },
    a.admin,
  );
  expect(
    (await ok("me", undefined, b.buyer)).user.merchant_memberships,
  ).toEqual([]);
  expect(
    (await api("media?supplier_id=" + a.sid, undefined, b.buyer)).http,
  ).toBe(403);
});
test("media migration replay and disposable database restart preserve source IDs, variants and commerce history", async () => {
  const sql = readFileSync(
    "packages/api/src/didar/onboarding-schema.sql",
    "utf8",
  );
  const hashes = async () =>
    (
      await db.query(
        `SELECT md5((SELECT jsonb_agg(json_build_array(id,supplier_id,product_id,source_digest,receipt) ORDER BY id)::text FROM didar_media_asset)) assets,md5((SELECT jsonb_agg(json_build_array(asset_id,kind,width,height,md5(data)) ORDER BY asset_id,kind)::text FROM didar_media_variant)) variants,md5((SELECT jsonb_agg(to_jsonb(i) ORDER BY id)::text FROM didar_inventory_item i)) uids,md5((SELECT jsonb_agg(to_jsonb(l) ORDER BY id)::text FROM didar_order_line l)) orders`,
      )
    ).rows[0];
  const before = await hashes();
  await db.query(sql);
  await db.query(sql);
  expect(await hashes()).toEqual(before);
  const run = (args: string[]) => {
    const r = spawnSync("docker", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error("Disposable restart failed");
    return r.stdout.trim();
  };
  const url = new URL(process.env.DATABASE_URL!);
  const ids = run([
    "ps",
    "-q",
    "--filter",
    "label=didar.disposable-qa=true",
  ]).split("\n");
  const container = ids
    .map((id) => JSON.parse(run(["inspect", id]))[0])
    .find(
      (x) =>
        x.Config.Labels["didar.disposable-qa"] === "true" &&
        x.NetworkSettings.Ports["5432/tcp"]?.some(
          (p: any) => p.HostIp === "127.0.0.1" && p.HostPort === url.port,
        ),
    );
  expect(container).toBeTruthy();
  const digest = createHash("sha256")
    .update((await image(asset, a.seller)).data)
    .digest("hex");
  run(["restart", container.Id]);
  for (let n = 0; ; n++) {
    try {
      await db.query("SELECT 1");
      break;
    } catch {
      if (n > 60) throw new Error("Disposable PostgreSQL unavailable");
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  expect(await hashes()).toEqual(before);
  expect(
    createHash("sha256")
      .update((await image(asset, a.seller)).data)
      .digest("hex"),
  ).toBe(digest);
  const event = (
    await db.query("SELECT id FROM didar_onboarding_event LIMIT 1")
  ).rows[0];
  await expect(
    db.query("DELETE FROM didar_onboarding_event WHERE id=$1", [event.id]),
  ).rejects.toThrow("CONFLICT_IMMUTABLE_ONBOARDING_EVENT");
});
