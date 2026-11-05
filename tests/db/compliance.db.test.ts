/**
 * The mandatory privacy webhooks against a real Postgres (skipped without DATABASE_URL).
 * What PRIVACY.md promises: a redaction removes the customer's first name everywhere Pickday
 * holds it, a shop deletion removes everything, and neither touches another store.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.DATABASE_URL;
const SHOP = "test-compliance.myshopify.com";
const OTHER = "test-compliance-other.myshopify.com";
let next: { topic: string; payload: unknown; shop?: string } = { topic: "", payload: {} };
vi.mock("../../app/shopify.server", () => ({ authenticate: { webhook: async () => ({ shop: next.shop ?? SHOP, topic: next.topic, payload: next.payload }) } }));

describe.skipIf(!hasDb)("privacy webhooks", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { action } = await import("../../app/routes/webhooks.compliance");
  const send = (topic: string, payload: unknown, shop = SHOP) => {
    next = { topic, payload, shop };
    return action({ request: new Request("https://x/webhooks/compliance", { method: "POST" }), params: {}, context: {} } as never);
  };
  const order = (shop: string, orderId: string, customerId: string | null) =>
    prisma.scheduledOrder.create({ data: { shop, orderId, orderName: `#${orderId}`, customerFirst: "Ana", customerId, method: "shipping", date: "2026-11-10", area: "10115" } });

  beforeAll(async () => {
    await cleanup();
    for (const s of [SHOP, OTHER]) await prisma.shop.create({ data: { shop: s, active: false } });
    await order(SHOP, "1001", "77");
    await order(SHOP, "1002", null);
    await order(SHOP, "10010", "88");
    await order(OTHER, "1001", "77");
  });
  afterAll(cleanup);
  async function cleanup() {
    for (const s of [SHOP, OTHER]) for (const m of ["scheduledItem", "scheduledOrder", "activityLog", "settings", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: s } });
  }

  it("a data request lists what Pickday holds for the customer", async () => {
    await send("CUSTOMERS_DATA_REQUEST", { customer: { id: 77 }, orders_requested: [1002] });
    const log = await prisma.activityLog.findFirst({ where: { shop: SHOP, kind: "privacy" } });
    expect(log?.summary).toContain("#1001: Ana");
    expect(log?.summary).toContain("#1002: Ana");
    expect(log?.summary).not.toContain("#10010");
  });

  it("a redaction removes the first name from the orders and from that log entry", async () => {
    await send("CUSTOMERS_REDACT", { customer: { id: 77 }, orders_to_redact: [1002] });
    const rows = await prisma.scheduledOrder.findMany({ where: { shop: SHOP }, orderBy: { orderId: "asc" } });
    expect(rows.map((r) => [r.orderId, r.customerFirst, r.customerId, r.area])).toEqual([
      ["1001", null, null, null],
      ["10010", "Ana", "88", "10115"],
      ["1002", null, null, null],
    ]);
    expect(await prisma.activityLog.count({ where: { shop: SHOP, kind: "privacy" } })).toBe(0);
    // Another store with the same order number and customer id is not touched.
    expect((await prisma.scheduledOrder.findFirst({ where: { shop: OTHER } }))?.customerFirst).toBe("Ana");
  });

  it("a shop deletion removes everything for that store only", async () => {
    await send("SHOP_REDACT", {});
    expect(await prisma.scheduledOrder.count({ where: { shop: SHOP } })).toBe(0);
    expect(await prisma.shop.count({ where: { shop: SHOP } })).toBe(0);
    expect(await prisma.scheduledOrder.count({ where: { shop: OTHER } })).toBe(1);
  });
});
