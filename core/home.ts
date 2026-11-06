/** Home page logic (pure, tested): setup checklist and alerts. */
import { addDays } from "./civil";
import { hasFeature, PLAN_LOCATION_LIMIT } from "./publish";
import type { PlanId, Settings } from "./types";

export type ChecklistId = "wizard" | "embed" | "pickupShopify" | "testOrder" | "snippet" | "checkout";

export interface HomeFlags {
  embedDetected?: boolean;
  firstOrderAt?: string;
  checkoutTested?: boolean;
  welcomeDone?: boolean;
  holidayYearOffered?: number;
}

/**
 * The setup path from install to the first dated order, in the order a merchant does it (D-79):
 * answer the setup questions → turn on the app embed → (pickup) Local pickup on in Shopify for the
 * same places → place a test order → the date in order emails → (paid) checkout matching.
 * `pickupOk` is the pickup check's result (null or undefined: not known, so the step isn't shown).
 */
export function checklist(s: Settings, flags: HomeFlags, checkoutAllowed: boolean, extra: { pickupOk?: boolean | null } = {}): { id: ChecklistId; done: boolean }[] {
  const items: { id: ChecklistId; done: boolean }[] = [
    { id: "wizard", done: !!flags.welcomeDone },
    { id: "embed", done: !!flags.embedDetected },
  ];
  if (s.methods.pickup.enabled && typeof extra.pickupOk === "boolean") items.push({ id: "pickupShopify", done: extra.pickupOk });
  items.push({ id: "testOrder", done: !!flags.firstOrderAt || !!flags.checkoutTested }, { id: "snippet", done: s.notifications.emailSnippetConfirmed });
  // Checkout matching is a paid feature: only listed when the plan has it.
  if (checkoutAllowed) items.push({ id: "checkout", done: s.checkoutMatching.enabled });
  return items;
}

export type AlertId = "busy" | "vacation" | "embedOff" | "usage" | "holidays" | "checkoutMismatch" | "configLarge" | "checkoutLimited" | "functionsMissing" | "planOff";

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
  usagePct: number | null;
  warnings: { code: string; detail?: string }[];
  plan?: PlanId;
  /** Does the holiday dataset know the store's country? (No offer when there's nothing to turn on.) */
  holidayData?: boolean;
}): Alert[] {
  const out: Alert[] = [];
  const { settings: s, today } = input;
  if (input.embedChecked && !input.flags.embedDetected) out.push({ id: "embedOff", tone: "critical" });
  for (const w of input.warnings) {
    if (w.code === "functionsMissing" || w.code === "configLarge" || w.code === "checkoutLimited" || w.code === "checkoutMismatch")
      out.push({ id: w.code, tone: w.code === "functionsMissing" ? "critical" : "warning", params: { detail: w.detail ?? "" } });
  }
  const off = input.plan ? settingsOffOnPlan(s, input.plan) : [];
  if (off.length) out.push({ id: "planOff", tone: "warning", params: { keys: off.join(",") } });
  const v = s.vacation;
  if (v.enabled && (!v.end || v.end >= today)) out.push({ id: "vacation", tone: "info", params: { start: v.start ?? today, end: v.end ?? "" } });
  if (input.busyDays.length) out.push({ id: "busy", tone: "warning", params: { count: input.busyDays.length, first: input.busyDays[0].date } });
  if (input.usagePct !== null && input.usagePct >= 80) out.push({ id: "usage", tone: input.usagePct >= 100 ? "critical" : "warning", params: { pct: input.usagePct } });
  // Holidays are the merchant's choice: offer them at most once a year (dismissable), only when none
  // are on and the country has a list. Never turned on without the merchant.
  const year = Number(today.slice(0, 4));
  if (!s.holidays.length && s.country && input.holidayData !== false && input.flags.holidayYearOffered !== year) out.push({ id: "holidays", tone: "info", params: { country: s.country } });
  return out;
}

/**
 * Settings pages whose saved setup the current plan switches off (after a downgrade, or a
 * trial ending). The settings are kept and work again after an upgrade.
 */
export function settingsOffOnPlan(s: Settings, plan: PlanId): string[] {
  const methods = Object.values(s.methods);
  const pr = s.productRules;
  const checks: [string, string, boolean][] = [
    ["methods", "allMethods", methods.filter((m) => m.enabled).length > 1],
    ["capacity", "slots", methods.some((m) => m.slotsEnabled)],
    ["capacity", "capacity", methods.some((m) => m.capacity.maxPerDay !== null || m.capacity.overrides.length > 0)],
    ["closures", "closures", s.closures.length > 0 || s.specialDays.length > 0],
    ["areas", "areas", s.areas.length > 0 || s.zones.length > 0],
    ["products", "productRules", pr.restrictions.length + pr.limits.length + pr.methodOnly.length + pr.extraLead.length > 0],
    ["surcharges", "surcharges", s.surcharges.length > 0],
    ["checkout", "checkoutMatching", s.checkoutMatching.enabled],
  ];
  const locLimit = PLAN_LOCATION_LIMIT[plan];
  const extra: [string, boolean][] = [
    ["locations", locLimit !== null && s.locations.filter((l) => l.enabled).length > locLimit],
    ["dateMode", s.dateMode === "item" && !hasFeature(plan, "dateMode")],
    ["customCss", !!s.widget.customCss.trim() && !hasFeature(plan, "customCss")],
    ["customerChanges", s.customerChanges.enabled && !hasFeature(plan, "customerChanges")],
    ["reminders", (s.notifications.reminders.enabled || s.notifications.dayFull.enabled) && !hasFeature(plan, "reminders")],
  ];
  return [...new Set([...checks.filter(([, f, used]) => used && !hasFeature(plan, f)).map(([page]) => page), ...extra.filter(([, off]) => off).map(([k]) => k)])];
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
