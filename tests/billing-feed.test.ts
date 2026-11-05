/** Billing webhook reads the plan from Shopify (B63); the calendar feed is Pro only (B65). */
import { afterEach, describe, expect, it, vi } from "vitest";

const shopRow = vi.fn();
vi.mock("../app/db.server", () => ({ default: { shop: { findUnique: (...a: unknown[]) => shopRow(...a) } } }));
vi.mock("../app/shopify.server", () => ({ unauthenticated: {} }));
vi.mock("../app/services/publish.server", () => ({ schedulePublish: vi.fn() }));
vi.mock("../app/models/settings.server", () => ({
  loadSettings: vi.fn(async () => {
    throw new Error("reached the feed");
  }),
}));

const { activeSubscription } = await import("../app/services/billing.server");
const { feedFor } = await import("../app/services/feed.server");

const admin = (subs: { id: string; name: string; status: string; test: boolean }[]) => ({
  graphql: async () => new Response(JSON.stringify({ data: { currentAppInstallation: { activeSubscriptions: subs } } })),
});

describe("billing: the current subscription comes from Shopify", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns the active plan, whatever webhook arrived last", async () => {
    vi.stubEnv("NODE_ENV", "production");
    shopRow.mockResolvedValue({ isDevStore: false });
    const sub = await activeSubscription("s.myshopify.com", admin([{ id: "gid://shopify/AppSubscription/2", name: "Pro", status: "ACTIVE", test: false }]) as never);
    expect(sub).toEqual({ id: "gid://shopify/AppSubscription/2", name: "Pro", status: "ACTIVE" });
  });

  it("no active subscription = Free", async () => {
    shopRow.mockResolvedValue({ isDevStore: false });
    expect(await activeSubscription("s.myshopify.com", admin([]) as never)).toBeNull();
  });

  it("a test charge counts on a development store, not on a real one", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_TEST", "false");
    const test = [{ id: "gid://shopify/AppSubscription/3", name: "Starter", status: "ACTIVE", test: true }];
    shopRow.mockResolvedValue({ isDevStore: true });
    expect((await activeSubscription("s.myshopify.com", admin(test) as never))?.name).toBe("Starter");
    shopRow.mockResolvedValue({ isDevStore: false });
    expect(await activeSubscription("s.myshopify.com", admin(test) as never)).toBeNull();
  });
});

describe("calendar feed", () => {
  it("answers nothing after a downgrade from Pro", async () => {
    shopRow.mockResolvedValue({ shop: "s.myshopify.com", active: true, plan: "starter" });
    expect(await feedFor("x".repeat(32))).toBeNull();
  });
  it("is served on Pro", async () => {
    shopRow.mockResolvedValue({ shop: "s.myshopify.com", active: true, plan: "pro" });
    await expect(feedFor("x".repeat(32))).rejects.toThrow("reached the feed");
  });
});
