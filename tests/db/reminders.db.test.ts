/**
 * Pro Flow triggers (D-77): "Reminder before the date" (once per order, once a day, at the
 * merchant's hour in the store's time zone) and "Day almost full" (once when a day crosses the
 * merchant's share of its limit). Real Postgres; Flow itself is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { handle: string; payload: Record<string, unknown> }[] = [];
vi.mock("../../app/services/flow.server", () => ({
  flowTrigger: vi.fn(async () => {}),
  sendFlowTrigger: vi.fn(async (_admin: unknown, handle: string, payload: Record<string, unknown>) => void sent.push({ handle, payload })),
}));
vi.mock("../../app/services/publish.server", () => ({ schedulePublish: vi.fn() }));
vi.mock("../../app/services/admin-t.server", () => ({ adminT: async () => ({ t: (k: string) => k, lang: "en", dateLabel: (d: string) => `label ${d}` }) }));

const hasDb = !!process.env.DATABASE_URL;
const SHOP = "test-reminders.myshopify.com";

describe.skipIf(!hasDb)("Pro Flow triggers (database)", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { sendRemindersIfDue, checkDayFull } = await import("../../app/services/reminders.server");
  const { defaultSettings } = await import("../../core/defaults");
  const { REMINDER_HANDLE, DAY_FULL_HANDLE } = await import("../../app/services/flow-payload");

  const settings = defaultSettings("DE");
  settings.notifications.reminders = { enabled: true, hour: 10, daysBefore: 1 };
  settings.notifications.dayFull = { enabled: true, percent: 80 };
  settings.methods.shipping.capacity.maxPerDay = 5;
  const admin = async () => ({}) as any;
  const row = async () => (await prisma.shop.findUnique({ where: { shop: SHOP } }))!;
  const order = (id: string, date: string | null, extra: Record<string, unknown> = {}) => ({ shop: SHOP, orderId: id, orderName: `#${id}`, method: "shipping", date, ...extra });

  beforeAll(async () => {
    await cleanup();
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Asia/Kathmandu", plan: "pro" } });
    await prisma.settings.create({ data: { shop: SHOP, version: 1, data: settings as any } });
    await prisma.scheduledOrder.createMany({
      data: [
        order("1", "2026-11-07"),
        order("2", "2026-11-07", { slotLabel: "10:00-12:00" }),
        order("3", "2026-11-07", { status: "cancelled" }),
        order("4", "2026-11-07", { status: "fulfilled" }),
        order("5", "2026-11-07", { limited: true }),
        order("6", "2026-11-08"),
        order("7", null),
      ],
    });
    // Order 7 has a date per item, one of them tomorrow.
    await prisma.scheduledItem.create({ data: { shop: SHOP, orderId: "7", lineId: "71", productId: "1", variantId: "11", title: "Cake", qty: 1, date: "2026-11-07", method: "shipping" } });
  });
  afterAll(cleanup);
  beforeEach(() => void sent.splice(0));
  async function cleanup() {
    for (const m of ["scheduledItem", "scheduledOrder", "capacityCount", "settings", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: SHOP } });
  }

  it("isn't sent before the merchant's hour (Kathmandu, +5:45)", async () => {
    // 09:59 in Kathmandu on 6 November.
    expect(await sendRemindersIfDue(await row(), admin, new Date("2026-11-06T04:14:00Z"))).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("at 10:00 store time: one reminder per open order dated tomorrow, nothing else", async () => {
    expect(await sendRemindersIfDue(await row(), admin, new Date("2026-11-06T04:16:00Z"))).toBe(3);
    expect(sent.every((s) => s.handle === REMINDER_HANDLE)).toBe(true);
    expect(sent.map((s) => s.payload.order_id).sort()).toEqual([1, 2, 7]);
    expect(sent.find((s) => s.payload.order_id === 2)?.payload["Time slot"]).toBe("10:00-12:00");
    expect(sent[0].payload["Days before"]).toBe(1);
  });

  it("is sent once a day, even when the hourly job runs again", async () => {
    expect(await sendRemindersIfDue(await row(), admin, new Date("2026-11-06T05:16:00Z"))).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("isn't sent on Starter, or when the merchant turned it off", async () => {
    await prisma.shop.update({ where: { shop: SHOP }, data: { plan: "starter", reminderFor: null } });
    expect(await sendRemindersIfDue(await row(), admin, new Date("2026-11-06T04:16:00Z"))).toBe(0);
    await prisma.shop.update({ where: { shop: SHOP }, data: { plan: "pro" } });
  });

  it("Day almost full: sent once when a day reaches 80% of its limit", async () => {
    const s = { ...settings };
    // 4 open orders on 7 November with a limit of 5 = 80%. Counts come from CapacityCount.
    await prisma.capacityCount.create({ data: { shop: SHOP, key: "shipping", date: "2026-11-07", slotId: "", orders: 4, items: 4 } });
    await checkDayFull(SHOP, {} as any, s, ["2026-11-07"], new Date("2026-11-06T04:16:00Z"));
    expect(sent).toHaveLength(1);
    expect(sent[0].handle).toBe(DAY_FULL_HANDLE);
    expect(sent[0].payload).toMatchObject({ Date: "2026-11-07", Booked: 4, Limit: 5, Percent: 80 });
    await checkDayFull(SHOP, {} as any, s, ["2026-11-07"], new Date("2026-11-06T04:20:00Z"));
    expect(sent).toHaveLength(1);
  });

  it("Day almost full: not for a day in the past, nor below the share", async () => {
    await prisma.capacityCount.create({ data: { shop: SHOP, key: "shipping", date: "2026-11-09", slotId: "", orders: 3, items: 3 } });
    await checkDayFull(SHOP, {} as any, settings, ["2026-11-09", "2026-11-01"], new Date("2026-11-06T04:16:00Z"));
    expect(sent).toHaveLength(0);
  });
});
