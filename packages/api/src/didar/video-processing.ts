import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let processing = false;
const MAX = 20 * 1024 * 1024;
function command(file: string, args: string[], timeout = 45000) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "",
      bytes = 0,
      done = false;
    const finish = (e?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      e ? reject(e) : resolve(output);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("INVALID_VIDEO_TIMEOUT"));
    }, timeout);
    child.stdout.on("data", (d) => {
      bytes += d.length;
      if (bytes > 1024 * 1024) {
        child.kill("SIGKILL");
        finish(new Error("INVALID_VIDEO_METADATA"));
      } else output += d;
    });
    child.stderr.on("data", () => {});
    child.on("error", () => finish(new Error("VIDEO_PROCESSOR_UNAVAILABLE")));
    child.on("close", (code) =>
      finish(code === 0 ? undefined : new Error("INVALID_VIDEO_DECODE")),
    );
  });
}
export async function processVideo(b: any) {
  if (processing) throw new Error("RATE_LIMIT");
  if (
    typeof b.data !== "string" ||
    b.data.length > Math.ceil(MAX / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)
  )
    throw new Error("INVALID_VIDEO_SIZE");
  const input = Buffer.from(b.data, "base64");
  if (
    input.length < 32 ||
    input.length > MAX ||
    input.toString("base64") !== b.data
  )
    throw new Error("INVALID_VIDEO_SIZE");
  const mp4 = input.toString("ascii", 4, 8) === "ftyp",
    webm = input.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  if (
    !(mp4 && b.mime_type === "video/mp4") &&
    !(webm && b.mime_type === "video/webm")
  )
    throw new Error("INVALID_VIDEO_TYPE");
  processing = true;
  let dir = "";
  try {
    dir = await mkdtemp(join(tmpdir(), "didar-video-"));
    const source = join(dir, mp4 ? "input.mp4" : "input.webm"),
      target = join(dir, "normalized.mp4"),
      poster = join(dir, "poster.png");
    await writeFile(source, input, { mode: 0o600 });
    const probe = process.env.FFPROBE_PATH || "ffprobe",
      ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    const metadata = JSON.parse(
      await command(
        probe,
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          ...(mp4 ? ["-enable_drefs", "0", "-use_absolute_path", "0"] : []),
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          source,
        ],
        10000,
      ),
    );
    const streams = metadata.streams || [],
      video = streams.find((s: any) => s.codec_type === "video"),
      duration = Number(metadata.format?.duration || video?.duration);
    if (
      !video ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 45 ||
      video.width < 2 ||
      video.height < 2 ||
      video.width > 3840 ||
      video.height > 3840 ||
      video.width * video.height > 8_294_400 ||
      streams.some((s: any) => !["video", "audio"].includes(s.codec_type)) ||
      streams.filter((s: any) => s.codec_type === "video").length !== 1
    )
      throw new Error("INVALID_VIDEO_DIMENSIONS");
    // No shell, URLs, subtitles, metadata or executable attachments; normalize to muted browser H.264.
    await command(ffmpeg, [
      "-v",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      ...(mp4 ? ["-enable_drefs", "0", "-use_absolute_path", "0"] : []),
      "-i",
      source,
      "-map",
      "0:v:0",
      "-map_metadata",
      "-1",
      "-an",
      "-sn",
      "-dn",
      "-t",
      "45",
      "-vf",
      "scale='if(gt(a,1),min(iw,1920),min(iw,1080))':'if(gt(a,1),min(ih,1080),min(ih,1920))':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-r",
      "24",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "24",
      "-pix_fmt",
      "yuv420p",
      "-maxrate",
      "4M",
      "-bufsize",
      "8M",
      "-fs",
      String(MAX),
      "-movflags",
      "+faststart",
      "-threads",
      "2",
      "-y",
      target,
    ]);
    const data = await readFile(target);
    if (data.length > MAX) throw new Error("INVALID_VIDEO_OUTPUT_SIZE");
    const normalized = JSON.parse(
      await command(
        probe,
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", target],
        10000,
      ),
    );
    const v = normalized.streams.find((x: any) => x.codec_type === "video");
    await command(
      ffmpeg,
      [
        "-v",
        "error",
        "-nostdin",
        "-i",
        target,
        "-frames:v",
        "1",
        "-vf",
        "scale=1600:1600:force_original_aspect_ratio=decrease",
        "-threads",
        "1",
        "-y",
        poster,
      ],
      15000,
    );
    return {
      data,
      poster: await readFile(poster),
      width: v.width,
      height: v.height,
      duration_ms: Math.min(
        45000,
        Math.ceil(Number(normalized.format.duration) * 1000),
      ),
      receipt: {
        source_mime: b.mime_type,
        source_bytes: input.length,
        source_width: video.width,
        source_height: video.height,
        duration_ms: Math.ceil(duration * 1000),
        metadata_removed: true,
        audio_removed: true,
        normalized_mime: "video/mp4",
        codec: "h264",
        normalized_bytes: data.length,
      },
    };
  } finally {
    processing = false;
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
