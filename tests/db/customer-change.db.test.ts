/** Customer date changes (order status page) against a real Postgres with a fake Shopify. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const token = { sub: "gid://shopify/Customer/77", dest: "https://test-customer.myshopify.com" };
const calls: { query: string; variables: any }[] = [];
const live = { customerId: "gid://shopify/Customer/77", cancelledAt: null as string | null, status: "UNFULFILLED" };
const admin = {
  graphql: async (query: string, opts?: { variables?: any }) => {
    calls.push({ query, variables: opts?.variables });
    const data: any = {};
    if (query.includes("order(id")) data.order = { customer: { id: live.customerId }, cancelledAt: live.cancelledAt, displayFulfillmentStatus: live.status, customAttributes: [] };
    for (const m of ["orderUpdate", "tagsAdd", "tagsRemove", "metafieldsSet"]) if (query.includes(m)) data[m] = { userErrors: [] };
    return new Response(JSON.stringify({ data }));
  },
};
vi.mock("../../app/services/publish.server", async (orig) => ({ ...(await orig<any>()), schedulePublish: vi.fn() }));
vi.mock("../../app/services/flow.server", () => ({ flowTrigger: vi.fn(async () => {}) }));
vi.mock("../../app/shopify.server", () => ({
  unauthenticated: { admin: async () => ({ admin }) },
  authenticate: { public: { customerAccount: async () => ({ sessionToken: token, cors: (r: Response) => r }) } },
}));

const SHOP = "test-customer.myshopify.com";

describe.skipIf(!process.env.DATABASE_URL)("customer date changes", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const route = await import("../../app/routes/api.customer.order.$id");
  const { defaultSettings } = await import("../../core/defaults");
  const { CUSTOMER_ACTOR } = await import("../../core/customer-change");

  const get = async (days = false) => {
    const res = (await route.loader({ request: new Request(`https://app/api/customer/order/3001${days ? "?days=1" : ""}`), params: { id: "gid://shopify/Order/3001" }, context: {} } as any)) as Response;
    return { status: res.status, body: (await res.json()) as any };
  };
  const post = async (body: unknown) => {
    const res = (await route.action({ request: new Request("https://app/api/customer/order/3001", { method: "POST", body: JSON.stringify(body) }), params: { id: "3001" }, context: {} } as any)) as Response;
    return { status: res.status, body: (await res.json()) as any };
  };

  async function cleanup() {
    for (const m of ["capacityCount", "productCount", "scheduledItem", "scheduledOrder", "settings", "activityLog", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: SHOP } });
  }
  beforeAll(async () => {
    await cleanup();
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", currency: "EUR", plan: "starter" } });
    const s = defaultSettings("DE");
    s.methods.shipping.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
    s.methods.shipping.schedule.windowDays = 400;
    s.customerChanges = { enabled: true, hoursBefore: 24, maxChanges: 1 };
    await prisma.settings.create({ data: { shop: SHOP, version: 1, data: s as any } });
    await prisma.scheduledOrder.create({
      data: { shop: SHOP, orderId: "3001", orderName: "#3001", method: "shipping", date: "2027-03-10", itemCount: 1, items: [{ lineId: "1", productId: "1", variantId: "11", title: "Cake", variant: null, qty: 1, needsDate: true }] },
    });
  });
  afterAll(cleanup);

  it("hides the order from another customer", async () => {
    live.customerId = "gid://shopify/Customer/99";
    const r = await get();
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ canChange: false, block: "notFound" });
    live.customerId = "gid://shopify/Customer/77";
  });

  it("refuses once the order is fulfilled in Shopify", async () => {
    live.status = "FULFILLED";
    expect((await get()).body).toMatchObject({ canChange: false, block: "fulfilled" });
    live.status = "UNFULFILLED";
  });

  it("lists available dates and saves the customer's choice once", async () => {
    const g = await get(true);
    expect(g.body.canChange).toBe(true);
    expect(g.body.current).toMatchObject({ method: "shipping", date: "2027-03-10" });
    expect(g.body.days.length).toBeGreaterThan(10);
    const pick = g.body.days[5].date;

    expect((await post({ date: "not-a-date" })).status).toBe(400);
    const ok = await post({ date: pick, slotId: null });
    expect(ok.body).toEqual({ ok: true });
    const row = await prisma.scheduledOrder.findFirstOrThrow({ where: { shop: SHOP, orderId: "3001" } });
    expect(row.date).toBe(pick);
    expect((row.history as any[]).at(-1)).toMatchObject({ by: CUSTOMER_ACTOR, to: { date: pick } });
    expect(calls.some((c) => c.query.includes("orderUpdate"))).toBe(true);

    // maxChanges = 1: the button disappears and a second change is refused.
    expect((await get()).body).toMatchObject({ canChange: false, block: "maxChanges" });
    expect(await post({ date: g.body.days[6].date })).toMatchObject({ status: 409, body: { ok: false, reason: "maxChanges" } });
  });

  it("is off on the Free plan", async () => {
    await prisma.shop.update({ where: { shop: SHOP }, data: { plan: "free" } });
    expect((await get()).body).toMatchObject({ canChange: false, block: "off" });
  });
});
