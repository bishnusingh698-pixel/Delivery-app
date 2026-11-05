/**
 * "Daily schedule" Flow trigger: once a day, at the hour the merchant picked (store time),
 * the orders for today or tomorrow. Merchants add Flow's free "Send internal email" action
 * to get a daily summary email: Pickday itself sends no email (DECISIONS D-30, D-61).
 */
import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import { addDays } from "../../core/civil";
import { hasFeature } from "../../core/publish";
import { nowInZone } from "../../core/tz";
import type { Settings } from "../../core/types";
import { loadSettings } from "../models/settings.server";
import { planOf } from "../models/shop.server";
import { adminT } from "./admin-t.server";
import type { AdminGraphql } from "./graphql.server";
import { DAILY_HANDLE, dailyPayload, type DayOrder } from "./flow-payload";
import { sendFlowTrigger } from "./flow.server";

export { DAILY_HANDLE, dailyPayload, type DayOrder };

/** Sent at most this many hours after the chosen hour (a sleeping server or a missed ping still sends it). */
const LATE_HOURS = 3;

/** Which store-local date to describe now, or null when it isn't time (or it was already sent). */
export function dueDate(settings: Pick<Settings, "notifications">, row: Pick<Shop, "timeZone" | "dailySummaryFor">, at = new Date()): string | null {
  const ds = settings.notifications.dailySummary;
  if (!ds.enabled) return null;
  const now = nowInZone(row.timeZone || "UTC", at);
  const hour = Math.floor(now.minutes / 60);
  if (hour < ds.hour || hour >= ds.hour + LATE_HOURS) return null;
  if (row.dailySummaryFor === now.date) return null;
  return now.date;
}

/** Orders scheduled on `date` (per-item orders count once if any of their items is on that date). */
async function ordersOn(shop: string, date: string): Promise<DayOrder[]> {
  const select = { method: true, slotLabel: true, locationId: true, itemCount: true } as const;
  const direct = await prisma.scheduledOrder.findMany({ where: { shop, date, status: { not: "cancelled" } }, select });
  const itemIds = (await prisma.scheduledItem.findMany({ where: { shop, date }, select: { orderId: true }, distinct: ["orderId"] })).map((i) => i.orderId);
  const perItem = itemIds.length
    ? await prisma.scheduledOrder.findMany({ where: { shop, date: null, orderId: { in: itemIds }, status: { not: "cancelled" } }, select })
    : [];
  return [...direct, ...perItem];
}

export function ordersPageUrl(shop: string, date: string): string {
  const store = shop.replace(/\.myshopify\.com$/, "");
  const handle = process.env.SHOPIFY_APP_HANDLE || "pickday";
  return `https://admin.shopify.com/store/${store}/apps/${handle}/app/orders?range=custom&from=${date}&to=${date}`;
}

/**
 * Send the trigger when it's due. The row is claimed first (one atomic update), so two
 * overlapping hourly runs never send it twice. Returns true when sent.
 */
export async function sendDailySummaryIfDue(row: Shop, admin: () => Promise<AdminGraphql>, at = new Date()): Promise<boolean> {
  if (!hasFeature(planOf(row), "dailySummary")) return false;
  const { settings } = await loadSettings(row.shop);
  const today = dueDate(settings, row, at);
  if (!today) return false;
  const claimed = await prisma.shop.updateMany({
    where: { shop: row.shop, OR: [{ dailySummaryFor: null }, { dailySummaryFor: { not: today } }] },
    data: { dailySummaryFor: today },
  });
  if (claimed.count !== 1) return false;
  try {
    const date = settings.notifications.dailySummary.day === "today" ? today : addDays(today, 1);
    const { t, dateLabel } = await adminT(row);
    const payload = dailyPayload(date, dateLabel(date), await ordersOn(row.shop, date), settings, (m) => t(`method.${m}`), ordersPageUrl(row.shop, date));
    await sendFlowTrigger(await admin(), DAILY_HANDLE, payload);
    return true;
  } catch (e) {
    // Not sent: give the claim back so the next hourly run tries again.
    await prisma.shop.updateMany({ where: { shop: row.shop, dailySummaryFor: today }, data: { dailySummaryFor: row.dailySummaryFor } });
    throw e;
  }
}
