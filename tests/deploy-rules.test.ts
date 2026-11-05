/**
 * Shopify's deploy-time rules (tests/deploy/rules.ts has every rule with its source), checked so
 * they fail here instead of at `shopify app deploy`. tests/deploy-rules.mutations.test.ts breaks a
 * copy of the app once per rule to prove each check catches what it claims to.
 * Function input query cost and size: tests/function-query-cost.test.ts.
 * Run before a deploy: `npm run check:shopify` (no database needed).
 */
import { join } from "node:path";
import { themeCheckRun } from "@shopify/theme-check-node";
import { describe, expect, it } from "vitest";
import { ALL_RULES, flowFields, payloadProblems, supportedVersion } from "./deploy/rules";
import { DAILY_HANDLE, FLOW_HANDLES, FLOW_PAYLOAD_MAX_BYTES, dailyPayload, orderPayload } from "../app/services/flow-payload";
import { FUNCTION_CONFIG_BUDGET, FUNCTION_LIST_MAX, FUNCTION_METAFIELD_MAX_BYTES, deliveryConfig, fitDeliveryConfig, fitFunctionConfig, ruleVariables, utf8Bytes } from "../core/publish";
import { timeCheckVariables } from "../core/checkout";
import type { Availability, Settings } from "../core/types";
import { config, settings } from "./helpers";

const root = join(__dirname, "..");

describe("Shopify deploy rules", () => {
  for (const [group, rules] of Object.entries(ALL_RULES)) {
    describe(group, () => {
      for (const [name, rule] of Object.entries(rules)) it(name, () => expect(rule(root)).toEqual([]));
    });
  }

  it("API versions: a version is supported for 12 months", () => {
    expect(supportedVersion("2026-10", new Date("2026-11-05"))).toBe(true);
    expect(supportedVersion("2025-10", new Date("2026-11-05"))).toBe(false);
    expect(supportedVersion("2026-08", new Date("2026-11-05"))).toBe(false);
  });
});

describe("Shopify Flow payloads match the trigger definitions", () => {
  const s = settings((x) => x.locations.push({ id: "l1", shopifyLocationId: null, name: "Bakery", address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null }));
  const order = { orderId: "5551234", method: "pickup", date: "2026-11-06", slotLabel: "10:00-12:00", locationId: "l1" };

  for (const [event, handle] of Object.entries(FLOW_HANDLES)) {
    it(`${handle} (${event})`, () => {
      expect(payloadProblems(flowFields(root, handle), orderPayload(order, s))).toEqual([]);
      // An order without a date or slot still sends every field.
      expect(payloadProblems(flowFields(root, handle), orderPayload({ ...order, date: null, slotLabel: null, locationId: null }, s))).toEqual([]);
    });
  }

  it(`${DAILY_HANDLE}: every field, right types, under Flow's 50 KB`, () => {
    const names = { delivery: "Local delivery", pickup: "Pickup", shipping: "Shipping" };
    const url = "https://admin.shopify.com/store/x/apps/pickday/app/orders?range=custom&from=2026-11-06&to=2026-11-06";
    const wide = settings((x) => {
      for (let i = 0; i < 50; i++) x.locations.push({ id: `l${i}`, shopifyLocationId: null, name: `Location with a long name ${i}\nsecond line`, address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null });
    });
    const orders = Array.from({ length: 3000 }, (_, i) => ({ method: ["delivery", "pickup", "shipping"][i % 3], slotLabel: i % 2 ? `${String(8 + (i % 12)).padStart(2, "0")}:00-${String(9 + (i % 12)).padStart(2, "0")}:00` : null, locationId: `l${i % 50}`, itemCount: 3 }));
    for (const list of [[], orders]) {
      const p = dailyPayload("2026-11-06", "Friday, 6 November", list, wide, (m) => names[m], url);
      expect(payloadProblems(flowFields(root, DAILY_HANDLE), p)).toEqual([]);
      expect(utf8Bytes(p)).toBeLessThan(FLOW_PAYLOAD_MAX_BYTES);
    }
  });
});

/**
 * Shopify gives a Function `null` for any metafield value over 10,000 bytes (metafield limits), and
 * a list in its input query may have at most 100 entries. Checked with a store far bigger than any
 * real one, in a 3-byte-per-character language (D-70).
 */
describe("Function metafields stay within Shopify's limits", () => {
  const huge = (s: Settings) => {
    const slots = Array.from({ length: 24 }, (_, i) => ({ id: `s${i}`, start: `${String(i).padStart(2, "0")}:00`, end: `${String(i).padStart(2, "0")}:59`, weekdays: [0, 1, 2, 3, 4, 5, 6], max: 9 }));
    for (const m of ["delivery", "pickup", "shipping"] as const) {
      s.methods[m].enabled = true;
      s.methods[m].slotsEnabled = true;
      s.methods[m].capacity.slots = slots;
      s.methods[m].names = { en: "お届け".repeat(20), ja: "お届け".repeat(20) };
    }
    for (let i = 0; i < 40; i++) s.locations.push({ id: `loc${i}`, shopifyLocationId: null, name: "店舗".repeat(30), address: "住所".repeat(50), mapUrl: "", instructions: { ja: "説明".repeat(50) }, timeZone: "Asia/Tokyo", enabled: true, countries: "all", custom: { schedule: JSON.parse(JSON.stringify(s.methods.pickup.schedule)), capacity: JSON.parse(JSON.stringify(s.methods.pickup.capacity)) } });
    for (let i = 0; i < 200; i++) s.closures.push({ id: `c${i}`, label: "休業日".repeat(10), start: "2026-12-01", end: "2026-12-02", yearly: true, methods: "all", locations: "all", kind: "blackout" });
    s.areas.push({ country: "JP", mode: "postcode", postcodes: Array.from({ length: 2000 }, (_, i) => `${100 + i}-*`), areas: [], regions: [], askFirst: false });
    s.texts = { ja: { "validation.missingDate": "日付を選んでください。".repeat(30) } };
    s.productRules.exclude = { products: Array.from({ length: 50 }, (_, i) => String(1000 + i)), variants: [], collections: Array.from({ length: 150 }, (_, i) => String(9000 + i)), tags: Array.from({ length: 150 }, (_, i) => `タグ-${"長".repeat(40)}-${i}`) };
  };
  const big = config(huge);
  const avail: Availability = { v: 1, at: "2026-11-05T00:00:00Z", c: { delivery: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}#${i}`, { o: 5, i: 9 }])) }, p: {} } as unknown as Availability;

  it("the budget is under Shopify's limit", () => expect(FUNCTION_CONFIG_BUDGET).toBeLessThan(FUNCTION_METAFIELD_MAX_BYTES));

  it("validation config: a huge store is cut down to fit, never over the limit", () => {
    const r = fitFunctionConfig(big, { avail, timeChecks: [600, 840], tzShift: { loc1: 60 }, embedOff: false });
    expect(r.bytes).toBeLessThanOrEqual(FUNCTION_CONFIG_BUDGET);
    expect(utf8Bytes(r.config)).toBe(r.bytes);
    expect(["dateOnly", "off"]).toContain(r.level);
  });

  it("validation config: a normal store keeps the full check", () => {
    const r = fitFunctionConfig(config(), { avail: { v: 1, at: "x", c: {}, p: {} } as Availability, timeChecks: [840, 1439] });
    expect(r.level).toBe("full");
  });

  it("delivery customization config fits, and a normal store keeps its wording", () => {
    const s = settings(huge);
    s.checkoutMatching.rateMap = Array.from({ length: 300 }, (_, i) => ({ title: `配送料金 ${"名".repeat(20)} ${i}`, method: "delivery" as const }));
    expect(utf8Bytes(fitDeliveryConfig(deliveryConfig(big, s)))).toBeLessThanOrEqual(FUNCTION_CONFIG_BUDGET);
    const normal = deliveryConfig(config(), settings());
    expect(fitDeliveryConfig(normal)).toEqual(normal);
  });

  it("input query variables: at most 100 per list, within the budget", () => {
    const vars = { ...ruleVariables(big), ...timeCheckVariables([600, 840]) };
    expect(vars.ruleTags.length).toBeLessThanOrEqual(FUNCTION_LIST_MAX);
    expect(vars.ruleCollections.length).toBeLessThanOrEqual(FUNCTION_LIST_MAX);
    expect(utf8Bytes(vars)).toBeLessThanOrEqual(FUNCTION_CONFIG_BUDGET);
  });
});

describe("theme app extension passes Shopify theme-check (theme-app-extension profile)", () => {
  it("no errors", async () => {
    const run = await themeCheckRun(join(root, "extensions/pickday-theme"));
    const errors = run.offenses.filter((o) => o.severity === 0).map((o) => `${o.check} ${o.uri.split("/pickday-theme/")[1]}: ${o.message}`);
    expect(errors).toEqual([]);
  }, 60_000);
});
