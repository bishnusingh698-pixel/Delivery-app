/**
 * Capacity counts and admin lists against a real Postgres (skipped without DATABASE_URL):
 * refunded orders, zones and tag rules in date-per-item mode, per-item orders on the Orders page.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../app/services/publish.server", () => ({ schedulePublish: vi.fn() }));
vi.mock("../../app/services/flow.server", () => ({ flowTrigger: vi.fn(async () => {}) }));

const hasDb = !!process.env.DATABASE_URL;
const SHOP = "test-counts.myshopify.com";

describe.skipIf(!hasDb)("capacity counts", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { recordOrder } = await import("../../app/services/orders.server");
  const { dayCounts, listOrders, parseFilters } = await import("../../app/services/orders-query.server");
  const { defaultSettings } = await import("../../core/defaults");
  const { toStorefrontConfig } = await import("../../core/publish");

  const settings = defaultSettings("DE");
  settings.dateMode = "item";
  settings.methods.delivery.enabled = true;
  settings.zones.push({ id: "north", name: "North", country: "DE", postcodes: ["10115"], areas: [], regions: [], schedule: {}, capacity: { ...settings.methods.delivery.capacity, maxPerDay: 3 } });
  settings.productRules.limits.push({ id: "cakes", name: "Cakes", target: { products: [], variants: [], collections: [], tags: ["cake"] }, max: 10, perLocation: false });

  const sel = (over: Record<string, unknown> = {}) => JSON.stringify({ v: 1, m: "shipping", d: null, s: null, t: null, l: null, z: null, a: null, c: "DE", lbl: null, lc: "en", f: null, ...over });
  const prop = (d: string) => [{ name: "_pickday", value: JSON.stringify({ d, s: null, t: null, lbl: null }) }];
  /** Fake Admin API: answers the product tags lookup, accepts everything else. */
  const admin = (tags: Record<string, string[]>) => ({
    graphql: async (query: string, opts?: { variables?: Record<string, unknown> }) => {
      const ids = (opts?.variables?.ids as string[] | undefined) ?? [];
      const data = query.includes("PickdayOrderTags") ? { nodes: ids.map((id) => ({ id, tags: tags[id.split("/").pop()!] ?? [] })) } : {};
      return new Response(JSON.stringify({ data }));
    },
  });
  const cap = async (key: string, date: string) => (await prisma.capacityCount.findFirst({ where: { shop: SHOP, key, date, slotId: "" } })) ?? null;
  const product = async (key: string, date: string) => (await prisma.productCount.findFirst({ where: { shop: SHOP, key, date } }))?.qty ?? 0;

  beforeAll(async () => {
    await cleanup();
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", currency: "EUR", plan: "pro" } });
    await prisma.settings.create({ data: { shop: SHOP, version: 1, data: settings as any } });
  });
  afterAll(cleanup);
  async function cleanup() {
    for (const m of ["capacityCount", "productCount", "scheduledItem", "scheduledOrder", "settings", "activityLog", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: SHOP } });
  }

  it("frees the spot of an order whose dated items were all refunded", async () => {
    const o = (updated: string, qty: number) => ({
      id: 101,
      name: "#101",
      updated_at: updated,
      note_attributes: [{ name: "_pickday", value: sel({ d: "2026-11-02" }) }],
      line_items: [{ id: 1010, product_id: 1, variant_id: 11, title: "Bread", quantity: 1, current_quantity: qty }],
    });
    await recordOrder(SHOP, o("2026-10-20T10:00:00Z", 1), null, "ORDERS_CREATE");
    expect((await cap("shipping", "2026-11-02"))?.orders).toBe(1);
    await recordOrder(SHOP, o("2026-10-20T11:00:00Z", 0), null, "ORDERS_UPDATED");
    expect((await cap("shipping", "2026-11-02"))?.orders ?? 0).toBe(0);
  });

  it("counts date-per-item orders of a zone with its own limit under the zone", async () => {
    await recordOrder(
      SHOP,
      {
        id: 102,
        name: "#102",
        updated_at: "2026-10-20T10:00:00Z",
        note_attributes: [{ name: "_pickday", value: sel({ m: "delivery", z: "north" }) }],
        line_items: [
          { id: 1020, product_id: 2, variant_id: 21, title: "Cake", quantity: 2, properties: prop("2026-11-03") },
          { id: 1021, product_id: 3, variant_id: 31, title: "Pie", quantity: 1, properties: prop("2026-11-04") },
        ],
      },
      admin({ "2": ["Cake"] }),
      "ORDERS_CREATE",
    );
    expect((await cap("delivery:z:north", "2026-11-03"))?.orders).toBe(1);
    expect((await cap("delivery:z:north", "2026-11-04"))?.orders).toBe(1);
    expect(await cap("delivery", "2026-11-03")).toBeNull();
    // The cake limit targets a tag: the order's cakes count toward it.
    expect(await product("cakes", "2026-11-03")).toBe(2);
    expect(await product("cakes", "2026-11-04")).toBe(0);
  });

  it("keeps counting tag rules when Shopify can't be asked for the tags again", async () => {
    await recordOrder(
      SHOP,
      {
        id: 102,
        name: "#102",
        updated_at: "2026-10-20T12:00:00Z",
        note_attributes: [{ name: "_pickday", value: sel({ m: "delivery", z: "north" }) }],
        line_items: [
          { id: 1020, product_id: 2, variant_id: 21, title: "Cake", quantity: 3, properties: prop("2026-11-03") },
          { id: 1021, product_id: 3, variant_id: 31, title: "Pie", quantity: 1, properties: prop("2026-11-04") },
        ],
      },
      null,
      "ORDERS_UPDATED",
    );
    expect(await product("cakes", "2026-11-03")).toBe(3);
  });

  it("lists and counts date-per-item orders on each of their dates", async () => {
    const url = (q: string) => new URL(`https://x/app/orders?${q}`);
    const on = async (d: string) => (await listOrders(SHOP, parseFilters(url(`range=custom&from=${d}&to=${d}`), "2026-10-20"))).rows.map((r) => r.orderName);
    expect(await on("2026-11-03")).toEqual(["#102"]);
    expect(await on("2026-11-04")).toEqual(["#102"]);
    expect(await on("2026-11-05")).toEqual([]);
    expect((await listOrders(SHOP, parseFilters(url(""), "2026-10-20"))).rows.map((r) => r.orderName)).toContain("#102");
    const config = toStorefrontConfig(settings, { version: 1, timeZone: "Europe/Berlin", primaryLocale: "en", plan: "pro", overLimit: false, currency: "EUR", debugUntil: null, today: "2026-10-20" });
    const days = await dayCounts(SHOP, config, "2026-11-03", "2026-11-04");
    expect(days["2026-11-03"].methods.delivery).toEqual({ orders: 1, items: 3 });
    expect(days["2026-11-04"].methods.delivery).toEqual({ orders: 1, items: 1 });
  });
});
