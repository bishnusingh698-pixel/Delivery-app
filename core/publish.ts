/**
 * Turn the stored Settings document into the compact JSON published to
 * Shopify metafields (storefront widget, validation Function, delivery
 * customization Function). Pure: the server does the actual writes.
 */
import { addDays } from "./civil";
import { closureMatches } from "./engine";
import { targetIsEmpty } from "./rules";
import type { FunctionConfig } from "./checkout";
import type { Availability, Closure, PlanId, Settings, StorefrontConfig } from "./types";

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
const BASICS = ["allMethods", "slots", "closures", "holidays", "notes", "dailySummary"];
const STARTER = [...BASICS, "capacity", "checkoutMatching", "customerChanges"];

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

/**
 * Shopify gives a Function `null` for any metafield value over 10,000 bytes (Shopify's metafield
 * limits page), and a checkout check without its settings lets every order through (D-24). Every
 * metafield a Function reads stays under this budget, counted in UTF-8 bytes (D-70).
 */
export const FUNCTION_METAFIELD_MAX_BYTES = 10_000;
/** What Pickday writes at most: a margin under Shopify's limit. */
export const FUNCTION_CONFIG_BUDGET = 9_500;

/** Size of a metafield value as Shopify counts it (UTF-8 bytes of the JSON text). */
export const utf8Bytes = (v: unknown): number => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v)).length;

/** What the validation Function reads: the date engine's fields plus areas and its own texts. Nothing for display. */
export function toFunctionConfig(c: StorefrontConfig): FunctionConfig {
  const texts: StorefrontConfig["texts"] = {};
  for (const [loc, map] of Object.entries(c.texts)) {
    const picked: Record<string, string> = {};
    for (const k of FUNCTION_TEXT_KEYS) if (map[k]) picked[k] = map[k];
    if (Object.keys(picked).length) texts[loc] = picked;
  }
  return {
    tz: c.tz,
    dateMode: c.dateMode,
    methods: c.methods,
    locations: c.locations.map((l) => ({ ...l, name: "", address: "", mapUrl: "", instructions: {} })),
    closures: c.closures.map((x) => ({ ...x, label: "" })),
    specialDays: c.specialDays.map((x) => ({ ...x, label: "" })),
    vacation: { ...c.vacation, message: {} },
    zones: c.zones,
    areas: c.areas.map((a) => ({ ...a, areas: a.areas.map((x) => ({ id: x.id, names: {} })) })),
    // Product names are not needed for validation; collection lists are replaced by inCollections().
    productRules: { ...c.productRules, collectionProducts: {} },
    surcharges: c.surcharges,
    texts,
  };
}

/** How much of the checkout check fits in Shopify's limit, best first (D-70). */
export const FUNCTION_LEVELS = ["full", "noCounts", "noAreas", "noTexts", "dateOnly", "off"] as const;
export type FunctionLevel = (typeof FUNCTION_LEVELS)[number];

export interface FunctionExtras {
  avail?: Availability | null;
  tzShift?: Record<string, number>;
  timeChecks?: number[];
  embedOff?: boolean;
}

/**
 * The validation Function's config, as complete as fits in `budget` bytes. Each step drops the part
 * whose loss is safest: the capacity counts (the Function then skips the "full" check, D-11), postcode
 * areas and zones (`trimmed`), the merchant's own message wording (Shopify's defaults are used), then
 * everything but "is a date chosen?" (`dateOnly`). "off" (nothing fits) lets checkout through, as before.
 */
export function fitFunctionConfig(c: StorefrontConfig, extras: FunctionExtras = {}, budget = FUNCTION_CONFIG_BUDGET): { config: FunctionConfig | { off: true }; level: FunctionLevel; bytes: number } {
  const base = toFunctionConfig(c);
  const add = (cfg: FunctionConfig): FunctionConfig => ({
    ...cfg,
    ...(extras.tzShift && Object.keys(extras.tzShift).length ? { tzShift: extras.tzShift } : {}),
    ...(extras.timeChecks ? { timeChecks: extras.timeChecks } : {}),
    ...(extras.embedOff ? { embedOff: true } : {}),
  });
  const noAreas: FunctionConfig = { ...base, trimmed: true, areas: base.areas.map((a) => ({ ...a, postcodes: [], areas: [], mode: "none" as const })), zones: [] };
  const noTexts: FunctionConfig = { ...noAreas, texts: {} };
  const dateOnly: FunctionConfig = {
    ...noTexts,
    dateOnly: true,
    methods: base.methods.map((m) => ({ ...m, names: {}, capacity: { ...m.capacity, slots: [], overrides: [], maxPerWeekday: null } })),
    locations: [],
    closures: [],
    specialDays: [],
    // Which products need a date stays: without it a product that needs none could be asked for one.
    productRules: { ...base.productRules, extraLead: [], restrictions: [], limits: [] },
    surcharges: [],
  };
  const steps: [FunctionLevel, FunctionConfig][] = [
    ["noCounts", add(base)],
    ["noAreas", add(noAreas)],
    ["noTexts", add(noTexts)],
    ["dateOnly", add(dateOnly)],
  ];
  if (extras.avail) steps.unshift(["full", { ...add(base), avail: extras.avail }]);
  for (const [level, config] of steps) {
    const bytes = utf8Bytes(config);
    if (bytes <= budget) return { config, level: level === "noCounts" && !extras.avail ? "full" : level, bytes };
  }
  const off = { off: true as const };
  return { config: off, level: "off", bytes: utf8Bytes(off) };
}

/** Is a closure active on any of the next `days` days? (used for warnings) */
export function closureHitsWindow(c: Settings["closures"][number], today: string, days: number): boolean {
  for (let i = 0; i <= days; i++) if (closureMatches(c, addDays(today, i))) return true;
  return false;
}

/** Shopify's limit for a list in a Function input query (field arguments and variables). */
export const FUNCTION_LIST_MAX = 100;

/**
 * Every tag and collection id used by product rules: the validation Function's input query
 * variables (hasTags / inCollections). At most 100 of each (Shopify's list limit) and, together,
 * within the Function metafield budget (D-70). Rules on tags or collections past that are only
 * applied by the cart widget.
 */
export function ruleVariables(cfg: Pick<StorefrontConfig, "productRules">, budget = FUNCTION_CONFIG_BUDGET - 200) {
  const tags = new Set<string>();
  const cols = new Set<string>();
  const pr = cfg.productRules;
  const targets = [pr.exclude, ...pr.extraLead.map((r) => r.target), ...pr.restrictions.map((r) => r.target), ...pr.limits.map((r) => r.target), ...pr.methodOnly.map((r) => r.target)];
  for (const t of targets) {
    if (targetIsEmpty(t)) continue;
    t.tags.forEach((g) => tags.add(g));
    t.collections.forEach((c) => cols.add(`gid://shopify/Collection/${c}`));
  }
  const out = { ruleTags: [...tags].slice(0, FUNCTION_LIST_MAX), ruleCollections: [...cols].slice(0, FUNCTION_LIST_MAX) };
  while (utf8Bytes(out) > budget && (out.ruleTags.length || out.ruleCollections.length)) {
    if (out.ruleTags.length >= out.ruleCollections.length) out.ruleTags.pop();
    else out.ruleCollections.pop();
  }
  return out;
}

/** Delivery customization Function config: only what it needs. */
export function deliveryConfig(config: StorefrontConfig, settings: Settings) {
  return {
    enabled: config.checkoutMatching.enabled,
    rename: config.checkoutMatching.renameWithDate,
    renameShipping: settings.checkoutMatching.renameShipping,
    rateMap: settings.checkoutMatching.rateMap.map((r) => ({ title: r.title.trim().toLowerCase(), method: r.method })),
    locations: config.locations.map((l) => ({ id: l.id, name: l.name })),
    names: Object.fromEntries(config.methods.map((m) => [m.id, m.names])),
    texts: Object.fromEntries(
      Object.entries(config.texts).map(([loc, map]) => [
        loc,
        Object.fromEntries(Object.entries(map).filter(([k]) => k.startsWith("checkout."))),
      ]),
    ),
  };
}

/**
 * The delivery customization config under Shopify's 10,000-byte Function metafield limit (D-70):
 * the merchant's own checkout wording goes first, then method names (Shopify's rate names stay).
 * If even the rate map doesn't fit, checkout matching is switched off rather than half-applied.
 */
export function fitDeliveryConfig(cfg: ReturnType<typeof deliveryConfig>, budget = FUNCTION_CONFIG_BUDGET): ReturnType<typeof deliveryConfig> {
  for (const c of [cfg, { ...cfg, texts: {} }, { ...cfg, texts: {}, names: {} }]) if (utf8Bytes(c) <= budget) return c;
  return { ...cfg, enabled: false, rateMap: [], locations: [], texts: {}, names: {} };
}
