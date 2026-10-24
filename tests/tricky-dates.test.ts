/**
 * Tricky date cases (Phase 3 verification): daylight saving changes in both hemispheres,
 * half-hour and 45-minute zones, the exact cutoff boundary, month and year ends, leap days,
 * public holidays over New Year, and the checkout Function's hour-level time.
 */
import { describe, expect, it } from "vitest";
import { buildCalendar, checkSelection, firstAvailableDate } from "../core/engine";
import { nowInZone, zonedToUtc } from "../core/tz";
import { validate, minutesFromAliases, shiftTime } from "../core/checkout";
import { encodeSelection } from "../core/selection";
import { toFunctionConfig } from "../core/publish";
import { holidayClosuresFor } from "../app/services/holidays.server";
import { config, input } from "./helpers";

const at = (iso: string) => new Date(iso);

describe("daylight saving time", () => {
  it("US spring forward: a 2 PM cutoff still switches at 14:00 local on the short day", () => {
    // 2027-03-14 New York jumps from 02:00 EST to 03:00 EDT (UTC-4 afterwards).
    const before = nowInZone("America/New_York", at("2027-03-14T17:59:00Z")); // 13:59 EDT
    const after = nowInZone("America/New_York", at("2027-03-14T18:00:00Z")); // 14:00 EDT
    expect(before).toEqual({ date: "2027-03-14", minutes: 13 * 60 + 59 });
    expect(after).toEqual({ date: "2027-03-14", minutes: 14 * 60 });
    const cfg = config((s) => (s.methods.shipping.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6]), "pro", "America/New_York");
    expect(firstAvailableDate(input(cfg, { now: before }))).toBe("2027-03-15");
    expect(firstAvailableDate(input(cfg, { now: after }))).toBe("2027-03-16");
  });

  it("US fall back: the repeated hour maps to the first occurrence and back to the same wall time", () => {
    const first = zonedToUtc("2026-11-01", "01:30", "America/New_York");
    expect(first.toISOString()).toBe("2026-11-01T05:30:00.000Z"); // 01:30 EDT
    expect(nowInZone("America/New_York", first)).toEqual({ date: "2026-11-01", minutes: 90 });
    // A time that doesn't exist (spring forward) moves forward: 02:30 → 03:30 EDT.
    const gap = zonedToUtc("2027-03-14", "02:30", "America/New_York");
    expect(gap.toISOString()).toBe("2027-03-14T07:30:00.000Z");
    expect(nowInZone("America/New_York", gap)).toEqual({ date: "2027-03-14", minutes: 3 * 60 + 30 });
    // Chile changes its clocks at midnight: the start of that day is 01:00, not the day before.
    const santiago = zonedToUtc("2026-09-06", "00:00", "America/Santiago");
    expect(nowInZone("America/Santiago", santiago).date).toBe("2026-09-06");
  });

  it("Sydney (southern hemisphere) DST start keeps the store's own today", () => {
    // 2026-10-04 02:00 AEST -> 03:00 AEDT. 13:30 UTC on Oct 3 is 23:30 AEST on Oct 3.
    expect(nowInZone("Australia/Sydney", at("2026-10-03T13:30:00Z")).date).toBe("2026-10-03");
    // 15:30 UTC on Oct 3 is 01:30 AEST on Oct 4 (before the jump).
    expect(nowInZone("Australia/Sydney", at("2026-10-03T15:30:00Z"))).toEqual({ date: "2026-10-04", minutes: 90 });
    // 16:30 UTC is 03:30 AEDT (after the jump).
    expect(nowInZone("Australia/Sydney", at("2026-10-03T16:30:00Z"))).toEqual({ date: "2026-10-04", minutes: 210 });
  });

  it("half-hour and 45-minute zones (India, Nepal, Chatham)", () => {
    expect(nowInZone("Asia/Kolkata", at("2026-06-01T08:29:00Z")).minutes).toBe(13 * 60 + 59);
    expect(nowInZone("Asia/Kathmandu", at("2026-06-01T08:15:00Z")).minutes).toBe(14 * 60);
    expect(nowInZone("Pacific/Chatham", at("2026-06-01T00:00:00Z")).minutes).toBe(12 * 60 + 45);
  });
});

describe("cutoff boundary", () => {
  const cfg = config(); // Mon–Fri, 1 working day, cutoff 14:00
  it("13:59 is before, 14:00 is after (to the minute)", () => {
    // 2026-10-14 is a Wednesday.
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-14", minutes: 13 * 60 + 59 } }))).toBe("2026-10-15");
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-14", minutes: 14 * 60 } }))).toBe("2026-10-16");
  });
  it("Friday after the cutoff jumps over the weekend", () => {
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-16", minutes: 15 * 60 } }))).toBe("2026-10-20");
  });
  it("no cutoff (null) never moves the date", () => {
    const c = config((s) => (s.methods.shipping.schedule.cutoff.time = null));
    expect(firstAvailableDate(input(c, { now: { date: "2026-10-14", minutes: 23 * 60 + 59 } }))).toBe("2026-10-15");
  });
});

describe("month, year and leap day ends", () => {
  it("month end: Friday Jan 30 → Monday Feb 2", () => {
    const cfg = config();
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-01-30", minutes: 9 * 60 } }))).toBe("2026-02-02");
  });

  it("year end with New Year's Day closed: Thursday Dec 31 → Monday Jan 4", () => {
    const cfg = config((s) => {
      s.closures = [{ id: "ny", label: "New Year", start: "01-01", end: "01-01", yearly: true, methods: "all", locations: "all", kind: "holiday" }];
    });
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-12-31", minutes: 9 * 60 } }))).toBe("2027-01-04");
  });

  it("leap day: Monday Feb 28 2028 + 1 working day = Tuesday Feb 29", () => {
    const cfg = config();
    expect(firstAvailableDate(input(cfg, { now: { date: "2028-02-28", minutes: 9 * 60 } }))).toBe("2028-02-29");
  });

  it("a yearly Feb 29 closure closes Feb 28 in non-leap years", () => {
    const cfg = config((s) => {
      s.methods.shipping.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
      s.closures = [{ id: "leap", label: "Leap", start: "02-29", end: "02-29", yearly: true, methods: "all", locations: "all", kind: "blackout" }];
    });
    const r = checkSelection(input(cfg, { now: { date: "2027-02-20", minutes: 600 } }), "2027-02-28", null);
    expect(r.ok).toBe(false);
  });

  it("the calendar crosses the year boundary and stops at the booking window", () => {
    const cfg = config((s) => (s.methods.shipping.schedule.windowDays = 10));
    const cal = buildCalendar(input(cfg, { now: { date: "2026-12-28", minutes: 600 } }), "2026-12-28", "2027-01-15");
    expect(cal.days.find((d) => d.date === "2027-01-07")?.available).toBe(true);
    expect(cal.days.find((d) => d.date === "2027-01-08")?.reason).toBe("beyondWindow");
  });
});

describe("public holidays over New Year (real dataset)", () => {
  it("UK: Christmas, Boxing Day and New Year's Day are all closed when the window spans the year", () => {
    const set = { id: "hs_gb", country: "GB", region: null, methods: "all" as const, locations: "all" as const, skip: [] };
    const closures = holidayClosuresFor([set], "2026-12-20", "2027-01-10", "en");
    const days = closures.map((c) => c.start);
    expect(days).toEqual(expect.arrayContaining(["2026-12-25", "2026-12-28", "2027-01-01"]));
  });
  it("Saudi Arabia (lunar holidays) are marked as possibly shifting", () => {
    const set = { id: "hs_sa", country: "SA", region: null, methods: "all" as const, locations: "all" as const, skip: [] };
    const closures = holidayClosuresFor([set], "2026-01-01", "2026-12-31", "en");
    expect(closures.some((c) => c.mayShift)).toBe(true);
  });
});

describe("checkout Function time (hour only)", () => {
  const aliases = (hour: number) => Object.fromEntries(Array.from({ length: 23 }, (_, i) => [`h${String(i + 1).padStart(2, "0")}`, i + 1 <= hour]));

  it("reads the hour from the timeAfter aliases and rolls over midnight", () => {
    expect(minutesFromAliases(aliases(0))).toBe(0);
    expect(minutesFromAliases(aliases(13))).toBe(13 * 60);
    expect(shiftTime({ date: "2026-12-31", minutes: 23 * 60 }, 90)).toEqual({ date: "2027-01-01", minutes: 30 });
  });

  it("gives the benefit of the doubt within the cutoff hour, and blocks after it", () => {
    const cfg = toFunctionConfig(config((s) => (s.methods.shipping.schedule.cutoff.time = "14:30")));
    const sel = encodeSelection({ v: 1, m: "shipping", d: "2026-10-15", s: null, t: null, l: null, z: null, a: null, c: "DE", lbl: null, lc: "en", f: null });
    const run = (hour: number) =>
      validate(
        {
          buyerJourney: { step: "CHECKOUT_COMPLETION" },
          cart: { attribute: { value: sel }, lines: [{ id: "1", quantity: 1, merchandise: { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/11", requiresShipping: true, product: { id: "gid://shopify/Product/1" } } }] },
          shop: { localTime: { date: "2026-10-14", ...aliases(hour) } },
          validation: { metafield: { jsonValue: cfg } },
        },
        { en: { "validation.dateUnavailable": "No longer available: {date}" } },
      );
    expect(run(13)).toEqual([]); // 13:xx, before the cutoff
    expect(run(14)).toEqual([]); // 14:00–14:59: could be before 14:30, let it through
    expect(run(15)).toHaveLength(1); // 15:xx: certainly after the cutoff
  });
});
