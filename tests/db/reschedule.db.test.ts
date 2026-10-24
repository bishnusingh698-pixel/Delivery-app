/** Admin reschedule against a real Postgres with a fake Shopify Admin API. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../app/services/publish.server", async (orig) => ({ ...(await orig<any>()), schedulePublish: vi.fn() }));
vi.mock("../../app/shopify.server", () => ({ unauthenticated: {}, authenticate: {} }));
vi.mock("../../app/services/flow.server", () => ({ flowTrigger: vi.fn(async () => {}) }));

const SHOP = "test-reschedule.myshopify.com";
const calls: { query: string; variables: any }[] = [];
const admin = {
  graphql: async (query: string, opts?: { variables?: any }) => {
    calls.push({ query, variables: opts?.variables });
    const data: any = {};
    if (query.includes("order(id")) data.order = { name: "#2001", customer: { firstName: "Bo" }, customAttributes: [{ key: "Gift note", value: "Hi" }], lineItems: { nodes: [{ id: "gid://shopify/LineItem/1", title: "Cake", variantTitle: null, quantity: 1, requiresShipping: true, isGiftCard: false, product: { id: "gid://shopify/Product/1" }, variant: { id: "gid://shopify/ProductVariant/11" } }] } };
    for (const m of ["orderUpdate", "tagsAdd", "tagsRemove", "metafieldsSet"]) if (query.includes(m)) data[m] = { userErrors: [] };
    return new Response(JSON.stringify({ data }));
  },
};

describe.skipIf(!process.env.DATABASE_URL)("admin reschedule", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { setOrderSchedule } = await import("../../app/services/reschedule.server");
  const { defaultSettings } = await import("../../core/defaults");

  async function cleanup() {
    for (const m of ["capacityCount", "productCount", "scheduledItem", "scheduledOrder", "settings", "activityLog", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: SHOP } });
  }
  beforeAll(async () => {
    await cleanup();
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", currency: "EUR", plan: "pro" } });
    const s = defaultSettings("DE");
    s.methods.shipping.capacity.maxPerDay = 1;
    s.methods.shipping.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
    s.methods.shipping.schedule.windowDays = 400;
    // Time slots set up but switched off: no order may get one.
    s.methods.shipping.capacity.slots = [{ id: "am", start: "09:00", end: "12:00", weekdays: [], max: null }];
    await prisma.settings.create({ data: { shop: SHOP, version: 1, data: s as any } });
    await prisma.capacityCount.create({ data: { shop: SHOP, key: "shipping", date: "2027-03-10", slotId: "", orders: 1, items: 1 } });
  });
  afterAll(cleanup);

  it("refuses a full day unless overridden", async () => {
    const r = await setOrderSchedule(SHOP, admin, "2001", { method: "shipping", date: "2027-03-10", slotId: null, locationId: null });
    expect(r).toMatchObject({ ok: false, reason: "full" });
    const forced = await setOrderSchedule(SHOP, admin, "2001", { method: "shipping", date: "2027-03-10", slotId: null, locationId: null }, { force: true, actor: "Sam" });
    expect(forced.ok).toBe(true);
  });

  it("moves the order, keeps other attributes, tags it and records history", async () => {
    calls.length = 0;
    const r = await setOrderSchedule(SHOP, admin, "2001", { method: "shipping", date: "2027-03-11", slotId: null, locationId: null });
    expect(r.ok).toBe(true);
    const row = await prisma.scheduledOrder.findFirst({ where: { shop: SHOP, orderId: "2001" } });
    expect(row?.date).toBe("2027-03-11");
    expect((row?.history as any[]).length).toBe(2);
    const update = calls.find((c) => c.query.includes("orderUpdate"))!;
    const keys = update.variables.input.customAttributes.map((a: any) => a.key);
    expect(keys).toEqual(expect.arrayContaining(["Gift note", "_pickday", "Delivery date"]));
    const tags = calls.find((c) => c.query.includes("tagsAdd"))!.variables.tags;
    expect(tags).toContain("Date: 2027-03-11");
    const remove = calls.find((c) => c.query.includes("tagsRemove"))!.variables.tags;
    expect(remove).toContain("Date: 2027-03-10");
    const count = await prisma.capacityCount.findFirst({ where: { shop: SHOP, key: "shipping", date: "2027-03-10", slotId: "" } });
    expect(count?.orders ?? 0).toBe(0);
  });

  it("never attaches a time slot the day doesn't offer", async () => {
    const r = await setOrderSchedule(SHOP, admin, "2001", { method: "shipping", date: "2027-03-12", slotId: "am", locationId: null });
    expect(r.ok).toBe(true);
    const row = await prisma.scheduledOrder.findFirst({ where: { shop: SHOP, orderId: "2001" } });
    expect(row).toMatchObject({ date: "2027-03-12", slotId: null, slotLabel: null });
  });
});
