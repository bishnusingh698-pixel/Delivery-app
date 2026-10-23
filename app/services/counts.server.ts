/**
 * Capacity and product-limit counts.
 *
 * Counts are always rebuilt from ScheduledOrder/ScheduledItem for the dates
 * that changed (never incremented), so retries and out-of-order webhooks
 * can't drift them.
 */
import { withLock } from "./lock.server";
import prisma from "../db.server";
import { lineMatches } from "../../core/rules";
import type { Availability, CartLine, DayCount, Settings, StorefrontConfig } from "../../core/types";

export interface StoredItem {
  lineId: string;
  productId: string;
  variantId: string;
  title: string;
  variant?: string | null;
  qty: number;
  tags?: string[];
  date?: string | null;
  slotId?: string | null;
  needsDate?: boolean;
}

/** Same keys as the engine's resolveRules(): a known pickup location has its own counts, otherwise "pickup". */
export function capacityKey(settings: Pick<Settings, "zones" | "locations">, method: string, locationId: string | null, zoneId: string | null): string {
  if (method === "pickup") return locationId && settings.locations.some((l) => l.id === locationId) ? `pickup:${locationId}` : "pickup";
  if (method === "delivery" && zoneId) {
    const z = settings.zones.find((x) => x.id === zoneId);
    if (z?.capacity) return `delivery:z:${z.id}`;
  }
  return method;
}

type Agg = Map<string, { orders: number; items: number }>;

/** Recompute counts for the given dates. */
export async function recountDates(shop: string, settings: Settings, dates: string[]) {
  const unique = [...new Set(dates.filter(Boolean))];
  if (!unique.length) return;
  // Read and rewrite under one lock per store so two recounts can't overwrite each other.
  await withLock(`count:${shop}`, () => recount(shop, settings, unique));
}

async function recount(shop: string, settings: Settings, unique: string[]) {
  const orders = await prisma.scheduledOrder.findMany({
    where: { shop, status: { not: "cancelled" }, date: { in: unique } },
  });
  const perItem = await prisma.scheduledItem.findMany({ where: { shop, date: { in: unique } } });
  const cancelled = new Set(
    (
      await prisma.scheduledOrder.findMany({
        where: { shop, status: "cancelled", orderId: { in: [...new Set(perItem.map((i) => i.orderId))] } },
        select: { orderId: true },
      })
    ).map((o) => o.orderId),
  );

  const cap: Agg = new Map();
  const prod = new Map<string, number>();
  const bump = (key: string, date: string, slot: string, items: number, orders = 1) => {
    const k = `${key}|${date}|${slot}`;
    const cur = cap.get(k) ?? { orders: 0, items: 0 };
    cur.orders += orders;
    cur.items += items;
    cap.set(k, cur);
  };
  const bumpProduct = (items: StoredItem[], date: string, locationId: string | null) => {
    for (const lim of settings.productRules.limits) {
      const qty = items
        .filter((it) => lineMatches(toLine(it), lim.target, settings.productRules))
        .reduce((n, it) => n + it.qty, 0);
      if (!qty) continue;
      const key = lim.perLocation && locationId ? `${lim.id}@${locationId}` : lim.id;
      prod.set(`${key}|${date}`, (prod.get(`${key}|${date}`) ?? 0) + qty);
    }
  };

  // Orders with per-item rows are counted from those rows below, not twice.
  const itemOrders = new Set(perItem.map((i) => i.orderId));
  for (const o of orders) {
    if (!o.date || !unique.includes(o.date) || itemOrders.has(o.orderId)) continue;
    const items = ((o.items as unknown as StoredItem[]) ?? []).filter((i) => i.needsDate !== false);
    const qty = items.reduce((n, i) => n + i.qty, 0);
    // Fully refunded (every dated item at quantity 0): the order no longer takes a spot.
    if (items.length && !qty) continue;
    const key = capacityKey(settings, o.method, o.locationId, o.zoneId);
    bump(key, o.date, "", qty);
    if (o.slotId) bump(key, o.date, o.slotId, qty);
    bumpProduct(items, o.date, o.locationId);
  }
  // Per-item mode: each line counts on its own date (one "order" per date per order).
  const byOrderDate = new Map<string, typeof perItem>();
  for (const it of perItem) {
    if (cancelled.has(it.orderId)) continue;
    const k = `${it.orderId}|${it.date}|${it.slotId ?? ""}`;
    byOrderDate.set(k, [...(byOrderDate.get(k) ?? []), it]);
  }
  for (const group of byOrderDate.values()) {
    const first = group[0];
    const qty = group.reduce((n, i) => n + i.qty, 0);
    const key = capacityKey(settings, first.method, first.locationId, null);
    bump(key, first.date, "", qty);
    if (first.slotId) bump(key, first.date, first.slotId, qty);
    bumpProduct(
      group.map((g) => ({ lineId: g.lineId, productId: g.productId, variantId: g.variantId, title: g.title, qty: g.qty })),
      first.date,
      first.locationId,
    );
  }

  await prisma.$transaction([
    prisma.capacityCount.deleteMany({ where: { shop, date: { in: unique } } }),
    prisma.productCount.deleteMany({ where: { shop, date: { in: unique } } }),
    prisma.capacityCount.createMany({
      data: [...cap.entries()].map(([k, v]) => {
        const [key, date, slotId] = k.split("|");
        return { shop, key, date, slotId, orders: v.orders, items: v.items };
      }),
    }),
    prisma.productCount.createMany({
      data: [...prod.entries()].map(([k, qty]) => {
        const [key, date] = k.split("|");
        return { shop, key, date, qty };
      }),
    }),
  ]);
}

/** All future dates that have orders (used after settings changes). */
export async function recountFuture(shop: string, settings: Settings, today: string) {
  const rows = await prisma.scheduledOrder.findMany({
    where: { shop, date: { gte: today } },
    select: { date: true },
    distinct: ["date"],
  });
  const items = await prisma.scheduledItem.findMany({ where: { shop, date: { gte: today } }, select: { date: true }, distinct: ["date"] });
  await recountDates(shop, settings, [...rows.map((r) => r.date!), ...items.map((i) => i.date)]);
}

export function toLine(it: StoredItem): CartLine {
  return { key: it.lineId, productId: it.productId, variantId: it.variantId, quantity: it.qty, title: it.title, tags: it.tags };
}

/** Build the published availability for [from, to]. */
export async function buildAvailability(shop: string, from: string, to: string): Promise<Availability> {
  const [caps, prods] = await Promise.all([
    prisma.capacityCount.findMany({ where: { shop, date: { gte: from, lte: to } } }),
    prisma.productCount.findMany({ where: { shop, date: { gte: from, lte: to } } }),
  ]);
  const c: Availability["c"] = {};
  for (const r of caps) {
    const day: DayCount = (c[r.key] ??= {})[r.date] ?? [0, 0];
    if (!r.slotId) {
      day[0] = r.orders;
      day[1] = r.items;
    } else {
      day[2] = { ...(day[2] ?? {}), [r.slotId]: [r.orders, r.items] };
    }
    c[r.key][r.date] = day;
  }
  const p: Availability["p"] = {};
  for (const r of prods) (p[r.key] ??= {})[r.date] = r.qty;
  return { v: 1, at: new Date().toISOString(), c, p };
}

/** Longest booking window in the config (days). */
export function maxWindow(cfg: Pick<StorefrontConfig, "methods" | "locations">): number {
  let max = 1;
  for (const m of cfg.methods) if (m.enabled) max = Math.max(max, m.schedule.windowDays);
  for (const l of cfg.locations) if (l.custom) max = Math.max(max, l.custom.schedule.windowDays);
  return Math.min(max, 400);
}
