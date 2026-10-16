/** Home page logic (pure, tested): setup checklist and alerts. */
import { addDays } from "./civil";
import type { Settings } from "./types";

export type ChecklistId = "embed" | "methods" | "schedule" | "checkout" | "snippet" | "testOrder";

export interface HomeFlags {
  embedDetected?: boolean;
  firstOrderAt?: string;
  checkoutTested?: boolean;
  welcomeDone?: boolean;
  holidayYearOffered?: number;
}

export function checklist(s: Settings, flags: HomeFlags, settingsVersion: number, checkoutAllowed: boolean): { id: ChecklistId; done: boolean }[] {
  const items: { id: ChecklistId; done: boolean }[] = [
    { id: "embed", done: !!flags.embedDetected },
    // Methods and schedule count as reviewed once the merchant saved settings after the welcome step.
    { id: "methods", done: Object.values(s.methods).some((m) => m.enabled) && settingsVersion > 2 },
    { id: "schedule", done: settingsVersion > 2 },
    { id: "checkout", done: !checkoutAllowed || s.checkoutMatching.enabled },
    { id: "snippet", done: s.notifications.emailSnippetConfirmed },
    { id: "testOrder", done: !!flags.firstOrderAt || !!flags.checkoutTested },
  ];
  return items;
}

export type AlertId = "busy" | "vacation" | "embedOff" | "usage" | "holidays" | "checkoutMismatch" | "configLarge" | "functionsMissing";

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
}): Alert[] {
  const out: Alert[] = [];
  const { settings: s, today } = input;
  if (input.embedChecked && !input.flags.embedDetected) out.push({ id: "embedOff", tone: "critical" });
  for (const w of input.warnings) {
    if (w.code === "functionsMissing" || w.code === "configLarge" || w.code === "checkoutMismatch") out.push({ id: w.code, tone: w.code === "functionsMissing" ? "critical" : "warning", params: { detail: w.detail ?? "" } });
  }
  const v = s.vacation;
  if (v.enabled && (!v.end || v.end >= today)) out.push({ id: "vacation", tone: "info", params: { start: v.start ?? today, end: v.end ?? "" } });
  if (input.busyDays.length) out.push({ id: "busy", tone: "warning", params: { count: input.busyDays.length, first: input.busyDays[0].date } });
  if (input.usagePct !== null && input.usagePct >= 80) out.push({ id: "usage", tone: input.usagePct >= 100 ? "critical" : "warning", params: { pct: input.usagePct } });
  const next = Number(today.slice(0, 4)) + 1;
  const hasHolidays = s.closures.some((c) => c.kind === "holiday");
  const hasNextYear = s.closures.some((c) => c.kind === "holiday" && (c.yearly || c.start.startsWith(String(next))));
  if (today.slice(5) >= "10-01" && hasHolidays && !hasNextYear && input.flags.holidayYearOffered !== next) out.push({ id: "holidays", tone: "info", params: { year: next } });
  return out;
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
