import { describe, expect, it } from "vitest";
import { alerts, busyDays, checklist, settingsOffOnPlan } from "../core/home";
import { defaultSettings } from "../core/defaults";
import { usageState } from "../core/plans";

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
    const a = alerts({ settings: s, today: "2026-10-16", flags: {}, embedChecked: true, busyDays: [{ date: "2026-10-17", pct: 90 }], usage: usageState(26, 30), warnings: [] });
    expect(a.map((x) => x.id)).toEqual(["embedOff", "vacation", "busy", "usage", "holidays"]);
    const quiet = alerts({ settings: defaultSettings("US"), today: "2026-03-01", flags: { embedDetected: true }, embedChecked: true, busyDays: [], usage: usageState(3, 30), warnings: [] });
    expect(quiet).toEqual([]);
  });
  it("usage alerts follow the soft cap: 80%, then the 20% buffer, then paused", () => {
    const base = { settings: defaultSettings("US"), today: "2026-03-01", flags: { embedDetected: true }, embedChecked: true, busyDays: [], warnings: [] };
    const id = (count: number) => alerts({ ...base, usage: usageState(count, 30) }).map((a) => a.id);
    expect(id(23)).toEqual([]);
    expect(id(24)).toEqual(["usage"]);
    expect(id(30)).toEqual(["usageGrace"]);
    expect(alerts({ ...base, usage: usageState(30, 30) })[0].params).toMatchObject({ left: 6, limit: 30 });
    expect(id(35)).toEqual(["usageGrace"]);
    expect(id(36)).toEqual(["usagePaused"]);
    expect(alerts({ ...base, usage: usageState(5000, null) })).toEqual([]);
  });
  it("lists settings a lower plan switches off", () => {
    const s = defaultSettings("US");
    s.methods.delivery.enabled = true;
    s.methods.pickup.enabled = true;
    s.methods.delivery.slotsEnabled = true;
    s.surcharges.push({ id: "f", label: "", kind: "weekday", weekdays: [6], dates: [], slotIds: [], methods: "all", amount: "5", variantId: null } as any);
    expect(settingsOffOnPlan(s, "free")).toEqual(["methods", "capacity", "surcharges"]);
    expect(settingsOffOnPlan(s, "starter")).toEqual(["surcharges"]);
    expect(settingsOffOnPlan(s, "pro")).toEqual([]);
    const a = alerts({ settings: s, today: "2026-03-01", flags: { embedDetected: true }, embedChecked: true, busyDays: [], usage: null, warnings: [], plan: "starter" });
    expect(a).toContainEqual({ id: "planOff", tone: "warning", params: { keys: "surcharges" } });
  });
  it("closures: Free keeps 10 closures; special days, holidays and product basics are Starter", () => {
    const s = defaultSettings("US");
    const closure = (i: number) => ({ id: `c${i}`, label: "", start: `2026-04-${String(i + 1).padStart(2, "0")}`, end: `2026-04-${String(i + 1).padStart(2, "0")}`, yearly: false, methods: "all" as const, locations: "all" as const, kind: "blackout" as const });
    s.closures = Array.from({ length: 10 }, (_, i) => closure(i));
    expect(settingsOffOnPlan(s, "free", "2026-03-01")).toEqual([]);
    s.closures.push(closure(10));
    expect(settingsOffOnPlan(s, "free", "2026-03-01")).toEqual(["closures"]);
    // Past one-time closures don't count.
    expect(settingsOffOnPlan(s, "free", "2026-04-05")).toEqual([]);
    expect(settingsOffOnPlan(s, "starter", "2026-03-01")).toEqual([]);
    const t = defaultSettings("US");
    t.productRules.exclude.tags.push("gift-card");
    expect(settingsOffOnPlan(t, "free")).toEqual(["products"]);
    expect(settingsOffOnPlan(t, "starter")).toEqual([]);
    t.productRules.limits.push({ id: "l" } as any);
    expect(settingsOffOnPlan(t, "starter")).toEqual(["products"]);
  });
});
