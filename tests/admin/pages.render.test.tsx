/**
 * Smoke test for the admin pages: each page renders on the server with realistic loader
 * data (no Shopify, no database). Catches crashes from missing data, bad keys or props.
 */
import { renderToString } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { defaultSettings, applyWizard } from "../../core/defaults";
import { I18nProvider } from "../../app/i18n/react";
import en from "../../app/i18n/admin/en.json";

vi.mock("../../app/shopify.server", () => ({ authenticate: {}, unauthenticated: {}, default: {}, PLAN_PRO: "Pro", PLAN_STARTER: "Starter", login: null }));
vi.mock("../../app/db.server", () => ({ default: {} }));
vi.mock("@shopify/app-bridge-react", () => ({ SaveBar: () => null, useAppBridge: () => ({ toast: { show: () => {} } }) }));

// React warns that useLayoutEffect does nothing on the server (Polaris wrappers, links): expected here.
const realError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("useLayoutEffect does nothing on the server")) return;
  realError(...args);
};

const settings = applyWizard(defaultSettings("US"), {
  country: "US",
  businessType: "bakery",
  methods: ["delivery", "pickup", "shipping"],
  workdays: [1, 2, 3, 4, 5, 6],
  lead: { amount: 1, unit: "days" },
  cutoff: "14:00",
  holidays: true,
  pickup: { name: "Main Street", address: "1 Main St" },
});
settings.closures.push({ id: "c1", label: "Stock-take", start: "2026-11-02", end: "2026-11-03", yearly: false, methods: "all", locations: "all", kind: "blackout" });
const meta = { shop: "test.myshopify.com", plan: "pro" as const, timeZone: "America/New_York", currency: "USD", country: "US", primaryLocale: "en", locales: ["en", "es"], today: "2026-10-23" };
const preview = { preview: { plan: "pro" as const, timeZone: "America/New_York", primaryLocale: "en", currency: "USD", country: "US" }, holidayItems: { [settings.holidays[0].id]: [{ key: "12-25", date: "2026-12-25", end: "2026-12-25", name: "Christmas Day", mayShift: false }] } };

async function render(path: string, mod: { default: () => JSX.Element }, data: unknown) {
  const router = createMemoryRouter([{ path: "*", id: "page", Component: mod.default, loader: () => data }], {
    initialEntries: [path],
    hydrationData: { loaderData: { page: data } },
  });
  return renderToString(
    <I18nProvider messages={en as Record<string, string>} lang="en">
      <RouterProvider router={router} />
    </I18nProvider>,
  );
}

const noRawKeys = (html: string) => {
  // A translation key printed instead of text looks like "delivery.whenHeading".
  const raw = html.match(/>(?:[a-z]+\.){1,3}[a-zA-Z]+</g) ?? [];
  expect(raw).toEqual([]);
};

describe("admin pages render", () => {
  it("Delivery", async () => {
    const html = await render("/app/delivery", await import("../../app/routes/app.delivery._index"), {
      meta, ...preview, countries: ["US", "CA"], markets: [], full: settings, areaCount: 0, zoneCount: 0, initial: { methods: settings.methods },
    });
    expect(html).toContain("Days and times");
    noRawKeys(html);
  });

  it("Pickup", async () => {
    const html = await render("/app/pickup", await import("../../app/routes/app.pickup"), {
      meta, ...preview, countries: ["US"], markets: [], timeZones: ["America/New_York"], daysOff: { loc_main: 1 }, full: settings, initial: { methods: settings.methods, locations: settings.locations },
    });
    expect(html).toContain("Main Street");
    noRawKeys(html);
  });

  it("Days off", async () => {
    const html = await render("/app/days-off", await import("../../app/routes/app.days-off"), {
      meta, weekStart: 0, holidayCountries: ["US", "CA"], holidayItems: preview.holidayItems, regions: { US: [{ code: "CA", name: "California" }] }, ordersByDate: { "2026-11-02": 3 },
      locations: [{ id: "loc_main", name: "Main Street" }], initial: { holidays: settings.holidays, closures: settings.closures, specialDays: [], vacation: settings.vacation },
    });
    expect(html).toContain("Christmas Day");
    expect(html).toContain("Stock-take");
    noRawKeys(html);
  });

  it("Settings", async () => {
    const html = await render("/app/settings", await import("../../app/routes/app.settings._index"), {
      meta, countries: ["US", "DE", "SA"], shopifyCountry: "US",
      initial: { country: "US", dateFormat: "auto", weekStart: 0, holidays: settings.holidays, methods: settings.methods, locations: settings.locations, methodOrder: settings.methodOrder, defaultMethod: null, dateMode: "order", tagging: settings.tagging, customerChanges: { ...settings.customerChanges, enabled: true } },
    });
    expect(html).toContain("Store and region");
    expect(html).toContain("Let customers change their date");
    expect(html).toContain("Changes per order");
    noRawKeys(html);
  });

  it("Notifications: daily summary setup", async () => {
    const notifications = { ...settings.notifications, dailySummary: { enabled: true, hour: 7, day: "tomorrow" as const } };
    const html = await render("/app/notifications", await import("../../app/routes/app.notifications"), { meta, initial: { notifications }, feedUrl: null });
    expect(html).toContain("Daily summary email (free with Shopify Flow)");
    expect(html).toContain("{{ordersPage}}");
    expect(html).toContain("{{orders | round}}");
    noRawKeys(html);
  });

  it("Appearance", async () => {
    const sf = (await import("../../locales/storefront/en.json")).default as Record<string, string>;
    const html = await render("/app/appearance", await import("../../app/routes/app.appearance"), {
      meta, ...preview, full: settings, embed: { detected: true, link: "https://x" }, keys: Object.keys(sf), defaults: { en: sf, es: sf }, builtIn: { en: true, es: true },
      context: {}, methods: ["delivery", "pickup", "shipping"], initial: { widget: settings.widget, texts: {}, notes: { enabled: true, methods: "all", maxLength: 250 } },
    });
    expect(html).toContain("Position on the cart page");
    noRawKeys(html);
  });

  it("Home: wizard and dashboard", async () => {
    const mod = await import("../../app/routes/app._index");
    const common = { shop: meta.shop, today: meta.today, plan: "free", themeLink: "https://x", embed: false };
    const wizard = await render("/app", mod, { ...common, mode: "wizard", ...preview, full: defaultSettings("US"), countries: ["US", "DE"], country: "US", firstLocation: { name: "Shop", address: "1 Main" } });
    expect(wizard).toContain("Step 1 of 3");
    noRawKeys(wizard);
    const chart = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${23 + i > 31 ? "0" + (i - 8) : 23 + i}`, orders: i, used: i, max: 10 }));
    const dash = await render("/app", mod, {
      ...common, mode: "dashboard", checklist: [{ id: "embed", done: false }, { id: "testOrder", done: true }], checklistDismissed: false,
      overview: { today: { total: 2, methods: { delivery: 2 } }, tomorrow: { total: 0, methods: {} }, week: { total: 5, methods: {} } }, chart,
      alerts: [{ id: "holidays", tone: "info", params: { country: "US" } }], celebrate: false, methods: ["delivery", "pickup"], closedToday: true,
    });
    expect(dash).toContain("Next 14 days");
    noRawKeys(dash);
  });
});
