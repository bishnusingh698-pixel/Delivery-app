/**
 * Monthly scheduled-order usage per plan, with the 20% grace buffer (D-54).
 * The month is the calendar month in the store's time zone (D-55).
 */
import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import { PLAN_ORDER_LIMIT, usageState, type UsageState } from "../../core/plans";
import { planOf, shopToday } from "../models/shop.server";
import { zonedToUtc } from "../../core/tz";

export interface Usage extends UsageState {
  monthStart: string;
}

/** Usage for the current calendar month in the store's time zone. */
export async function monthlyUsage(shop: string, row: Pick<Shop, "plan" | "isDevStore" | "timeZone">): Promise<Usage> {
  const today = shopToday(row);
  const monthStart = today.slice(0, 8) + "01";
  const limit = PLAN_ORDER_LIMIT[planOf(row)];
  if (limit === null) return { ...usageState(0, null), monthStart };
  const since = zonedToUtc(monthStart, "00:00", row.timeZone || "UTC");
  const count = await prisma.scheduledOrder.count({ where: { shop, createdAt: { gte: since } } });
  return { ...usageState(count, limit), monthStart };
}
