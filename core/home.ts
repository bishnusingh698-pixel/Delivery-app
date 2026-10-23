/** Home and Settings page logic (pure, tested): setup guide, card statuses and alerts. */
import { addDays } from "./civil";
import { PLAN_CLOSURE_LIMIT, hasFeature, type UsageState } from "./plans";
import { closureActive } from "./publish";
import type { PlanId, Settings } from "./types";

export type SetupStepId = "embed" | "methods" | "schedule" | "pickupLocation" | "preview" | "testOrder" | "checkout" | "digest";

export interface HomeFlags {
  embedDetected?: boolean;
  firstOrderAt?: string;
  welcomeDone?: boolean;
  holidayYearOffered?: number;
  /** Saved on the "Delivery, pickup & shipping" page, or chosen through the welcome questions. */
  methodsSaved?: boolean;
  /** Saved on the "Days & hours" page at least once. */
  scheduleSaved?: boolean;
  /** Opened the store's cart from the setup guide. */
  previewed?: boolean;
}

export interface SetupStep {
  id: SetupStepId;
  done: boolean;
  /** Optional steps don't count toward "x of y done". */
  optional: boolean;
  /** Plan feature the step needs that the current plan doesn't include (shown with a lock, never hidden). */
  lockedFeature?: string;
}

export interface SetupGuide {
  steps: SetupStep[];
  done: number;
  total: number;
  /** Every required step is done. */
  complete: boolean;
}

/** The "Set up Pickday" guide on Home (pure). The pickup location step only shows when pickup is on. */
export function setupGuide(s: Settings, flags: HomeFlags, plan: PlanId): SetupGuide {
  const anyMethod = Object.values(s.methods).some((m) => m.enabled);
  const pickup = s.methods.pickup.enabled;
  const steps: SetupStep[] = [
    { id: "embed", done: !!flags.embedDetected, optional: false },
    { id: "methods", done: anyMethod && !!flags.methodsSaved, optional: false },
    { id: "schedule", done: !!flags.scheduleSaved, optional: false },
  ];
  if (pickup) steps.push({ id: "pickupLocation", done: s.locations.some((l) => l.enabled && l.name.trim() !== ""), optional: false });
  steps.push(
    { id: "preview", done: !!flags.previewed || !!flags.firstOrderAt, optional: false },
    { id: "testOrder", done: !!flags.firstOrderAt, optional: false },
    stepFor("checkout", s.checkoutMatching.enabled, "checkoutMatching", plan),
    stepFor("digest", s.notifications.digest.enabled, "digest", plan),
  );
  const required = steps.filter((x) => !x.optional);
  const done = required.filter((x) => x.done).length;
  return { steps, done, total: required.length, complete: done === required.length };
}

function stepFor(id: SetupStepId, on: boolean, feature: string, plan: PlanId): SetupStep {
  const allowed = hasFeature(plan, feature);
  return { id, done: allowed && on, optional: true, ...(allowed ? {} : { lockedFeature: feature }) };
}

export type SettingsCardKey =
  | "methods" | "schedule" | "closures" | "locations" | "capacity" | "areas" | "products" | "checkout" | "surcharges" | "notifications" | "transfer";

/** "on": in use; "off": not used (fine); "todo": needed but not set up yet; null: a tool, no status. */
export type CardStatus = "on" | "off" | "todo" | null;

/** Status shown on each card of the Settings page (pure). */
export function settingsStatus(s: Settings, flags: HomeFlags): Record<SettingsCardKey, CardStatus> {
  const methods = Object.values(s.methods);
  const pr = s.productRules;
  const on = (v: boolean): CardStatus => (v ? "on" : "off");
  const pickup = s.methods.pickup.enabled;
  const hasLocation = s.locations.some((l) => l.enabled && l.name.trim() !== "");
  return {
    methods: methods.some((m) => m.enabled) && flags.methodsSaved ? "on" : "todo",
    schedule: flags.scheduleSaved ? "on" : "todo",
    closures: on(s.closures.length > 0 || s.specialDays.length > 0 || s.vacation.enabled),
    locations: !pickup ? "off" : hasLocation ? "on" : "todo",
    capacity: on(methods.some((m) => m.enabled && (m.slotsEnabled || m.capacity.maxPerDay !== null || (m.capacity.maxPerWeekday ?? []).some((x) => x !== null) || m.capacity.overrides.length > 0))),
    areas: on(s.areas.length > 0 || s.zones.length > 0),
    products: on(pr.exclude.products.length + pr.exclude.variants.length + pr.exclude.collections.length + pr.exclude.tags.length + pr.extraLead.length + pr.restrictions.length + pr.limits.length + pr.methodOnly.length > 0),
    checkout: on(s.checkoutMatching.enabled),
    surcharges: on(s.surcharges.length > 0),
    notifications: on(s.notifications.digest.enabled || s.notifications.emailSnippetConfirmed),
    transfer: null,
  };
}

export type AlertId = "busy" | "vacation" | "embedOff" | "usage" | "usageGrace" | "usagePaused" | "holidays" | "checkoutMismatch" | "configLarge" | "functionsMissing" | "planOff";

export interface Alert {
  id: AlertId;
  tone: "warning" | "info" | "critical";
  params?: Record<string, string | number>;
}

export function alerts(input: {
  settings: Settings;
  today: string;
  flags: HomeFlags;
  embedChecked: boolean;
  busyDays: { date: string; pct: number }[];
  /** Monthly order usage (null on unlimited plans). */
  usage: Pick<UsageState, "pct" | "count" | "limit" | "over" | "paused" | "graceLeft"> | null;
  warnings: { code: string; detail?: string }[];
  plan?: PlanId;
}): Alert[] {
  const out: Alert[] = [];
  const { settings: s, today } = input;
  if (input.embedChecked && !input.flags.embedDetected) out.push({ id: "embedOff", tone: "critical" });
  for (const w of input.warnings) {
    if (w.code === "functionsMissing" || w.code === "configLarge" || w.code === "checkoutMismatch") out.push({ id: w.code, tone: w.code === "functionsMissing" ? "critical" : "warning", params: { detail: w.detail ?? "" } });
  }
  const off = input.plan ? settingsOffOnPlan(s, input.plan, today) : [];
  if (off.length) out.push({ id: "planOff", tone: "warning", params: { keys: off.join(",") } });
  const v = s.vacation;
  if (v.enabled && (!v.end || v.end >= today)) out.push({ id: "vacation", tone: "info", params: { start: v.start ?? today, end: v.end ?? "" } });
  if (input.busyDays.length) out.push({ id: "busy", tone: "warning", params: { count: input.busyDays.length, first: input.busyDays[0].date } });
  // Soft cap (D-54): a heads-up at 80%, a stronger banner in the 20% buffer, extras paused after it.
  const u = input.usage;
  if (u && u.limit !== null) {
    const params = { pct: u.pct, count: u.count, limit: u.limit, left: u.graceLeft };
    if (u.paused) out.push({ id: "usagePaused", tone: "critical", params });
    else if (u.over) out.push({ id: "usageGrace", tone: "critical", params });
    else if (u.pct >= 80) out.push({ id: "usage", tone: "warning", params });
  }
  const next = Number(today.slice(0, 4)) + 1;
  const hasHolidays = s.closures.some((c) => c.kind === "holiday");
  const hasNextYear = s.closures.some((c) => c.kind === "holiday" && (c.yearly || c.start.startsWith(String(next))));
  const canImport = !input.plan || hasFeature(input.plan, "holidays");
  if (today.slice(5) >= "10-01" && canImport && hasHolidays && !hasNextYear && input.flags.holidayYearOffered !== next) out.push({ id: "holidays", tone: "info", params: { year: next } });
  return out;
}

/**
 * Settings pages whose saved setup the current plan switches off (after a downgrade, or a
 * trial ending). The settings are kept and work again after an upgrade.
 */
export function settingsOffOnPlan(s: Settings, plan: PlanId, today?: string): string[] {
  const methods = Object.values(s.methods);
  const pr = s.productRules;
  const closureLimit = PLAN_CLOSURE_LIMIT[plan];
  const blackouts = s.closures.filter((c) => c.kind !== "holiday" && (!today || closureActive(c, today))).length;
  const exclude = pr.exclude.products.length + pr.exclude.variants.length + pr.exclude.collections.length + pr.exclude.tags.length;
  const checks: [string, string, boolean][] = [
    ["methods", "allMethods", methods.filter((m) => m.enabled).length > 1],
    ["capacity", "slots", methods.some((m) => m.slotsEnabled)],
    ["capacity", "capacity", methods.some((m) => m.capacity.maxPerDay !== null || m.capacity.overrides.length > 0)],
    ["closures", "unlimitedClosures", closureLimit !== null && blackouts > closureLimit],
    ["closures", "specialDays", s.specialDays.length > 0],
    ["closures", "holidays", s.closures.some((c) => c.kind === "holiday")],
    ["areas", "areas", s.areas.length > 0 || s.zones.length > 0],
    ["products", "productBasics", exclude + pr.extraLead.length > 0],
    ["products", "productRules", pr.restrictions.length + pr.limits.length + pr.methodOnly.length > 0],
    ["surcharges", "surcharges", s.surcharges.length > 0],
    ["checkout", "checkoutMatching", s.checkoutMatching.enabled],
  ];
  return [...new Set(checks.filter(([, f, used]) => used && !hasFeature(plan, f)).map(([page]) => page))];
}

/** Days at or above 80% of their limit within the next 7 days. */
export function busyDays(counts: Record<string, { used: number; max: number | null }>, today: string) {
  const out: { date: string; pct: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const c = counts[d];
    if (c?.max) {
      const pct = Math.round((c.used / c.max) * 100);
      if (pct >= 80) out.push({ date: d, pct });
    }
  }
  return out;
}
