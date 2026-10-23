import { describe, expect, it } from "vitest";
import { applyBusinessPreset, applyCountry, applyWizard, defaultSettings, sixDays, wizardSuggestion } from "../core/defaults";
import { attributeDate, formatDate, formatShopperDate } from "../core/dateformat";
import { onAccent } from "../core/color";
import { holidayClosures } from "../core/holidays";
import { regionDefaults } from "../core/regions";
import { weekOrder } from "../core/i18n/week";
import { applyPlan, hasFeature, toStorefrontConfig } from "../core/publish";
import { firstAvailableDate, checkSelection } from "../core/engine";
import { holidayClosuresFor } from "../app/services/holidays.server";
import { validateSettings } from "../app/services/settings-schema.server";
import { input } from "./helpers";

describe("regional defaults", () => {
  it("knows weekends that are not Saturday + Sunday", () => {
    expect(regionDefaults("US")).toEqual({ workdays: [1, 2, 3, 4, 5], weekStart: 0, dateFormat: "mdy" });
    expect(regionDefaults("DE")).toEqual({ workdays: [1, 2, 3, 4, 5], weekStart: 1, dateFormat: "dmy" });
    expect(regionDefaults("SA").workdays).toEqual([0, 1, 2, 3, 4]);
    expect(regionDefaults("IL").workdays).toEqual([0, 1, 2, 3, 4]);
    expect(regionDefaults("AE").workdays).toEqual([1, 2, 3, 4, 5]);
    expect(regionDefaults("IR").workdays).toEqual([6, 0, 1, 2, 3]);
    expect(regionDefaults("EG").weekStart).toBe(6);
    expect(regionDefaults("JP").dateFormat).toBe("ymd");
    expect(regionDefaults(null).workdays).toEqual([1, 2, 3, 4, 5]);
  });

  it("new stores get their country's working days, week start and public holidays", () => {
    const s = defaultSettings("SA");
    expect(s.methods.shipping.schedule.weekdays).toEqual([0, 1, 2, 3, 4]);
    expect(s.weekStart).toBe(0);
    expect(s.holidays).toEqual([{ id: "hs_sa", country: "SA", region: null, methods: "all", locations: "all", skip: [] }]);
    expect(s.dateFormat).toBe("auto");
    expect(validateSettings(s).ok).toBe(true);
    expect(defaultSettings(null).holidays).toEqual([]);
  });

  it("six-day presets add the first day off after the working days", () => {
    expect(sixDays([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(sixDays([0, 1, 2, 3, 4])).toEqual([0, 1, 2, 3, 4, 5]);
    const bakery = applyBusinessPreset(defaultSettings("IL"), "bakery");
    expect(bakery.methods.pickup.schedule.weekdays).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("changing the country swaps holidays and optionally working days", () => {
    const us = defaultSettings("US");
    const ae = applyCountry(us, "AE", { workdays: false, dateFormat: true });
    expect(ae.holidays.map((h) => h.country)).toEqual(["AE"]);
    expect(ae.methods.shipping.schedule.weekdays).toEqual(us.methods.shipping.schedule.weekdays);
    expect(ae.dateFormat).toBe("dmy");
    const sa = applyCountry(us, "SA", { workdays: true, dateFormat: false });
    expect(sa.methods.delivery.schedule.weekdays).toEqual([0, 1, 2, 3, 4]);
    expect(sa.dateFormat).toBe("auto");
    // Same country again keeps skipped holidays.
    const skipped = { ...us, holidays: [{ ...us.holidays[0], skip: ["12-25"] }] };
    expect(applyCountry(skipped, "US", { workdays: false, dateFormat: false }).holidays[0].skip).toEqual(["12-25"]);
  });

  it("week order follows the store setting when set", () => {
    expect(weekOrder("en-US", 1)[0]).toBe(1);
    expect(weekOrder("de", 0)[0]).toBe(0);
    expect(weekOrder("de", null)[0]).toBe(1);
  });
});

describe("date format", () => {
  it("writes each format", () => {
    expect(formatDate("2026-03-07", "mdy", "en")).toBe("03/07/2026");
    expect(formatDate("2026-03-07", "dmy", "en")).toBe("07/03/2026");
    expect(formatDate("2026-03-07", "ymd", "en")).toBe("2026-03-07");
    expect(formatDate("2026-03-07", "long", "en-US")).toBe("March 7, 2026");
    expect(formatDate("2026-03-07", "auto", "de")).toBe("Samstag, 7. März");
  });
  it("keeps the ISO date in brackets for snippets, without repeating it", () => {
    expect(attributeDate("2026-12-31", "mdy", "en")).toBe("12/31/2026 (2026-12-31)");
    expect(attributeDate("2026-12-31", "ymd", "en")).toBe("2026-12-31");
  });
  it("adds the weekday for shoppers", () => {
    expect(formatShopperDate("2026-03-07", "dmy", "en", () => "x")).toBe("Sat 07/03/2026");
    expect(formatShopperDate("2026-03-07", "auto", "en", () => "Sat, 7 Mar")).toBe("Sat, 7 Mar");
  });
});

describe("accent contrast", () => {
  it("uses dark text on light accents", () => {
    expect(onAccent("#2c6ecb")).toBe("#ffffff");
    expect(onAccent("#ffd700")).toBe("#111111");
    expect(onAccent("#ffffff")).toBe("#111111");
    expect(onAccent("#000000")).toBe("#ffffff");
    expect(onAccent("bad")).toBe("#ffffff");
  });
});

describe("public holiday sets", () => {
  const set = { id: "hs_us", country: "US", region: null, methods: "all" as const, locations: "all" as const, skip: [] as string[] };

  it("renew every year: next year's Christmas is closed without any action", () => {
    const closures = holidayClosuresFor([set], "2027-10-01", "2028-12-31", "en");
    const xmas = closures.filter((c) => c.label === "Christmas Day").map((c) => c.start);
    expect(xmas).toEqual(["2027-12-25", "2028-12-25"]);
    expect(closures.every((c) => c.kind === "holiday" && c.id.startsWith("hol:hs_us:"))).toBe(true);
  });

  it("skipping a holiday keeps the store open that day in every year", () => {
    const items = [
      { key: "12-25", date: "2026-12-25", end: "2026-12-25", name: "Christmas Day", mayShift: false },
      { key: "01-01", date: "2027-01-01", end: "2027-01-01", name: "New Year's Day", mayShift: false },
    ];
    expect(holidayClosures({ ...set, skip: ["12-25"] }, items).map((c) => c.start)).toEqual(["2027-01-01"]);
  });

  it("closes the day for shoppers once published", () => {
    const s = defaultSettings("US");
    s.methods.shipping.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
    s.methods.shipping.schedule.lead = { amount: 0, unit: "days", workingDays: false };
    s.methods.shipping.schedule.cutoff.time = null;
    const today = "2026-12-24";
    const cfg = toStorefrontConfig(s, {
      version: 1, timeZone: "America/New_York", primaryLocale: "en", plan: "free", overLimit: false, currency: "USD", debugUntil: null, today,
      holidayClosures: holidayClosuresFor(s.holidays, today, "2027-01-31", "en"),
    });
    const r = checkSelection(input(cfg, { now: { date: today, minutes: 600 } }), "2026-12-25", null);
    expect(r.ok).toBe(false);
    expect(firstAvailableDate(input(cfg, { now: { date: "2026-12-25", minutes: 600 } }))).toBe("2026-12-26");
  });
});

describe("plans", () => {
  it("free stores get every scheduling basic, not limits", () => {
    for (const f of ["allMethods", "slots", "closures", "holidays", "notes"]) expect(hasFeature("free", f)).toBe(true);
    expect(hasFeature("free", "capacity")).toBe(false);
    expect(hasFeature("starter", "capacity")).toBe(true);
    const s = defaultSettings("DE");
    s.methods.delivery.enabled = true;
    s.methods.pickup.enabled = true;
    s.methods.delivery.capacity.maxPerDay = 3;
    const free = applyPlan(s, "free");
    expect(free.methods.delivery.enabled && free.methods.pickup.enabled).toBe(true);
    expect(free.methods.delivery.capacity.maxPerDay).toBeNull();
  });
});

describe("setup wizard", () => {
  it("suggests the country's days and the business type's lead time", () => {
    const s = defaultSettings(null);
    const sug = wizardSuggestion(s, "SA", "bakery");
    expect(sug.workdays).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sug.methods).toEqual(["pickup", "delivery"]);
    expect(sug.lead).toEqual({ amount: 1, unit: "days" });
  });

  it("turns the answers into valid settings that work for shoppers at once", () => {
    const s = defaultSettings(null);
    const next = applyWizard(s, {
      country: "US",
      businessType: "florist",
      methods: ["delivery", "pickup"],
      workdays: [1, 2, 3, 4, 5, 6],
      lead: { amount: 1, unit: "days" },
      cutoff: "15:00",
      holidays: true,
      pickup: { name: "Main Street", address: "1 Main St" },
    });
    expect(validateSettings(next).ok).toBe(true);
    expect(next.country).toBe("US");
    expect(next.holidays[0].country).toBe("US");
    expect(next.methods.delivery.enabled && next.methods.pickup.enabled && !next.methods.shipping.enabled).toBe(true);
    expect(next.methods.pickup.schedule.cutoff.time).toBe("15:00");
    expect(next.locations.map((l) => l.name)).toEqual(["Main Street"]);
    expect(next.methodOrder.slice(0, 2).sort()).toEqual(["delivery", "pickup"]);
    const none = applyWizard(s, { country: "DE", businessType: null, methods: [], workdays: [1, 2, 3, 4, 5], lead: { amount: 2, unit: "days" }, cutoff: null, holidays: false, pickup: null });
    expect(none.methods.shipping.enabled).toBe(true);
    expect(none.holidays).toEqual([]);
  });
});
