// node src/thumb.cjs -> build/thumbnail-1280x720.png (drawn at 1920x1080, scaled down)
const { chromium } = require("playwright");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const url = (await require("./serve.cjs")(p)).replace("stage.html", "thumb.html");
  await p.goto(url);
  await p.waitForFunction(() => window.READY, null, { timeout: 60000 });
  await p.waitForTimeout(300);
  const big = path.join(root, "build/thumbnail-1920.png");
  await p.screenshot({ path: big });
  await b.close();
  execFileSync("convert", [big, "-filter", "Lanczos", "-resize", "1280x720", "-strip", path.join(root, "build/thumbnail-1280x720.png")]);
  console.log("thumbnail ok");
})();
