/**
 * Daily summary for the merchant (D-56, D-57): tomorrow's orders per method and slot,
 * optional production list, days filling up in the next 7 days.
 * Sent only through the Shopify Flow trigger "Daily summary ready"; the merchant
 * adds Flow's "Send internal email", Slack, etc. Pickday sends no email itself.
 * At most one per store per day (DigestLog primary key).
 */
import prisma from "../db.server";
import { addDays, toMinutes } from "../../core/civil";
import { nowInZone } from "../../core/tz";
import { hasFeature } from "../../core/publish";
import type { MethodId } from "../../core/types";
import { planOf } from "../models/shop.server";
import { loadSettings } from "../models/settings.server";
import { unauthenticated } from "../shopify.server";
import { adminT } from "./admin-t.server";
import { dayCounts, production } from "./orders-query.server";
import { storefrontConfigFor } from "./publish.server";
import { flowDailySummary } from "./flow.server";
import type { AdminGraphql } from "./graphql.server";

/** Is it time to send today's summary for this shop? */
export async function digestDue(shop: string): Promise<{ due: boolean; today: string }> {
  const row = await prisma.shop.findUnique({ where: { shop } });
  if (!row?.active) return { due: false, today: "" };
  const { settings } = await loadSettings(shop);
  const d = settings.notifications.digest;
  const now = nowInZone(row.timeZone || "UTC");
  if (!d.enabled || !hasFeature(planOf(row), "digest")) return { due: false, today: now.date };
  if (now.minutes < toMinutes(d.time || "18:00")) return { due: false, today: now.date };
  const sent = await prisma.digestLog.findUnique({ where: { shop_day: { shop, day: now.date } } });
  return { due: !sent, today: now.date };
}

export interface DigestData {
  /** The day summarized (tomorrow in the store's time zone), YYYY-MM-DD. */
  date: string;
  dateLabel: string;
  counts: { total: number; delivery: number; pickup: number; shipping: number };
  /** Plain-text summary lines (no link). */
  lines: string[];
  link: string;
  /** "…and {count} more" in the admin language. */
  more: (n: number) => string;
}

export async function buildDigest(shop: string, today: string): Promise<DigestData> {
  const { row, settings, config } = await storefrontConfigFor(shop);
  const { t, dateLabel } = await adminT(row);
  const tomorrow = addDays(today, 1);
  const orders = await prisma.scheduledOrder.findMany({ where: { shop, date: tomorrow, status: { not: "cancelled" } }, select: { method: true, slotLabel: true, itemCount: true } });
  const week = await dayCounts(shop, config, tomorrow, addDays(today, 7));
  const methodName = (m: string) => settings.methods[m as MethodId]?.names[row.adminLocale] || t(`method.${m}`);

  const counts = { total: orders.length, delivery: 0, pickup: 0, shipping: 0 };
  const byMethod = new Map<string, Map<string, number>>();
  for (const o of orders) {
    if (o.method === "delivery" || o.method === "pickup" || o.method === "shipping") counts[o.method]++;
    const slots = byMethod.get(o.method) ?? new Map<string, number>();
    slots.set(o.slotLabel ?? "", (slots.get(o.slotLabel ?? "") ?? 0) + 1);
    byMethod.set(o.method, slots);
  }
  const lines: string[] = [];
  if (!orders.length) lines.push(t("digest.none"));
  for (const [m, slots] of byMethod) {
    const total = [...slots.values()].reduce((a, b) => a + b, 0);
    lines.push(`${methodName(m)}: ${total}`);
    const timed = [...slots].filter(([s]) => s).sort(([a], [b]) => a.localeCompare(b));
    for (const [s, n] of timed) lines.push(`  ${s}: ${n}`);
  }
  if (settings.notifications.digest.includeProduction && hasFeature(planOf(row), "production")) {
    const prod = await production(shop, tomorrow, tomorrow, {}, settings.productionPrepOffsetDays);
    if (prod.length) lines.push("", t("production.title"), ...prod.map((p) => `  ${p.qty} x ${p.title}${p.variant ? ` (${p.variant})` : ""}`));
  }
  const busy = Object.entries(week).filter(([, d]) => d.max && d.used / d.max >= 0.8);
  if (busy.length) lines.push("", t("digest.capacity"), ...busy.map(([d, c]) => `  ${dateLabel(d)}: ${c.used} / ${c.max}`));
  return {
    date: tomorrow,
    dateLabel: dateLabel(tomorrow),
    counts,
    lines,
    link: ordersLink(shop, tomorrow),
    more: (n) => t("digest.more", { count: n }),
  };
}

/** Admin URL of the Pickday orders page for one day. */
export function ordersLink(shop: string, date: string) {
  return `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/apps/${process.env.SHOPIFY_APP_HANDLE ?? "pickday"}/app/orders?range=custom&from=${date}&to=${date}`;
}

/** Longest Summary sent to Flow, in characters. Flow's whole payload limit is 50,000 bytes. */
export const FLOW_SUMMARY_MAX = 4000;

/** Join lines, dropping whole lines from the end (with "…and N more") when longer than `max`. Pure. */
export function truncateLines(lines: string[], max: number, more: (n: number) => string): string {
  const full = lines.join("\n");
  if (full.length <= max) return full;
  const kept: string[] = [];
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    const rest = lines.slice(i).filter((l) => l.trim()).length;
    const tail = more(rest);
    const add = (kept.length ? 1 : 0) + lines[i].length;
    if (len + add + 1 + tail.length > max) {
      while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
      return [...kept, tail].join("\n");
    }
    kept.push(lines[i]);
    len += add;
  }
  return kept.join("\n");
}

/** Payload for the "Daily summary ready" Flow trigger. Keys must match the extension's field keys. Pure. */
export function flowSummaryPayload(d: Pick<DigestData, "date" | "dateLabel" | "counts" | "lines" | "link" | "more">, max = FLOW_SUMMARY_MAX) {
  return {
    Date: d.date,
    "Date label": d.dateLabel,
    "Total orders": d.counts.total,
    Deliveries: d.counts.delivery,
    Pickups: d.counts.pickup,
    Shipping: d.counts.shipping,
    Summary: truncateLines(d.lines, max, d.more),
    "Orders link": d.link,
  };
}

/** Send if due. Records the day first so a crash can never send twice. */
export async function sendDigestIfDue(shop: string, getAdmin: () => Promise<AdminGraphql> = async () => (await unauthenticated.admin(shop)).admin): Promise<boolean> {
  const { due, today } = await digestDue(shop);
  if (!due) return false;
  try {
    await prisma.digestLog.create({ data: { shop, day: today } });
  } catch {
    return false; // another run got there first
  }
  try {
    const d = await buildDigest(shop, today);
    return await flowDailySummary(await getAdmin(), flowSummaryPayload(d));
  } catch (e) {
    console.error("[digest] flow", (e as Error).message);
    return false;
  }
}
