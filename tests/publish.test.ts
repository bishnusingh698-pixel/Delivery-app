/** Publishing schedule: bursts of orders are coalesced but never postponed, and publishes never overlap. */
import { afterEach, describe, expect, it, vi } from "vitest";

const admin = vi.fn();
vi.mock("../app/db.server", () => ({ default: { shop: { update: vi.fn(async () => ({})) } } }));
vi.mock("../app/shopify.server", () => ({ unauthenticated: { admin: (...a: unknown[]) => admin(...a) } }));

const { publishShop, schedulePublish } = await import("../app/services/publish.server");
// The mocked Shopify client fails on purpose; keep the expected error logs out of the test output.
vi.spyOn(console, "error").mockImplementation(() => {});

describe("publishing", () => {
  afterEach(() => {
    vi.useRealTimers();
    admin.mockReset();
  });

  it("publishes a few seconds after the first change even while orders keep coming in", async () => {
    vi.useFakeTimers();
    admin.mockRejectedValue(new Error("stop here"));
    // An order every 2 seconds: a pure debounce would never publish.
    for (let t = 0; t < 4; t++) {
      schedulePublish("busy.myshopify.com");
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(admin).toHaveBeenCalledTimes(2);
  });

  it("runs one publish per store at a time, in order", async () => {
    const order: string[] = [];
    let release!: () => void;
    admin.mockImplementationOnce(() => {
      order.push("first starts");
      return new Promise((_, reject) => (release = () => reject(new Error("first done"))));
    });
    admin.mockImplementationOnce(async () => {
      order.push("second starts");
      throw new Error("second done");
    });
    const first = publishShop("one.myshopify.com").catch(() => order.push("first ends"));
    const second = publishShop("one.myshopify.com").catch(() => order.push("second ends"));
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(["first starts"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first starts", "first ends", "second starts", "second ends"]);
  });
});
