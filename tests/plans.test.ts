import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultSettings } from "../core/defaults";
import {
  ALL_BILLING_NAMES,
  GRACE_FRACTION,
  PAID_PLAN_IDS,
  PLANS,
  PLAN_FEATURES,
  TRIAL_DAYS,
  billingName,
  formatUsd,
  fromBillingName,
  graceLimit,
  minPlanFor,
  usageState,
  yearlyPerMonth,
} from "../core/plans";
import { applyPlan, hasFeature, PLAN_ORDER_LIMIT } from "../core/publish";
import type { Closure } from "../core/types";

const ROOT = join(__dirname, "..");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? filesUnder(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("plans", () => {
  it("every feature applyPlan gates exists in the plan sets", () => {
    const src = readFileSync(join(ROOT, "core/publish.ts"), "utf8");
    const gated = [...src.matchAll(/f\.has\("([A-Za-z]+)"\)/g)].map((m) => m[1]);
    expect(gated.length).toBeGreaterThan(5);
    for (const f of gated) expect(PLAN_FEATURES.pro.has(f), f).toBe(true);
  });

  it("every feature checked in the app and core exists in the plan sets", () => {
    const files = [...filesUnder(join(ROOT, "app")), ...filesUnder(join(ROOT, "core"))];
    const used = new Set<string>();
    for (const file of files) {
      for (const m of readFileSync(file, "utf8").matchAll(/hasFeature\([^,()]+,\s*"([A-Za-z]+)"\)/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    for (const f of used) expect(PLAN_FEATURES.pro.has(f), f).toBe(true);
  });

  it("plans include the lower plans' features", () => {
    for (const f of PLAN_FEATURES.free) expect(PLAN_FEATURES.starter.has(f)).toBe(true);
    for (const f of PLAN_FEATURES.starter) expect(PLAN_FEATURES.pro.has(f)).toBe(true);
    expect(hasFeature("starter", "production")).toBe(true);
    expect(hasFeature("starter", "importExport")).toBe(true);
    expect(hasFeature("starter", "shareCodes")).toBe(false);
    expect(hasFeature("starter", "productBasics")).toBe(true);
    expect(hasFeature("starter", "productRules")).toBe(false);
    expect(minPlanFor("production")).toBe("Starter");
    expect(minPlanFor("shareCodes")).toBe("Pro");
  });

  it("prices: yearly is about 10 times monthly (2 months free)", () => {
    expect(PLANS.starter.monthly).toBe(4.99);
    expect(PLANS.starter.yearly).toBe(49);
    expect(PLANS.pro.monthly).toBe(9.99);
    expect(PLANS.pro.yearly).toBe(99);
    for (const p of PAID_PLAN_IDS) {
      expect(Math.abs(PLANS[p].yearly - PLANS[p].monthly * 10)).toBeLessThan(1);
    }
    expect(formatUsd(yearlyPerMonth("starter"))).toBe("$4.08");
    expect(formatUsd(yearlyPerMonth("pro"))).toBe("$8.25");
    expect(formatUsd(PLANS.starter.monthly)).toBe("$4.99");
    expect(formatUsd(49)).toBe("$49");
    expect(TRIAL_DAYS).toBe(14);
    expect(PLAN_ORDER_LIMIT).toEqual({ free: 30, starter: 500, pro: null });
  });

  it("billing names round-trip", () => {
    expect(ALL_BILLING_NAMES).toEqual(["Starter", "Starter yearly", "Pro", "Pro yearly"]);
    for (const p of PAID_PLAN_IDS) {
      for (const i of ["monthly", "yearly"] as const) expect(fromBillingName(billingName(p, i))).toEqual({ plan: p, interval: i });
    }
    expect(fromBillingName(null)).toEqual({ plan: "free", interval: null });
    expect(fromBillingName("Something else").plan).toBe("free");
  });

  it("applies the Free closure limit (first 10 by start date that still matter)", () => {
    const s = defaultSettings("US");
    const c = (id: string, start: string, kind: Closure["kind"] = "blackout"): Closure => ({ id, label: "", start, end: start, yearly: false, methods: "all", locations: "all", kind });
    s.closures = [
      c("old", "2026-01-05"),
      ...Array.from({ length: 12 }, (_, i) => c(`d${i}`, `2026-05-${String(20 - i).padStart(2, "0")}`)),
      c("hol", "2026-12-25", "holiday"),
    ];
    s.specialDays = [{ id: "o", date: "2026-05-30", label: "", methods: "all", locations: "all", slots: null, maxPerDay: null }];
    const free = applyPlan(s, "free", "2026-03-01");
    expect(free.closures).toHaveLength(10);
    expect(free.closures.map((x) => x.id)).not.toContain("old");
    expect(free.closures.map((x) => x.id)).not.toContain("hol");
    // The earliest dates win: 9 to 18 May; 19 and 20 May are dropped.
    expect(free.closures.map((x) => x.start).sort()[0]).toBe("2026-05-09");
    expect(free.closures.map((x) => x.start)).not.toContain("2026-05-20");
    expect(free.specialDays).toEqual([]);
    const starter = applyPlan(s, "starter", "2026-03-01");
    expect(starter.closures).toHaveLength(14);
    expect(starter.specialDays).toHaveLength(1);
  });

  it("splits product rules: exclusions and extra lead on Starter, the rest on Pro", () => {
    const s = defaultSettings("US");
    s.productRules.exclude.tags = ["gift-card"];
    s.productRules.extraLead = [{ id: "x", target: { products: ["1"], variants: [], collections: [], tags: [] }, days: 2 }];
    s.productRules.limits = [{ id: "l" } as never];
    const free = applyPlan(s, "free");
    expect(free.productRules.exclude.tags).toEqual([]);
    expect(free.productRules.extraLead).toEqual([]);
    const starter = applyPlan(s, "starter");
    expect(starter.productRules.exclude.tags).toEqual(["gift-card"]);
    expect(starter.productRules.extraLead).toHaveLength(1);
    expect(starter.productRules.limits).toEqual([]);
    expect(applyPlan(s, "pro").productRules.limits).toHaveLength(1);
  });

  it("soft cap: extras pause only past limit + 20%", () => {
    expect(GRACE_FRACTION).toBe(0.2);
    expect(graceLimit(30)).toBe(36);
    expect(graceLimit(500)).toBe(600);
    expect(usageState(29, 30)).toMatchObject({ over: false, paused: false });
    expect(usageState(30, 30)).toMatchObject({ over: true, paused: false, graceLeft: 6 });
    expect(usageState(36, 30)).toMatchObject({ over: true, paused: true, graceLeft: 0 });
    expect(usageState(9999, null)).toMatchObject({ limit: null, over: false, paused: false });
  });
});
