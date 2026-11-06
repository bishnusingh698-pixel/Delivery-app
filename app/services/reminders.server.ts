/**
 * Pro Shopify Flow triggers (D-77), both free to run (Flow sends any email or SMS):
 *  - "Reminder before the date": once a day at the merchant's hour (store time), one trigger per open
 *    order whose date is `daysBefore` days ahead. Merchants add their email/SMS app's action in Flow.
 *  - "Day almost full": once when a day's bookings reach the merchant's share of its daily limit.
 */
import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import { addDays } from "../../core/civil";
import { formatDate } from "../../core/dateformat";
import { hasFeature, toStorefrontConfig } from "../../core/publish";
import { nowInZone } from "../../core/tz";
import type { Settings } from "../../core/types";
import { loadSettings } from "../models/settings.server";
import { flagsOf, planOf, requireShop, setFlags } from "../models/shop.server";
import { adminT } from "./admin-t.server";
import { ordersPageUrl } from "./daily-summary.server";
import { DAY_FULL_HANDLE, REMINDER_HANDLE, dayFullPayload, reminderPayload } from "./flow-payload";
import { sendFlowTrigger } from "./flow.server";
import type { AdminGraphql } from "./graphql.server";
import { dayCounts } from "./orders-query.server";

/** Sent at most this many hours after the chosen hour (a sleeping server or a missed ping still sends them). */
const LATE_HOURS = 3;
/** Most reminders sent in one run (Flow calls one by one; a bigger day is the rare exception). */
export const REMINDERS_MAX = 500;

/** Store-local date to claim now, or null when it isn't the hour (or they were already sent today). */
export function remindersDue(settings: Pick<Settings, "notifications">, row: Pick<Shop, "timeZone" | "reminderFor">, at = new Date()): string | null {
  const r = settings.notifications.reminders;
  if (!r.enabled || !settings.notifications.flowEnabled) return null;
  const now = nowInZone(row.timeZone || "UTC", at);
  const hour = Math.floor(now.minutes / 60);
  if (hour < r.hour || hour >= r.hour + LATE_HOURS) return null;
  if (row.reminderFor === now.date) return null;
  return now.date;
}

/** Open orders (not fulfilled, cancelled or over the plan limit) dated `date`, including orders with a date per item. */
async function openOrdersOn(shop: string, date: string) {
  const select = { orderId: true, method: true, date: true, slotLabel: true, locationId: true } as const;
  const direct = await prisma.scheduledOrder.findMany({ where: { shop, date, status: "scheduled", limited: false }, select, take: REMINDERS_MAX });
  const itemIds = (await prisma.scheduledItem.findMany({ where: { shop, date }, select: { orderId: true }, distinct: ["orderId"], take: REMINDERS_MAX })).map((i) => i.orderId);
  const perItem = itemIds.length
    ? await prisma.scheduledOrder.findMany({ where: { shop, date: null, orderId: { in: itemIds }, status: "scheduled", limited: false }, select })
    : [];
  return [...direct, ...perItem.map((o) => ({ ...o, date }))].slice(0, REMINDERS_MAX);
}

/**
 * Send today's reminders when it's time. The day is claimed first (one atomic update), so two
 * overlapping hourly runs never send them twice. Returns how many were sent.
 */
export async function sendRemindersIfDue(row: Shop, admin: () => Promise<AdminGraphql>, at = new Date()): Promise<number> {
  if (!hasFeature(planOf(row), "reminders")) return 0;
  const { settings } = await loadSettings(row.shop);
  const today = remindersDue(settings, row, at);
  if (!today) return 0;
  const claimed = await prisma.shop.updateMany({
    where: { shop: row.shop, OR: [{ reminderFor: null }, { reminderFor: { not: today } }] },
    data: { reminderFor: today },
  });
  if (claimed.count !== 1) return 0;
  const days = settings.notifications.reminders.daysBefore;
  const date = addDays(today, days);
  const orders = await openOrdersOn(row.shop, date);
  if (!orders.length) return 0;
  let client: AdminGraphql;
  try {
    client = await admin();
  } catch (e) {
    // No access right now: give the day back so the next hourly run tries again.
    await prisma.shop.updateMany({ where: { shop: row.shop, reminderFor: today }, data: { reminderFor: row.reminderFor } });
    throw e;
  }
  // Written as the order's own "Delivery date" is: the store's language and date format.
  const label = formatDate(date, settings.dateFormat, row.primaryLocale || "en");
  let sent = 0;
  for (const o of orders) {
    try {
      await sendFlowTrigger(client, REMINDER_HANDLE, reminderPayload(o, settings, label, days));
      sent++;
    } catch (e) {
      console.error(`[reminders] ${row.shop} ${o.orderId}`, (e as Error).message);
    }
  }
  return sent;
}

/**
 * After bookings change: send "Day almost full" for each given day (today or later) whose bookings
 * reached the merchant's share of its limit, once. A day that drops below the share (a cancellation)
 * can be announced again when it fills up again.
 */
export async function checkDayFull(shop: string, admin: AdminGraphql | null, settings: Settings, dates: (string | null | undefined)[], at = new Date()) {
  const cfg = settings.notifications.dayFull;
  if (!admin || !cfg.enabled || !settings.notifications.flowEnabled) return;
  const row = await requireShop(shop);
  const plan = planOf(row);
  if (!hasFeature(plan, "dayFull")) return;
  const today = nowInZone(row.timeZone || "UTC", at).date;
  const days = [...new Set(dates.filter((d): d is string => !!d && d >= today))].sort();
  if (!days.length) return;
  const config = toStorefrontConfig(settings, { version: 0, timeZone: row.timeZone, primaryLocale: row.primaryLocale, plan, overLimit: false, currency: row.currency, debugUntil: null, today });
  const counts = await dayCounts(shop, config, days[0], days[days.length - 1]);
  const flags = flagsOf(row);
  const sentFor: Record<string, number> = Object.fromEntries(Object.entries(flags.dayFullSent ?? {}).filter(([d]) => d >= today));
  let dateLabel: ((d: string) => string) | null = null;
  for (const d of days) {
    const c = counts[d];
    if (!c?.max) continue;
    const pct = Math.round((c.used / c.max) * 100);
    if (pct < cfg.percent) {
      delete sentFor[d];
      continue;
    }
    if (sentFor[d]) continue;
    dateLabel ??= (await adminT(row)).dateLabel;
    try {
      await sendFlowTrigger(admin, DAY_FULL_HANDLE, dayFullPayload(d, dateLabel(d), c.used, c.max, ordersPageUrl(shop, d)));
      sentFor[d] = pct;
    } catch (e) {
      console.error(`[day full] ${shop} ${d}`, (e as Error).message);
    }
  }
  await setFlags(shop, { dayFullSent: sentFor });
}
