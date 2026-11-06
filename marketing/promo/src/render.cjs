// Renders the stage to numbered JPEG frames: node src/render.cjs [fps=60] [workers=3] [from=0] [to=end]
// RESUME=1 renders only the frames that are missing (delete a range of frames, then resume to redo it).
// Each worker is its own browser (pages in one browser share a compositor process, which caps
// throughput) and seeks its own contiguous range. Re-rendering a time range only replaces those
// frames. Also writes build/sfx.json, the sound-effect cue list collected while the stage builds.
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const [fps = 60, workers = 3, from = 0, to = Infinity] = process.argv.slice(2).map(Number);
const dir = path.join(root, "build/frames"); fs.mkdirSync(dir, { recursive: true });

async function boot() {
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(await require("./serve.cjs")(page));
  await page.waitForFunction(() => window.READY || window.BOOT_ERROR, null, { timeout: 120000 });
  const be = await page.evaluate(() => window.BOOT_ERROR);
  if (be) throw new Error(be);
  return { browser, page, cdp: await page.context().newCDPSession(page) };
}

(async () => {
  const first = await boot();
  const total = await first.page.evaluate(() => window.TOTAL);
  fs.writeFileSync(path.join(root, "build/sfx.json"), JSON.stringify(await first.page.evaluate(() => window.SFX)));
  const N = Math.round(total * fps), A = Math.round(from * fps), Z = Math.min(N, Math.round(Math.min(to, total) * fps));
  fs.writeFileSync(path.join(root, "build/frames.json"), JSON.stringify({ fps, frames: N, total }));
  console.log(`frames ${A}..${Z - 1} of ${N} @ ${fps} fps, ${workers} workers`);
  const name = (f) => path.join(dir, `f${String(f).padStart(5, "0")}.jpg`);
  const todo = [];
  for (let f = A; f < Z; f++) if (!process.env.RESUME || !fs.existsSync(name(f))) todo.push(f);
  const per = Math.ceil(todo.length / workers), t0 = Date.now();
  console.log(`${todo.length} to render`);
  let done = 0;
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const mine = todo.slice(w * per, (w + 1) * per);
    if (!mine.length) { if (w === 0) await first.browser.close(); return; }
    const W = w === 0 ? first : await boot();
    for (const f of mine) {
      await W.page.evaluate((t) => window.seek(t), f / fps);
      const { data } = await W.cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 95 });
      fs.writeFileSync(name(f) + ".tmp", Buffer.from(data, "base64"));
      fs.renameSync(name(f) + ".tmp", name(f)); // never leave a half-written frame behind
      if (++done % 300 === 0) console.log(`${done}/${todo.length} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    await W.browser.close();
  }));
  console.log(`rendered ${todo.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch((e) => { console.error(e); process.exit(1); });
