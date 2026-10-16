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
