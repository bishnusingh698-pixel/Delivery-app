/**
 * Reports (Pro): what a merchant learns from their own scheduled orders. Pure, so it is tested
 * without a database; the page reads the rows (dates, methods, slots, when placed) and passes them in.
 * Everything is counted in the store's time zone.
 */
import { addDays, diffDays, firstOfMonth, weekday } from "./civil";
import { nowInZone } from "./tz";
import type { MethodId } from "./types";

export type ReportRange = "last30" | "last90" | "last365" | "next30";
export const REPORT_RANGES: ReportRange[] = ["last30", "last90", "last365", "next30"];

export function rangeDates(range: ReportRange, today: string): { from: string; to: string } {
  switch (range) {
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "last365":
      return { from: addDays(today, -364), to: today };
    case "next30":
      return { from: today, to: addDays(today, 29) };
    default:
      return { from: addDays(today, -89), to: today };
  }
}

export interface ReportRow {
  /** The delivery, pickup or shipping day (for an order with a date per item: its first item's day). */
  date: string;
  method: string;
  locationId: string | null;
  slotLabel: string | null;
  status: string;
  /** When Pickday recorded the order (ISO), close to when it was placed. */
  createdAt: string;
  /** Who changed the date: one entry per change. */
  changes: { by: string | null }[];
}

export const LEAD_BUCKETS = ["sameDay", "nextDay", "2to3", "4to7", "8to14", "15plus"] as const;
export type LeadBucket = (typeof LEAD_BUCKETS)[number];

export function leadBucket(days: number): LeadBucket {
  if (days <= 0) return "sameDay";
  if (days === 1) return "nextDay";
  if (days <= 3) return "2to3";
  if (days <= 7) return "4to7";
  if (days <= 14) return "8to14";
  return "15plus";
}

export interface Report {
  /** Orders with a date in the range, cancelled ones excluded. */
  orders: number;
  cancelled: number;
  /** Orders whose date was changed at least once, and how many changes the customer made. */
  changedOrders: number;
  changesByCustomer: number;
  changesByStaff: number;
  byMethod: { method: MethodId; orders: number; pct: number }[];
  byLocation: { id: string | null; orders: number }[];
  /** Orders per weekday, 0 = Sunday. */
  weekdays: number[];
  busiestDays: { date: string; orders: number }[];
  slots: { label: string; orders: number }[];
  lead: { bucket: LeadBucket; orders: number; pct: number }[];
  /** Average days between placing the order and its date, one decimal. */
  avgLeadDays: number | null;
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export function computeReport(rows: ReportRow[], timeZone: string, isCustomer: (by: string | null) => boolean): Report {
  const live = rows.filter((r) => r.status !== "cancelled");
  const orders = live.length;
  const methods = new Map<string, number>();
  const locations = new Map<string | null, number>();
  const days = new Map<string, number>();
  const slots = new Map<string, number>();
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  const lead = new Map<LeadBucket, number>();
  let leadSum = 0;
  let leadN = 0;
  for (const r of live) {
    methods.set(r.method, (methods.get(r.method) ?? 0) + 1);
    if (r.method === "pickup") locations.set(r.locationId, (locations.get(r.locationId) ?? 0) + 1);
    days.set(r.date, (days.get(r.date) ?? 0) + 1);
    if (r.slotLabel) slots.set(r.slotLabel, (slots.get(r.slotLabel) ?? 0) + 1);
    weekdays[weekday(r.date)]++;
    const placed = nowInZone(timeZone, new Date(r.createdAt)).date;
    const d = Math.max(0, diffDays(r.date, placed));
    lead.set(leadBucket(d), (lead.get(leadBucket(d)) ?? 0) + 1);
    leadSum += d;
    leadN++;
  }
  let changesByCustomer = 0;
  let changesByStaff = 0;
  let changedOrders = 0;
  for (const r of rows) {
    if (!r.changes.length) continue;
    changedOrders++;
    for (const c of r.changes) {
      if (isCustomer(c.by)) changesByCustomer++;
      else changesByStaff++;
    }
  }
  return {
    orders,
    cancelled: rows.length - orders,
    changedOrders,
    changesByCustomer,
    changesByStaff,
    byMethod: (["delivery", "pickup", "shipping"] as MethodId[]).filter((m) => methods.get(m)).map((m) => ({ method: m, orders: methods.get(m)!, pct: pct(methods.get(m)!, orders) })),
    byLocation: [...locations].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, orders: n })),
    weekdays,
    busiestDays: [...days].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([date, n]) => ({ date, orders: n })),
    slots: [...slots].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10).map(([label, n]) => ({ label, orders: n })),
    lead: LEAD_BUCKETS.map((b) => ({ bucket: b, orders: lead.get(b) ?? 0, pct: pct(lead.get(b) ?? 0, leadN) })),
    avgLeadDays: leadN ? Math.round((leadSum / leadN) * 10) / 10 : null,
  };
}

/**
 * Orders placed this month against last month, by when they were placed (store time). "So far" is
 * last month up to the same day of the month, for a fair comparison mid-month.
 */
export function monthComparison(placedAt: string[], today: string, timeZone: string) {
  const thisStart = firstOfMonth(today);
  const lastStart = firstOfMonth(addDays(thisStart, -1));
  const dayOfMonth = Number(today.slice(8, 10));
  const lastSameDay = addDays(lastStart, Math.min(dayOfMonth, diffDays(thisStart, lastStart)) - 1);
  let thisMonth = 0;
  let lastMonth = 0;
  let lastMonthSoFar = 0;
  for (const at of placedAt) {
    const d = nowInZone(timeZone, new Date(at)).date;
    if (d >= thisStart && d <= today) thisMonth++;
    else if (d >= lastStart && d < thisStart) {
      lastMonth++;
      if (d <= lastSameDay) lastMonthSoFar++;
    }
  }
  const change = lastMonthSoFar ? Math.round(((thisMonth - lastMonthSoFar) / lastMonthSoFar) * 100) : null;
  return { thisMonth, lastMonth, lastMonthSoFar, change, thisStart, lastStart };
}
