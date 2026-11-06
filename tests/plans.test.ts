/**
 * Plans (D-76): every card on the Plans page matches what the code unlocks, each paid plan adds
 * something, the core picker stays on every plan (D-52), and Reports count correctly.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVERY_PLAN, newIn, planCards, planFor } from "../core/plans";
import { PLAN_FEATURES, PLAN_LOCATION_LIMIT, PLAN_ORDER_LIMIT, applyPlan } from "../core/publish";
import { computeReport, leadBucket, monthComparison, rangeDates } from "../core/reports";
import { settings } from "./helpers";

const en: Record<string, string> = JSON.parse(readFileSync(join(__dirname, "../app/i18n/admin/en.json"), "utf8"));

describe("plan cards match the code", () => {
  const cards = planCards();

  it("every feature a plan adds is on its card, and nothing else", () => {
    for (const c of cards) {
      const listed = c.features.filter((f) => !(EVERY_PLAN as readonly string[]).includes(f));
      expect(new Set(listed)).toEqual(new Set(newIn(c.id)));
      for (const f of listed) expect(PLAN_FEATURES[c.id].has(f)).toBe(true);
    }
  });

  it("every card line has a text", () => {
    for (const c of cards) for (const f of c.features) expect(en[`plans.feature.${f}`], f).toBeTruthy();
  });

  it("orders and locations on the cards are the real limits", () => {
    for (const c of cards) {
      expect(c.orders).toBe(PLAN_ORDER_LIMIT[c.id]);
      expect(c.locations).toBe(PLAN_LOCATION_LIMIT[c.id]);
    }
  });

  it("each paid plan adds features; Pro has reports, reminders and the 'day almost full' trigger", () => {
    expect(newIn("starter").length).toBeGreaterThan(0);
    expect(newIn("pro")).toEqual(expect.arrayContaining(["reports", "reminders", "dayFull"]));
    expect(planFor("reports")).toBe("pro");
    expect(planFor("capacity")).toBe("starter");
  });

  it("Free keeps a correct picker: every method, slots, holidays, closed days, notes (D-52)", () => {
    for (const f of ["allMethods", "slots", "holidays", "closures", "notes", "dailySummary"]) expect(PLAN_FEATURES.free.has(f)).toBe(true);
  });

  it("a downgrade keeps the data and only switches the feature off (applyPlan)", () => {
    const s = settings((x) => {
      x.methods.delivery.capacity.maxPerDay = 10;
      x.surcharges = [{ id: "f", label: "Sat", kind: "weekday", weekdays: [6], dates: [], slotIds: [], amount: "5.00", methods: "all", variantId: "1" }];
    });
    const before = JSON.stringify(s);
    const free = applyPlan(s, "free");
    expect(free.methods.delivery.capacity.maxPerDay).toBeNull();
    expect(free.surcharges).toEqual([]);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("reports", () => {
  const rows = [
    // Kolkata store: placed 5 Nov 23:00 local (17:30 UTC) for 6 Nov = next day.
    { date: "2026-11-06", method: "delivery", locationId: null, slotLabel: "09:00-12:00", status: "scheduled", createdAt: "2026-11-05T17:30:00Z", changes: [] },
    // Placed 6 Nov 00:30 local (19:00 UTC on 5 Nov) for 6 Nov = same day.
    { date: "2026-11-06", method: "pickup", locationId: "a", slotLabel: null, status: "scheduled", createdAt: "2026-11-05T19:00:00Z", changes: [{ by: "Customer" }] },
    { date: "2026-11-13", method: "pickup", locationId: "a", slotLabel: null, status: "fulfilled", createdAt: "2026-11-01T10:00:00Z", changes: [{ by: "Ana" }, { by: "Customer" }] },
    { date: "2026-11-07", method: "shipping", locationId: null, slotLabel: null, status: "cancelled", createdAt: "2026-11-01T10:00:00Z", changes: [] },
  ];
  const r = computeReport(rows, "Asia/Kolkata", (by) => by === "Customer");

  it("counts orders, cancellations and date changes", () => {
    expect(r.orders).toBe(3);
    expect(r.cancelled).toBe(1);
    expect(r.changedOrders).toBe(2);
    expect(r.changesByCustomer).toBe(2);
    expect(r.changesByStaff).toBe(1);
  });

  it("splits by method, location, weekday, day and slot", () => {
    expect(r.byMethod).toEqual([
      { method: "delivery", orders: 1, pct: 33 },
      { method: "pickup", orders: 2, pct: 67 },
    ]);
    expect(r.byLocation).toEqual([{ id: "a", orders: 2 }]);
    expect(r.weekdays[5]).toBe(3); // 6 and 13 November 2026 are Fridays
    expect(r.busiestDays[0]).toEqual({ date: "2026-11-06", orders: 2 });
    expect(r.slots).toEqual([{ label: "09:00-12:00", orders: 1 }]);
  });

  it("measures how far ahead customers book in the store's time zone", () => {
    expect(r.lead.find((x) => x.bucket === "sameDay")?.orders).toBe(1);
    expect(r.lead.find((x) => x.bucket === "nextDay")?.orders).toBe(1);
    expect(r.lead.find((x) => x.bucket === "8to14")?.orders).toBe(1);
    expect(leadBucket(15)).toBe("15plus");
  });

  it("compares this month with the same days of last month", () => {
    const m = monthComparison(["2026-11-02T10:00:00Z", "2026-11-05T10:00:00Z", "2026-10-03T10:00:00Z", "2026-10-20T10:00:00Z", "2026-10-31T20:00:00Z"], "2026-11-06", "Asia/Kolkata");
    // 31 Oct 20:00 UTC is 1 Nov 01:30 in Kolkata: this month.
    expect(m.thisMonth).toBe(3);
    expect(m.lastMonth).toBe(2);
    expect(m.lastMonthSoFar).toBe(1);
    expect(m.change).toBe(200);
  });

  it("ranges are counted from the store's today", () => {
    expect(rangeDates("last30", "2026-11-06")).toEqual({ from: "2026-10-08", to: "2026-11-06" });
    expect(rangeDates("next30", "2026-11-06").to).toBe("2026-12-05");
  });
});

describe("usage bar", async () => {
  const { trialEndsOn, usageMonth, usageTone } = await import("../core/usage");
  it("the month and its reset day are the store's (Sydney: 1 Dec starts while it's still November in UTC)", () => {
    expect(usageMonth("2026-12-01")).toEqual({ monthStart: "2026-12-01", resetsOn: "2027-01-01" });
    expect(usageMonth("2026-02-28").resetsOn).toBe("2026-03-01");
  });
  it("is near from 80% and over at the limit; unlimited plans are never near", () => {
    expect(usageTone({ count: 39, limit: 50 })).toBe("ok");
    expect(usageTone({ count: 40, limit: 50 })).toBe("near");
    expect(usageTone({ count: 50, limit: 50 })).toBe("over");
    expect(usageTone({ count: 5000, limit: null })).toBe("ok");
  });
  it("the trial ends 14 days after the subscription started, on the store's calendar", () => {
    // Started 1 Nov 20:00 UTC: ends 15 Nov 20:00 UTC = 16 Nov in Sydney.
    const sub = { createdAt: "2026-11-01T20:00:00Z", trialDays: 14 };
    expect(trialEndsOn(sub, "Australia/Sydney", new Date("2026-11-06T00:00:00Z"))).toBe("2026-11-16");
    expect(trialEndsOn(sub, "America/New_York", new Date("2026-11-06T00:00:00Z"))).toBe("2026-11-15");
    expect(trialEndsOn(sub, "UTC", new Date("2026-11-16T00:00:00Z"))).toBeNull();
    expect(trialEndsOn({ createdAt: "2026-11-01T20:00:00Z", trialDays: 0 }, "UTC")).toBeNull();
  });
});
