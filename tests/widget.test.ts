// @vitest-environment jsdom
/** Storefront widget state and cart sync, with an in-memory cart (no theme, no network). */
import { describe, expect, it } from "vitest";
import { Pickday, type BootData } from "../widget/src/widget";
import type { Cart, CartApi, CartItem } from "../widget/src/cart";
import { ATTR_KEY, encodeSelection } from "../core/selection";
import type { Selection, Settings } from "../core/types";
import { config } from "./helpers";

const item = (over: Partial<CartItem> = {}): CartItem => ({
  key: "k1",
  id: 11,
  product_id: 1,
  variant_id: 11,
  quantity: 1,
  title: "Sourdough",
  product_title: "Sourdough",
  handle: "sourdough",
  gift_card: false,
  requires_shipping: true,
  properties: {},
  final_line_price: 5000,
  ...over,
});

function memoryCart(items: CartItem[], attributes: Record<string, string> = {}) {
  const cart: Cart = { token: "t", item_count: items.length, items, attributes, total_price: 5000, currency: "EUR" };
  const copy = () => JSON.parse(JSON.stringify(cart)) as Cart;
  const calls: string[] = [];
  const api: CartApi = {
    getCart: async () => copy(),
    updateAttributes: async (attrs) => {
      calls.push("update");
      for (const [k, v] of Object.entries(attrs)) if (v) cart.attributes[k] = v;
      else delete cart.attributes[k];
      return copy();
    },
    changeLine: async (key, change) => {
      calls.push(`change:${key}:${change.quantity}`);
      const it = cart.items.find((i) => i.key === key);
      if (it && change.properties) it.properties = change.properties;
      if (it && change.quantity !== undefined) it.quantity = change.quantity;
      cart.items = cart.items.filter((i) => i.quantity > 0);
      return copy();
    },
    addVariant: async (id, quantity = 1) => {
      calls.push(`add:${id}`);
      cart.items.push(item({ key: `fee-${id}`, id: Number(id), variant_id: Number(id), product_id: 2, requires_shipping: false, quantity, final_line_price: 500 }));
      return copy();
    },
    productTags: async () => [],
    notifyTheme: () => {},
  };
  return { cart, api, calls };
}

// 2026-10-14 is a Wednesday; default schedule Mon–Fri, 1 working day, cutoff 14:00: Thursday is the earliest day.
const NOW = { date: "2026-10-14", minutes: 9 * 60 };
const boot = (mut?: (s: Settings) => void): BootData => ({
  config: config(mut),
  availability: null,
  locale: "en",
  country: "DE",
  currency: "EUR",
  rate: 1,
  template: "cart",
  assetBase: "",
  nowAt: NOW,
});
const sel = (over: Partial<Selection> = {}): string =>
  encodeSelection({ v: 1, m: "shipping", d: "2026-10-15", s: null, t: null, l: null, z: null, a: null, c: "DE", lbl: null, lc: "en", f: null, ...over });

describe("storefront widget", () => {
  const withThursdayFee = (s: Settings) => {
    s.surcharges.push({ id: "thu", label: "Thursday", kind: "weekday", weekdays: [4], dates: [], slotIds: [], methods: "all", amount: "5", variantId: "900" });
  };

  it("adds a missing fee line back after the shopper removed it", async () => {
    const { cart, api, calls } = memoryCart([item()], { [ATTR_KEY]: sel() });
    const pd = new Pickday(boot(withThursdayFee), api);
    await pd.start();
    await pd.flush();
    expect(calls).toContain("add:900");
    expect(cart.items.filter((i) => i.variant_id === 900)).toHaveLength(1);

    // The shopper removes the fee line in the theme's cart; the widget puts it back.
    cart.items = cart.items.filter((i) => i.variant_id !== 900);
    calls.length = 0;
    await pd.refresh();
    await pd.flush();
    expect(calls).toEqual(["add:900"]);
    expect(pd.feesInSync()).toBe(true);
    pd.stop();
  });

  it("sets a changed fee quantity back to 1 and saves nothing when all is in sync", async () => {
    const { cart, api, calls } = memoryCart([item(), item({ key: "fee", id: 900, variant_id: 900, product_id: 2, requires_shipping: false, quantity: 3 })], { [ATTR_KEY]: sel() });
    const pd = new Pickday(boot(withThursdayFee), api);
    await pd.start();
    await pd.flush();
    expect(cart.items.find((i) => i.variant_id === 900)?.quantity).toBe(1);
    calls.length = 0;
    await pd.refresh();
    await pd.flush();
    expect(calls).toEqual([]);
    pd.stop();
  });

  it("date per item: a line with a date but no time slot can't go to checkout", async () => {
    const slots = (s: Settings) => {
      s.dateMode = "item";
      s.methods.shipping.slotsEnabled = true;
      s.methods.shipping.capacity.slots = [{ id: "am", start: "09:00", end: "12:00", weekdays: [], max: null }];
    };
    const prop = (d: string, s: string | null) => ({ [ATTR_KEY]: JSON.stringify({ d, s, t: s ? "09:00-12:00" : null, lbl: null }) });
    const noSlot = memoryCart([item({ properties: prop("2026-10-15", null) })], { [ATTR_KEY]: sel({ d: null }) });
    const pd = new Pickday(boot(slots), noSlot.api);
    await pd.start();
    expect(pd.blockingMessage()).toBe(pd.tx.t("requiredItems"));
    pd.stop();

    const withSlot = memoryCart([item({ properties: prop("2026-10-15", "am") })], { [ATTR_KEY]: sel({ d: null }) });
    const ok = new Pickday(boot(slots), withSlot.api);
    await ok.start();
    expect(ok.blockingMessage()).toBeNull();
    ok.stop();
  });
});
