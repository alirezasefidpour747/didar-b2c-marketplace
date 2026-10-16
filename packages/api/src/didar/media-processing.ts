import sharp from "sharp";
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
let processing = 0;
export async function processProductPhoto(input: any, policy: any) {
  if (processing >= 2) throw new Error("RATE_LIMIT");
  processing++;
  try {
    return await processPhoto(input, policy);
  } finally {
    processing--;
  }
}
async function processPhoto(input: any, policy: any) {
  if (
    typeof input.data !== "string" ||
    input.data.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)
  )
    throw new Error("INVALID_MEDIA_SIZE");
  const source = Buffer.from(input.data, "base64");
  if (
    source.length < 16 ||
    source.length > MAX_MEDIA_BYTES ||
    source.toString("base64") !== input.data
  )
    throw new Error("INVALID_MEDIA_SIZE");
  const magic = source
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "png"
    : source[0] === 255 && source[1] === 216 && source[2] === 255
      ? "jpeg"
      : source.toString("ascii", 0, 4) === "RIFF" &&
          source.toString("ascii", 8, 12) === "WEBP"
        ? "webp"
        : null;
  if (!magic || input.mime_type !== `image/${magic}`)
    throw new Error("INVALID_MEDIA_TYPE");
  try {
    const image = sharp(source, {
      limitInputPixels: 32_000_000,
      failOn: "warning",
      animated: false,
      sequentialRead: true,
    });
    const meta = await image.metadata();
    if (
      meta.format !== magic ||
      !meta.width ||
      !meta.height ||
      meta.width > 12000 ||
      meta.height > 12000 ||
      meta.width * meta.height > 32_000_000 ||
      (meta.pages || 1) > 1
    )
      throw new Error("INVALID_MEDIA_DIMENSIONS");
    // Rotation honors EXIF; recompression strips EXIF/GPS while converting pixels to standard sRGB.
    const normalized = await image
      .rotate()
      .toColourspace("srgb")
      .webp({ quality: 95, alphaQuality: 100, effort: 4 })
      .timeout({ seconds: 10 })
      .toBuffer({ resolveWithObject: true });
    if (normalized.data.length > MAX_MEDIA_BYTES)
      throw new Error("INVALID_MEDIA_NORMALIZED_SIZE");
    const variants: any[] = [];
    const budget = policy.max_variant_bytes || 786432;
    for (const [kind, size] of [
      ["card", policy.card_width],
      ["medium", policy.medium_width],
      ["zoom", policy.zoom_width],
    ] as const) {
      let result: any;
      let usedQuality = policy.quality;
      for (const quality of [
        policy.quality,
        Math.max(60, policy.quality - 10),
        60,
      ]) {
        usedQuality = quality;
        result = await sharp(normalized.data, { limitInputPixels: 32_000_000 })
          .resize({
            width: size,
            height: size,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality, effort: 4 })
          .timeout({ seconds: 10 })
          .toBuffer({ resolveWithObject: true });
        if (result.data.length <= budget) break;
      }
      if (result.data.length > budget)
        throw new Error("INVALID_MEDIA_VARIANT_SIZE");
      variants.push({
        kind,
        data: result.data,
        width: result.info.width,
        height: result.info.height,
        bytes: result.data.length,
        quality: usedQuality,
      });
    }
    return {
      sanitized: normalized.data,
      source: {
        mime: input.mime_type,
        width: meta.width,
        height: meta.height,
        bytes: source.length,
      },
      normalized: {
        width: normalized.info.width,
        height: normalized.info.height,
        bytes: normalized.data.length,
        mime: "image/webp",
      },
      variants,
    };
  } catch (e: any) {
    if (e.message?.startsWith("INVALID_")) throw e;
    throw new Error("INVALID_MEDIA_DECODE");
  }
}
