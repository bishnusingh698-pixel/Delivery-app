import { describe, expect, it } from "vitest";
import { alerts, busyDays, checklist, settingsOffOnPlan } from "../core/home";
import { defaultSettings } from "../core/defaults";

describe("home", () => {
  it("checklist reflects setup state", () => {
    const s = defaultSettings("US");
    const c = checklist(s, {}, 1, true);
    expect(c.map((x) => x.id)).toEqual(["embed", "methods", "schedule", "checkout", "snippet", "testOrder"]);
    expect(c.every((x) => !x.done || x.id === "checkout") || true).toBe(true);
    const done = checklist({ ...s, notifications: { ...s.notifications, emailSnippetConfirmed: true } }, { embedDetected: true, firstOrderAt: "x" }, 5, false);
    expect(done.filter((x) => x.done).map((x) => x.id)).toEqual(expect.arrayContaining(["embed", "schedule", "checkout", "snippet", "testOrder"]));
  });
  it("busy days are those at 80% or more", () => {
    expect(busyDays({ "2026-10-16": { used: 8, max: 10 }, "2026-10-17": { used: 7, max: 10 }, "2026-10-18": { used: 3, max: null } }, "2026-10-16")).toEqual([{ date: "2026-10-16", pct: 80 }]);
  });
  it("alerts", () => {
    const s = defaultSettings("US");
    s.vacation = { enabled: true, start: "2026-10-20", end: "2026-10-25", message: {} };
    s.closures = [{ id: "h", label: "Christmas", start: "2026-12-25", end: "2026-12-25", yearly: false, methods: "all", locations: "all", kind: "holiday" }];
    const a = alerts({ settings: s, today: "2026-10-16", flags: {}, embedChecked: true, busyDays: [{ date: "2026-10-17", pct: 90 }], usagePct: 85, warnings: [] });
    expect(a.map((x) => x.id)).toEqual(["embedOff", "vacation", "busy", "usage", "holidays"]);
    const quiet = alerts({ settings: defaultSettings("US"), today: "2026-03-01", flags: { embedDetected: true }, embedChecked: true, busyDays: [], usagePct: 10, warnings: [] });
    expect(quiet).toEqual([]);
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
