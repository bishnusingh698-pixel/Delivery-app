/**
 * Daily schedule Flow trigger against a real Postgres (skipped without DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../app/shopify.server", () => ({ unauthenticated: {} }));

const hasDb = !!process.env.DATABASE_URL;
const SHOP = "test-daily.myshopify.com";

describe.skipIf(!hasDb)("daily schedule trigger", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { sendDailySummaryIfDue } = await import("../../app/services/daily-summary.server");
  const { defaultSettings } = await import("../../core/defaults");
  const at = new Date("2026-10-24T05:30:00Z"); // 07:30 in Berlin

  const clean = async () => {
    await prisma.scheduledOrder.deleteMany({ where: { shop: SHOP } });
    await prisma.settings.deleteMany({ where: { shop: SHOP } });
    await prisma.shop.deleteMany({ where: { shop: SHOP } });
  };
  beforeAll(async () => {
    await clean();
    const s = defaultSettings();
    s.notifications.dailySummary = { enabled: true, hour: 7, day: "tomorrow" };
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", plan: "free" } });
    await prisma.settings.create({ data: { shop: SHOP, data: s as object, version: 1 } });
    await prisma.scheduledOrder.createMany({
      data: [
        { shop: SHOP, orderId: "1", orderName: "#1", method: "delivery", date: "2026-10-25", slotLabel: "10:00-12:00", itemCount: 2 },
        { shop: SHOP, orderId: "2", orderName: "#2", method: "pickup", date: "2026-10-25", itemCount: 1 },
        { shop: SHOP, orderId: "3", orderName: "#3", method: "pickup", date: "2026-10-25", itemCount: 1, status: "cancelled" },
        { shop: SHOP, orderId: "4", orderName: "#4", method: "shipping", date: "2026-10-26", itemCount: 1 },
      ],
    });
  });
  afterAll(clean);

  const adminWith = (graphql: ReturnType<typeof vi.fn>) => async () => ({ graphql }) as any;
  const ok = () => vi.fn(async () => new Response(JSON.stringify({ data: { flowTriggerReceive: { userErrors: [] } } })));

  it("gives the claim back when Flow refuses, so the next run retries", async () => {
    const graphql = vi.fn(async () => new Response(JSON.stringify({ data: { flowTriggerReceive: { userErrors: [{ field: null, message: "nope" }] } } })));
    const row = await prisma.shop.findUniqueOrThrow({ where: { shop: SHOP } });
    await expect(sendDailySummaryIfDue(row, adminWith(graphql), at)).rejects.toThrow(/nope/);
    expect((await prisma.shop.findUniqueOrThrow({ where: { shop: SHOP } })).dailySummaryFor).toBeNull();
  });

  it("sends tomorrow's totals once, even when two runs overlap", async () => {
    const graphql = ok();
    const row = await prisma.shop.findUniqueOrThrow({ where: { shop: SHOP } });
    const results = await Promise.all([sendDailySummaryIfDue(row, adminWith(graphql), at), sendDailySummaryIfDue(row, adminWith(graphql), at)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(graphql).toHaveBeenCalledTimes(1);
    const body = (graphql.mock.calls[0] as any[])[1].variables;
    expect(body.handle).toBe("pickday-flow-daily");
    expect(body.payload).toMatchObject({ Date: "2026-10-25", Orders: 2, "Local delivery orders": 1, "Pickup orders": 1, "Shipping orders": 0, Items: 3 });
    // A later run the same day sends nothing.
    const again = await prisma.shop.findUniqueOrThrow({ where: { shop: SHOP } });
    expect(await sendDailySummaryIfDue(again, adminWith(graphql), new Date("2026-10-24T06:30:00Z"))).toBe(false);
  });
});
