// App Store listing images: node src/listing.cjs [n...]   (run python3 src/listing-parts.py first)
// 1. shoots the admin/checkout UI parts (build/lparts/*.html) as transparent PNGs at 3x, plus rects.json
//    (where the marked-up bits sit, in the part's CSS px)
// 2. renders listing.html?n=0..6 at 1920 x 1080 CSS px, 5/3 device scale (3200 x 1800), and scales it
//    down to 1600 x 900 -> out/listing/
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const NAMES = ["listing-00-feature", "listing-01-picker", "listing-02-limits", "listing-03-checkout", "listing-04-orders", "listing-05-print", "listing-06-worldwide"];

(async () => {
  const only = process.argv.slice(2).map(Number);
  const b = await chromium.launch({ args: ["--force-color-profile=srgb"] });
  const parts = path.join(root, "build/lparts");
  const rects = {};
  const pp = await b.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 3 });
  for (const f of fs.readdirSync(parts).filter((f) => f.endsWith(".html"))) {
    const name = f.replace(".html", "");
    await pp.goto("file://" + path.join(parts, f));
    await pp.evaluate(() => document.fonts.ready);
    const el = await pp.$("#fig");
    await el.screenshot({ path: path.join(parts, `${name}.png`), omitBackground: true });
    rects[name] = await pp.evaluate(() => {
      const o = document.getElementById("fig").getBoundingClientRect(), out = {};
      const r = (e) => { const a = e.getBoundingClientRect(); return { x: a.left - o.left, y: a.top - o.top, w: a.width, h: a.height }; };
      document.querySelectorAll(".pdc-day").forEach((d) => { out[d.querySelector(".pdc-num").textContent] = r(d); });
      const opt = [...document.querySelectorAll("#fig div")].find((d) => d.style.borderRadius === "12px" && d.textContent.includes("Sat, Nov 14"));
      if (opt) out.option = r(opt);
      return out;
    });
  }
  fs.writeFileSync(path.join(parts, "rects.json"), JSON.stringify(rects));

  const out = path.join(root, "out/listing"); fs.mkdirSync(out, { recursive: true });
  const raw = path.join(root, "build/listing"); fs.mkdirSync(raw, { recursive: true });
  const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 5 / 3 });
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.route("http://promo.local/**", (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname);
    const f = path.join(root, "..", p);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
    const ext = path.extname(f);
    const type = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" }[ext] || "application/octet-stream";
    return route.fulfill({ body: fs.readFileSync(f), contentType: type });
  });
  for (let n = 0; n < NAMES.length; n++) {
    if (only.length && !only.includes(n)) continue;
    await page.goto(`http://promo.local/promo/src/listing.html?n=${n}`);
    await page.waitForFunction(() => window.READY || window.BOOT_ERROR, null, { timeout: 60000 });
    const be = await page.evaluate(() => window.BOOT_ERROR);
    if (be) throw new Error(be);
    await page.waitForTimeout(200);
    const big = path.join(raw, `${NAMES[n]}.png`);
    await page.screenshot({ path: big });
    execFileSync("python3", ["-c", `from PIL import Image; Image.open(r"${big}").convert("RGB").resize((1600, 900), Image.LANCZOS).save(r"${path.join(out, NAMES[n] + ".png")}", optimize=True)`]);
    console.log(NAMES[n]);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
