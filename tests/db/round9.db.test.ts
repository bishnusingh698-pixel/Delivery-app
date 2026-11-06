/**
 * Round 9 bugs that need a real Postgres (skipped without DATABASE_URL).
 *  - B79: an order with a date per item on two different days was missing from "Today/Tomorrow",
 *    the calendar, Home's counts and the printed day sheet (it has no single date).
 *  - B80: an order that carries a date copied from an older order (subscription renewal, a
 *    duplicated order) was recorded as a new booking on a past day: counted, tagged, sent to Flow
 *    and counted against the plan's monthly orders.
 *  - Usage on unlimited plans reports the real number of orders this month (Home usage bar).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../app/services/publish.server", () => ({ schedulePublish: vi.fn(), storefrontConfigFor: vi.fn() }));
vi.mock("../../app/services/flow.server", () => ({ flowTrigger: vi.fn(async () => {}) }));

const hasDb = !!process.env.DATABASE_URL;
const SHOP = "test-round9.myshopify.com";

describe.skipIf(!hasDb)("round 9 (database)", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { recordOrder } = await import("../../app/services/orders.server");
  const { listOrders, parseFilters, dayCounts, ordersWhere, orderRow } = await import("../../app/services/orders-query.server");
  const { monthlyUsage } = await import("../../app/services/usage.server");
  const { defaultSettings } = await import("../../core/defaults");
  const { toStorefrontConfig } = await import("../../core/publish");
  const flow = await import("../../app/services/flow.server");

  const settings = defaultSettings("DE");
  const config = toStorefrontConfig(settings, { version: 1, timeZone: "Europe/Berlin", primaryLocale: "en", plan: "pro", overLimit: false, currency: "EUR", debugUntil: null, today: "2026-11-01" });
  const noDate = JSON.stringify({ v: 1, m: "shipping", d: null, s: null, t: null, l: null, z: null, a: null, c: "DE", lbl: null, lc: "en", f: null });
  const item = (d: string) => [{ name: "_pickday", value: JSON.stringify({ d, s: null, t: null, lbl: null }) }];

  beforeAll(async () => {
    await cleanup();
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", currency: "EUR", plan: "pro" } });
    await prisma.settings.create({ data: { shop: SHOP, version: 1, data: settings as any } });
  });
  afterAll(cleanup);
  async function cleanup() {
    for (const m of ["capacityCount", "productCount", "scheduledItem", "scheduledOrder", "settings", "activityLog", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: SHOP } });
  }

  it("B79: an order with items on two days is listed, counted and printed on each of them", async () => {
    await recordOrder(
      SHOP,
      {
        id: 901,
        name: "#901",
        updated_at: "2026-11-01T10:00:00Z",
        note_attributes: [{ name: "_pickday", value: noDate }],
        line_items: [
          { id: 9011, product_id: 1, variant_id: 11, title: "Cake", quantity: 1, properties: item("2026-11-10") },
          { id: 9012, product_id: 2, variant_id: 22, title: "Bread", quantity: 3, properties: item("2026-11-12") },
        ],
      },
      null,
      "ORDERS_CREATE",
    );
    const day = (d: string) => parseFilters(new URL(`https://x/app/orders?range=custom&from=${d}&to=${d}`), "2026-11-01");
    for (const d of ["2026-11-10", "2026-11-12"]) {
      const list = await listOrders(SHOP, day(d));
      expect(list.rows.map((r) => r.orderName)).toContain("#901");
      expect(list.total).toBe(1);
    }
    expect((await listOrders(SHOP, day("2026-11-11"))).total).toBe(0);
    // Print and export use the same filter; on a day's sheet only that day's items are listed.
    const rows = await prisma.scheduledOrder.findMany({ where: await ordersWhere(SHOP, day("2026-11-12")) });
    expect(rows).toHaveLength(1);
    expect(orderRow(rows[0], settings, { from: "2026-11-12", to: "2026-11-12" }).lines.map((l) => l.title)).toEqual(["Bread"]);
    // Home and the Orders calendar count it on both days, once.
    const counts = await dayCounts(SHOP, config, "2026-11-09", "2026-11-13");
    expect(counts["2026-11-10"].methods.shipping?.orders).toBe(1);
    expect(counts["2026-11-12"].methods.shipping?.orders).toBe(1);
    expect(counts["2026-11-11"].methods.shipping).toBeUndefined();
  });

  it("B79: an order with every item on the same day is not counted twice", async () => {
    await recordOrder(
      SHOP,
      {
        id: 902,
        name: "#902",
        updated_at: "2026-11-01T10:00:00Z",
        note_attributes: [{ name: "_pickday", value: noDate }],
        line_items: [{ id: 9021, product_id: 1, variant_id: 11, title: "Cake", quantity: 1, properties: item("2026-11-13") }],
      },
      null,
      "ORDERS_CREATE",
    );
    const counts = await dayCounts(SHOP, config, "2026-11-13", "2026-11-13");
    expect(counts["2026-11-13"].methods.shipping?.orders).toBe(1);
  });

  it("B80: a date copied from an older order (renewal, duplicate) isn't booked on that past day", async () => {
    vi.mocked(flow.flowTrigger).mockClear();
    const before = await monthlyUsage(SHOP, { plan: "free", timeZone: "Europe/Berlin" });
    const r = await recordOrder(
      SHOP,
      {
        id: 903,
        name: "#903",
        created_at: "2026-11-05T09:00:00+01:00",
        updated_at: "2026-11-05T09:00:00+01:00",
        note_attributes: [{ name: "_pickday", value: JSON.stringify({ v: 1, m: "shipping", d: "2026-10-01", lbl: "1 Oct" }) }],
        line_items: [{ id: 9031, product_id: 1, variant_id: 11, title: "Cake", quantity: 1 }],
      },
      { request: vi.fn() } as any,
      "ORDERS_CREATE",
    );
    expect(r).toBe("copiedDate");
    expect(await prisma.scheduledOrder.findFirst({ where: { shop: SHOP, orderId: "903" } })).toBeNull();
    expect(await prisma.capacityCount.findFirst({ where: { shop: SHOP, date: "2026-10-01" } })).toBeNull();
    expect(flow.flowTrigger).not.toHaveBeenCalled();
    expect((await monthlyUsage(SHOP, { plan: "free", timeZone: "Europe/Berlin" })).count).toBe(before.count);
    const log = await prisma.activityLog.findFirst({ where: { shop: SHOP, summary: { contains: "#903" } } });
    expect(log?.summary).toMatch(/2026-10-01/);
  });

  it("B80: a subscription renewal isn't booked on the first order's date, even when that date is still ahead", async () => {
    for (const [id, source] of [[905, "subscription_contract"], [906, "subscription_contract_checkout_one"]] as const) {
      const r = await recordOrder(
        SHOP,
        {
          id,
          name: `#${id}`,
          source_name: source,
          created_at: "2026-11-05T09:00:00+01:00",
          updated_at: "2026-11-05T09:00:00+01:00",
          note_attributes: [{ name: "_pickday", value: JSON.stringify({ v: 1, m: "shipping", d: "2026-11-09", lbl: "9 Nov" }) }],
          line_items: [{ id: id * 10, product_id: 1, variant_id: 11, title: "Weekly bread", quantity: 1 }],
        },
        null,
        "ORDERS_CREATE",
      );
      expect(r).toBe("copiedDate");
    }
    expect(await prisma.scheduledOrder.count({ where: { shop: SHOP, orderId: { in: ["905", "906"] } } })).toBe(0);
  });

  it("B80: an order finished just after midnight for the day before is still recorded", async () => {
    // Checkout started at 23:58 for today, paid at 00:01: the date is one day before the order. Keep it.
    const r = await recordOrder(
      SHOP,
      {
        id: 904,
        name: "#904",
        created_at: "2026-11-06T00:01:00+01:00",
        updated_at: "2026-11-06T00:01:00+01:00",
        note_attributes: [{ name: "_pickday", value: JSON.stringify({ v: 1, m: "shipping", d: "2026-11-05", lbl: "5 Nov" }) }],
        line_items: [{ id: 9041, product_id: 1, variant_id: 11, title: "Cake", quantity: 1 }],
      },
      null,
      "ORDERS_CREATE",
    );
    expect(r).toBe("created");
  });

  it("an order already recorded keeps its updates, whatever its date", async () => {
    // Fulfilled a week after its date: not a copy, just an update.
    const r = await recordOrder(
      SHOP,
      {
        id: 904,
        name: "#904",
        created_at: "2026-11-06T00:01:00+01:00",
        updated_at: "2026-11-13T10:00:00+01:00",
        fulfillment_status: "fulfilled",
        note_attributes: [{ name: "_pickday", value: JSON.stringify({ v: 1, m: "shipping", d: "2026-11-05", lbl: "5 Nov" }) }],
        line_items: [{ id: 9041, product_id: 1, variant_id: 11, title: "Cake", quantity: 1 }],
      },
      null,
      "ORDERS_UPDATED",
    );
    expect(r).toBe("updated");
  });

  it("usage on an unlimited plan counts this month's orders (Home usage bar)", async () => {
    const u = await monthlyUsage(SHOP, { plan: "pro", timeZone: "Europe/Berlin" });
    expect(u.limit).toBeNull();
    expect(u.count).toBeGreaterThanOrEqual(3);
    expect(u.over).toBe(false);
    expect(u.resetsOn > u.monthStart).toBe(true);
  });
});
