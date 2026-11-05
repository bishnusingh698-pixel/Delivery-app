/** Round 7 fixes (AUDIT.md): each test fails on the code before the fix. */
import { describe, expect, it, vi } from "vitest";
import { validate, type ValidationInput } from "../core/checkout";
import { fitFunctionConfig, ruleVariables, utf8Bytes } from "../core/publish";
import { encodeSelection } from "../core/selection";
import type { Availability, StorefrontConfig } from "../core/types";
import { config } from "./helpers";
import { dailyPayload } from "../app/services/flow-payload";

const messages = { en: { "validation.missingDate": "Choose a date", "validation.dateUnavailable": "No longer available: {date}", "validation.methodUnavailable": "Not available" } };

function input(jsonValue: unknown, attr: string | null): ValidationInput {
  return {
    buyerJourney: { step: "CHECKOUT_COMPLETION" },
    cart: {
      attribute: attr === null ? null : { value: attr },
      lines: [{ id: "1", quantity: 1, merchandise: { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/11", requiresShipping: true, product: { id: "gid://shopify/Product/1" } } }],
    },
    shop: { localTime: { date: "2026-10-14", cutoffA: false, cutoffB: false } },
    validation: { metafield: { jsonValue } },
  };
}
const sunday = encodeSelection({ v: 1, m: "shipping", d: "2026-10-18", s: null, t: null, l: null, z: null, a: null, c: "DE", lbl: "Sun", lc: "en", f: null });

/** A store whose rules are just over what fits: many closed days and pickup locations. */
const busy = (): StorefrontConfig =>
  config((s) => {
    s.methods.shipping.dateRequired = true;
    for (let i = 0; i < 80; i++) s.closures.push({ id: `c${i}`, label: `Closed ${i}`, start: `2027-01-${String(1 + (i % 28)).padStart(2, "0")}`, end: `2027-01-${String(1 + (i % 28)).padStart(2, "0")}`, yearly: false, methods: "all", locations: "all", kind: "blackout" });
    for (let i = 0; i < 12; i++) s.locations.push({ id: `l${i}`, shopifyLocationId: null, name: `Shop ${i}`, address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: { schedule: JSON.parse(JSON.stringify(s.methods.pickup.schedule)), capacity: JSON.parse(JSON.stringify(s.methods.pickup.capacity)) } });
  });

describe("Function config under Shopify's 10,000-byte metafield limit (D-70)", () => {
  it("a store too big for the full check still requires a date at checkout", () => {
    const r = fitFunctionConfig(busy(), { timeChecks: [840, 1439] }, 3000);
    expect(r.level).toBe("dateOnly");
    expect(validate(input(r.config, null), messages)).toEqual([{ message: "Choose a date", target: "$.cart" }]);
    // The other rules aren't in the config: a chosen date is let through (D-24), the widget checked it.
    expect(validate(input(r.config, sunday), messages)).toEqual([]);
  });

  it("with room, the full rules are checked (a Sunday is refused)", () => {
    const r = fitFunctionConfig(config((s) => (s.methods.shipping.dateRequired = true)), { timeChecks: [840, 1439] });
    expect(r.level).toBe("full");
    expect(validate(input(r.config, sunday), messages)).toHaveLength(1);
  });

  it("the capacity counts are dropped first, then areas and texts, then everything but the date", () => {
    const c = busy();
    c.areas = [{ country: "DE", mode: "postcode", postcodes: Array.from({ length: 300 }, (_, i) => `${10000 + i}`), areas: [], regions: [], askFirst: false }];
    const avail = { v: 1, at: "x", c: { shipping: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, { o: 1, i: 1 }])) }, p: {} } as unknown as Availability;
    const withoutCounts = utf8Bytes(fitFunctionConfig(c, {}, 1e9).config);
    expect(fitFunctionConfig(c, { avail }, 1e9).level).toBe("full");
    expect(fitFunctionConfig(c, { avail }, withoutCounts).level).toBe("noCounts");
    expect(fitFunctionConfig(c, { avail }, withoutCounts - 1).level).toBe("noAreas");
    expect(fitFunctionConfig(c, { avail }, 50).level).toBe("off");
  });

  it("sizes are counted in UTF-8 bytes, not characters", () => {
    expect(utf8Bytes("日付")).toBe(6); // 2 characters, 3 bytes each
    expect(utf8Bytes({ a: "日付" })).toBe(14); // {"a":"日付"}
  });

  it("input variables keep at most 100 tags", () => {
    const c = config((s) => (s.productRules.exclude.tags = Array.from({ length: 150 }, (_, i) => `t${i}`)));
    expect(ruleVariables(c).ruleTags).toHaveLength(100);
  });
});

describe("Flow daily summary", () => {
  it("the Summary stays one line when a location name has a line break", () => {
    const s = { locations: [{ id: "l1", name: "Bakery\nback door" }] } as never;
    const p = dailyPayload("2026-11-06", "Fri", [{ method: "pickup", slotLabel: null, locationId: "l1", itemCount: 1 }], s, () => "Pickup", "https://x");
    expect(p.Summary).not.toMatch(/[\r\n]/);
  });
});

describe("webhook de-duplication only skips real duplicates", async () => {
  const create = vi.fn();
  vi.doMock("../app/db.server", () => ({ default: { webhookLog: { create } } }));
  vi.doMock("../app/shopify.server", () => ({ unauthenticated: {} }));
  const { firstDelivery } = await import("../app/services/orders.server");

  it("a new delivery is processed", async () => {
    create.mockResolvedValueOnce({});
    expect(await firstDelivery("w1", "s", "ORDERS_CREATE")).toBe(true);
  });
  it("an already recorded delivery is skipped", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    expect(await firstDelivery("w1", "s", "ORDERS_CREATE")).toBe(false);
  });
  it("a database outage is an error (Shopify retries), not a duplicate", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("Can't reach database server"), { code: "P1001" }));
    await expect(firstDelivery("w2", "s", "ORDERS_CREATE")).rejects.toThrow("Can't reach database server");
  });
});
