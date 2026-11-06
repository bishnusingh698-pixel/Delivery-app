import { describe, expect, it } from "vitest";
import { alerts, busyDays, checklist, settingsOffOnPlan } from "../core/home";
import { countryHolidaySet, defaultSettings } from "../core/defaults";

describe("home", () => {
  it("checklist reflects setup state", () => {
    const s = defaultSettings("US");
    const c = checklist(s, {}, true);
    // The setup path in the order a merchant does it: questions, app embed, test order, emails, checkout (D-79).
    expect(c.map((x) => x.id)).toEqual(["wizard", "embed", "testOrder", "snippet", "checkout"]);
    expect(c.every((x) => !x.done)).toBe(true);
    // Without checkout matching on the plan, that step isn't listed.
    const done = checklist({ ...s, notifications: { ...s.notifications, emailSnippetConfirmed: true } }, { welcomeDone: true, embedDetected: true, firstOrderAt: "x" }, false);
    expect(done.map((x) => x.id)).toEqual(["wizard", "embed", "testOrder", "snippet"]);
    expect(done.every((x) => x.done)).toBe(true);
  });
  it("with pickup on, Local pickup in Shopify is a step before the test order (D-78)", () => {
    const s = defaultSettings("US");
    s.methods.pickup.enabled = true;
    expect(checklist(s, {}, false, { pickupOk: false }).map((x) => x.id)).toEqual(["wizard", "embed", "pickupShopify", "testOrder", "snippet"]);
    expect(checklist(s, {}, false, { pickupOk: true }).find((x) => x.id === "pickupShopify")?.done).toBe(true);
    // Not known (Shopify couldn't be asked) or pickup off: not listed.
    expect(checklist(s, {}, false, { pickupOk: null }).some((x) => x.id === "pickupShopify")).toBe(false);
    s.methods.pickup.enabled = false;
    expect(checklist(s, {}, false, { pickupOk: false }).some((x) => x.id === "pickupShopify")).toBe(false);
  });
  it("busy days are those at 80% or more", () => {
    expect(busyDays({ "2026-10-16": { used: 8, max: 10 }, "2026-10-17": { used: 7, max: 10 }, "2026-10-18": { used: 3, max: null } }, "2026-10-16")).toEqual([{ date: "2026-10-16", pct: 80 }]);
  });
  it("alerts", () => {
    const s = defaultSettings("US");
    s.vacation = { enabled: true, start: "2026-10-20", end: "2026-10-25", message: {} };
    // No public holidays switched on: suggested once a year.
    s.holidays = [];
    const a = alerts({ settings: s, today: "2026-10-16", flags: {}, embedChecked: true, busyDays: [{ date: "2026-10-17", pct: 90 }], usagePct: 85, warnings: [] });
    expect(a.map((x) => x.id)).toEqual(["embedOff", "vacation", "busy", "usage", "holidays"]);
    // Holidays on: nothing to suggest.
    const withHolidays = { ...defaultSettings("US"), holidays: [countryHolidaySet("US")] };
    const quiet = alerts({ settings: withHolidays, today: "2026-03-01", flags: { embedDetected: true }, embedChecked: true, busyDays: [], usagePct: 10, warnings: [] });
    expect(quiet).toEqual([]);
    // No holiday list for the country (Kuwait): nothing to offer.
    expect(alerts({ settings: defaultSettings("KW"), today: "2026-03-01", flags: { embedDetected: true }, embedChecked: true, busyDays: [], usagePct: 10, warnings: [], holidayData: false })).toEqual([]);
    expect(alerts({ settings: s, today: "2026-10-16", flags: { holidayYearOffered: 2026 }, embedChecked: false, busyDays: [], usagePct: null, warnings: [] }).map((x) => x.id)).toEqual(["vacation"]);
  });
  it("lists settings a lower plan switches off", () => {
    const s = defaultSettings("US");
    s.methods.delivery.enabled = true;
    s.methods.pickup.enabled = true;
    s.methods.delivery.slotsEnabled = true;
    s.surcharges.push({ id: "f", label: "", kind: "weekday", weekdays: [6], dates: [], slotIds: [], methods: "all", amount: "5", variantId: null } as any);
    // Every method and time slots are on every plan now; daily limits need Starter.
    expect(settingsOffOnPlan(s, "free")).toEqual(["surcharges"]);
    s.methods.delivery.capacity.maxPerDay = 10;
    expect(settingsOffOnPlan(s, "free")).toEqual(["capacity", "surcharges"]);
    expect(settingsOffOnPlan(s, "starter")).toEqual(["surcharges"]);
    expect(settingsOffOnPlan(s, "pro")).toEqual([]);
    const a = alerts({ settings: s, today: "2026-03-01", flags: { embedDetected: true }, embedChecked: true, busyDays: [], usagePct: null, warnings: [], plan: "starter" });
    expect(a).toContainEqual({ id: "planOff", tone: "warning", params: { keys: "surcharges" } });
  });
});
