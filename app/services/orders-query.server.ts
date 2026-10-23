/**
 * Reading scheduled orders for the Orders, Production and Home pages and the digest.
 * Every query is scoped by shop.
 */
import type { Prisma, ScheduledOrder } from "@prisma/client";
import prisma from "../db.server";
import { addDays } from "../../core/civil";
import { dayMax, resolveRules, specialDayFor } from "../../core/engine";
import type { MethodId, Settings, StorefrontConfig } from "../../core/types";
import type { StoredItem } from "./counts.server";
import { loadSettings } from "../models/settings.server";

export type RangeKey = "today" | "tomorrow" | "week" | "next7" | "custom" | "upcoming" | "all";

export interface OrderFilters {
  range: RangeKey;
  from: string | null;
  to: string | null;
  method: MethodId | "";
  location: string;
  zone: string;
  status: "" | "scheduled" | "fulfilled" | "cancelled";
  tag: string;
  q: string;
  page: number;
}

export function parseFilters(url: URL, today: string, weekStart: number | null = 1): OrderFilters & { dateFrom: string | null; dateTo: string | null } {
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const range = (g("range") || "upcoming") as RangeKey;
  const f: OrderFilters = {
    range,
    from: g("from") || null,
    to: g("to") || null,
    method: (["delivery", "pickup", "shipping"].includes(g("method")) ? g("method") : "") as OrderFilters["method"],
    location: g("location"),
    zone: g("zone"),
    status: (["scheduled", "fulfilled", "cancelled"].includes(g("status")) ? g("status") : "") as OrderFilters["status"],
    tag: g("tag"),
    q: g("q").trim().slice(0, 80),
    page: Math.max(1, Number(g("page")) || 1),
  };
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  switch (range) {
    case "today":
      dateFrom = dateTo = today;
      break;
    case "tomorrow":
      dateFrom = dateTo = addDays(today, 1);
      break;
    case "week": {
      // The current week, starting on the store's first day of the week (Monday when not set).
      const first = weekStart ?? 1;
      const wd = (new Date(today + "T00:00:00Z").getUTCDay() - first + 7) % 7;
      dateFrom = addDays(today, -wd);
      dateTo = addDays(dateFrom, 6);
      break;
    }
    case "next7":
      dateFrom = today;
      dateTo = addDays(today, 6);
      break;
    case "custom":
      dateFrom = f.from;
      dateTo = f.to ?? f.from;
      break;
    case "upcoming":
      dateFrom = today;
      break;
    case "all":
      break;
  }
  return { ...f, dateFrom, dateTo };
}

export function whereFor(shop: string, f: ReturnType<typeof parseFilters>): Prisma.ScheduledOrderWhereInput {
  const where: Prisma.ScheduledOrderWhereInput = { shop };
  const date: Prisma.StringNullableFilter = {};
  if (f.dateFrom) date.gte = f.dateFrom;
  if (f.dateTo) date.lte = f.dateTo;
  if (f.dateFrom || f.dateTo) where.date = date;
  if (f.method) where.method = f.method;
  if (f.location) where.locationId = f.location;
  if (f.zone) where.zoneId = f.zone;
  where.status = f.status ? f.status : { not: "cancelled" };
  if (f.tag) where.tags = { has: f.tag };
  if (f.q) {
    const q = f.q.replace(/^#/, "");
    where.OR = [{ orderName: { contains: q, mode: "insensitive" } }, { customerFirst: { contains: q, mode: "insensitive" } }, { orderId: q }];
  }
  return where;
}

export const PAGE_SIZE = 50;

export async function listOrders(shop: string, f: ReturnType<typeof parseFilters>) {
  const where = whereFor(shop, f);
  const [rows, total] = await Promise.all([
    prisma.scheduledOrder.findMany({ where, orderBy: [{ date: "asc" }, { slotLabel: "asc" }, { orderName: "asc" }], skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.scheduledOrder.count({ where }),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export function orderRow(o: ScheduledOrder, settings: Settings) {
  const items = (o.items as unknown as StoredItem[]) ?? [];
  const loc = settings.locations.find((l) => l.id === o.locationId)?.name ?? null;
  const zone = settings.zones.find((z) => z.id === o.zoneId)?.name ?? null;
  return {
    id: o.orderId,
    name: o.orderName,
    customer: o.customerFirst,
    method: o.method as MethodId,
    date: o.date,
    slot: o.slotLabel,
    place: loc ?? zone ?? o.area ?? null,
    items: o.itemCount,
    lines: items.filter((i) => i.needsDate !== false).map((i) => ({ title: i.title, variant: i.variant ?? null, qty: i.qty })),
    status: o.status,
    limited: o.limited,
    tags: o.tags,
  };
}
export type OrderRow = ReturnType<typeof orderRow>;

/** Orders and items per date and method, plus capacity used/max per date (method-level limits). */
export async function dayCounts(shop: string, config: StorefrontConfig, from: string, to: string) {
  const grouped = await prisma.scheduledOrder.groupBy({
    by: ["date", "method"],
    where: { shop, status: { not: "cancelled" }, date: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { itemCount: true },
  });
  const caps = await prisma.capacityCount.findMany({ where: { shop, slotId: "", date: { gte: from, lte: to } } });
  const out: Record<string, { methods: Partial<Record<MethodId, { orders: number; items: number }>>; used: number; max: number | null }> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) out[d] = { methods: {}, used: 0, max: null };
  for (const g of grouped) {
    if (!g.date || !out[g.date]) continue;
    out[g.date].methods[g.method as MethodId] = { orders: g._count._all, items: g._sum.itemCount ?? 0 };
  }
  for (const m of config.methods) {
    if (!m.enabled) continue;
    const keys =
      m.id === "pickup"
        ? config.locations.some((l) => l.enabled)
          ? config.locations.filter((l) => l.enabled).map((l) => ({ key: `pickup:${l.id}`, loc: l.id as string | null, zone: null as string | null }))
          : [{ key: "pickup", loc: null as string | null, zone: null as string | null }]
        : [
            { key: m.id as string, loc: null as string | null, zone: null as string | null },
            // Delivery zones with their own limit are counted under their own key.
            ...(m.id === "delivery" ? config.zones.filter((z) => z.capacity).map((z) => ({ key: `delivery:z:${z.id}`, loc: null, zone: z.id as string | null })) : []),
          ];
    for (const { key, loc, zone } of keys) {
      const rules = resolveRules(config, m.id, loc, zone);
      if (!rules) continue;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const max = dayMax(rules.capacity, d, specialDayFor(config, d, m.id, loc));
        if (max === null) continue;
        const c = caps.find((x) => x.key === key && x.date === d);
        const used = c ? (rules.capacity.unit === "items" ? c.items : c.orders) : 0;
        out[d].used += used;
        out[d].max = (out[d].max ?? 0) + max;
      }
    }
  }
  return out;
}

/** Production list: totals per product/variant for a date range, with per-slot split. */
export async function production(shop: string, from: string, to: string, filters: { method?: string; location?: string }, offsetDays = 0) {
  // With a prep offset, "items needed on day D" are those delivered on D + offset.
  const dFrom = addDays(from, offsetDays);
  const dTo = addDays(to, offsetDays);
  const where: Prisma.ScheduledOrderWhereInput = { shop, status: { not: "cancelled" }, date: { gte: dFrom, lte: dTo } };
  if (filters.method) where.method = filters.method;
  if (filters.location) where.locationId = filters.location;
  const orders = await prisma.scheduledOrder.findMany({ where, select: { orderId: true, items: true, slotLabel: true } });
  const perItem = await prisma.scheduledItem.findMany({
    where: { shop, date: { gte: dFrom, lte: dTo }, ...(filters.method ? { method: filters.method } : {}), ...(filters.location ? { locationId: filters.location } : {}) },
  });
  const rows = new Map<string, { title: string; variant: string | null; qty: number; orders: Set<string>; slots: Map<string, number> }>();
  const add = (orderId: string, title: string, variant: string | null, key: string, qty: number, slot: string | null) => {
    const r = rows.get(key) ?? { title, variant, qty: 0, orders: new Set<string>(), slots: new Map<string, number>() };
    r.qty += qty;
    r.orders.add(orderId);
    const s = slot ?? "";
    r.slots.set(s, (r.slots.get(s) ?? 0) + qty);
    rows.set(key, r);
  };
  const perItemOrders = new Set(perItem.map((i) => i.orderId));
  for (const o of orders) {
    if (perItemOrders.has(o.orderId)) continue;
    for (const it of (o.items as unknown as StoredItem[]) ?? []) {
      if (it.needsDate === false) continue;
      add(o.orderId, it.title, it.variant ?? null, `${it.productId}|${it.variantId}`, it.qty, o.slotLabel);
    }
  }
  const labels = perItem.some((i) => i.slotId) ? slotLabels((await loadSettings(shop)).settings) : new Map<string, string>();
  for (const it of perItem) add(it.orderId, it.title, null, `${it.productId}|${it.variantId}`, it.qty, it.slotId ? labels.get(it.slotId) ?? it.slotId : null);
  return [...rows.values()]
    .map((r) => ({ title: r.title, variant: r.variant, qty: r.qty, orders: r.orders.size, slots: [...r.slots].filter(([s]) => s).map(([slot, qty]) => ({ slot, qty })) }))
    .sort((a, b) => a.title.localeCompare(b.title) || (a.variant ?? "").localeCompare(b.variant ?? ""));
}

/** Slot id → "09:00-12:00", from every slot list in the settings (methods, locations, zones, special days). */
export function slotLabels(settings: Settings): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string" && typeof o.start === "string" && typeof o.end === "string" && !out.has(o.id)) out.set(o.id, `${o.start}-${o.end}`);
    Object.values(o).forEach(walk);
  };
  walk(settings);
  return out;
}

/** CSV with a UTF-8 BOM so Excel opens accents correctly. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    // Neutralise spreadsheet formulas.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
