/**
 * Monthly scheduled-order usage per plan (Home usage bar, Plans page, the Free/Starter limit).
 */
import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import { PLAN_ORDER_LIMIT } from "../../core/publish";
import { planOf, shopToday } from "../models/shop.server";
import { usageMonth } from "../../core/usage";
import { zonedToUtc } from "../../core/tz";

export interface Usage {
  /** Orders Pickday recorded this month (store time). Counted on every plan. */
  count: number;
  /** The plan's monthly limit, or null when unlimited. */
  limit: number | null;
  pct: number;
  over: boolean;
  /** First day of this month in the store's time zone. */
  monthStart: string;
  /** The day the count starts again from zero (first day of next month, store time). */
  resetsOn: string;
}

/** Usage for the current calendar month in the store's time zone. */
export async function monthlyUsage(shop: string, row: Pick<Shop, "plan" | "timeZone">, at = new Date()): Promise<Usage> {
  const { monthStart, resetsOn } = usageMonth(shopToday(row, at));
  const limit = PLAN_ORDER_LIMIT[planOf(row)];
  const since = zonedToUtc(monthStart, "00:00", row.timeZone || "UTC");
  const count = await prisma.scheduledOrder.count({ where: { shop, createdAt: { gte: since } } });
  if (limit === null) return { count, limit: null, pct: 0, over: false, monthStart, resetsOn };
  return { count, limit, pct: Math.round((count / limit) * 100), over: count >= limit, monthStart, resetsOn };
}
