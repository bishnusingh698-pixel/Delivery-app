/**
 * Payloads for Pickday's Shopify Flow triggers (extensions/pickday-flow-*). Flow rejects a payload
 * whose keys or value types don't match the trigger's fields, so they are built in one place with
 * no database or Shopify imports, and tests/deploy-rules.test.ts compares them field by field with
 * each trigger's shopify.extension.toml.
 */
import type { MethodId, Settings } from "../../core/types";
import { METHOD_IDS } from "../../core/types";

export type FlowEvent = "scheduled" | "rescheduled" | "cancelled";

export const FLOW_HANDLES: Record<FlowEvent, string> = {
  scheduled: "pickday-flow-scheduled",
  rescheduled: "pickday-flow-rescheduled",
  cancelled: "pickday-flow-cancelled",
};

export const DAILY_HANDLE = "pickday-flow-daily";

/** Flow's limit for one trigger payload, keys included (Flow trigger reference). */
export const FLOW_PAYLOAD_MAX_BYTES = 50_000;

const METHOD: Record<string, string> = { delivery: "Local delivery", pickup: "Pickup", shipping: "Shipping" };

export interface FlowOrder {
  orderId: string;
  method: string;
  date: string | null;
  slotLabel: string | null;
  locationId: string | null;
}

/** "Schedule created / changed / cancelled": the order reference (order_id) plus four text fields. */
export function orderPayload(o: FlowOrder, settings: Pick<Settings, "locations">) {
  return {
    order_id: Number(o.orderId),
    Method: METHOD[o.method] ?? o.method,
    Date: o.date ?? "",
    "Time slot": o.slotLabel ?? "",
    "Pickup location": settings.locations.find((l) => l.id === o.locationId)?.name ?? "",
  };
}

export interface DayOrder {
  method: string;
  slotLabel: string | null;
  locationId: string | null;
  itemCount: number;
}

/** Longest "Summary" text sent (a single line text field). */
export const SUMMARY_MAX = 900;

/** "Daily schedule": the day's totals. Keys match extensions/pickday-flow-daily (Flow needs every field). */
export function dailyPayload(
  date: string,
  dayLabel: string,
  orders: DayOrder[],
  settings: Pick<Settings, "locations">,
  methodName: (m: MethodId) => string,
  ordersUrl: string,
) {
  const by = (m: MethodId) => orders.filter((o) => o.method === m);
  const parts: string[] = [];
  for (const m of METHOD_IDS) {
    const list = by(m);
    if (!list.length) continue;
    // Break down by time slot, or by pickup location when there are no slots.
    const groups = new Map<string, number>();
    for (const o of list) {
      const key = o.slotLabel?.replace("-", "–") ?? (m === "pickup" && o.locationId ? settings.locations.find((l) => l.id === o.locationId)?.name ?? "" : "");
      if (key) groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const detail = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}: ${n}`).join(", ");
    parts.push(`${methodName(m)} ${list.length}${detail ? ` (${detail})` : ""}`);
  }
  // One line: a location or method name with a line break would make it a multi-line text.
  let summary = (parts.join(" · ") || "0").replace(/\s*[\r\n]+\s*/g, " ");
  if (summary.length > SUMMARY_MAX) summary = `${summary.slice(0, SUMMARY_MAX - 1)}…`;
  return {
    Date: date,
    Day: dayLabel,
    Orders: orders.length,
    "Local delivery orders": by("delivery").length,
    "Pickup orders": by("pickup").length,
    "Shipping orders": by("shipping").length,
    Items: orders.reduce((n, o) => n + o.itemCount, 0),
    Summary: summary,
    "Orders page": ordersUrl,
  };
}

/* ------------------------------------------------------------------ Pro */

export const REMINDER_HANDLE = "pickday-flow-reminder";
export const DAY_FULL_HANDLE = "pickday-flow-day-full";

/** Every trigger this app declares, with a payload built in this file (checked by tests/deploy/rules.ts). */
export const ALL_FLOW_HANDLES = [...Object.values(FLOW_HANDLES), DAILY_HANDLE, REMINDER_HANDLE, DAY_FULL_HANDLE];

const oneLine = (s: string | null | undefined, max = 500) => {
  const t = (s ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * "Reminder before the date": one order, sent `daysBefore` days ahead (Pro). `dayLabel` is the date
 * written in the store's language and date format, ready for a customer email or SMS.
 */
export function reminderPayload(o: FlowOrder, settings: Pick<Settings, "locations">, dayLabel: string, daysBefore: number) {
  const loc = settings.locations.find((l) => l.id === o.locationId);
  return {
    ...orderPayload(o, settings),
    Day: oneLine(dayLabel, 200),
    "Pickup address": oneLine(loc?.address),
    "Days before": daysBefore,
  };
}

/** "Day almost full": a day's bookings reached the merchant's share of its limit (Pro). */
export function dayFullPayload(date: string, dayLabel: string, booked: number, limit: number, ordersUrl: string) {
  return {
    Date: date,
    Day: oneLine(dayLabel, 200),
    Booked: booked,
    Limit: limit,
    Percent: limit ? Math.round((booked / limit) * 100) : 0,
    "Orders page": ordersUrl,
  };
}
