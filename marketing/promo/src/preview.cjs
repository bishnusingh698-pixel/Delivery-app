// Preview frames: node src/preview.cjs <seconds...>  -> build/preview/t<sec>.jpg (+ sheet.jpg montage)
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
(async () => {
  const times = process.argv.slice(2).map(Number);
  const out = path.join(root, "build/preview"); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(await require("./serve.cjs")(p));
  await p.waitForFunction(() => window.READY || window.BOOT_ERROR, null, { timeout: 60000 });
  const be = await p.evaluate(() => window.BOOT_ERROR);
  if (be) { console.error("BOOT_ERROR", be); await b.close(); process.exit(1); }
  const files = [];
  for (const t of times) {
    const t0 = Date.now();
    await p.evaluate((t) => window.seek(t), t);
    const f = path.join(out, `t${t.toFixed(2)}.jpg`);
    await p.screenshot({ path: f, type: "jpeg", quality: 80 });
    files.push(f);
    console.log("frame", t, Date.now() - t0, "ms");
  }
  if (errs.length) console.error("errors:", [...new Set(errs)].slice(0, 10).join("\n"));
  await b.close();
  if (files.length > 1) {
    const cols = Math.min(3, files.length);
    execFileSync("montage", [...files, "-tile", `${cols}x`, "-geometry", "960x540+4+4", "-background", "#222", path.join(out, "sheet.jpg")]);
  }
})();
