/**
 * Turn the stored Settings document into the compact JSON published to
 * Shopify metafields (storefront widget, validation Function, delivery
 * customization Function). Pure: the server does the actual writes.
 */
import { addDays } from "./civil";
import { closureMatches } from "./engine";
import type { Closure, PlanId, Settings, StorefrontConfig } from "./types";

export interface PublishMeta {
  version: number;
  timeZone: string;
  primaryLocale: string;
  plan: PlanId;
  overLimit: boolean;
  currency: string;
  debugUntil: string | null;
  /** Today in the store zone; past one-time closures before this are dropped. */
  today: string;
  /** Public holidays of the holiday sets, already expanded for the booking window (core/holidays.ts). */
  holidayClosures?: Closure[];
}

/** Features each plan unlocks (also used by the admin for lock badges). */
const BASICS = ["allMethods", "slots", "closures", "holidays", "notes"];
const STARTER = [...BASICS, "capacity", "checkoutMatching"];

/**
 * Every plan gets a correct picker: all methods, time slots, holidays, closures and notes.
 * Starter sells limits (no overbooking) and checkout matching; Pro the advanced rules and tools.
 */
export const PLAN_FEATURES: Record<PlanId, Set<string>> = {
  free: new Set(BASICS),
  starter: new Set(STARTER),
  pro: new Set([
    ...STARTER,
    "unlimitedLocations", "areas", "productRules", "dateMode", "surcharges", "production", "bulkReschedule",
    "routeSheet", "calendarFeed", "flow", "customCss", "importExport",
  ]),
};

export const PLAN_ORDER_LIMIT: Record<PlanId, number | null> = { free: 50, starter: 500, pro: null };
export const PLAN_LOCATION_LIMIT: Record<PlanId, number | null> = { free: 1, starter: 3, pro: null };

export function hasFeature(plan: PlanId, feature: string): boolean {
  return PLAN_FEATURES[plan].has(feature);
}

/**
 * Apply plan limits so a downgraded store keeps working with the features it
 * still pays for. Data is never deleted, only switched off in the published copy.
 */
export function applyPlan(s: Settings, plan: PlanId): Settings {
  const out: Settings = JSON.parse(JSON.stringify(s));
  const f = PLAN_FEATURES[plan];
  if (!f.has("allMethods")) {
    // Free: keep only the first enabled method in display order.
    const first = out.methodOrder.find((id) => out.methods[id].enabled);
    for (const id of out.methodOrder) out.methods[id].enabled = id === first;
  }
  if (!f.has("slots")) for (const m of Object.values(out.methods)) m.slotsEnabled = false;
  if (!f.has("capacity")) {
    for (const m of Object.values(out.methods)) {
      m.capacity.maxPerDay = null;
      m.capacity.maxPerWeekday = null;
      m.capacity.overrides = [];
      m.capacity.slots = m.capacity.slots.map((x) => ({ ...x, max: null }));
    }
  }
  if (!f.has("closures")) {
    out.closures = [];
    out.specialDays = [];
  }
  if (!f.has("holidays")) out.holidays = [];
  if (!f.has("notes")) out.notes.enabled = false;
  if (!f.has("checkoutMatching")) out.checkoutMatching.enabled = false;
  if (!f.has("areas")) {
    out.areas = [];
    out.zones = [];
  }
  if (!f.has("productRules")) {
    out.productRules.restrictions = [];
    out.productRules.limits = [];
    out.productRules.methodOnly = [];
    out.productRules.extraLead = [];
  }
  if (!f.has("dateMode")) out.dateMode = "order";
  if (!f.has("surcharges")) out.surcharges = [];
  if (!f.has("customCss")) out.widget.customCss = "";
  const locLimit = PLAN_LOCATION_LIMIT[plan];
  if (locLimit !== null) {
    let n = 0;
    for (const l of out.locations) {
      if (l.enabled) n++;
      if (n > locLimit) l.enabled = false;
    }
  }
  return out;
}

export function toStorefrontConfig(settings: Settings, meta: PublishMeta): StorefrontConfig {
  const s = applyPlan(settings, meta.plan);
  const keepClosure = (c: Settings["closures"][number]) => c.yearly || c.end >= addDays(meta.today, -1);
  return {
    v: meta.version,
    tz: meta.timeZone,
    primaryLocale: meta.primaryLocale,
    plan: meta.plan,
    overLimit: meta.overLimit,
    dateMode: s.dateMode,
    methods: s.methodOrder.map((id) => ({ id, ...s.methods[id] })),
    defaultMethod: s.defaultMethod,
    locations: s.locations,
    closures: [...s.closures.filter(keepClosure), ...(s.holidays.length ? meta.holidayClosures ?? [] : [])],
    specialDays: s.specialDays.filter((d) => d.date >= addDays(meta.today, -1)),
    vacation: s.vacation,
    areas: s.areas,
    zones: s.zones,
    productRules: s.productRules,
    surcharges: s.surcharges.filter((f) => f.variantId),
    dateFormat: s.dateFormat,
    weekStart: s.weekStart,
    notes: s.notes,
    checkoutMatching: { enabled: s.checkoutMatching.enabled, renameWithDate: s.checkoutMatching.renameWithDate },
    widget: s.widget,
    texts: s.texts,
    debugUntil: meta.debugUntil,
    currency: meta.currency,
  };
}

/** Text keys the Functions may need merchant overrides for. */
export const FUNCTION_TEXT_KEYS = [
  "area.notCovered",
  "validation.missingDate",
  "validation.missingItemDate",
  "validation.dateUnavailable",
  "validation.methodUnavailable",
  "validation.minOrder",
  "validation.surcharge",
  "checkout.renameDate",
  "checkout.renamePickup",
];

/** Shrink the config for Function input limits (see DECISIONS D-11). */
export function toFunctionConfig(c: StorefrontConfig, maxBytes = 20000): StorefrontConfig & { trimmed?: boolean } {
  const texts: StorefrontConfig["texts"] = {};
  for (const [loc, map] of Object.entries(c.texts)) {
    const picked: Record<string, string> = {};
    for (const k of FUNCTION_TEXT_KEYS) if (map[k]) picked[k] = map[k];
    if (Object.keys(picked).length) texts[loc] = picked;
  }
  const out: StorefrontConfig & { trimmed?: boolean } = {
    ...c,
    texts,
    widget: { ...c.widget, customCss: "", drawerSelector: "" },
    locations: c.locations.map((l) => ({ ...l, address: "", mapUrl: "", instructions: {} })),
    areas: c.areas.map((a) => ({ ...a, areas: a.areas.map((x) => ({ id: x.id, names: {} })) })),
    // Product names are not needed for validation; collection lists are replaced by inCollections().
    productRules: { ...c.productRules, collectionProducts: {} },
  };
  if (JSON.stringify(out).length > maxBytes) {
    out.trimmed = true;
    out.areas = out.areas.map((a) => ({ ...a, postcodes: [], mode: "none" as const }));
    out.zones = [];
  }
  return out;
}

/** Is a closure active on any of the next `days` days? (used for warnings) */
export function closureHitsWindow(c: Settings["closures"][number], today: string, days: number): boolean {
  for (let i = 0; i <= days; i++) if (closureMatches(c, addDays(today, i))) return true;
  return false;
}
