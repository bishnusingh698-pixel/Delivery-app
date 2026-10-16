/** Checkout Functions: validation (backstop) and delivery customization (checkout matching). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { customizeDelivery, minutesFromAliases, validate, type DeliveryConfig, type ValidationInput } from "../core/checkout";
import { toFunctionConfig } from "../core/publish";
import type { Selection, StorefrontConfig } from "../core/types";
import { config } from "./helpers";

const messages = JSON.parse(readFileSync(join(__dirname, "../extensions/pickday-validation/src/messages.generated.json"), "utf8"));

// 2026-10-14 is a Wednesday. Default schedule: Mon–Fri, 1 working day lead, cutoff 14:00.
const sel = (over: Partial<Selection> = {}): string =>
  JSON.stringify({ v: 1, m: "shipping", d: "2026-10-15", s: null, t: null, l: null, z: null, a: null, c: "DE", lbl: "Thu, 15 Oct", lc: "en", f: null, ...over });

function vInput(cfg: StorefrontConfig, over: { attr?: string | null; step?: string; hour?: number; lang?: string; lines?: ValidationInput["cart"]["lines"]; subtotal?: string } = {}): ValidationInput {
  const hour = over.hour ?? 9;
  const localTime: Record<string, unknown> = { date: "2026-10-14" };
  for (let h = 1; h < 24; h++) localTime[`h${String(h).padStart(2, "0")}`] = h <= hour;
  return {
    buyerJourney: { step: over.step ?? "CHECKOUT_COMPLETION" },
    cart: {
      attribute: over.attr === null ? null : { value: over.attr ?? sel() },
      cost: { subtotalAmount: { amount: over.subtotal ?? "50.0", currencyCode: "EUR" } },
      deliveryGroups: [{ deliveryAddress: { countryCode: "DE", zip: "10115" } }],
      lines: over.lines ?? [
        { id: "gid://shopify/CartLine/1", quantity: 1, merchandise: { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/11", requiresShipping: true, product: { id: "gid://shopify/Product/1", isGiftCard: false, hasTags: [], inCollections: [] } } },
      ],
    },
    localization: { language: { isoCode: over.lang ?? "EN" }, country: { isoCode: "DE" } },
    presentmentCurrencyRate: "1.0",
    shop: { localTime },
    validation: { metafield: { jsonValue: toFunctionConfig(cfg) } },
  };
}

describe("validation Function", () => {
  const cfg = config((s) => (s.methods.shipping.dateRequired = true));

  it("passes a valid choice", () => expect(validate(vInput(cfg), messages)).toEqual([]));

  it("never blocks adding to cart", () => expect(validate(vInput(cfg, { attr: null, step: "CART_INTERACTION" }), messages)).toEqual([]));

  it("blocks a missing required date, in the shopper's language", () => {
    const [e] = validate(vInput(cfg, { attr: null, lang: "DE" }), messages);
    expect(e.target).toBe("$.cart");
    expect(e.message).toBe(messages.de["validation.missingDate"]);
  });

  it("allows a missing date when not required", () => {
    const c = config((s) => (s.methods.shipping.dateRequired = false));
    expect(validate(vInput(c, { attr: null }), messages)).toEqual([]);
  });

  it("blocks a date that passed its cutoff while the shopper was in checkout", () => {
    // At 15:00 the cutoff (14:00) has passed: tomorrow is no longer possible.
    const [e] = validate(vInput(cfg, { hour: 15 }), messages);
    expect(e.message).toContain("Thu, 15 Oct");
  });

  it("is lenient within the hour (time is floored to the hour)", () => {
    expect(minutesFromAliases({ h13: true, h14: false })).toBe(13 * 60);
    expect(validate(vInput(cfg, { hour: 13 }), messages)).toEqual([]);
  });

  it("blocks a closed day", () => {
    const [e] = validate(vInput(cfg, { attr: sel({ d: "2026-10-17", lbl: "Sat, 17 Oct" }) }), messages);
    expect(e.message).toContain("Sat, 17 Oct");
  });

  it("blocks a full day using the published counts", () => {
    const c = config((s) => {
      s.methods.shipping.dateRequired = true;
      s.methods.shipping.capacity.maxPerDay = 2;
    });
    const input = vInput(c);
    (input.validation!.metafield!.jsonValue as any).avail = { v: 1, at: "", c: { shipping: { "2026-10-15": [2, 2] } }, p: {} };
    expect(validate(input, messages)).toHaveLength(1);
  });

  it("blocks a method not offered in the delivery country", () => {
    const c = config((s) => {
      s.methods.shipping.countries = ["FR"];
      s.methods.pickup.enabled = true;
    });
    expect(validate(vInput(c), messages)[0].message).toBe(messages.en["validation.methodUnavailable"]);
  });

  it("ignores carts with only gift cards", () => {
    const lines = [{ id: "a", quantity: 1, merchandise: { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/9", requiresShipping: false, product: { id: "gid://shopify/Product/9", isGiftCard: true } } }];
    expect(validate(vInput(cfg, { attr: null, lines }), messages)).toEqual([]);
  });

  it("checks the minimum order in the shopper's currency", () => {
    const c = config((s) => (s.methods.shipping.minOrder = "60"));
    const [e] = validate(vInput(c, { subtotal: "50.0" }), messages);
    expect(e.message).toContain("60.00 EUR");
  });

  it("does nothing without a config (app not set up)", () => {
    const input = vInput(cfg, { attr: null });
    input.validation = { metafield: null };
    expect(validate(input, messages)).toEqual([]);
  });

  it("requires a date per item in date-per-item mode", () => {
    const c = config((s) => {
      s.dateMode = "item";
      s.methods.shipping.dateRequired = true;
    });
    expect(validate(vInput(c, { attr: sel({ d: null }) }), messages)[0].message).toBe(messages.en["validation.missingItemDate"]);
    const lines = vInput(c).cart.lines.map((l) => ({ ...l, attribute: { value: JSON.stringify({ d: "2026-10-15", s: null, t: null, lbl: "Thu" }) } }));
    expect(validate(vInput(c, { attr: sel({ d: null }), lines }), messages)).toEqual([]);
  });
});

describe("delivery customization Function", () => {
  const dc: DeliveryConfig = { enabled: true, rename: true, rateMap: [], locations: [{ id: "l1", name: "Main Street" }], names: {}, texts: {} };
  const options = [
    { handle: "ship", title: "Standard", deliveryMethodType: "SHIPPING" },
    { handle: "local", title: "Local delivery", deliveryMethodType: "LOCAL" },
    { handle: "p1", title: "Main Street", deliveryMethodType: "PICK_UP" },
    { handle: "p2", title: "Harbour", deliveryMethodType: "PICK_UP" },
  ];
  const run = (attr: string | null, cfg: DeliveryConfig = dc, opts = options) =>
    customizeDelivery({ cart: { attribute: attr ? { value: attr } : null, deliveryGroups: [{ id: "g", deliveryOptions: opts }] }, localization: { language: { isoCode: "EN" } }, deliveryCustomization: { metafield: { jsonValue: cfg } } }, messages);

  it("keeps only pickup at the chosen location and adds the date", () => {
    const ops = run(sel({ m: "pickup", l: "l1", lbl: "Fri, 16 Oct" }));
    const hidden = ops.flatMap((o) => ("deliveryOptionHide" in o ? [o.deliveryOptionHide.deliveryOptionHandle] : []));
    expect(hidden.sort()).toEqual(["local", "p2", "ship"]);
    expect(ops).toContainEqual({ deliveryOptionRename: { deliveryOptionHandle: "p1", title: "Main Street – Fri, 16 Oct" } });
  });

  it("keeps local delivery for a delivery choice", () => {
    const ops = run(sel({ m: "delivery", lbl: "Fri, 16 Oct" }));
    expect(ops.filter((o) => "deliveryOptionHide" in o)).toHaveLength(3);
  });

  it("uses the merchant's rate mapping", () => {
    const ops = run(sel({ m: "delivery" }), { ...dc, rateMap: [{ title: "standard", method: "delivery" }] });
    const hidden = ops.flatMap((o) => ("deliveryOptionHide" in o ? [o.deliveryOptionHide.deliveryOptionHandle] : []));
    expect(hidden).not.toContain("ship");
  });

  it("never hides everything", () => {
    expect(run(sel({ m: "delivery" }), dc, [options[0]])).toEqual([]);
  });

  it("does nothing when matching is off or there's no choice", () => {
    expect(run(sel(), { ...dc, enabled: false })).toEqual([]);
    expect(run(null)).toEqual([]);
  });
});
