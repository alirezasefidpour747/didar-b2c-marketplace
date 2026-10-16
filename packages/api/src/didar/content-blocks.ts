import { randomUUID } from "node:crypto";
import { clean } from "./storefront";
export const BLOCK_TYPES = [
  "HERO_VIDEO",
  "HERO_MEDIA_SLIDER",
  "EDITORIAL_MOSAIC",
  "SPLIT_STORY",
  "FULL_BLEED_MEDIA",
  "COLLECTION_SPOTLIGHT",
  "FEATURED_PRODUCT_GRID",
  "PRODUCT_CAROUSEL",
  "CATEGORY_FACET_DISCOVERY",
  "BRAND_STORY",
  "SPACER_DIVIDER",
];
export const PAGE_KINDS = [
  "DIDAR_HOME",
  "MERCHANT_HOME",
  "CATEGORY_LANDING",
  "COLLECTION_LANDING",
  "MERCHANT_CURATED",
  "DIDAR_CAMPAIGN",
  "MERCHANT_CAMPAIGN",
];
const ids = (a: any, max: number) => {
  if (!Array.isArray(a) || a.length > max || new Set(a).size !== a.length)
    throw new Error("INVALID_CONTENT_IDS");
  return a.map((x) => clean(x, 100));
};
const number = (x: any, fallback: number, min = 0, max = 100) => {
  if (x === undefined) return fallback;
  if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max)
    throw new Error("INVALID_CONTENT_NUMBER");
  return x;
};
const optional = (x: any, max: number) => (x ? clean(x, max) : "");
const prose = (x: any, max: number) => {
  if (!x) return "";
  if (
    typeof x !== "string" ||
    x.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(x)
  )
    throw new Error("INVALID_CONTENT_TEXT");
  return x.trim();
};
function cta(x: any) {
  if (!x) return undefined;
  if (Object.keys(x).some((k) => !["label", "path"].includes(k)))
    throw new Error("INVALID_CONTENT_CTA");
  const path = clean(x.path, 600);
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(path) ||
    /%(?:00|0a|0d|2f|5c)/i.test(path) ||
    path.includes("#") ||
    path.split("/").includes("..") ||
    path.includes(":")
  )
    throw new Error("INVALID_CONTENT_CTA");
  const normalized = new URL(path, "https://didar.invalid");
  return {
    label: clean(x.label, 80),
    path: normalized.pathname + normalized.search,
  };
}
function media(x: any) {
  if (
    !x ||
    typeof x !== "object" ||
    Object.keys(x).some(
      (k) =>
        ![
          "asset_id",
          "mobile_asset_id",
          "alt",
          "focal_x",
          "focal_y",
          "fit",
          "cta",
          "caption",
        ].includes(k),
    )
  )
    throw new Error("INVALID_CONTENT_MEDIA");
  if (x.fit !== undefined && !["CONTAIN", "COVER"].includes(x.fit))
    throw new Error("INVALID_CONTENT_FIT");
  return {
    asset_id: x.asset_id ? clean(x.asset_id, 100) : "",
    mobile_asset_id: x.mobile_asset_id ? clean(x.mobile_asset_id, 100) : "",
    alt: optional(x.alt, 300),
    caption: prose(x.caption, 500),
    focal_x: number(x.focal_x, 50),
    focal_y: number(x.focal_y, 50),
    fit: x.fit || "CONTAIN",
    cta: cta(x.cta),
  };
}
export function validateBlocks(input: any) {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > 24 ||
    JSON.stringify(input).length > 180000
  )
    throw new Error("INVALID_CONTENT_BLOCKS");
  const seen = new Set();
  return input.map((b: any) => {
    if (
      !b ||
      typeof b !== "object" ||
      Object.keys(b).some(
        (k) =>
          ![
            "id",
            "type",
            "theme",
            "title",
            "body",
            "cta",
            "media",
            "slides",
            "tiles",
            "layout",
            "side",
            "product_ids",
            "collection_id",
            "category_id",
            "facet",
            "value",
            "height",
            "autoplay",
            "interval_ms",
          ].includes(k),
      ) ||
      !BLOCK_TYPES.includes(b.type)
    )
      throw new Error("INVALID_CONTENT_BLOCK");
    const id = b.id ? clean(b.id, 100) : randomUUID();
    if (seen.has(id)) throw new Error("INVALID_CONTENT_BLOCK_ID");
    seen.add(id);
    const out: any = {
      id,
      type: b.type,
      theme: b.theme || "WHITE",
      title: optional(b.title, 160),
      body: prose(b.body, 3000),
      cta: cta(b.cta),
    };
    if (!["WHITE", "NAVY", "CHAMPAGNE"].includes(out.theme))
      throw new Error("INVALID_CONTENT_THEME");
    if (["HERO_VIDEO", "SPLIT_STORY", "FULL_BLEED_MEDIA"].includes(b.type))
      out.media = media(b.media || {});
    if (b.type === "HERO_MEDIA_SLIDER") {
      if (!Array.isArray(b.slides) || !b.slides.length || b.slides.length > 8)
        throw new Error("INVALID_CONTENT_SLIDES");
      out.slides = b.slides.map(media);
      out.autoplay = b.autoplay === true;
      out.interval_ms = number(b.interval_ms, 7000, 5000, 30000);
    }
    if (b.type === "EDITORIAL_MOSAIC") {
      if (
        !Array.isArray(b.tiles) ||
        b.tiles.length < 2 ||
        b.tiles.length > 4 ||
        !["LARGE_TWO", "STAGGERED", "UNEQUAL"].includes(b.layout)
      )
        throw new Error("INVALID_CONTENT_MOSAIC");
      out.tiles = b.tiles.map(media);
      out.layout = b.layout;
    }
    if (b.type === "SPLIT_STORY") {
      if (b.side !== undefined && !["START", "END"].includes(b.side))
        throw new Error("INVALID_CONTENT_SIDE");
      out.side = b.side || "START";
    }
    if (["FEATURED_PRODUCT_GRID", "PRODUCT_CAROUSEL"].includes(b.type))
      out.product_ids = ids(b.product_ids || [], 24);
    if (b.type === "COLLECTION_SPOTLIGHT")
      out.collection_id = b.collection_id ? clean(b.collection_id, 100) : "";
    if (b.type === "CATEGORY_FACET_DISCOVERY") {
      out.category_id = b.category_id ? clean(b.category_id, 100) : "";
      out.facet = optional(b.facet, 60);
      out.value = optional(b.value, 80);
    }
    if (b.type === "SPACER_DIVIDER") out.height = number(b.height, 40, 8, 96);
    return out;
  });
}
export function blockReferences(blocks: any[]) {
  const assets = new Set<string>(),
    products = new Set<string>(),
    ctas: any[] = [];
  for (const b of blocks) {
    if (b.cta) ctas.push(b.cta);
    for (const m of [b.media, ...(b.slides || []), ...(b.tiles || [])].filter(
      Boolean,
    )) {
      if (m.asset_id) assets.add(m.asset_id);
      if (m.mobile_asset_id) assets.add(m.mobile_asset_id);
      if (m.cta) ctas.push(m.cta);
    }
    for (const id of b.product_ids || []) products.add(id);
  }
  return { assets: [...assets], products: [...products], ctas };
}
export const starterPreset = (kind = "DIDAR_HOME") =>
  validateBlocks([
    {
      type: "HERO_VIDEO",
      theme: "NAVY",
      title: "لحظه‌هایی که ماندگار می‌شوند",
      media: {},
    },
    { type: "HERO_MEDIA_SLIDER", slides: [{}, {}] },
    { type: "EDITORIAL_MOSAIC", layout: "LARGE_TWO", tiles: [{}, {}, {}] },
    {
      type: "SPLIT_STORY",
      title: "داستان انتخاب ما",
      body: "متن داستان برند را اینجا بنویسید.",
      media: {},
    },
    { type: "COLLECTION_SPOTLIGHT", title: "انتخاب ویژه" },
    {
      type: "FEATURED_PRODUCT_GRID",
      title: kind === "MERCHANT_HOME" ? "منتخب فروشگاه" : "منتخب دیدار",
      product_ids: [],
    },
  ]);
