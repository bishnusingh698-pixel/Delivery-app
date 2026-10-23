/**
 * The admin live preview runs the real storefront widget: build a harness page with Vite,
 * open it in headless Chromium and check it renders, reacts to setting changes and shows
 * public holidays as closed. Run: npx tsx tests/browser/preview.browser.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "node_modules/.cache/preview-harness");

async function main() {
  await build({ root: join(root, "tests/browser/preview"), base: "./", logLevel: "warn", configFile: false, build: { outDir: out, emptyOutDir: true } });
  const pre = ["/opt/pw-browsers/chromium", ...(existsSync("/opt/pw-browsers") ? readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).flatMap((d) => [join("/opt/pw-browsers", d, "chrome-linux/chrome"), join("/opt/pw-browsers", d, "chrome-linux64/chrome")]) : [])].find((f) => existsSync(f));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? pre });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, timezoneId: "America/New_York" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\//, "") || "index.html";
    const f = join(out, p);
    if (!existsSync(f)) return route.fulfill({ status: 404, body: "" });
    const type = f.endsWith(".html") ? "text/html" : f.endsWith(".js") ? "application/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".json") ? "application/json" : "application/octet-stream";
    return route.fulfill({ body: readFileSync(f), contentType: `${type}; charset=utf-8` });
  });
  const fails: string[] = [];
  const check = (ok: unknown, msg: string) => !ok && fails.push(msg);
  await page.goto("https://admin.test/index.html");
  await page.waitForSelector(".pd-preview .pd-root", { timeout: 10000 });
  const tomorrow = await page.innerText("#tomorrow");
  const day = page.locator(`.pd-day[data-date="${tomorrow}"]`);
  if (await day.count()) {
    check(!(await day.getAttribute("class"))?.includes("is-available"), "holiday shown as available");
    check((await day.getAttribute("aria-label"))?.includes("Test Holiday"), "holiday name missing from the day");
  }
  check(await page.locator("textarea.pd-notes").count(), "notes box missing");
  // Pick a day: the in-memory cart takes the choice, slots show up.
  await page.click(".pd-day.is-available >> nth=0");
  check(await page.locator(".pd-chip").count(), "slots not shown after picking a day");
  // Settings change → the preview is rebuilt with the new accent and readable text.
  await page.click("#yellow");
  await page.waitForTimeout(300);
  const color = await page.$eval(".pd-preview .pickday", (el) => getComputedStyle(el).getPropertyValue("--pd-on-accent").trim());
  check(color === "#111111", `text colour on yellow accent: ${color}`);
  await page.click("#noHolidays");
  await page.waitForTimeout(300);
  if (await day.count()) check((await page.locator(`.pd-day[data-date="${tomorrow}"]`).getAttribute("class"))?.includes("is-available"), "holiday still closed after turning holidays off");
  check(!errors.length, `page errors: ${errors.join("; ")}`);
  await page.screenshot({ path: join(root, "tests/browser/screenshots/admin-preview.png"), fullPage: true });
  await browser.close();
  console.log(fails.length ? `FAIL\n  ${fails.join("\n  ")}` : "PASS  admin live preview runs the real widget");
  process.exit(fails.length ? 1 : 0);
}
void main();
