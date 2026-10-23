/** Calendar feed against a real Postgres (skipped without DATABASE_URL). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SHOP = "test-feed.myshopify.com";

describe.skipIf(!process.env.DATABASE_URL)("calendar feed", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { feedFor } = await import("../../app/services/feed.server");
  const { defaultSettings } = await import("../../core/defaults");

  async function cleanup() {
    for (const m of ["scheduledOrder", "settings", "shop"] as const) await (prisma[m] as any).deleteMany({ where: { shop: SHOP } });
  }
  beforeAll(async () => {
    await cleanup();
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", currency: "EUR", plan: "pro", feedToken: "feed-test-token" } });
    const s = defaultSettings("DE");
    s.locations = [{ id: "ny", shopifyLocationId: null, name: "NY shop", address: "", mapUrl: "", instructions: {}, timeZone: "America/New_York", enabled: true, countries: "all", custom: null }];
    await prisma.settings.create({ data: { shop: SHOP, version: 1, data: s as any } });
    const date = new Date().toISOString().slice(0, 10);
    await prisma.scheduledOrder.createMany({
      data: [
        { shop: SHOP, orderId: "1", orderName: "#1", method: "pickup", locationId: "ny", date, slotId: "am", slotLabel: "10:00-12:00" },
        { shop: SHOP, orderId: "2", orderName: "#2", method: "delivery", date, slotId: "am", slotLabel: "10:00-12:00" },
      ],
    });
  });
  afterAll(cleanup);

  it("writes slot times in the pickup location's own time zone", async () => {
    const ics = (await feedFor("feed-test-token"))!.replace(/\r\n /g, "");
    const events = ics.split("BEGIN:VEVENT").slice(1);
    expect(events.find((e) => e.includes("#1"))).toContain("DTSTART;TZID=America/New_York:");
    expect(events.find((e) => e.includes("#2"))).toContain("DTSTART;TZID=Europe/Berlin:");
  });
});
