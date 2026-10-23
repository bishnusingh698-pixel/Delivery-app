import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, fromDays, inRange, isValidDate, toDays, weekday } from "../core/civil";
import { buildCalendar, checkSelection, computeEarliest, firstAvailableDate, resolveRules } from "../core/engine";
import { datedLines, methodsFor, areaCovered, findZone } from "../core/rules";
import { nowInZone, zonedToUtc } from "../core/tz";
import type { Availability } from "../core/types";
import { config, input, line } from "./helpers";

// 2026-10-14 is a Wednesday. Default schedule: Mon–Fri, lead 1 working day, cutoff 14:00, 30-day window.

describe("civil date math", () => {
  it("round-trips days and handles leap years and month/year boundaries", () => {
    for (const d of ["1970-01-01", "2000-02-29", "2024-02-29", "2026-12-31", "2027-01-01", "2100-03-01"]) {
      expect(fromDays(toDays(d))).toBe(d);
    }
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2027-01-01", "2026-12-31")).toBe(1);
    expect(weekday("2026-10-14")).toBe(3);
    expect(weekday("2028-02-29")).toBe(2);
    expect(isValidDate("2027-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("matches yearly ranges across the year end", () => {
    expect(inRange("2026-12-30", "12-24", "01-02", true)).toBe(true);
    expect(inRange("2027-01-02", "2026-12-24", "2027-01-02", true)).toBe(true);
    expect(inRange("2027-01-03", "12-24", "01-02", true)).toBe(false);
  });
});

describe("time zones and DST", () => {
  it("computes now in the store zone, not the server's", () => {
    // 2026-10-14 08:45 UTC = 14:15 in Kolkata (+05:30) and 04:45 in New York (-04:00).
    const at = new Date(Date.UTC(2026, 9, 14, 8, 45));
    expect(nowInZone("Asia/Kolkata", at)).toEqual({ date: "2026-10-14", minutes: 14 * 60 + 15 });
    expect(nowInZone("America/New_York", at)).toEqual({ date: "2026-10-14", minutes: 4 * 60 + 45 });
    // Late evening UTC is already tomorrow in Auckland.
    expect(nowInZone("Pacific/Auckland", new Date(Date.UTC(2026, 9, 14, 20, 0))).date).toBe("2026-10-15");
  });

  it("converts civil time to UTC across DST changes", () => {
    // Europe/Berlin: CET (+1) on 2026-03-28, CEST (+2) on 2026-03-30.
    expect(zonedToUtc("2026-03-28", "12:00", "Europe/Berlin").toISOString()).toBe("2026-03-28T11:00:00.000Z");
    expect(zonedToUtc("2026-03-30", "12:00", "Europe/Berlin").toISOString()).toBe("2026-03-30T10:00:00.000Z");
    // US DST ends 2026-11-01.
    expect(zonedToUtc("2026-11-02", "09:00", "America/New_York").toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("Kolkata store, UTC server, New York shopper: same days before and after a 2 PM cutoff", () => {
    const cfg = config(undefined, "pro", "Asia/Kolkata");
    // Before cutoff: 13:00 IST = 07:30 UTC = 03:30 New York.
    const before = nowInZone("Asia/Kolkata", new Date(Date.UTC(2026, 9, 14, 7, 30)));
    // After cutoff: 14:30 IST = 09:00 UTC.
    const after = nowInZone("Asia/Kolkata", new Date(Date.UTC(2026, 9, 14, 9, 0)));
    expect(firstAvailableDate(input(cfg, { now: before }))).toBe("2026-10-15");
    expect(firstAvailableDate(input(cfg, { now: after }))).toBe("2026-10-16");
  });
});

describe("lead time and cutoffs", () => {
  it("1 working day before and after cutoff", () => {
    const cfg = config();
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-14", minutes: 13 * 60 + 59 } }))).toBe("2026-10-15");
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-14", minutes: 14 * 60 } }))).toBe("2026-10-16");
  });

  it("working-day counting skips weekends; calendar counting does not", () => {
    const work = config((s) => (s.methods.shipping.schedule.lead = { amount: 2, unit: "days", workingDays: true }));
    // Friday 09:00 + 2 working days = Tuesday.
    expect(firstAvailableDate(input(work, { now: { date: "2026-10-16", minutes: 540 } }))).toBe("2026-10-20");
    const cal = config((s) => (s.methods.shipping.schedule.lead = { amount: 2, unit: "days", workingDays: false }));
    // Friday + 2 calendar days = Sunday (closed) -> Monday.
    expect(firstAvailableDate(input(cal, { now: { date: "2026-10-16", minutes: 540 } }))).toBe("2026-10-19");
  });

  it("per-weekday cutoffs", () => {
    const cfg = config((s) => {
      s.methods.shipping.schedule.cutoff = { time: null, perWeekday: [null, "14:00", "14:00", "10:00", "14:00", "12:00", null] };
    });
    // Wednesday cutoff is 10:00.
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-14", minutes: 9 * 60 + 59 } }))).toBe("2026-10-15");
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-14", minutes: 10 * 60 } }))).toBe("2026-10-16");
  });

  it("orders on a non-working day count from the next working day", () => {
    const cfg = config();
    // Saturday: next working day Monday, +1 working day = Tuesday.
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-17", minutes: 600 } }))).toBe("2026-10-20");
  });

  it("hour-based lead time hides slots that start too early", () => {
    const cfg = config((s) => {
      const m = s.methods.delivery;
      m.enabled = true;
      m.slotsEnabled = true;
      m.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
      m.schedule.lead = { amount: 4, unit: "hours", workingDays: false };
      m.schedule.cutoff.time = null;
      m.capacity.hideSlotMinutesBefore = 0;
      m.capacity.slots = [
        { id: "a", start: "10:00", end: "12:00", weekdays: [], max: null },
        { id: "b", start: "14:00", end: "16:00", weekdays: [], max: null },
      ];
    });
    const cal = buildCalendar(input(cfg, { method: "delivery", now: { date: "2026-10-14", minutes: 9 * 60 } }), "2026-10-14", "2026-10-15");
    const today = cal.days[0];
    expect(today.available).toBe(true);
    expect(today.slots.map((x) => x.available)).toEqual([false, true]);
  });

  it("same-day allowed before its own cutoff only", () => {
    const cfg = config((s) => (s.methods.shipping.schedule.sameDay = { allowed: true, cutoff: "10:00" }));
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-14", minutes: 9 * 60 } }))).toBe("2026-10-14");
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-10-14", minutes: 10 * 60 } }))).toBe("2026-10-15");
  });

  it("product extra lead time (longest wins) pushes the earliest date", () => {
    const cfg = config((s) => {
      s.productRules.extraLead = [
        { id: "x", target: { products: ["2"], variants: [], collections: [], tags: [] }, days: 3 },
        { id: "y", target: { products: [], variants: [], collections: [], tags: ["cake"] }, days: 1 },
      ];
    });
    const lines = [line(), line({ key: "k2", productId: "2", title: "Wedding cake", tags: ["Cake"] })];
    // Wed 09:00: base Thu, +3 working days = Tue.
    expect(firstAvailableDate(input(cfg, { lines }))).toBe("2026-10-20");
  });

  it("don't open dates before a launch date, and stop at the booking window", () => {
    const cfg = config((s) => {
      s.methods.shipping.schedule.notBefore = "2026-10-26";
      s.methods.shipping.schedule.windowDays = 14;
    });
    const cal = buildCalendar(input(cfg, {}), "2026-10-14", "2026-10-31");
    const status = (d: string) => cal.days.find((x) => x.date === d)!;
    expect(status("2026-10-23").reason).toBe("notYetOpen");
    expect(status("2026-10-26").available).toBe(true);
    expect(status("2026-10-28").available).toBe(true);
    expect(status("2026-10-29").reason).toBe("beyondWindow");
  });
});

describe("closures, holidays, special days, vacation", () => {
  it("blocks closures with labels and opens special days", () => {
    const cfg = config((s) => {
      s.closures = [
        { id: "c1", label: "Reformation Day", start: "2026-10-15", end: "2026-10-15", yearly: false, methods: "all", locations: "all", kind: "holiday" },
        { id: "c2", label: "Christmas", start: "12-24", end: "12-26", yearly: true, methods: "all", locations: "all", kind: "blackout" },
      ];
      s.specialDays = [{ id: "s1", date: "2026-10-18", label: "Open Sunday", methods: "all", locations: "all", slots: null, maxPerDay: null }];
    });
    const cal = buildCalendar(input(cfg, {}), "2026-10-14", "2026-10-19");
    const st = (d: string) => cal.days.find((x) => x.date === d)!;
    expect(st("2026-10-15")).toMatchObject({ available: false, reason: "holiday", detail: "Reformation Day" });
    expect(st("2026-10-17").reason).toBe("closed");
    expect(st("2026-10-18").available).toBe(true);
    // Working-day counting skips the holiday: Wed 09:00 + 1 working day = Fri.
    expect(cal.firstAvailable).toBe("2026-10-16");
    const xmas = buildCalendar(input(cfg, { now: { date: "2027-12-20", minutes: 600 } }), "2027-12-24", "2027-12-27");
    expect(xmas.days.map((d) => d.available)).toEqual([false, false, false, true]);
  });

  it("vacation mode closes the range", () => {
    const cfg = config((s) => (s.vacation = { enabled: true, start: "2026-10-14", end: "2026-10-20", message: {} }));
    // Prep starts on the first working day after the holiday (Wed 21st), +1 working day.
    expect(firstAvailableDate(input(cfg, {}))).toBe("2026-10-22");
  });

  it("location-specific closures only affect that pickup location", () => {
    const cfg = config((s) => {
      s.methods.pickup.enabled = true;
      s.locations = [
        { id: "l1", shopifyLocationId: null, name: "Main", address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null },
        { id: "l2", shopifyLocationId: null, name: "Harbour", address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null },
      ];
      s.closures = [{ id: "c", label: "Refit", start: "2026-10-15", end: "2026-10-16", yearly: false, methods: "all", locations: ["l1"], kind: "blackout" }];
    });
    expect(firstAvailableDate(input(cfg, { method: "pickup", locationId: "l1" }))).toBe("2026-10-19");
    expect(firstAvailableDate(input(cfg, { method: "pickup", locationId: "l2" }))).toBe("2026-10-15");
  });

  it("returns null when nothing is ever available", () => {
    const cfg = config((s) => (s.methods.shipping.schedule.weekdays = []));
    expect(firstAvailableDate(input(cfg, {}))).toBeNull();
  });
});

describe("capacity", () => {
  const avail = (c: Availability["c"], p: Availability["p"] = {}): Availability => ({ v: 1, at: "", c, p });

  it("counts orders per day", () => {
    const cfg = config((s) => (s.methods.shipping.capacity.maxPerDay = 2));
    const a = avail({ shipping: { "2026-10-15": [2, 7] } });
    const cal = buildCalendar(input(cfg, { availability: a }), "2026-10-15", "2026-10-16");
    expect(cal.days[0]).toMatchObject({ available: false, reason: "full" });
    expect(cal.days[1].available).toBe(true);
  });

  it("counts items using cart quantities", () => {
    const cfg = config((s) => {
      s.methods.shipping.capacity.unit = "items";
      s.methods.shipping.capacity.maxPerDay = 10;
    });
    const a = avail({ shipping: { "2026-10-15": [3, 8] } });
    const two = buildCalendar(input(cfg, { availability: a, lines: [line({ quantity: 2 })] }), "2026-10-15", "2026-10-15");
    const three = buildCalendar(input(cfg, { availability: a, lines: [line({ quantity: 3 })] }), "2026-10-15", "2026-10-15");
    expect(two.days[0]).toMatchObject({ available: true, left: 2 });
    expect(three.days[0]).toMatchObject({ available: false, reason: "full" });
  });

  it("slot max 2: third order sees Full; per-date override raises the limit", () => {
    const cfg = config((s) => {
      const m = s.methods.shipping;
      m.slotsEnabled = true;
      m.capacity.slots = [
        { id: "s1", start: "10:00", end: "12:00", weekdays: [], max: 2 },
        { id: "s2", start: "12:00", end: "14:00", weekdays: [], max: 2 },
      ];
      m.capacity.maxPerDay = 3;
      m.capacity.overrides = [{ date: "2026-10-16", maxPerDay: 200, slots: null }];
    });
    const a = avail({ shipping: { "2026-10-15": [2, 2, { s1: [2, 2] }], "2026-10-16": [3, 3, { s1: [1, 1] }] } });
    const cal = buildCalendar(input(cfg, { availability: a }), "2026-10-15", "2026-10-16");
    expect(cal.days[0].slots.map((s) => [s.slot.id, s.available, s.reason])).toEqual([
      ["s1", false, "full"],
      ["s2", true, null],
    ]);
    expect(cal.days[1].available).toBe(true);
    expect(checkSelection(input(cfg, { availability: a }), "2026-10-15", "s1")).toMatchObject({ ok: false, reason: "slotUnavailable" });
    expect(checkSelection(input(cfg, { availability: a }), "2026-10-15", null)).toMatchObject({ ok: false, reason: "slotRequired" });
    expect(checkSelection(input(cfg, { availability: a }), "2026-10-15", "s2")).toMatchObject({ ok: true });
  });

  it("admin reschedule can release the order's own spot or ignore limits", () => {
    const cfg = config((s) => (s.methods.shipping.capacity.maxPerDay = 1));
    const a = avail({ shipping: { "2026-10-15": [1, 1] } });
    expect(checkSelection(input(cfg, { availability: a }), "2026-10-15", null).ok).toBe(false);
    expect(
      checkSelection(input(cfg, { availability: a, release: { date: "2026-10-15", slotId: null, orders: 1, items: 1 } }), "2026-10-15", null).ok,
    ).toBe(true);
    expect(checkSelection(input(cfg, { availability: a, ignoreCapacity: true }), "2026-10-15", null).ok).toBe(true);
  });

  it("product daily limit: 40 loaves sells out only for carts containing them", () => {
    const cfg = config((s) => {
      s.productRules.limits = [{ id: "r1", name: "Sourdough", target: { products: ["1"], variants: [], collections: [], tags: [] }, max: 40, perLocation: false }];
    });
    const a = avail({}, { r1: { "2026-10-15": 40 } });
    const withBread = buildCalendar(input(cfg, { availability: a }), "2026-10-15", "2026-10-15");
    expect(withBread.days[0]).toMatchObject({ available: false, reason: "soldOut", detail: "Sourdough" });
    const other = buildCalendar(input(cfg, { availability: a, lines: [line({ productId: "9", title: "Bagel" })] }), "2026-10-15", "2026-10-15");
    expect(other.days[0].available).toBe(true);
  });
});

describe("product rules", () => {
  it("date restriction (10–18 April yearly) limits the calendar", () => {
    const cfg = config((s) => {
      s.methods.shipping.schedule.windowDays = 365;
      s.productRules.restrictions = [
        { id: "hx", name: "Hot cross buns", target: { products: [], variants: [], collections: [], tags: ["easter"] }, weekdays: null, ranges: [{ start: "04-10", end: "04-18", yearly: true }], dates: [] },
      ];
    });
    const lines = [line({ tags: ["Easter"], title: "Hot cross buns" })];
    const now = { date: "2027-04-01", minutes: 540 };
    expect(firstAvailableDate(input(cfg, { lines, now }))).toBe("2027-04-12"); // 10th/11th = weekend
    const cal = buildCalendar(input(cfg, { lines, now }), "2027-04-19", "2027-04-19");
    expect(cal.days[0]).toMatchObject({ reason: "productUnavailable", detail: "Hot cross buns" });
  });

  it("mixed cart with no common date has no available day", () => {
    const cfg = config((s) => {
      s.methods.shipping.schedule.windowDays = 365;
      s.productRules.restrictions = [
        { id: "a", name: "A", target: { products: ["1"], variants: [], collections: [], tags: [] }, weekdays: null, ranges: [{ start: "04-10", end: "04-18", yearly: true }], dates: [] },
        { id: "b", name: "B", target: { products: ["2"], variants: [], collections: [], tags: [] }, weekdays: null, ranges: [{ start: "12-20", end: "12-24", yearly: true }], dates: [] },
      ];
    });
    const lines = [line(), line({ key: "k2", productId: "2", title: "Christmas menu" })];
    expect(firstAvailableDate(input(cfg, { lines, now: { date: "2027-04-01", minutes: 540 } }))).toBeNull();
  });

  it("gift cards and excluded products don't need a date; mixed cart setting", () => {
    const cfg = config((s) => (s.productRules.exclude.tags = ["no-date"]));
    const gc = line({ giftCard: true, requiresShipping: false });
    expect(datedLines([gc], cfg.productRules)).toEqual([]);
    expect(datedLines([line({ tags: ["NO-DATE"] })], cfg.productRules)).toEqual([]);
    const mixed = [line(), line({ key: "k2", tags: ["no-date"] })];
    expect(datedLines(mixed, cfg.productRules)).toHaveLength(1);
    expect(datedLines(mixed, { ...cfg.productRules, mixedCart: "all" })).toHaveLength(0);
  });

  it("collection rules use published collection membership", () => {
    const cfg = config((s) => {
      s.productRules.exclude.collections = ["77"];
      s.productRules.collectionProducts = { "77": ["5"] };
    });
    expect(datedLines([line({ productId: "5" })], cfg.productRules)).toEqual([]);
  });
});

describe("countries, methods and areas", () => {
  const cfg = config((s) => {
    s.methods.delivery.enabled = true;
    s.methods.delivery.countries = ["DE"];
    s.methods.pickup.enabled = true;
    s.methods.pickup.countries = ["DE"];
    s.methods.shipping.countries = "all";
    s.productRules.methodOnly = [{ id: "m", target: { products: ["7"], variants: [], collections: [], tags: [] }, methods: ["pickup"] }];
    s.areas = [
      { country: "DE", mode: "postcode", postcodes: ["10115-10999"], areas: [], regions: [], askFirst: true },
      { country: "AE", mode: "area", postcodes: [], areas: [{ id: "marina", names: { en: "Dubai Marina" } }], regions: [], askFirst: true },
    ];
    s.zones = [
      { id: "n", name: "North", country: "DE", postcodes: ["10115-10199"], areas: [], regions: [], schedule: { weekdays: [2, 4] }, capacity: null },
      { id: "x", name: "Other", country: "AT", postcodes: ["10115-10199"], areas: [], regions: [], schedule: {}, capacity: null },
    ];
  });

  it("offers methods per country", () => {
    expect(methodsFor(cfg, "US", [line()])).toEqual(["shipping"]);
    expect(methodsFor(cfg, "DE", [line()])).toEqual(["delivery", "pickup", "shipping"]);
    expect(methodsFor(cfg, "DE", [line({ productId: "7" })])).toEqual(["pickup"]);
  });

  it("postcode range accepts spaced input; area-list countries", () => {
    expect(areaCovered(cfg, { country: "DE", postcode: "10 117" })).toBe(true);
    expect(areaCovered(cfg, { country: "DE", postcode: "80331" })).toBe(false);
    expect(areaCovered(cfg, { country: "AE", areaId: "marina" })).toBe(true);
    expect(areaCovered(cfg, { country: "FR", postcode: "75001" })).toBeNull();
  });

  it("zones are scoped by country and override weekdays", () => {
    expect(findZone(cfg, { country: "DE", postcode: "10117" })?.id).toBe("n");
    expect(findZone(cfg, { country: "AT", postcode: "10117" })?.id).toBe("x");
    const rules = resolveRules(cfg, "delivery", null, "n")!;
    expect(rules.schedule.weekdays).toEqual([2, 4]);
    // Wed 09:00, 1 working day in zone (Tue/Thu) => Thu 15th.
    expect(firstAvailableDate(input(cfg, { method: "delivery", zoneId: "n" }))).toBe("2026-10-15");
    expect(computeEarliest(input(cfg, { method: "delivery", zoneId: "n" }), rules).date).toBe("2026-10-15");
  });
});

describe("surcharges", () => {
  it("returns the fee for Sunday but not Monday", () => {
    const cfg = config((s) => {
      s.methods.shipping.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
      s.surcharges = [{ id: "sun", label: "Sunday", kind: "weekday", weekdays: [0], dates: [], slotIds: [], methods: "all", amount: "5.00", variantId: "999" }];
    });
    const sun = checkSelection(input(cfg, {}), "2026-10-18", null);
    const mon = checkSelection(input(cfg, {}), "2026-10-19", null);
    expect(sun.ok && sun.fees.map((f) => f.id)).toEqual(["sun"]);
    expect(mon.ok && mon.fees).toEqual([]);
  });

  it("keeps an hour-based lead time for same-day slot start", () => {
    const cfg = config((s) => {
      s.methods.shipping.schedule.lead = { amount: 3, unit: "hours", workingDays: false };
      s.methods.shipping.schedule.cutoff.time = "08:00";
      s.methods.shipping.schedule.sameDay = { allowed: true, cutoff: "12:00" };
    });
    const inp = input(cfg, { now: { date: "2026-10-14", minutes: 9 * 60 } });
    const e = computeEarliest(inp, resolveRules(cfg, "shipping", null, null)!);
    expect(e.date).toBe("2026-10-14");
    expect(e.minMinutes).toBe(12 * 60);
  });
});
