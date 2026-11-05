/**
 * Captures the REAL storefront widget (extensions/pickday-theme/assets/pickday.js) in states
 * used by the listing images and the promo video. Run: npx tsx marketing/src/widget-shots.ts
 * Output: marketing/out/parts/*.png (2x element screenshots).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { defaultSettings } from "../../core/defaults";
import { toStorefrontConfig } from "../../core/publish";
import { nowInZone } from "../../core/tz";
import { addDays } from "../../core/civil";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const assets = join(root, "extensions/pickday-theme/assets");
const out = join(root, "marketing/out/parts");
mkdirSync(out, { recursive: true });
const TZ = "America/New_York";
const today = nowInZone(TZ).date;

type Settings = ReturnType<typeof defaultSettings>;
type Avail = { v: 1; at: string; c: Record<string, Record<string, [number, number, Record<string, [number, number]>?]>>; p: Record<string, Record<string, number>> };

function base(country = "US", mut?: (s: Settings) => void) {
  const s = defaultSettings(country);
  const d = s.methods.delivery;
  d.enabled = true;
  d.slotsEnabled = true;
  d.dateRequired = true;
  if (country === "US") d.schedule.weekdays = [1, 2, 3, 4, 5, 6];
  d.capacity.maxPerDay = 20;
  d.capacity.showSpotsLeftBelow = 4;
  d.capacity.slots = [
    { id: "am", start: "09:00", end: "12:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 8 },
    { id: "md", start: "12:00", end: "15:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 8 },
    { id: "pm", start: "15:00", end: "18:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 8 },
  ];
  s.methods.pickup.enabled = true;
  s.methods.pickup.slotsEnabled = true;
  s.methods.pickup.capacity.slots = [
    { id: "p1", start: "08:00", end: "11:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 10 },
    { id: "p2", start: "11:00", end: "14:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 10 },
    { id: "p3", start: "14:00", end: "17:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 10 },
  ];
  s.methods.shipping.enabled = true;
  s.locations = [
    { id: "main", shopifyLocationId: null, name: "Juniper Street Bakery", address: "14 Juniper St", mapUrl: "", instructions: { en: "Ring the bell at the side door." }, timeZone: null, enabled: true, countries: "all", custom: null },
  ];
  s.methodOrder = ["delivery", "pickup", "shipping"];
  s.defaultMethod = "delivery";
  s.notes.enabled = true;
  s.widget.accent = "#2c6ecb";
  s.widget.theme = "light";
  s.widget.radius = 10;
  s.widget.showSpotsLeft = true;
  mut?.(s);
  return toStorefrontConfig(s, { version: 1, timeZone: TZ, primaryLocale: "en", plan: "pro", overLimit: false, currency: "USD", debugUntil: null, today });
}

const cart = {
  token: "t",
  item_count: 2,
  items: [
    { key: "1:a", id: 11, product_id: 1, variant_id: 11, quantity: 1, title: "Sourdough loaf", product_title: "Sourdough loaf", handle: "sourdough", gift_card: false, requires_shipping: true, properties: {} },
    { key: "2:b", id: 12, product_id: 2, variant_id: 12, quantity: 1, title: "Birthday cake", product_title: "Birthday cake", handle: "cake", gift_card: false, requires_shipping: true, properties: {} },
  ],
  attributes: {} as Record<string, string>,
  total_price: 5400,
  currency: "USD",
};

async function open(page: Page, cfg: unknown, availability: Avail | null, locale = "en", width = 460) {
  cart.attributes = {};
  await page.setViewportSize({ width, height: 1400 });
  const boot = { config: cfg, availability, locale, country: "US", currency: "USD", rate: 1, template: "cart", pseudo: false, assetBase: "/assets/" };
  const dir = ["ar", "he"].includes(locale) ? "rtl" : "ltr";
  const html = `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/pickday.css">
  <style>body{font-family:Inter,system-ui,sans-serif;margin:0;padding:10px;background:#fff;color:#1a1a1a;font-size:16px}.pickday{margin:0!important}</style></head>
  <body><form action="/cart" method="post"><div data-pickday-mount="block"></div><button type="submit" name="checkout" style="display:none">Check out</button></form>
  <script id="pickday-data" type="application/json">${JSON.stringify(boot)}</script><script src="/assets/pickday.js"></script></body></html>`;
  await page.unroute("**/*").catch(() => {});
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/assets/")) {
      const f = join(assets, url.pathname.slice(8));
      if (!existsSync(f)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ body: readFileSync(f), contentType: f.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8" });
    }
    if (url.pathname === "/cart.js") return route.fulfill({ json: cart });
    if (url.pathname === "/cart/update.js") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      for (const [k, v] of Object.entries(body.attributes ?? {})) {
        if (v) cart.attributes[k] = String(v);
        else delete cart.attributes[k];
      }
      return route.fulfill({ json: cart });
    }
    if (url.pathname === "/cart") return route.fulfill({ body: html, contentType: "text/html; charset=utf-8" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("https://shop.test/cart");
  await page.waitForSelector(".pd-root", { timeout: 8000 });
  await page.waitForTimeout(300);
}

async function snap(page: Page, name: string) {
  await page.waitForTimeout(250);
  await page.locator(".pickday").first().screenshot({ path: join(out, `${name}.png`) });
  console.log("saved", name);
}

/** Click the n-th available day (0 = first). */
async function pickDay(page: Page, n: number) {
  const days = page.locator(".pd-day:not([disabled]):not([aria-disabled=true])");
  await days.nth(n).click();
}

async function main() {
  const pre = ["/opt/pw-browsers/chromium", ...(existsSync("/opt/pw-browsers") ? readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).flatMap((d) => [join("/opt/pw-browsers", d, "chrome-linux/chrome"), join("/opt/pw-browsers", d, "chrome-linux64/chrome")]) : [])].find((f) => existsSync(f));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? pre });
  const ctx = await browser.newContext({ deviceScaleFactor: 2, timezoneId: TZ });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));

  // Availability: some days busy, one day full, one slot full.
  const d = (n: number) => addDays(today, n);
  const avail: Avail = {
    v: 1,
    at: new Date().toISOString(),
    c: {
      delivery: {
        [d(2)]: [20, 20, { am: [8, 8], md: [8, 8], pm: [4, 4] }],
        [d(3)]: [14, 14, { am: [8, 8], md: [5, 5], pm: [1, 1] }],
        [d(4)]: [13, 13, { am: [8, 8], md: [5, 5], pm: [0, 0] }],
        [d(5)]: [9, 9, { am: [6, 6], md: [2, 2], pm: [1, 1] }],
        [d(8)]: [20, 20, {}],
      },
      pickup: {},
      "pickup:main": {},
    },
    p: {},
  };

  // 1. Hero: delivery date + slot chosen
  await open(page, base("US", (s) => { s.notes.enabled = false; }), avail, "en", 530);
  await snap(page, "w-empty");
  await pickDay(page, 2);
  await page.waitForTimeout(300);
  // Same look as a chosen slot, without collapsing the picker into its summary line.
  await page.evaluate(() => document.querySelectorAll(".pd-chip")[1]?.classList.add("is-active"));
  await snap(page, "w-hero");
  await page.locator(".pd-chip:not(.is-full)").nth(1).click();
  await snap(page, "w-summary");

  // 2. Limits: open the busy day so "Full" and "spots left" show
  await open(page, base("US", (s) => { s.notes.enabled = false; }), avail, "en", 530);
  await pickDay(page, 1);
  await snap(page, "w-limits");

  // 3. Pickup chosen
  await open(page, base(), avail);
  const pickupBtn = page.locator("button, label").filter({ hasText: "Pickup" }).first();
  await pickupBtn.click();
  await page.waitForTimeout(300);
  await pickDay(page, 1);
  await page.waitForTimeout(200);
  const ps = page.locator(".pd-chip:not([disabled])");
  if (await ps.count()) await ps.nth(1).click();
  await snap(page, "w-pickup");

  // 4. Holidays: French store, Armistice Day closed
  const holiday = (s: Settings) => {
    s.closures = [
      { id: "h1", label: "Armistice 1918", start: "2026-11-11", end: "2026-11-11", yearly: true, methods: "all", locations: "all", kind: "holiday" },
      { id: "c1", label: "Inventaire", start: "2026-11-19", end: "2026-11-20", yearly: false, methods: "all", locations: "all", kind: "blackout" },
    ];
  };
  await open(page, base("FR", (s) => { holiday(s); s.notes.enabled = false; }), null, "fr", 470);
  await snap(page, "w-fr");
  await open(page, base("JP", holiday), null, "ja");
  await snap(page, "w-ja");
  await open(page, base("SA", holiday), null, "ar");
  await snap(page, "w-ar");
  await open(page, base("DE", holiday), null, "de");
  await pickDay(page, 3);
  await snap(page, "w-de");
  await open(page, base("US", holiday), null, "es");
  await snap(page, "w-es");

  // Dropdown + dark style variant for the appearance story
  await open(page, base("US", (s) => { s.widget.input = "dropdown"; s.widget.theme = "dark"; s.widget.accent = "#ff6a3d"; s.widget.radius = 18; }), avail);
  await snap(page, "w-dark");
  await open(page, base("US", (s) => { s.widget.accent = "#1a7f5a"; s.widget.radius = 2; s.widget.compact = true; }), avail);
  await snap(page, "w-green");

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
