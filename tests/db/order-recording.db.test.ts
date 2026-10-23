/**
 * Order recording edge cases against a real Postgres (skipped without DATABASE_URL):
 * failed recounts, refunds, per-item dates, tag-based limits and plan changes.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../app/services/publish.server", () => ({ schedulePublish: vi.fn() }));
const flow = vi.fn(async (...a: unknown[]) => a.length);
vi.mock("../../app/services/flow.server", () => ({ flowTrigger: (...a: unknown[]) => flow(...a) }));
let failRecount = false;
vi.mock("../../app/services/counts.server", async (orig) => {
  const o = await orig<typeof import("../../app/services/counts.server")>();
  return {
    ...o,
    recountDates: async (...a: Parameters<typeof o.recountDates>) => {
      if (failRecount) {
        failRecount = false;
        throw new Error("db timeout");
      }
      return o.recountDates(...a);
    },
  };
});

const SHOP = "test-recording.myshopify.com";
const admin = {
  graphql: async (query: string) => {
    const data: Record<string, unknown> = {};
    for (const m of ["tagsAdd", "tagsRemove", "metafieldsSet"]) if (query.includes(m)) data[m] = { userErrors: [] };
    return new Response(JSON.stringify({ data }));
  },
};

describe.skipIf(!process.env.DATABASE_URL)("recording orders: edge cases", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { recordOrder } = await import("../../app/services/orders.server");
  const { applySubscription } = await import("../../app/services/billing.server");
  const { defaultCapacity, defaultSettings } = await import("../../core/defaults");

  const sel = (o: Record<string, unknown> = {}) => JSON.stringify({ v: 1, m: "shipping", ...o });
  const count = async (date: string, key = "shipping", slotId = "") => prisma.capacityCount.findFirst({ where: { shop: SHOP, key, date, slotId } });
  async function cleanup() {
    for (const m of ["capacityCount", "productCount", "scheduledItem", "scheduledOrder", "settings", "activityLog", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: SHOP } });
  }
  beforeAll(async () => {
    await cleanup();
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", currency: "EUR", plan: "pro" } });
    const s = defaultSettings("DE");
    s.methods.delivery.enabled = true;
    s.zones = [{ id: "z1", name: "North", country: "DE", postcodes: ["10*"], areas: [], regions: [], schedule: {}, capacity: { ...defaultCapacity(), maxPerDay: 3 } }];
    s.productRules.limits = [{ id: "cakes", name: "Cakes", target: { products: [], variants: [], collections: [], tags: ["Cake"] }, max: 5, perLocation: false }];
    s.productRules.tagProducts = { cake: ["1"] };
    await prisma.settings.create({ data: { shop: SHOP, version: 1, data: s as any } });
  });
  afterAll(cleanup);

  it("a retry after a failed recount is processed again, not skipped as unchanged", async () => {
    const p = { id: 501, name: "#501", updated_at: "2026-10-16T10:00:00Z", note_attributes: [{ name: "_pickday", value: sel({ d: "2027-01-05" }) }], line_items: [{ id: 1, product_id: 2, variant_id: 21, title: "Bread", quantity: 1 }] };
    failRecount = true;
    await expect(recordOrder(SHOP, p, admin, "ORDERS_CREATE")).rejects.toThrow("db timeout");
    expect(await prisma.scheduledOrder.findFirst({ where: { shop: SHOP, orderId: "501" } })).toBeNull();
    flow.mockClear();
    expect(await recordOrder(SHOP, p, admin, "ORDERS_CREATE")).toBe("created");
    expect((await count("2027-01-05"))?.orders).toBe(1);
    expect(flow).toHaveBeenCalledTimes(1);

    // A failed update is put back too, so the retry moves the count.
    const moved = { ...p, updated_at: "2026-10-16T11:00:00Z", note_attributes: [{ name: "_pickday", value: sel({ d: "2027-01-08" }) }] };
    failRecount = true;
    await expect(recordOrder(SHOP, moved, admin)).rejects.toThrow();
    expect((await prisma.scheduledOrder.findFirst({ where: { shop: SHOP, orderId: "501" } }))?.date).toBe("2027-01-05");
    expect(await recordOrder(SHOP, moved, admin)).toBe("updated");
    expect((await count("2027-01-05"))?.orders ?? 0).toBe(0);
    expect((await count("2027-01-08"))?.orders).toBe(1);
  });

  it("a fully refunded order no longer takes a spot", async () => {
    const base = { id: 502, name: "#502", note_attributes: [{ name: "_pickday", value: sel({ d: "2027-01-06" }) }] };
    await recordOrder(SHOP, { ...base, updated_at: "2026-10-16T10:00:00Z", line_items: [{ id: 1, product_id: 2, variant_id: 21, title: "Bread", quantity: 1 }] }, null, "ORDERS_CREATE");
    expect((await count("2027-01-06"))?.orders).toBe(1);
    await recordOrder(SHOP, { ...base, updated_at: "2026-10-16T11:00:00Z", line_items: [{ id: 1, product_id: 2, variant_id: 21, title: "Bread", quantity: 1, current_quantity: 0 }] }, null);
    expect((await count("2027-01-06"))?.orders ?? 0).toBe(0);
  });

  it("per-item lines on different dates: listed on the earliest date, counted on each", async () => {
    const line = (id: number, d: string, s?: string) => ({ id, product_id: 100 + id, variant_id: 200 + id, title: "X", quantity: 1, properties: [{ name: "_pickday", value: JSON.stringify({ d, s }) }] });
    await recordOrder(SHOP, { id: 503, name: "#503", updated_at: "2026-10-16T10:00:00Z", note_attributes: [{ name: "_pickday", value: sel() }], line_items: [line(2, "2027-01-20"), line(1, "2027-01-12")] }, null, "ORDERS_CREATE");
    expect((await prisma.scheduledOrder.findFirst({ where: { shop: SHOP, orderId: "503" } }))?.date).toBe("2027-01-12");
    expect((await count("2027-01-12"))?.orders).toBe(1);
    expect((await count("2027-01-20"))?.orders).toBe(1);
  });

  it("per-item lines on one date in two slots count as one order that day", async () => {
    const line = (id: number, s: string) => ({ id, product_id: 100 + id, variant_id: 200 + id, title: "X", quantity: 1, properties: [{ name: "_pickday", value: JSON.stringify({ d: "2027-01-07", s }) }] });
    await recordOrder(SHOP, { id: 504, name: "#504", updated_at: "2026-10-16T10:00:00Z", note_attributes: [{ name: "_pickday", value: sel() }], line_items: [line(1, "am"), line(2, "pm")] }, null, "ORDERS_CREATE");
    expect(await count("2027-01-07")).toMatchObject({ orders: 1, items: 2 });
    expect(await count("2027-01-07", "shipping", "am")).toMatchObject({ orders: 1, items: 1 });
    expect(await count("2027-01-07", "shipping", "pm")).toMatchObject({ orders: 1, items: 1 });
  });

  it("counts tag-based product limits from the stored tag membership", async () => {
    await recordOrder(SHOP, { id: 505, name: "#505", updated_at: "2026-10-16T10:00:00Z", note_attributes: [{ name: "_pickday", value: sel({ d: "2027-01-09" }) }], line_items: [{ id: 1, product_id: 1, variant_id: 11, title: "Chocolate cake", quantity: 4 }] }, null, "ORDERS_CREATE");
    expect((await prisma.productCount.findFirst({ where: { shop: SHOP, key: "cakes", date: "2027-01-09" } }))?.qty).toBe(4);
  });

  it("zone counts follow the plan: recounted under the method key after a downgrade", async () => {
    await recordOrder(SHOP, { id: 506, name: "#506", updated_at: "2026-10-16T10:00:00Z", note_attributes: [{ name: "_pickday", value: JSON.stringify({ v: 1, m: "delivery", d: "2027-01-11", z: "z1", a: "10115" }) }], line_items: [{ id: 1, product_id: 2, variant_id: 21, title: "Bread", quantity: 1 }] }, null, "ORDERS_CREATE");
    expect((await count("2027-01-11", "delivery:z:z1"))?.orders).toBe(1);
    await prisma.shop.update({ where: { shop: SHOP }, data: { subscriptionId: "gid://shopify/AppSubscription/1" } });
    expect(await applySubscription(SHOP, { id: "gid://shopify/AppSubscription/2", name: "Starter", status: "ACTIVE" })).toEqual({ from: "pro", to: "starter" });
    expect(await count("2027-01-11", "delivery:z:z1")).toBeNull();
    expect((await count("2027-01-11", "delivery"))?.orders).toBe(1);
  });
});
