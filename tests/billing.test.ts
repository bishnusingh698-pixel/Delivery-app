import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../app/db.server", () => ({ default: {} }));
vi.mock("../app/shopify.server", () => ({ unauthenticated: {} }));
import { billingTest, planFromName } from "../app/services/billing.server";
import { planOf } from "../app/models/shop.server";

describe("billing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses test charges on development stores, even in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_TEST", "false");
    expect(billingTest({ isDevStore: true })).toBe(true);
    expect(billingTest({ isDevStore: false })).toBe(false);
    expect(billingTest(null)).toBe(false);
  });

  it("BILLING_TEST=true makes every store use test charges", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_TEST", "true");
    expect(billingTest({ isDevStore: false })).toBe(true);
  });

  it("development stores follow their subscription like real stores", () => {
    expect(planOf({ plan: "free" })).toBe("free");
    expect(planOf({ plan: "starter" })).toBe("starter");
    expect(planOf({ plan: "nonsense" })).toBe("free");
    expect(planFromName("Pro")).toBe("pro");
  });
});
