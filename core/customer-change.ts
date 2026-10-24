/**
 * When a customer may change their own date from the order status page (customer accounts).
 * Pure: the server route and tests share it.
 */
import { zonedToUtc } from "./tz";
import type { CustomerChangeSettings } from "./types";

/** `history[].by` for changes made by the customer (counted against `maxChanges`). */
export const CUSTOMER_ACTOR = "Customer (order status page)";

export type ChangeBlock = "off" | "noDate" | "cancelled" | "fulfilled" | "limited" | "tooLate" | "maxChanges";

export interface ChangeableOrder {
  date: string | null;
  slotLabel: string | null;
  status: string;
  limited: boolean;
  history: unknown;
}

export function customerChanges(history: unknown): number {
  return Array.isArray(history) ? history.filter((h) => h && typeof h === "object" && (h as { by?: unknown }).by === CUSTOMER_ACTOR).length : 0;
}

/** The last moment the customer can still change: `hoursBefore` before the slot start (or midnight). */
export function changeDeadline(s: CustomerChangeSettings, o: Pick<ChangeableOrder, "date" | "slotLabel">, timeZone: string): Date | null {
  if (!o.date) return null;
  const start = zonedToUtc(o.date, o.slotLabel?.slice(0, 5) || "00:00", timeZone);
  return new Date(start.getTime() - s.hoursBefore * 3600_000);
}

/** Why the customer can't change this order now, or null when they can. */
export function customerChangeBlock(s: CustomerChangeSettings, o: ChangeableOrder, timeZone: string, now = new Date()): ChangeBlock | null {
  if (!s.enabled) return "off";
  if (!o.date) return "noDate"; // no date yet, or per-item dates (the store handles those)
  if (o.status === "cancelled") return "cancelled";
  if (o.status === "fulfilled") return "fulfilled";
  if (o.limited) return "limited";
  const deadline = changeDeadline(s, o, timeZone);
  if (!deadline || now.getTime() >= deadline.getTime()) return "tooLate";
  if (customerChanges(o.history) >= s.maxChanges) return "maxChanges";
  return null;
}
