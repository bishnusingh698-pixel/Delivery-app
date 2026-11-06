/**
 * What each plan card on the Plans page (and Home) lists. Built from PLAN_FEATURES so a card can't
 * promise what the code doesn't unlock: tests/plans.test.ts checks every card against it (D-76).
 */
import { PLAN_FEATURES, PLAN_LOCATION_LIMIT, PLAN_ORDER_LIMIT } from "./publish";
import type { PlanId } from "./types";

export const PLAN_IDS: PlanId[] = ["free", "starter", "pro"];
export const PLAN_PRICES: Record<PlanId, string> = { free: "$0", starter: "$7.99", pro: "$14.99" };

/** Parts of the picker every plan has, which aren't switched by PLAN_FEATURES (nothing to lock). */
export const EVERY_PLAN = ["datePicker", "checkoutBlock", "languages", "orders"] as const;

/** Features shown by the order and location lines of a card instead of a list item. */
const SHOWN_AS_LIMITS = new Set(["unlimitedLocations"]);

/** Card order: what a merchant compares first. */
const ORDER = [
  "allMethods", "slots", "holidays", "closures", "notes", "dailySummary",
  "capacity", "checkoutMatching", "customerChanges",
  "reports", "reminders", "dayFull", "areas", "productRules", "dateMode", "surcharges", "production", "routeSheet", "bulkReschedule",
  "calendarFeed", "flow", "importExport", "customCss",
];

/** Features a plan adds over the plan below it, in card order. */
export function newIn(plan: PlanId): string[] {
  const i = PLAN_IDS.indexOf(plan);
  const below = i > 0 ? PLAN_FEATURES[PLAN_IDS[i - 1]] : new Set<string>();
  const added = [...PLAN_FEATURES[plan]].filter((f) => !below.has(f) && !SHOWN_AS_LIMITS.has(f));
  return added.sort((a, b) => rank(a) - rank(b));
}

const rank = (f: string) => {
  const i = ORDER.indexOf(f);
  return i < 0 ? ORDER.length : i;
};

export interface PlanCard {
  id: PlanId;
  price: string;
  orders: number | null;
  locations: number | null;
  /** "everythingFree" / "everythingStarter" first on paid plans. */
  includes: "everythingFree" | "everythingStarter" | null;
  features: string[];
}

export function planCards(): PlanCard[] {
  return PLAN_IDS.map((id, i) => ({
    id,
    price: PLAN_PRICES[id],
    orders: PLAN_ORDER_LIMIT[id],
    locations: PLAN_LOCATION_LIMIT[id],
    includes: i === 0 ? null : i === 1 ? "everythingFree" : "everythingStarter",
    features: i === 0 ? [...newIn(id).slice(0, 2), ...EVERY_PLAN, ...newIn(id).slice(2)] : newIn(id),
  }));
}

/** The cheapest plan that has a feature (for "part of the X plan" badges). */
export function planFor(feature: string): PlanId | null {
  return PLAN_IDS.find((p) => PLAN_FEATURES[p].has(feature)) ?? null;
}
