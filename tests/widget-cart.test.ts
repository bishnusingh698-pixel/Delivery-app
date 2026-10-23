import { describe, expect, it } from "vitest";
import { minOrderSubtotal } from "../widget/src/cart";

const item = (variant_id: number, final_line_price: number) => ({ key: String(variant_id), id: variant_id, product_id: 1, variant_id, quantity: 1, title: "x", product_title: "x", handle: "x", gift_card: false, requires_shipping: true, properties: null, final_line_price });

describe("minimum order amount in the widget", () => {
  it("uses the subtotal before order discounts, like the checkout Function", () => {
    // 50.00 of goods, a 10% order discount (total 45.00): a 50.00 minimum is met at checkout.
    expect(minOrderSubtotal({ items: [item(11, 5000)], total_price: 4500, items_subtotal_price: 5000 }, new Set())).toBe(5000);
  });

  it("leaves Pickday's own fee lines out", () => {
    expect(minOrderSubtotal({ items: [item(11, 5000), item(99, 500)], total_price: 5500, items_subtotal_price: 5500 }, new Set(["99"]))).toBe(5000);
    expect(minOrderSubtotal({ items: [item(11, 5000), item(99, 500)], total_price: 5500 }, new Set(["99"]))).toBe(5000);
  });
});

describe("theme cart changes", () => {
  it("are noticed even while the widget's own cart request is running", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();
    const g = globalThis as any;
    const nodeFetch = g.fetch;
    let release!: () => void;
    const fake = vi.fn((url: string) => (url.endsWith("cart.js") ? new Promise((r) => (release = () => r(new Response("{}")))) : Promise.resolve(new Response("{}"))));
    g.window = { fetch: fake, setTimeout, clearTimeout, addEventListener: () => {}, Shopify: { routes: { root: "/" } } };
    g.fetch = (...a: unknown[]) => g.window.fetch(...a);
    g.document = { addEventListener: () => {} };
    g.XMLHttpRequest = class { open() {} addEventListener() {} };
    const { getCart, onCartChange } = await import("../widget/src/cart");
    const cb = vi.fn();
    onCartChange(cb);
    const own = getCart();
    await g.window.fetch("/cart/add.js", { method: "POST" });
    await vi.runAllTimersAsync();
    expect(cb).toHaveBeenCalledTimes(1);
    release();
    await own;
    await vi.runAllTimersAsync();
    expect(cb).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    for (const k of ["window", "document", "XMLHttpRequest"]) delete g[k];
    g.fetch = nodeFetch;
  });
});
