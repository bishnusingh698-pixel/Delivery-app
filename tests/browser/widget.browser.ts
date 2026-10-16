/**
 * Browser checks for the built storefront widget (run: npm run test:browser).
 * Loads extensions/pickday-theme/assets/pickday.js into a fake cart page in
 * headless Chromium with a mocked AJAX cart, then checks:
 *  - it renders, and picking a date + slot saves cart attributes
 *  - pseudo-localised (40% longer) text never overflows a 320px phone width
 *  - Arabic and Hebrew render right-to-left (screenshots saved for review)
 *  - the checkout button is blocked until a required date is chosen
 * Needs Chromium (PLAYWRIGHT_CHROMIUM or /opt/pw-browsers, or `npx playwright install chromium`).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { defaultSettings } from "../../core/defaults";
import { toStorefrontConfig } from "../../core/publish";
import { nowInZone } from "../../core/tz";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const assets = join(root, "extensions/pickday-theme/assets");
const shots = join(root, "tests/browser/screenshots");
mkdirSync(shots, { recursive: true });

function config(plan: "free" | "pro" = "pro") {
  const s = defaultSettings("US");
  s.methods.delivery.enabled = true;
  s.methods.delivery.slotsEnabled = true;
  s.methods.delivery.dateRequired = true;
  s.methods.delivery.capacity.slots = [
    { id: "am", start: "09:00", end: "12:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 5 },
    { id: "pm", start: "13:00", end: "17:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 5 },
  ];
  s.methods.delivery.schedule.weekdays = [1, 2, 3, 4, 5, 6];
  s.methods.pickup.enabled = true;
  s.locations = [
    { id: "main", shopifyLocationId: null, name: "Main Street Store", address: "1 Main St", mapUrl: "", instructions: { en: "Ring the bell." }, timeZone: null, enabled: true, countries: "all", custom: null },
  ];
  s.methodOrder = ["delivery", "pickup", "shipping"];
  s.defaultMethod = "delivery";
  const tz = "America/New_York";
  return toStorefrontConfig(s, { version: 1, timeZone: tz, primaryLocale: "en", plan, overLimit: false, currency: "USD", debugUntil: null, today: nowInZone(tz).date });
}

const cartState = {
  token: "t",
  item_count: 1,
  items: [{ key: "1:a", id: 11, product_id: 1, variant_id: 11, quantity: 1, title: "Cake", product_title: "Cake", handle: "cake", gift_card: false, requires_shipping: true, properties: {} }],
  attributes: {} as Record<string, string>,
  total_price: 5000,
  currency: "USD",
};

async function open(page: Page, locale: string, pseudo = false) {
  cartState.attributes = {};
  const boot = { config: config(), availability: null, locale, country: "US", currency: "USD", rate: 1, template: "cart", pseudo, poweredByUrl: "https://example.com", brand: "Pickday", assetBase: "/assets/" };
  const html = `<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/pickday.css">
    <style>body{font-family:system-ui,sans-serif;margin:0;padding:0 16px}main{max-width:100%}</style></head>
    <body><main><form action="/cart" method="post"><div data-pickday-mount="block"></div><button type="submit" name="checkout">Check out</button></form></main>
    <script id="pickday-data" type="application/json">${JSON.stringify(boot)}</script><script src="/assets/pickday.js"></script></body></html>`;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/assets/")) {
      const f = join(assets, url.pathname.slice(8));
      if (!existsSync(f)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8" });
    }
    if (url.pathname === "/cart.js") return route.fulfill({ json: cartState });
    if (url.pathname === "/cart/update.js") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      for (const [k, v] of Object.entries(body.attributes ?? {})) {
        if (v) cartState.attributes[k] = String(v);
        else delete cartState.attributes[k];
      }
      return route.fulfill({ json: cartState });
    }
    if (url.pathname === "/cart") return route.fulfill({ body: html, contentType: "text/html; charset=utf-8" });
    if (url.pathname === "/checkout") return route.fulfill({ body: "checkout", contentType: "text/html; charset=utf-8" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("https://shop.test/cart");
  await page.waitForSelector(".pd-root", { timeout: 5000 });
}

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message });
  }
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const exe = process.env.PLAYWRIGHT_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
  const browser = await chromium.launch({ executablePath: exe });
  const ctx = await browser.newContext({ viewport: { width: 320, height: 900 }, timezoneId: "America/New_York" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await check("renders and saves the chosen date and slot", async () => {
    await open(page, "en");
    await page.click("button[name=checkout]");
    assert(await page.isVisible("[data-pd-err]"), "checkout was not blocked without a date");
    assert(page.url().endsWith("/cart"), "navigated to checkout without a date");
    await page.click(".pd-day.is-available >> nth=0");
    if (!(await page.locator(".pd-chip").count())) throw new Error("no slots: " + (await page.innerText(".pickday")));
    await page.click(".pd-chip:not(.is-full) >> nth=0");
    await page.waitForFunction(() => document.querySelector(".pd-summary") !== null);
    await page.waitForTimeout(600);
    const raw = cartState.attributes._pickday;
    assert(raw, "no _pickday attribute saved");
    const sel = JSON.parse(raw);
    assert(sel.m === "delivery" && /^\d{4}-\d\d-\d\d$/.test(sel.d) && sel.s, `bad selection ${raw}`);
    assert(cartState.attributes["Delivery date"]?.includes(sel.d), "readable date attribute missing");
  });

  await check("keyboard: arrow keys move between days", async () => {
    await open(page, "en");
    const first = page.locator(".pd-day[tabindex='0']");
    await first.focus();
    const before = await first.getAttribute("data-date");
    await page.keyboard.press("ArrowRight");
    const after = await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.date);
    assert(after && before && after > before, `focus did not move (${before} -> ${after})`);
  });

  const overflow = async () =>
    page.evaluate(() => {
      const root = document.querySelector(".pickday") as HTMLElement;
      const limit = root.getBoundingClientRect().right + 1;
      const left = root.getBoundingClientRect().left - 1;
      const bad: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>("*")) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > limit || r.left < left)) bad.push(`${el.getAttribute("class") || el.tagName}: ${el.textContent?.slice(0, 40)}`);
      }
      return { bad: bad.slice(0, 5), scroll: document.documentElement.scrollWidth > window.innerWidth };
    });

  await check("pseudo-localised text fits a 320px screen", async () => {
    await open(page, "en", true);
    let o = await overflow();
    assert(!o.scroll && !o.bad.length, `overflow: ${o.bad.join(" | ")}`);
    await page.click(".pd-day.is-available >> nth=0");
    o = await overflow();
    assert(!o.scroll && !o.bad.length, `overflow with slots: ${o.bad.join(" | ")}`);
    await page.screenshot({ path: join(shots, "pseudo.png"), fullPage: true });
  });

  const locales = readdirSync(join(root, "locales/storefront")).filter((f) => !f.startsWith("_")).map((f) => f.replace(".json", ""));
  for (const locale of locales) {
    await check(`${locale}: renders without overflow`, async () => {
      await open(page, locale);
      const xs = await page.$$eval(".pd-grid th", (ths) => ths.map((t) => t.getBoundingClientRect().left));
      await page.click(".pd-day.is-available >> nth=0");
      const o = await overflow();
      assert(!o.scroll && !o.bad.length, `overflow: ${o.bad.join(" | ")}`);
      const dir = await page.getAttribute(".pickday", "dir");
      const rtl = locale === "ar" || locale === "he";
      assert(dir === (rtl ? "rtl" : "ltr"), `dir=${dir}`);
      if (rtl) {
        // The first weekday column must be on the right.
        assert(xs[0] > xs[6], "calendar not mirrored");
        await page.screenshot({ path: join(shots, `rtl-${locale}.png`), fullPage: true });
      }
    });
  }

  await check("no page errors", async () => assert(!errors.length, errors.join("; ")));
  await browser.close();

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshots: tests/browser/screenshots/`);
  process.exit(failed ? 1 : 0);
}

void main();
