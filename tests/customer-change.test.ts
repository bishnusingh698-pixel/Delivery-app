import { describe, expect, it } from "vitest";
import { CUSTOMER_ACTOR, changeDeadline, customerChangeBlock, customerChanges } from "../core/customer-change";

const on = { enabled: true, hoursBefore: 24, maxChanges: 2 };
const order = (extra: Record<string, unknown> = {}) => ({ date: "2026-10-27", slotLabel: "10:00-12:00", status: "scheduled", limited: false, history: [], ...extra });
const TZ = "Europe/Berlin";

describe("customer date changes", () => {
  it("deadline is hoursBefore the slot start, in the store's zone", () => {
    // 27 Oct 10:00 Berlin (winter time, UTC+1) minus 24 h = 26 Oct 09:00 UTC.
    expect(changeDeadline(on, order(), TZ)?.toISOString()).toBe("2026-10-26T09:00:00.000Z");
    // Without a slot: midnight starts the day. 27 Oct 00:00 Berlin = 26 Oct 23:00 UTC; minus 24 h.
    expect(changeDeadline(on, order({ slotLabel: null }), TZ)?.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(changeDeadline({ ...on, hoursBefore: 0 }, order(), "America/New_York")?.toISOString()).toBe("2026-10-27T14:00:00.000Z");
  });

  it("allows a change before the deadline only", () => {
    expect(customerChangeBlock(on, order(), TZ, new Date("2026-10-26T08:59:00Z"))).toBeNull();
    expect(customerChangeBlock(on, order(), TZ, new Date("2026-10-26T09:00:00Z"))).toBe("tooLate");
  });

  it("says why it can't be changed", () => {
    const early = new Date("2026-10-20T00:00:00Z");
    expect(customerChangeBlock({ ...on, enabled: false }, order(), TZ, early)).toBe("off");
    expect(customerChangeBlock(on, order({ date: null }), TZ, early)).toBe("noDate");
    expect(customerChangeBlock(on, order({ status: "cancelled" }), TZ, early)).toBe("cancelled");
    expect(customerChangeBlock(on, order({ status: "fulfilled" }), TZ, early)).toBe("fulfilled");
    expect(customerChangeBlock(on, order({ limited: true }), TZ, early)).toBe("limited");
  });

  it("counts only the customer's own changes against the limit", () => {
    const early = new Date("2026-10-20T00:00:00Z");
    const staff = { at: "x", by: "Sam" };
    const mine = { at: "x", by: CUSTOMER_ACTOR };
    expect(customerChanges([staff, mine, null, "junk"])).toBe(1);
    expect(customerChangeBlock(on, order({ history: [staff, staff, mine] }), TZ, early)).toBeNull();
    expect(customerChangeBlock(on, order({ history: [mine, mine] }), TZ, early)).toBe("maxChanges");
    expect(customerChanges(undefined)).toBe(0);
  });
});
