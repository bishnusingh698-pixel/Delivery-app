/**
 * Order recording against a real Postgres (skipped without DATABASE_URL).
 * CI runs these with a Postgres service; locally: `npx prisma migrate deploy` first.
 */
import { PLAN_ORDER_LIMIT } from "../../core/publish";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../app/services/publish.server", () => ({ schedulePublish: vi.fn() }));
vi.mock("../../app/services/flow.server", () => ({ flowTrigger: vi.fn(async () => {}) }));

const hasDb = !!process.env.DATABASE_URL;
const SHOP = "test-orders.myshopify.com";

describe.skipIf(!hasDb)("recording orders", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { recordOrder } = await import("../../app/services/orders.server");
  const { defaultSettings } = await import("../../core/defaults");

  const sel = (d: string, s: string | null = null) => JSON.stringify({ v: 1, m: "shipping", d, s, t: null, l: null, z: null, a: null, c: "DE", lbl: d, lc: "en", f: null });
  const order = (id: number, d: string, updated: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: `#${id}`,
    updated_at: updated,
    note_attributes: [{ name: "_pickday", value: sel(d) }],
    customer: { first_name: "Ana" },
    line_items: [{ id: id * 10, product_id: 1, variant_id: 11, title: "Cake", quantity: 2 }],
    ...extra,
  });
  const count = async (date: string) => (await prisma.capacityCount.findFirst({ where: { shop: SHOP, key: "shipping", date, slotId: "" } }))?.orders ?? 0;

  beforeAll(async () => {
    await cleanup();
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", currency: "EUR", plan: "free" } });
    await prisma.settings.create({ data: { shop: SHOP, version: 1, data: defaultSettings("DE") as any } });
  });
  afterAll(cleanup);
  async function cleanup() {
    for (const m of ["capacityCount", "productCount", "scheduledItem", "scheduledOrder", "settings", "activityLog", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: SHOP } });
  }

  it("records a new order and counts it", async () => {
    expect(await recordOrder(SHOP, order(1, "2026-10-20", "2026-10-16T10:00:00Z"), null, "ORDERS_CREATE")).toBe("created");
    expect(await count("2026-10-20")).toBe(1);
  });

  it("ignores a duplicate and an older payload", async () => {
    expect(await recordOrder(SHOP, order(1, "2026-10-20", "2026-10-16T10:00:00Z"), null)).toBe("unchanged");
    expect(await recordOrder(SHOP, order(1, "2026-10-22", "2026-10-16T09:00:00Z"), null)).toBe("stale");
    expect(await count("2026-10-20")).toBe(1);
  });

  it("moves the count when the date changes", async () => {
    expect(await recordOrder(SHOP, order(1, "2026-10-22", "2026-10-16T11:00:00Z"), null)).toBe("updated");
    expect(await count("2026-10-20")).toBe(0);
    expect(await count("2026-10-22")).toBe(1);
  });

  it("frees the capacity when cancelled", async () => {
    await recordOrder(SHOP, order(1, "2026-10-22", "2026-10-16T12:00:00Z", { cancelled_at: "2026-10-16T12:00:00Z" }), null, "ORDERS_CANCELLED");
    expect(await count("2026-10-22")).toBe(0);
  });

  it("still records orders over the free plan limit, flagged as limited", async () => {
    await prisma.scheduledOrder.createMany({ data: Array.from({ length: PLAN_ORDER_LIMIT.free! }, (_, i) => ({ shop: SHOP, orderId: `x${i}`, orderName: `#x${i}`, method: "shipping", date: "2026-09-01" })) });
    await recordOrder(SHOP, order(2, "2026-10-21", "2026-10-16T10:00:00Z"), null, "ORDERS_CREATE");
    const row = await prisma.scheduledOrder.findFirst({ where: { shop: SHOP, orderId: "2" } });
    expect(row?.limited).toBe(true);
    expect(await count("2026-10-21")).toBe(1);
  });

  it("counts a per-item order once, not twice", async () => {
    const items = (await count("2026-10-23")) + 0;
    const o = order(3, "2026-10-23", "2026-10-16T10:00:00Z", {
      note_attributes: [{ name: "_pickday", value: JSON.stringify({ v: 1, m: "shipping", d: null, s: null, t: null, l: null, z: null, a: null, c: "DE", lbl: null, lc: "en", f: null }) }],
      line_items: [{ id: 30, product_id: 1, variant_id: 11, title: "Cake", quantity: 2, properties: [{ name: "_pickday", value: JSON.stringify({ d: "2026-10-23", s: null, t: null, lbl: null }) }] }],
    });
    await recordOrder(SHOP, o, null, "ORDERS_CREATE");
    expect(await count("2026-10-23")).toBe(items + 1);
  });

  it("records create and update for one order arriving together without losing either", async () => {
    const { withLock } = await import("../../app/services/lock.server");
    const run = (u: string, d: string) => withLock(`order:${SHOP}`, () => recordOrder(SHOP, order(4, d, u), null));
    await Promise.all([run("2026-10-16T10:00:00Z", "2026-10-26"), run("2026-10-16T10:05:00Z", "2026-10-27")]);
    expect((await prisma.scheduledOrder.findFirst({ where: { shop: SHOP, orderId: "4" } }))?.date).toBe("2026-10-27");
    expect(await count("2026-10-26")).toBe(0);
    expect(await count("2026-10-27")).toBe(1);
  });
});
