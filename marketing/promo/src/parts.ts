/**
 * Real-UI parts for the promo video. Run from the repo root:
 *   npx tsx marketing/promo/src/parts.ts
 * - The REAL storefront widget (extensions/pickday-theme/assets/pickday.js) in three states
 *   (nothing picked, Saturday picked, Saturday + 12–3 slot picked), with element boxes so the
 *   video can draw ink marks exactly on the day and slot.
 * - The same widget in Arabic (right to left), for the languages scene.
 * - The REAL day sheet, route sheet and production list (app/services/print.server.ts) printed in the video's blue ink.
 * Output: marketing/promo/build/parts/
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { defaultSettings } from "../../../core/defaults";
import { toStorefrontConfig } from "../../../core/publish";
import { daySheet, productionSheet, routeSheet } from "../../../app/services/print.server";
import { loadMessages, makeT } from "../../../app/i18n";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const assets = join(root, "extensions/pickday-theme/assets");
const out = join(root, "marketing/promo/build/parts");
const fonts = join(root, "marketing/promo/node_modules/@fontsource");
mkdirSync(out, { recursive: true });
const TZ = "America/New_York";
// A fixed story week: "today" is Thursday 5 November 2026, the shopper picks Saturday 14.
const TODAY = "2026-11-05";
const PICK = "2026-11-14";

function config() {
  const s = defaultSettings("US");
  const d = s.methods.delivery;
  d.enabled = true; d.slotsEnabled = true; d.dateRequired = true;
  d.schedule.weekdays = [1, 2, 3, 4, 5, 6];
  d.capacity.maxPerDay = 20; d.capacity.showSpotsLeftBelow = 4;
  d.capacity.slots = [
    { id: "am", start: "09:00", end: "12:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 8 },
    { id: "md", start: "12:00", end: "15:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 8 },
    { id: "pm", start: "15:00", end: "18:00", weekdays: [0, 1, 2, 3, 4, 5, 6], max: 8 },
  ];
  s.methods.pickup.enabled = true;
  s.methods.shipping.enabled = true;
  s.locations = [{ id: "main", shopifyLocationId: null, name: "Juniper Street Bakery", address: "14 Juniper St", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null }];
  s.methodOrder = ["delivery", "pickup", "shipping"];
  s.defaultMethod = "delivery";
  s.notes.enabled = false;
  Object.assign(s.widget, { accent: "#2c6ecb", theme: "light", radius: 10, showSpotsLeft: true });
  return toStorefrontConfig(s, { version: 1, timeZone: TZ, primaryLocale: "en", plan: "pro", overLimit: false, currency: "USD", debugUntil: null, today: TODAY });
}

const availability = {
  v: 1, at: "2026-11-05T12:00:00Z", p: {},
  c: { delivery: { "2026-11-07": [20, 20, {}], "2026-11-13": [20, 20, {}], "2026-11-14": [14, 14, { am: [6, 6], md: [5, 5], pm: [3, 3] }] } },
};
const cart = { token: "t", item_count: 2, items: [
  { key: "1:a", id: 11, product_id: 1, variant_id: 11, quantity: 1, title: "Sourdough loaf", product_title: "Sourdough loaf", handle: "a", gift_card: false, requires_shipping: true, properties: {} },
  { key: "2:b", id: 12, product_id: 2, variant_id: 12, quantity: 1, title: "Birthday cake", product_title: "Birthday cake", handle: "b", gift_card: false, requires_shipping: true, properties: {} },
], attributes: {} as Record<string, string>, total_price: 5400, currency: "USD" };

async function open(page: Page, locale = "en") {
  cart.attributes = {};
  const boot = { config: config(), availability, locale, country: "US", currency: "USD", rate: 1, template: "cart", pseudo: false, assetBase: "/assets/" };
  const html = `<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/pickday.css">
  ${[400, 500, 600, 700].map((w) => `<link rel="stylesheet" href="/fonts/noto-sans-arabic/${w}.css">`).join("")}
  <style>body{font-family:Inter,"Noto Sans Arabic",system-ui,sans-serif;margin:0;padding:10px;background:#fff;color:#1a1a1a;font-size:16px}.pickday{margin:0!important}</style></head>
  <body><form action="/cart" method="post"><div data-pickday-mount="block"></div></form>
  <script id="pickday-data" type="application/json">${JSON.stringify(boot)}</script><script src="/assets/pickday.js"></script></body></html>`;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/assets/")) {
      const f = join(assets, url.pathname.slice(8));
      return existsSync(f) ? route.fulfill({ body: readFileSync(f), contentType: f.endsWith(".css") ? "text/css" : "application/javascript" }) : route.fulfill({ status: 404, body: "" });
    }
    if (url.pathname.startsWith("/fonts/")) {
      const f = join(fonts, url.pathname.slice(7));
      return existsSync(f) ? route.fulfill({ body: readFileSync(f), contentType: f.endsWith(".css") ? "text/css" : "font/woff2" }) : route.fulfill({ status: 404, body: "" });
    }
    if (url.pathname === "/cart.js") return route.fulfill({ json: cart });
    if (url.pathname === "/cart/update.js") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      for (const [k, v] of Object.entries(body.attributes ?? {})) v ? (cart.attributes[k] = String(v)) : delete cart.attributes[k];
      return route.fulfill({ json: cart });
    }
    return route.fulfill({ body: html, contentType: "text/html; charset=utf-8" });
  });
  await page.goto("https://shop.test/cart");
  await page.waitForSelector(".pd-root");
  await page.waitForTimeout(300);
}

async function boxes(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector(".pickday")!.getBoundingClientRect();
    const rel = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x - root.x, y: r.y - root.y, w: r.width, h: r.height }; };
    return {
      size: { w: root.width, h: root.height },
      days: [...document.querySelectorAll<HTMLElement>(".pd-day[data-date]")].map((b) => ({ date: b.dataset.date, cls: b.className, ...rel(b) })),
      chips: [...document.querySelectorAll(".pd-chip")].map((c) => ({ text: c.textContent, cls: c.className, ...rel(c) })),
      methods: [...document.querySelectorAll(".pd-method")].map((m) => ({ text: m.textContent, ...rel(m) })),
    };
  });
}

async function main() {
  const pre = ["/opt/pw-browsers/chromium", ...(existsSync("/opt/pw-browsers") ? readdirSync("/opt/pw-browsers").filter((d) => /^chromium-\d+$/.test(d)).flatMap((d) => [join("/opt/pw-browsers", d, "chrome-linux/chrome"), join("/opt/pw-browsers", d, "chrome-linux64/chrome")]) : [])].find((f) => existsSync(f));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? pre });
  const ctx = await browser.newContext({ deviceScaleFactor: 2, timezoneId: TZ, viewport: { width: 560, height: 1200 } });
  // Freeze the clock on the story's Thursday so the calendar is the same every build.
  await ctx.addInitScript("globalThis.__name = (f) => f;"); // tsx keeps function names with a helper the page lacks
  await ctx.addInitScript(`{const T=new Date("2026-11-05T15:00:00Z").getTime();const D=Date;class F extends D{constructor(...a){super(...(a.length?a:[T]))}static now(){return T}};globalThis.Date=F;}`);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await open(page);
  const el = page.locator(".pickday").first();
  const shot = async (name: string) => { await page.waitForTimeout(250); await el.screenshot({ path: join(out, `${name}.png`) }); };
  await shot("fig-empty");
  const b0 = await boxes(page);
  await page.click(`.pd-day[data-date="${PICK}"]`);
  await shot("fig-day");
  const b1 = await boxes(page);
  // Same look as a chosen slot, without collapsing the picker into its summary line.
  await page.evaluate(() => document.querySelectorAll(".pd-chip")[1]?.classList.add("is-active"));
  await shot("fig-slot");
  // The same picker in Arabic: the widget flips itself to right-to-left.
  await page.unroute("**/*");
  await open(page, "ar");
  await page.evaluate(() => document.fonts.ready);
  await page.click(`.pd-day[data-date="${PICK}"]`);
  await page.evaluate(() => document.querySelectorAll(".pd-chip")[1]?.classList.add("is-active"));
  await shot("fig-ar");
  const b2 = await boxes(page);
  writeFileSync(join(out, "fig.json"), JSON.stringify({ empty: b0, day: b1, ar: b2 }, null, 1));

  // Day sheet, printed in blue ink on transparent paper.
  const t = makeT(await loadMessages("en"), "en");
  const s = defaultSettings("US");
  const o = (n: number, method: string, slot: string, first: string, items: [string, number, string?][]) => ({
    id: String(n), shop: "x", orderId: String(n), orderName: `#${n}`, customerFirst: first, method, date: "2026-11-14", slotLabel: slot, locationId: method === "pickup" ? "main" : null, zoneId: null, area: null,
    itemCount: items.reduce((a, i) => a + i[1], 0), items: items.map(([title, qty, variant]) => ({ title, qty, variant: variant ?? null })), status: "open", limited: true, tags: [],
  }) as any;
  s.locations = [{ id: "main", shopifyLocationId: null, name: "Juniper Street Bakery", address: "14 Juniper St", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null }];
  const orders = [
    o(1041, "delivery", "09:00-12:00", "Maya", [["Birthday cake", 1, "Chocolate · 8 in"], ["Candles", 1]]),
    o(1044, "delivery", "09:00-12:00", "Daniel", [["Sourdough loaf", 2]]),
    o(1047, "delivery", "12:00-15:00", "Priya", [["Croissant box", 1, "12 pieces"]]),
    o(1038, "pickup", "08:00-11:00", "Leo", [["Sourdough loaf", 1], ["Cinnamon rolls", 6]]),
    o(1049, "pickup", "11:00-14:00", "Hana", [["Birthday cake", 1, "Vanilla · 6 in"]]),
  ];
  const live = new Map<string, any>([
    ["1041", { note: "Gift: Happy 30th, Sam!", phone: null, address: { name: "Maya R.", address1: "220 Elm Ave", address2: null, zip: "11215", city: "Brooklyn", phone: null } }],
    ["1044", { note: "Leave it at the back door", phone: null, address: { name: "Daniel K.", address1: "18 Pine St", address2: null, zip: "11217", city: "Brooklyn", phone: null } }],
    ["1047", { note: null, phone: null, address: { name: "Priya S.", address1: "9 Oak Pl", address2: null, zip: "11238", city: "Brooklyn", phone: null } }],
  ]);
  const ink = `<style>body{color:#2546b3!important;background:transparent!important;margin:18px!important;font-family:"IBM Plex Mono",ui-monospace,monospace!important;font-size:13px!important}
    h1{font-family:Inter,sans-serif;font-weight:800}th,td{border-color:#2546b3!important}th{background:transparent!important}h2{border-color:#2546b3!important}.muted{color:#2546b3!important;opacity:.7}.box{border-color:#2546b3!important}</style>`;
  const html = daySheet(t, "en", s, "2026-11-14", "Saturday, November 14, 2026", orders, live).replace("</head>", `${ink}</head>`);
  writeFileSync(join(out, "daysheet.html"), html);
  const p2 = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 900, height: 60 } }); // fullPage grows to the content
  await p2.setContent(html);
  await p2.waitForTimeout(200);
  await p2.screenshot({ path: join(out, "daysheet.png"), omitBackground: true, fullPage: true });
  const route = routeSheet(t, "en", s, "Saturday, November 14, 2026", orders, live).replace("</head>", `${ink}</head>`);
  await p2.setContent(route); await p2.waitForTimeout(150);
  await p2.screenshot({ path: join(out, "route.png"), omitBackground: true, fullPage: true });
  const prod = productionSheet(t, "en", "Saturday, November 14, 2026", [
    { title: "Sourdough loaf", variant: null, qty: 9, orders: 6, slots: [{ slot: "09:00-12:00", qty: 5 }, { slot: "12:00-15:00", qty: 4 }] },
    { title: "Birthday cake", variant: "Chocolate · 8 in", qty: 3, orders: 3, slots: [{ slot: "09:00-12:00", qty: 2 }, { slot: "11:00-14:00", qty: 1 }] },
    { title: "Birthday cake", variant: "Vanilla · 6 in", qty: 2, orders: 2, slots: [{ slot: "11:00-14:00", qty: 2 }] },
    { title: "Croissant box", variant: "12 pieces", qty: 4, orders: 4, slots: [{ slot: "12:00-15:00", qty: 4 }] },
    { title: "Cinnamon rolls", variant: null, qty: 18, orders: 3, slots: [{ slot: "08:00-11:00", qty: 18 }] },
    { title: "Candles", variant: null, qty: 3, orders: 3, slots: [{ slot: "09:00-12:00", qty: 3 }] },
  ]).replace("</head>", `${ink}</head>`);
  await p2.setContent(prod); await p2.waitForTimeout(150);
  await p2.screenshot({ path: join(out, "production.png"), omitBackground: true, fullPage: true });
  await browser.close();
  console.log("parts ok", out);
}
main().catch((e) => { console.error(e); process.exit(1); });
