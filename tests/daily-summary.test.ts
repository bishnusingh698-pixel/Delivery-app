import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../core/defaults";

vi.mock("../app/db.server", () => ({ default: {} }));
vi.mock("../app/shopify.server", () => ({ unauthenticated: {} }));

const { dailyPayload, dueDate, ordersPageUrl } = await import("../app/services/daily-summary.server");

const on = (hour = 7, day: "today" | "tomorrow" = "tomorrow") => {
  const s = defaultSettings();
  s.notifications.dailySummary = { enabled: true, hour, day };
  return s;
};

describe("daily summary timing", () => {
  const row = (dailySummaryFor: string | null = null) => ({ timeZone: "Europe/Berlin", dailySummaryFor });
  // 2026-10-24 05:30 UTC = 07:30 in Berlin (summer time until 25 October).
  const at = new Date("2026-10-24T05:30:00Z");

  it("is off unless switched on", () => expect(dueDate(defaultSettings(), row(), at)).toBeNull());
  it("is due at the chosen store-local hour", () => expect(dueDate(on(7), row(), at)).toBe("2026-10-24"));
  it("waits before the hour", () => expect(dueDate(on(8), row(), at)).toBeNull());
  it("still sends up to 3 hours late (sleeping server), not later", () => {
    expect(dueDate(on(5), row(), at)).toBe("2026-10-24");
    expect(dueDate(on(4), row(), at)).toBeNull();
  });
  it("sends once per store-local day", () => {
    expect(dueDate(on(7), row("2026-10-24"), at)).toBeNull();
    expect(dueDate(on(7), row("2026-10-23"), at)).toBe("2026-10-24");
  });
  it("uses the store's zone, not the server's", () => {
    // Same instant is 01:30 in New York.
    expect(dueDate(on(7), { timeZone: "America/New_York", dailySummaryFor: null }, at)).toBeNull();
    expect(dueDate(on(1), { timeZone: "America/New_York", dailySummaryFor: null }, at)).toBe("2026-10-24");
  });
});

describe("daily summary payload", () => {
  const s = defaultSettings();
  s.locations = [{ ...(s.locations[0] ?? ({} as any)), id: "loc1", name: "Main Street" }] as any;
  const names = { delivery: "Local delivery", pickup: "Store pickup", shipping: "Shipping" } as const;
  const url = ordersPageUrl("cake-shop.myshopify.com", "2026-10-25");

  it("counts per method and breaks down by slot or location", () => {
    const p = dailyPayload(
      "2026-10-25",
      "Sunday, 25 October 2026",
      [
        { method: "delivery", slotLabel: "10:00-12:00", locationId: null, itemCount: 2 },
        { method: "delivery", slotLabel: "10:00-12:00", locationId: null, itemCount: 1 },
        { method: "delivery", slotLabel: "14:00-16:00", locationId: null, itemCount: 3 },
        { method: "pickup", slotLabel: null, locationId: "loc1", itemCount: 1 },
        { method: "shipping", slotLabel: null, locationId: null, itemCount: 5 },
      ],
      s,
      (m) => names[m],
      url,
    );
    expect(p).toEqual({
      Date: "2026-10-25",
      Day: "Sunday, 25 October 2026",
      Orders: 5,
      "Local delivery orders": 3,
      "Pickup orders": 1,
      "Shipping orders": 1,
      Items: 12,
      Summary: "Local delivery 3 (10:00–12:00: 2, 14:00–16:00: 1) · Store pickup 1 (Main Street: 1) · Shipping 1",
      "Orders page": "https://admin.shopify.com/store/cake-shop/apps/pickday/app/orders?range=custom&from=2026-10-25&to=2026-10-25",
    });
  });

  it("sends every field on an empty day (Flow requires all of them)", () => {
    const p = dailyPayload("2026-10-25", "x", [], s, (m) => names[m], url);
    expect(p.Orders).toBe(0);
    expect(p.Summary).toBe("0");
    expect(Object.keys(p)).toHaveLength(9);
  });

  it("matches the trigger's fields exactly", async () => {
    const { readFileSync } = await import("node:fs");
    const toml = readFileSync("extensions/pickday-flow-daily/shopify.extension.toml", "utf8");
    const keys = [...toml.matchAll(/key = "([^"]+)"/g)].map((m) => m[1]);
    for (const k of keys) expect(k).toMatch(/^[A-Za-z ]+$/); // Flow: letters and spaces only
    expect(keys.sort()).toEqual(Object.keys(dailyPayload("d", "d", [], s, (m) => names[m], url)).sort());
  });

  it("keeps the summary short", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ method: "pickup", slotLabel: null, locationId: `x${i}`, itemCount: 1 }));
    const wide = { ...s, locations: many.map((o, i) => ({ id: o.locationId, name: `Location number ${i}` })) } as any;
    expect(dailyPayload("d", "d", many, wide, (m) => names[m], url).Summary.length).toBeLessThanOrEqual(900);
  });
});
