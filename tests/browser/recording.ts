import { spawn } from "node:child_process";
// Real Chromium frames encoded by the installed system FFmpeg. No CDN or browser-cache substitution.
export async function recordPage(page: any, path: string) {
  const cdp = await page.context().newCDPSession(page),
    encoder = spawn(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-framerate",
        "4",
        "-i",
        "pipe:0",
        "-an",
        "-vf",
        "scale=1440:1000:force_original_aspect_ratio=decrease,pad=1440:1000:(ow-iw)/2:(oh-ih)/2:color=white",
        "-c:v",
        "libvpx-vp9",
        "-deadline",
        "realtime",
        "-cpu-used",
        "8",
        "-threads",
        "2",
        "-b:v",
        "900k",
        "-y",
        path,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
  let frames = 0,
    error = false;
  encoder.stderr.on("data", () => {});
  encoder.on("error", () => {
    error = true;
  });
  encoder.stdin.on("error", () => {
    error = true;
  });
  let latest: Buffer | null = null;
  const ticker = setInterval(() => {
    if (
      latest &&
      frames < 120 &&
      !error &&
      encoder.stdin.writableLength < 8 * 1024 * 1024
    ) {
      encoder.stdin.write(latest);
      frames++;
    }
  }, 250);
  ticker.unref();
  cdp.on("Page.screencastFrame", async (e: any) => {
    latest = Buffer.from(e.data, "base64");
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId });
    } catch {}
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 75,
    maxWidth: 1440,
    maxHeight: 1000,
    everyNthFrame: 2,
  });
  return async () => {
    clearInterval(ticker);
    if (!frames && latest) {
      encoder.stdin.write(latest);
      frames++;
    }
    await cdp.send("Page.stopScreencast");
    await cdp.detach();
    encoder.stdin.end();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        encoder.kill("SIGKILL");
        reject(Error("Browser recording timeout"));
      }, 15000);
      encoder.once("close", (code) => {
        clearTimeout(timeout);
        if (code === 0 && !error && frames > 0) resolve();
        else reject(Error("Browser recording failed"));
      });
    });
  };
}
