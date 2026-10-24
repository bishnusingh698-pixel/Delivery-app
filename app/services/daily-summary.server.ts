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
import { METHOD_IDS, type MethodId, type Settings } from "../../core/types";
import { loadSettings } from "../models/settings.server";
import { planOf } from "../models/shop.server";
import { adminT } from "./admin-t.server";
import { gql, type AdminGraphql } from "./graphql.server";

export const DAILY_HANDLE = "pickday-flow-daily";
/** Sent at most this many hours after the chosen hour (a sleeping server or a missed ping still sends it). */
const LATE_HOURS = 3;
const SUMMARY_MAX = 900;

export interface DayOrder {
  method: string;
  slotLabel: string | null;
  locationId: string | null;
  itemCount: number;
}

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

/** The trigger payload. Keys match extensions/pickday-flow-daily (Flow needs every field). */
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
  let summary = parts.join(" · ") || "0";
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
    const res = await gql(
      await admin(),
      `mutation($handle: String!, $payload: JSON!) { flowTriggerReceive(handle: $handle, payload: $payload) { userErrors { field message } } }`,
      { handle: DAILY_HANDLE, payload },
    );
    const errors = res.flowTriggerReceive?.userErrors ?? [];
    if (errors.length) throw new Error(`flowTriggerReceive: ${errors.map((e: { message: string }) => e.message).join("; ")}`);
    return true;
  } catch (e) {
    // Not sent: give the claim back so the next hourly run tries again.
    await prisma.shop.updateMany({ where: { shop: row.shop, dailySummaryFor: today }, data: { dailySummaryFor: row.dailySummaryFor } });
    throw e;
  }
}
