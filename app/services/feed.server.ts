/** Secret calendar feed (.ics) per store, for Google Calendar, Apple Calendar and Outlook. */
import { randomBytes } from "node:crypto";
import prisma from "../db.server";
import { addDays } from "../../core/civil";
import { icsCalendar, icsEvent } from "../../core/calendar";
import { hasFeature } from "../../core/publish";
import type { MethodId } from "../../core/types";
import { loadSettings } from "../models/settings.server";
import { planOf, shopToday } from "../models/shop.server";
import { adminT } from "./admin-t.server";
import type { StoredItem } from "./counts.server";
import { slotLabels } from "./orders-query.server";

export async function regenerateFeedToken(shop: string) {
  const token = randomBytes(24).toString("base64url");
  await prisma.shop.update({ where: { shop }, data: { feedToken: token } });
  return token;
}

export async function feedFor(token: string): Promise<string | null> {
  const row = await prisma.shop.findUnique({ where: { feedToken: token } });
  // A Pro feature: the feed stops (like any unknown address) after a downgrade.
  if (!row?.active || !hasFeature(planOf(row), "calendarFeed")) return null;
  const { settings } = await loadSettings(row.shop);
  const { t } = await adminT(row);
  const today = shopToday(row);
  const range = { gte: addDays(today, -30), lte: addDays(today, 180) };
  const dated = await prisma.scheduledOrder.findMany({
    where: { shop: row.shop, status: { not: "cancelled" }, date: range },
    orderBy: [{ date: "asc" }, { slotLabel: "asc" }],
    take: 3000,
  });
  // Date per item with different dates: one entry per order and item date.
  const items = await prisma.scheduledItem.findMany({ where: { shop: row.shop, date: range }, take: 3000 });
  const perItemOrders = items.length
    ? await prisma.scheduledOrder.findMany({ where: { shop: row.shop, status: { not: "cancelled" }, date: null, orderId: { in: [...new Set(items.map((i) => i.orderId))] } } })
    : [];
  const labels = perItemOrders.length ? slotLabels(settings) : new Map<string, string>();
  const perItem = perItemOrders.flatMap((o) => {
    const mine = items.filter((i) => i.orderId === o.orderId);
    return [...new Set(mine.map((i) => i.date))].map((date) => {
      const slotId = mine.find((i) => i.date === date && i.slotId)?.slotId;
      return { ...o, date, slotLabel: slotId ? labels.get(slotId) ?? null : null, perItemDate: true };
    });
  });
  const orders = [...dated.map((o) => ({ ...o, perItemDate: false })), ...perItem].sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const name = (m: string) => settings.methods[m as MethodId]?.names[row.adminLocale] || t(`method.${m}`);
  const cfg = settings.notifications.calendarFeed;
  const events: string[] = [];
  if (cfg.mode === "day") {
    const byDay = new Map<string, Map<string, number>>();
    for (const o of orders) {
      const m = byDay.get(o.date!) ?? new Map<string, number>();
      m.set(o.method, (m.get(o.method) ?? 0) + 1);
      byDay.set(o.date!, m);
    }
    for (const [date, m] of byDay) {
      const summary = [...m].map(([k, n]) => `${name(k)}: ${n}`).join(", ");
      events.push(icsEvent({ uid: `${row.shop}-${date}@pickday`, stamp, title: summary, date, start: null, end: null, timeZone: row.timeZone }));
    }
  } else {
    for (const o of orders) {
      const [start, end] = o.slotLabel?.split("-") ?? [null, null];
      const loc = settings.locations.find((l) => l.id === o.locationId)?.name;
      const details = cfg.includeDetails
        ? ((o.items as unknown as StoredItem[]) ?? [])
            .filter((i) => i.needsDate !== false && (!o.perItemDate || i.date === o.date))
            .map((i) => `${i.qty} x ${i.title}`)
            .join("\n")
        : undefined;
      events.push(
        icsEvent({
          uid: o.perItemDate ? `${row.shop}-${o.orderId}-${o.date}@pickday` : `${row.shop}-${o.orderId}@pickday`,
          stamp,
          title: `${o.orderName}${o.customerFirst ? ` ${o.customerFirst}` : ""} – ${name(o.method)}`,
          date: o.date!,
          start: start ?? null,
          end: end ?? null,
          timeZone: row.timeZone,
          location: loc,
          description: details,
        }),
      );
    }
  }
  return icsCalendar(t("feed.name"), events);
}
