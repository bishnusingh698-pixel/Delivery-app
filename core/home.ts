/** Home page logic (pure, tested): setup checklist and alerts. */
import { addDays } from "./civil";
import { hasFeature } from "./publish";
import type { PlanId, Settings } from "./types";

export type ChecklistId = "embed" | "checkout" | "snippet" | "testOrder";

export interface HomeFlags {
  embedDetected?: boolean;
  firstOrderAt?: string;
  checkoutTested?: boolean;
  welcomeDone?: boolean;
  holidayYearOffered?: number;
}

/** What's left after the setup wizard (which covers methods, days and holidays). */
export function checklist(s: Settings, flags: HomeFlags, checkoutAllowed: boolean): { id: ChecklistId; done: boolean }[] {
  const items: { id: ChecklistId; done: boolean }[] = [
    { id: "embed", done: !!flags.embedDetected },
    { id: "testOrder", done: !!flags.firstOrderAt || !!flags.checkoutTested },
    { id: "checkout", done: s.checkoutMatching.enabled },
    { id: "snippet", done: s.notifications.emailSnippetConfirmed },
  ];
  // Checkout matching is a paid feature: only listed when the plan has it.
  return items.filter((i) => i.id !== "checkout" || checkoutAllowed);
}

export type AlertId = "busy" | "vacation" | "embedOff" | "usage" | "holidays" | "checkoutMismatch" | "configLarge" | "functionsMissing" | "planOff";

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
}): Alert[] {
  const out: Alert[] = [];
  const { settings: s, today } = input;
  if (input.embedChecked && !input.flags.embedDetected) out.push({ id: "embedOff", tone: "critical" });
  for (const w of input.warnings) {
    if (w.code === "functionsMissing" || w.code === "configLarge" || w.code === "checkoutMismatch") out.push({ id: w.code, tone: w.code === "functionsMissing" ? "critical" : "warning", params: { detail: w.detail ?? "" } });
  }
  const off = input.plan ? settingsOffOnPlan(s, input.plan) : [];
  if (off.length) out.push({ id: "planOff", tone: "warning", params: { keys: off.join(",") } });
  const v = s.vacation;
  if (v.enabled && (!v.end || v.end >= today)) out.push({ id: "vacation", tone: "info", params: { start: v.start ?? today, end: v.end ?? "" } });
  if (input.busyDays.length) out.push({ id: "busy", tone: "warning", params: { count: input.busyDays.length, first: input.busyDays[0].date } });
  if (input.usagePct !== null && input.usagePct >= 80) out.push({ id: "usage", tone: input.usagePct >= 100 ? "critical" : "warning", params: { pct: input.usagePct } });
  // Public holidays renew by themselves (holiday sets); only suggest them when none are on.
  const year = Number(today.slice(0, 4));
  if (!s.holidays.length && s.country && input.flags.holidayYearOffered !== year) out.push({ id: "holidays", tone: "info", params: { country: s.country } });
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
