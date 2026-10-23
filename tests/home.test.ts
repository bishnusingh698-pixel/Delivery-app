import { describe, expect, it } from "vitest";
import { alerts, busyDays, settingsOffOnPlan, settingsStatus, setupGuide } from "../core/home";
import { defaultSettings } from "../core/defaults";
import { usageState } from "../core/plans";

describe("home", () => {
  it("setup guide: steps in order, live status, x of y counts required steps only", () => {
    const s = defaultSettings("US");
    s.methods.pickup.enabled = false;
    const g = setupGuide(s, {}, "free");
    expect(g.steps.map((x) => x.id)).toEqual(["embed", "methods", "schedule", "preview", "testOrder", "checkout", "digest"]);
    expect(g.steps.filter((x) => x.optional).map((x) => x.id)).toEqual(["checkout", "digest"]);
    expect(g).toMatchObject({ done: 0, total: 5, complete: false });
    // Optional steps are locked on Free, with the feature that unlocks them; never hidden.
    expect(g.steps.find((x) => x.id === "checkout")).toMatchObject({ lockedFeature: "checkoutMatching", done: false });
    expect(g.steps.find((x) => x.id === "digest")).toMatchObject({ lockedFeature: "digest" });

    const flags = { embedDetected: true, methodsSaved: true, scheduleSaved: true, previewed: true };
    const almost = setupGuide(s, flags, "free");
    expect(almost).toMatchObject({ done: 4, total: 5, complete: false });
    const done = setupGuide(s, { ...flags, firstOrderAt: "2026-10-20T10:00:00Z" }, "free");
    expect(done).toMatchObject({ done: 5, total: 5, complete: true });
  });
  it("setup guide: pickup adds the location step; the first order also counts as previewed", () => {
    const s = defaultSettings("US");
    s.methods.pickup.enabled = true;
    const g = setupGuide(s, { firstOrderAt: "x" }, "pro");
    expect(g.steps.map((x) => x.id)).toEqual(["embed", "methods", "schedule", "pickupLocation", "preview", "testOrder", "checkout", "digest"]);
    expect(g.steps.find((x) => x.id === "pickupLocation")?.done).toBe(false);
    expect(g.steps.find((x) => x.id === "preview")?.done).toBe(true);
    s.locations.push({ id: "l1", shopifyLocationId: null, name: "Main shop", address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null });
    expect(setupGuide(s, {}, "pro").steps.find((x) => x.id === "pickupLocation")?.done).toBe(true);
    // Methods need a saved choice, not just the defaults.
    expect(setupGuide(s, {}, "pro").steps.find((x) => x.id === "methods")?.done).toBe(false);
    expect(setupGuide(s, { methodsSaved: true }, "pro").steps.find((x) => x.id === "methods")?.done).toBe(true);
    // Optional steps on a plan that includes them.
    s.checkoutMatching.enabled = true;
    s.notifications.digest.enabled = true;
    const pro = setupGuide(s, {}, "pro");
    expect(pro.steps.filter((x) => x.optional).every((x) => x.done && !x.lockedFeature)).toBe(true);
    expect(pro.done).toBe(1);
  });
  it("settings card status: on, off, not set up", () => {
    const s = defaultSettings("US");
    s.methods.pickup.enabled = true;
    const st = settingsStatus(s, {});
    expect(st).toMatchObject({ methods: "todo", schedule: "todo", locations: "todo", closures: "off", capacity: "off", areas: "off", products: "off", checkout: "off", surcharges: "off", notifications: "off", transfer: null });
    s.methods.pickup.enabled = false;
    s.methods.delivery.enabled = true;
    s.methods.delivery.capacity.maxPerDay = 20;
    s.vacation.enabled = true;
    s.checkoutMatching.enabled = true;
    s.notifications.digest.enabled = true;
    s.productRules.exclude.tags.push("gift-card");
    expect(settingsStatus(s, { methodsSaved: true, scheduleSaved: true })).toMatchObject({ methods: "on", schedule: "on", locations: "off", closures: "on", capacity: "on", products: "on", checkout: "on", notifications: "on" });
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
