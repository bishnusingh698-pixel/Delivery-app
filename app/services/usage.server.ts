/**
 * Monthly scheduled-order usage per plan.
 */
import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import { PLAN_ORDER_LIMIT } from "../../core/publish";
import { planOf, shopToday } from "../models/shop.server";
import { zonedToUtc } from "../../core/tz";

export interface Usage {
  count: number;
  limit: number | null;
  pct: number;
  over: boolean;
  monthStart: string;
}

/** Usage for the current calendar month in the store's time zone. */
export async function monthlyUsage(shop: string, row: Pick<Shop, "plan" | "isDevStore" | "timeZone">): Promise<Usage> {
  const today = shopToday(row);
  const monthStart = today.slice(0, 8) + "01";
  const limit = PLAN_ORDER_LIMIT[planOf(row)];
  if (limit === null) return { count: 0, limit: null, pct: 0, over: false, monthStart };
  const since = zonedToUtc(monthStart, "00:00", row.timeZone || "UTC");
  const count = await prisma.scheduledOrder.count({ where: { shop, createdAt: { gte: since } } });
  return { count, limit, pct: Math.round((count / limit) * 100), over: count >= limit, monthStart };
}
