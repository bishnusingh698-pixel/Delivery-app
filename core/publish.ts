/**
 * Turn the stored Settings document into the compact JSON published to
 * Shopify metafields (storefront widget, validation Function, delivery
 * customization Function). Pure: the server does the actual writes.
 */
import { addDays } from "./civil";
import { closureMatches } from "./engine";
import { PLAN_CLOSURE_LIMIT, PLAN_FEATURES, PLAN_LOCATION_LIMIT } from "./plans";
import type { PlanId, Settings, StorefrontConfig } from "./types";

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
}

export {
  PLAN_FEATURES,
  PLAN_ORDER_LIMIT,
  PLAN_LOCATION_LIMIT,
  PLAN_CLOSURE_LIMIT,
  hasFeature,
} from "./plans";

/**
 * Apply plan limits so a downgraded store keeps working with the features it
 * still pays for. Data is never deleted, only switched off in the published copy.
 * `today` (store zone) lets the Free closure limit skip past one-time closures.
 */
export function applyPlan(s: Settings, plan: PlanId, today?: string): Settings {
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
  if (!f.has("specialDays")) out.specialDays = [];
  if (!f.has("holidays")) out.closures = out.closures.filter((c) => c.kind !== "holiday");
  const closureLimit = PLAN_CLOSURE_LIMIT[plan];
  if (closureLimit !== null) {
    // Free: the first closures by start date that still matter (past one-time closures don't count).
    const live = today ? out.closures.filter((c) => closureActive(c, today)) : out.closures;
    const keep = new Set([...live].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)).slice(0, closureLimit));
    out.closures = out.closures.filter((c) => keep.has(c));
  }
  if (!f.has("checkoutMatching")) out.checkoutMatching.enabled = false;
  if (!f.has("areas")) {
    out.areas = [];
    out.zones = [];
  }
  if (!f.has("productBasics")) {
    out.productRules.exclude = { products: [], variants: [], collections: [], tags: [] };
    out.productRules.extraLead = [];
  }
  if (!f.has("productRules")) {
    out.productRules.restrictions = [];
    out.productRules.limits = [];
    out.productRules.methodOnly = [];
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

/** A closure that still matters on or after `today` (yearly, or not yet over; one day of slack for time zones). */
export function closureActive(c: Settings["closures"][number], today: string): boolean {
  return c.yearly || c.end >= addDays(today, -1);
}

export function toStorefrontConfig(settings: Settings, meta: PublishMeta): StorefrontConfig {
  const s = applyPlan(settings, meta.plan, meta.today);
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
    closures: s.closures.filter((c) => closureActive(c, meta.today)),
    specialDays: s.specialDays.filter((d) => d.date >= addDays(meta.today, -1)),
    vacation: s.vacation,
    areas: s.areas,
    zones: s.zones,
    productRules: s.productRules,
    surcharges: s.surcharges.filter((f) => f.variantId),
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
