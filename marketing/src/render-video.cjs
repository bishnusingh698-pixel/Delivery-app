// Renders out/video/scenes/<id>.html frame by frame (all CSS animations stepped) into out/video/clips/<id>.mp4
// node src/render-video.cjs [id ...]
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const tl = JSON.parse(fs.readFileSync(path.join(root, "out/video/timeline.json"), "utf8"));
const only = process.argv.slice(2);
fs.mkdirSync(path.join(root, "out/video/clips"), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  await Promise.all(tl.filter((s) => !only.length || only.includes(s.id)).map(async (s) => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto("file://" + path.join(root, "out/video/scenes", s.id + ".html"), { waitUntil: "load" });
    await page.waitForTimeout(500);
    const out = path.join(root, "out/video/clips", s.id + ".mp4");
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", "30", "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-pix_fmt", "yuv420p", "-r", "30", out], { stdio: ["pipe", "inherit", "inherit"] });
    for (let i = 0; i < s.frames; i++) {
      await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), (i * 1000) / 30);
      const buf = await page.screenshot({ type: "jpeg", quality: 94 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await new Promise((r) => ff.on("close", r));
    console.log("clip", s.id, s.frames);
    await page.close();
  }));
  await browser.close();
})();
