import { describe, expect, it } from "vitest";
import { toShopifyLocation } from "../app/services/locations.server";

describe("toShopifyLocation", () => {
  it("uses the numeric id, formatted address and pickup instructions", () => {
    const l = toShopifyLocation({
      id: "gid://shopify/Location/123456",
      name: " Main shop ",
      address: { address1: "1 High St", city: "Leeds", zip: "LS1 1AA", countryCode: "GB", formatted: ["1 High St", "Leeds LS1 1AA", "United Kingdom"] },
      localPickupSettingsV2: { instructions: " Ring the bell " },
    });
    expect(l).toEqual({ id: "123456", name: "Main shop", address: "1 High St, Leeds LS1 1AA, United Kingdom", countryCode: "GB", instructions: "Ring the bell" });
  });

  it("builds an address from parts and handles missing pickup settings", () => {
    const l = toShopifyLocation({
      id: "gid://shopify/Location/9",
      name: "Depot",
      address: { address1: "Rue 2", address2: null, city: "Paris", zip: "75001", countryCode: "FR", formatted: [] },
      localPickupSettingsV2: null,
    });
    expect(l.address).toBe("Rue 2, 75001 Paris, FR");
    expect(l.instructions).toBe("");
  });
});

describe("pickup locations in another time zone", () => {
  it("get a new checkout time offset after a daylight-saving change (the hourly job compares them)", async () => {
    const { vi } = await import("vitest");
    vi.doMock("../app/db.server", () => ({ default: {} }));
    vi.doMock("../app/shopify.server", () => ({ unauthenticated: {} }));
    const { locationTimeShifts } = await import("../app/services/publish.server");
    const zones = { tz: "Europe/Berlin", locations: [{ id: "ny", timeZone: "America/New_York" }] as never };
    // Europe goes back on 25 Oct 2026, the US on 1 Nov: for that week New York is 5 hours behind, not 6.
    expect(locationTimeShifts(zones, new Date("2026-10-24T12:00:00Z"))).toEqual({ ny: -360 });
    expect(locationTimeShifts(zones, new Date("2026-10-26T12:00:00Z"))).toEqual({ ny: -300 });
    expect(locationTimeShifts(zones, new Date("2026-11-02T12:00:00Z"))).toEqual({ ny: -360 });
  });
});
