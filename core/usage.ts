/** The plan's order month and how close a store is to its limit (Home usage bar, Plans page). Pure. */
import { addMonths, firstOfMonth } from "./civil";

/** This month in the store's time zone: its first day and the day the count resets. */
export function usageMonth(today: string): { monthStart: string; resetsOn: string } {
  const monthStart = firstOfMonth(today);
  return { monthStart, resetsOn: addMonths(monthStart, 1) };
}

export type UsageTone = "ok" | "near" | "over";

/** "near" from 80% of the limit, "over" at the limit (orders keep being recorded, D-10). */
export function usageTone(u: { count: number; limit: number | null }): UsageTone {
  if (u.limit === null) return "ok";
  if (u.count >= u.limit) return "over";
  return u.count >= u.limit * 0.8 ? "near" : "ok";
}
