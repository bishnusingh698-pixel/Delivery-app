/** Secret calendar feed (.ics) per store, for Google Calendar, Apple Calendar and Outlook. */
import { randomBytes } from "node:crypto";
import prisma from "../db.server";
import { addDays } from "../../core/civil";
import { icsCalendar, icsEvent } from "../../core/calendar";
import type { MethodId } from "../../core/types";
import { loadSettings } from "../models/settings.server";
import { shopToday } from "../models/shop.server";
import { adminT } from "./admin-t.server";
import type { StoredItem } from "./counts.server";

export async function regenerateFeedToken(shop: string) {
  const token = randomBytes(24).toString("base64url");
  await prisma.shop.update({ where: { shop }, data: { feedToken: token } });
  return token;
}

export async function feedFor(token: string): Promise<string | null> {
  const row = await prisma.shop.findUnique({ where: { feedToken: token } });
  if (!row?.active) return null;
  const { settings } = await loadSettings(row.shop);
  const { t } = await adminT(row);
  const today = shopToday(row);
  const orders = await prisma.scheduledOrder.findMany({
    where: { shop: row.shop, status: { not: "cancelled" }, date: { gte: addDays(today, -30), lte: addDays(today, 180) } },
    orderBy: [{ date: "asc" }, { slotLabel: "asc" }],
    take: 3000,
  });
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
      const place = o.method === "pickup" ? settings.locations.find((l) => l.id === o.locationId) : undefined;
      const loc = place?.name;
      const items = cfg.includeDetails ? ((o.items as unknown as StoredItem[]) ?? []).filter((i) => i.needsDate !== false).map((i) => `${i.qty} x ${i.title}`).join("\n") : undefined;
      events.push(
        icsEvent({
          uid: `${row.shop}-${o.orderId}@pickday`,
          stamp,
          title: `${o.orderName}${o.customerFirst ? ` ${o.customerFirst}` : ""} – ${name(o.method)}`,
          date: o.date!,
          start: start ?? null,
          end: end ?? null,
          // Slot times are local to the pickup location.
          timeZone: place?.timeZone || row.timeZone,
          location: loc,
          description: items,
        }),
      );
    }
  }
  return icsCalendar(t("feed.name"), events);
}
