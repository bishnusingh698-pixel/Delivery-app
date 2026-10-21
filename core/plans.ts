/**
 * Pricing and plan limits: the single source of truth (DECISIONS D-51).
 * Used by the billing config (app/shopify.server.ts), the Plans page, feature
 * gating (core/publish.ts applyPlan, hasFeature) and usage counting. Pure.
 */
import type { PlanId } from "./types";

export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingIntervalId = "monthly" | "yearly";

export interface PlanDef {
  id: PlanId;
  /** USD per 30 days. */
  monthly: number;
  /** USD per year ("2 months free"). */
  yearly: number;
  /** Scheduled orders per calendar month (null = unlimited). */
  orderLimit: number | null;
  /** Enabled pickup locations (null = unlimited). */
  locationLimit: number | null;
  /** One-time and yearly closures in use (null = unlimited). */
  closureLimit: number | null;
  /** Features this plan unlocks (each plan lists everything, including the lower plans' features). */
  features: string[];
}

const STARTER_FEATURES = [
  "allMethods",
  "slots",
  "capacity",
  "unlimitedClosures",
  "specialDays",
  "holidays",
  "checkoutMatching",
  "noBranding",
  "ordersCalendar",
  "csvExport",
  "production",
  "productBasics",
  "importExport",
];

const PRO_FEATURES = [
  ...STARTER_FEATURES,
  "unlimitedLocations",
  "areas",
  "productRules",
  "dateMode",
  "surcharges",
  "bulkReschedule",
  "routeSheet",
  "calendarFeed",
  "flow",
  "digest",
  "shareCodes",
  "customCss",
  "prioritySupport",
];

export const PLANS: Record<PlanId, PlanDef> = {
  free: { id: "free", monthly: 0, yearly: 0, orderLimit: 30, locationLimit: 1, closureLimit: 10, features: [] },
  starter: { id: "starter", monthly: 4.99, yearly: 49, orderLimit: 500, locationLimit: 1, closureLimit: null, features: STARTER_FEATURES },
  pro: { id: "pro", monthly: 9.99, yearly: 99, orderLimit: null, locationLimit: null, closureLimit: null, features: PRO_FEATURES },
};

export const PLAN_IDS: PlanId[] = ["free", "starter", "pro"];
export const PAID_PLAN_IDS: PaidPlanId[] = ["starter", "pro"];

/** Free trial on both paid plans, monthly and yearly. */
export const TRIAL_DAYS = 14;

/** Over the monthly order limit, everything keeps working for this extra share (D-54). */
export const GRACE_FRACTION = 0.2;

/** Subscription names as Shopify stores them (keys of the billing config). */
export const BILLING_NAMES = {
  starter: { monthly: "Starter", yearly: "Starter yearly" },
  pro: { monthly: "Pro", yearly: "Pro yearly" },
} as const satisfies Record<PaidPlanId, Record<BillingIntervalId, string>>;

export type BillingName = (typeof BILLING_NAMES)[PaidPlanId][BillingIntervalId];

export const ALL_BILLING_NAMES: BillingName[] = PAID_PLAN_IDS.flatMap((p) => [BILLING_NAMES[p].monthly, BILLING_NAMES[p].yearly]);

export function billingName(plan: PaidPlanId, interval: BillingIntervalId): BillingName {
  return BILLING_NAMES[plan][interval];
}

/** Plan and interval from a Shopify subscription name. Unknown names fall back to a loose match (older names). */
export function fromBillingName(name: string | null | undefined): { plan: PlanId; interval: BillingIntervalId | null } {
  const n = (name ?? "").trim().toLowerCase();
  for (const p of PAID_PLAN_IDS) {
    for (const i of ["monthly", "yearly"] as const) if (BILLING_NAMES[p][i].toLowerCase() === n) return { plan: p, interval: i };
  }
  const interval = /year|annual/.test(n) ? "yearly" : n ? "monthly" : null;
  if (n.includes("pro")) return { plan: "pro", interval };
  if (n.includes("starter")) return { plan: "starter", interval };
  return { plan: "free", interval: null };
}

export function price(plan: PlanId, interval: BillingIntervalId): number {
  return interval === "yearly" ? PLANS[plan].yearly : PLANS[plan].monthly;
}

/** What the yearly price comes to per month, rounded to the cent (49 → 4.08). */
export function yearlyPerMonth(plan: PlanId): number {
  return Math.round((PLANS[plan].yearly / 12) * 100) / 100;
}

/** "$4.99", "$49", "$0". */
export function formatUsd(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** The cheapest plan that has a feature, for "Available on …" labels. */
export function minPlanFor(feature: string): "Starter" | "Pro" {
  return PLANS.starter.features.includes(feature) ? "Starter" : "Pro";
}

export const PLAN_FEATURES: Record<PlanId, Set<string>> = {
  free: new Set(PLANS.free.features),
  starter: new Set(PLANS.starter.features),
  pro: new Set(PLANS.pro.features),
};
export const PLAN_ORDER_LIMIT: Record<PlanId, number | null> = { free: PLANS.free.orderLimit, starter: PLANS.starter.orderLimit, pro: PLANS.pro.orderLimit };
export const PLAN_LOCATION_LIMIT: Record<PlanId, number | null> = { free: PLANS.free.locationLimit, starter: PLANS.starter.locationLimit, pro: PLANS.pro.locationLimit };
export const PLAN_CLOSURE_LIMIT: Record<PlanId, number | null> = { free: PLANS.free.closureLimit, starter: PLANS.starter.closureLimit, pro: PLANS.pro.closureLimit };

export function hasFeature(plan: PlanId, feature: string): boolean {
  return PLAN_FEATURES[plan].has(feature);
}

/** Orders a month after which the extras pause: the limit plus the 20% buffer. */
export function graceLimit(limit: number): number {
  return Math.floor(limit * (1 + GRACE_FRACTION) + 1e-9);
}

export interface UsageState {
  count: number;
  limit: number | null;
  /** Percent of the limit (can go over 100). */
  pct: number;
  /** count >= limit: the limit is reached (the buffer is in use). */
  over: boolean;
  /** Orders after which the extras pause (limit + 20%). */
  graceLimit: number | null;
  /** Orders left in the buffer before the extras pause. */
  graceLeft: number;
  /** count >= graceLimit: new orders are recorded without tags, metafield or Flow. */
  paused: boolean;
}

export function usageState(count: number, limit: number | null): UsageState {
  if (limit === null) return { count, limit: null, pct: 0, over: false, graceLimit: null, graceLeft: 0, paused: false };
  const g = graceLimit(limit);
  return {
    count,
    limit,
    pct: Math.round((count / limit) * 100),
    over: count >= limit,
    graceLimit: g,
    graceLeft: Math.max(0, g - count),
    paused: count >= g,
  };
}
