/**
 * Pickup locations vs Shopify's Local pickup (D-78): checkout keeps only the Shopify pickup option
 * whose name matches the Pickday location, so Local pickup must be on for that place in Shopify and
 * the names must match. The check names each mismatch with a fix.
 */
import { describe, expect, it } from "vitest";
import { pickupCheck } from "../core/pickup-check";
import { customizeDelivery, type DeliveryConfig } from "../core/checkout";
import type { Location } from "../core/types";

const loc = (id: string, name: string, over: Partial<Location> = {}): Location => ({ id, shopifyLocationId: null, name, address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null, ...over });
const shop = (id: string, name: string, pickup: boolean) => ({ id, name, pickup });

describe("pickup check", () => {
  it("all good: every Pickday location is offered for Local pickup under the same name", () => {
    expect(pickupCheck([loc("a", "Downtown")], [shop("1", "Downtown", true)])).toEqual({ ok: true, issues: [] });
  });

  it("names a Pickday location that Shopify doesn't offer for pickup", () => {
    const r = pickupCheck([loc("a", "Downtown")], [shop("1", "Main St", true)]);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual(expect.arrayContaining([{ kind: "notOffered", locationId: "a", name: "Downtown" }, { kind: "notInPickday", shopifyId: "1", name: "Main St" }]));
  });

  it("a Shopify location with Local pickup off: turn it on in Shopify", () => {
    const r = pickupCheck([loc("a", "Downtown", { shopifyLocationId: "1" })], [shop("1", "Downtown", false), shop("2", "Warehouse", true)]);
    expect(r.issues).toContainEqual({ kind: "pickupOff", locationId: "a", name: "Downtown", shopifyId: "1" });
  });

  it("a location renamed in Shopify: offers to use Shopify's name", () => {
    const r = pickupCheck([loc("a", "Downtown", { shopifyLocationId: "1" })], [shop("1", "Downtown Store", true)]);
    // "Downtown Store" contains "Downtown": checkout still matches it, nothing to fix.
    expect(r.ok).toBe(true);
    const r2 = pickupCheck([loc("a", "City", { shopifyLocationId: "1" })], [shop("1", "Downtown Store", true)]);
    expect(r2.issues).toContainEqual({ kind: "renamed", locationId: "a", name: "City", shopifyId: "1", shopifyName: "Downtown Store" });
    expect(r2.issues.some((i) => i.kind === "notInPickday")).toBe(false);
  });

  it("no Pickday location (pickup at the store): Shopify needs Local pickup on somewhere", () => {
    expect(pickupCheck([], [shop("1", "Shop", false)]).issues).toEqual([{ kind: "noShopifyPickup" }]);
    expect(pickupCheck([], [shop("1", "Shop", true), shop("2", "Other", true)]).ok).toBe(true);
  });

  it("switched-off Pickday locations aren't checked; a matching name in another case still matches", () => {
    expect(pickupCheck([loc("a", "downtown "), loc("b", "Closed", { enabled: false })], [shop("1", "Downtown", true)]).ok).toBe(true);
  });

  it("agrees with checkout matching: what the check calls a match is the option checkout keeps", () => {
    const cfg: DeliveryConfig = { enabled: true, rename: false, rateMap: [], locations: [{ id: "a", name: "Downtown" }], names: {}, texts: {} };
    const ops = customizeDelivery(
      {
        cart: {
          attribute: { value: JSON.stringify({ v: 1, m: "pickup", d: "2026-11-10", l: "a" }) },
          deliveryGroups: [{ id: "g", deliveryOptions: [{ handle: "p1", title: "Downtown Store", deliveryMethodType: "PICK_UP" }, { handle: "p2", title: "Main St", deliveryMethodType: "PICK_UP" }] }],
        },
        deliveryCustomization: { metafield: { jsonValue: cfg } },
      },
      {},
    );
    expect(ops).toEqual([{ deliveryOptionHide: { deliveryOptionHandle: "p2" } }]);
    expect(pickupCheck([loc("a", "Downtown")], [shop("1", "Downtown Store", true), shop("2", "Main St", true)]).issues).toEqual([{ kind: "notInPickday", shopifyId: "2", name: "Main St" }]);
  });
});
