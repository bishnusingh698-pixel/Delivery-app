import { describe, expect, it } from "vitest";
import { methodMismatch, orderTags, parseOrder, type OrderPayload } from "../app/services/order-parse";
import { settings } from "./helpers";

const sel = { v: 1, m: "pickup", d: "2026-10-18", s: "am", t: "10:00-12:00", l: "l1", z: null, a: null, c: "DE", lbl: "Sun", lc: "en", f: null };
const order = (over: Partial<OrderPayload> = {}): OrderPayload => ({
  id: 1001,
  name: "#1001",
  updated_at: "2026-10-16T10:00:00Z",
  note_attributes: [{ name: "_pickday", value: JSON.stringify(sel) }],
  customer: { first_name: " Ana " },
  line_items: [
    { id: 1, product_id: 10, variant_id: 100, title: "Cake", quantity: 2 },
    { id: 2, product_id: 20, variant_id: 200, title: "Gift card", quantity: 1, gift_card: true, requires_shipping: false },
  ],
  ...over,
});

describe("order parsing", () => {
  it("reads the choice, first name and the items that need a date", () => {
    const p = parseOrder(order(), settings())!;
    expect(p).toMatchObject({ orderId: "1001", customerFirst: "Ana", method: "pickup", date: "2026-10-18", slotId: "am", locationId: "l1", status: "scheduled", itemCount: 2 });
    expect(p.items.map((i) => i.needsDate)).toEqual([true, false]);
  });

  it("ignores orders without a Pickday choice", () => {
    expect(parseOrder(order({ note_attributes: [] }), settings())).toBeNull();
  });

  it("marks cancelled and fulfilled orders", () => {
    expect(parseOrder(order({ cancelled_at: "2026-10-16T11:00:00Z" }), settings())!.status).toBe("cancelled");
    expect(parseOrder(order({ fulfillment_status: "fulfilled" }), settings())!.status).toBe("fulfilled");
  });

  it("uses current quantities after an order edit and skips removed lines", () => {
    const o = order();
    o.line_items[0].current_quantity = 0;
    expect(parseOrder(o, settings())!.itemCount).toBe(0);
  });

  it("leaves surcharge lines out", () => {
    const s = settings((x) => x.surcharges.push({ id: "f", kind: "sameDay", weekdays: [], dates: [], slotIds: [], methods: "all", amount: "5", label: {}, variantId: "200" } as any));
    expect(parseOrder(order(), s)!.items.map((i) => i.lineId)).toEqual(["1"]);
  });

  it("reads per-item dates", () => {
    const o = order({ note_attributes: [{ name: "_pickday", value: JSON.stringify({ ...sel, d: null, s: null }) }] });
    o.line_items[0].properties = [{ name: "_pickday", value: JSON.stringify({ d: "2026-10-20", s: null, t: null, lbl: null }) }];
    const p = parseOrder(o, settings())!;
    expect(p.perItem).toEqual([expect.objectContaining({ lineId: "1", date: "2026-10-20" })]);
    expect(p.date).toBe("2026-10-20");
  });

  it("builds tags with a prefix", () => {
    const p = parseOrder(order(), settings())!;
    expect(orderTags(p, "PD-", "Main Street")).toEqual(["PD-Pickday", "PD-Method: Pickup", "PD-Date: 2026-10-18", "PD-Slot: 10:00-12:00", "PD-Location: Main Street"]);
  });

  it("spots a checkout option that disagrees with the choice", () => {
    const p = parseOrder(order({ shipping_lines: [{ title: "Express" }] }), settings())!;
    expect(methodMismatch(p, [{ title: "express", method: "shipping" }])).toBe(true);
    expect(methodMismatch(p, [{ title: "express", method: "pickup" }])).toBe(false);
  });
});
