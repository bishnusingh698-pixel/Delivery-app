/** Admin reschedule: Shopify errors, rate limits and slots from date overrides (real Postgres, fake Admin API). */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../app/services/publish.server", async (orig) => ({ ...(await orig<object>()), schedulePublish: vi.fn() }));
vi.mock("../../app/shopify.server", () => ({ unauthenticated: {}, authenticate: {} }));
vi.mock("../../app/services/flow.server", () => ({ flowTrigger: vi.fn(async () => {}) }));

const SHOP = "test-reschedule-order.myshopify.com";
let throttle = 0;
const admin = {
  graphql: async (query: string) => {
    if (query.includes("orderUpdate") && throttle > 0) {
      throttle--;
      return new Response(JSON.stringify({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }));
    }
    const data: Record<string, unknown> = {};
    if (query.includes("order(id"))
      data.order = { name: "#9", customer: null, customAttributes: [], lineItems: { nodes: [{ id: "gid://shopify/LineItem/1", title: "Cake", variantTitle: null, quantity: 1, requiresShipping: true, isGiftCard: false, product: { id: "gid://shopify/Product/1" }, variant: { id: "gid://shopify/ProductVariant/11" } }] } };
    for (const m of ["orderUpdate", "tagsAdd", "tagsRemove", "metafieldsSet"]) if (query.includes(m)) data[m] = { userErrors: [] };
    return new Response(JSON.stringify({ data }));
  },
};

describe.skipIf(!process.env.DATABASE_URL)("admin reschedule and Shopify", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { setOrderSchedule } = await import("../../app/services/reschedule.server");
  const { retryThrottled } = await import("../../app/services/graphql.server");
  const { defaultCapacity, defaultSchedule, defaultSettings } = await import("../../core/defaults");

  async function cleanup() {
    for (const m of ["capacityCount", "productCount", "scheduledItem", "scheduledOrder", "settings", "activityLog", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: SHOP } });
  }
  beforeAll(async () => {
    await cleanup();
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", currency: "EUR", plan: "pro" } });
    const s = defaultSettings("DE");
    for (const m of ["shipping", "pickup"] as const) {
      s.methods[m].enabled = true;
      s.methods[m].schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
      s.methods[m].schedule.windowDays = 400;
      s.methods[m].slotsEnabled = true;
      s.methods[m].capacity.slots = [{ id: "am", start: "09:00", end: "12:00", weekdays: [], max: null }];
    }
    s.methods.shipping.capacity.overrides = [{ date: "2027-03-12", maxPerDay: null, slots: [{ id: "xmas", start: "07:00", end: "08:00", weekdays: [], max: null }] }];
    const schedule = { ...defaultSchedule(), weekdays: [0, 1, 2, 3, 4, 5, 6], windowDays: 400 };
    s.locations = [
      { id: "L1", shopifyLocationId: null, name: "Shop", address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: { schedule, capacity: { ...defaultCapacity(), slots: [{ id: "am", start: "16:00", end: "18:00", weekdays: [], max: null }] } } },
    ] as typeof s.locations;
    await prisma.settings.create({ data: { shop: SHOP, version: 1, data: s as any } });
    await prisma.scheduledOrder.create({ data: { shop: SHOP, orderId: "9", orderName: "#9", method: "shipping", date: "2027-02-01", slotId: "am", slotLabel: "09:00-12:00", items: [], itemCount: 1 } });
    await prisma.capacityCount.create({ data: { shop: SHOP, key: "shipping", date: "2027-02-01", slotId: "", orders: 1, items: 1 } });
  });
  afterAll(cleanup);

  const row = () => prisma.scheduledOrder.findFirst({ where: { shop: SHOP, orderId: "9" } });

  it("a Shopify error leaves our record, history and counts on the old date", async () => {
    throttle = 1;
    await expect(setOrderSchedule(SHOP, admin, "9", { method: "shipping", date: "2027-02-03", slotId: "am", locationId: null })).rejects.toThrow();
    const r = await row();
    expect(r?.date).toBe("2027-02-01");
    expect(r?.history).toEqual([]);
    expect((await prisma.capacityCount.findFirst({ where: { shop: SHOP, key: "shipping", date: "2027-02-01", slotId: "" } }))?.orders).toBe(1);
  });

  it("bulk moves wait and retry when Shopify is rate limited", async () => {
    throttle = 2;
    const r = await retryThrottled(() => setOrderSchedule(SHOP, admin, "9", { method: "shipping", date: "2027-02-03", slotId: "am", locationId: null }), [1, 1, 1]);
    expect(r.ok).toBe(true);
    expect((await row())?.date).toBe("2027-02-03");
    expect((await prisma.capacityCount.findFirst({ where: { shop: SHOP, key: "shipping", date: "2027-02-01", slotId: "" } }))?.orders ?? 0).toBe(0);
  });

  it("keeps a slot that only exists on that date (date override)", async () => {
    const r = await setOrderSchedule(SHOP, admin, "9", { method: "shipping", date: "2027-03-12", slotId: "xmas", locationId: null });
    expect(r.ok).toBe(true);
    expect(await row()).toMatchObject({ slotId: "xmas", slotLabel: "07:00-08:00" });
  });

  it("uses the pickup location's own slots over the method's", async () => {
    const r = await setOrderSchedule(SHOP, admin, "9", { method: "pickup", date: "2027-03-15", slotId: "am", locationId: "L1" });
    expect(r.ok).toBe(true);
    expect(await row()).toMatchObject({ method: "pickup", locationId: "L1", slotId: "am", slotLabel: "16:00-18:00" });
  });
});
