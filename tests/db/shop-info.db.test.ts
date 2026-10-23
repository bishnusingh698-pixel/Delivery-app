/** Daily refresh of shop details (time zone, currency, languages) against a real Postgres. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const schedulePublish = vi.fn();
vi.mock("../../app/services/publish.server", () => ({ publishShop: vi.fn(), schedulePublish: (...a: unknown[]) => schedulePublish(...a) }));

const SHOP = "test-shop-info.myshopify.com";
let tz = "Europe/Berlin";
const admin = {
  graphql: async () =>
    new Response(
      JSON.stringify({
        data: {
          shop: { name: "Test", email: "a@b.c", ianaTimezone: tz, currencyCode: "EUR", billingAddress: { countryCodeV2: "DE" }, plan: { partnerDevelopment: false, shopifyPlus: false } },
          shopLocales: [{ locale: "de", primary: true, published: true }],
        },
      }),
    ),
};

describe.skipIf(!process.env.DATABASE_URL)("shop details refresh", async () => {
  const { default: prisma } = await import("../../app/db.server");
  const { refreshShopInfo } = await import("../../app/services/install.server");
  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shop: SHOP } });
    await prisma.shop.create({ data: { shop: SHOP, timeZone: "Europe/Berlin", currency: "EUR", primaryLocale: "de", locales: ["de"] } });
  });
  afterAll(() => prisma.shop.deleteMany({ where: { shop: SHOP } }));

  it("stores a new time zone and republishes only when something changed", async () => {
    expect(await refreshShopInfo(SHOP, admin)).toBe(false);
    expect(schedulePublish).not.toHaveBeenCalled();
    tz = "Europe/Lisbon";
    expect(await refreshShopInfo(SHOP, admin)).toBe(true);
    expect((await prisma.shop.findUnique({ where: { shop: SHOP } }))?.timeZone).toBe("Europe/Lisbon");
    expect(schedulePublish).toHaveBeenCalledWith(SHOP);
  });
});
