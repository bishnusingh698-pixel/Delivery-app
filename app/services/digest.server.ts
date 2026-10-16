/**
 * Daily digest for the merchant: tomorrow's orders per method and slot,
 * optional production list, capacity warnings for the next 7 days.
 * At most one per store per day (DigestLog primary key).
 */
import prisma from "../db.server";
import { addDays, toMinutes } from "../../core/civil";
import { nowInZone } from "../../core/tz";
import { hasFeature } from "../../core/publish";
import type { MethodId } from "../../core/types";
import { planOf } from "../models/shop.server";
import { loadSettings } from "../models/settings.server";
import { adminT } from "./admin-t.server";
import { dayCounts, production } from "./orders-query.server";
import { storefrontConfigFor } from "./publish.server";
import { sendEmail } from "./email.server";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Is it time to send today's digest for this shop? */
export async function digestDue(shop: string): Promise<{ due: boolean; today: string }> {
  const row = await prisma.shop.findUnique({ where: { shop } });
  if (!row?.active) return { due: false, today: "" };
  const { settings } = await loadSettings(shop);
  const d = settings.notifications.digest;
  const now = nowInZone(row.timeZone || "UTC");
  if (!d.enabled || !d.recipients.length || !hasFeature(planOf(row), "digest")) return { due: false, today: now.date };
  if (now.minutes < toMinutes(d.time || "18:00")) return { due: false, today: now.date };
  const sent = await prisma.digestLog.findUnique({ where: { shop_day: { shop, day: now.date } } });
  return { due: !sent, today: now.date };
}

export async function buildDigest(shop: string, today: string) {
  const { row, settings, config } = await storefrontConfigFor(shop);
  const { t, dateLabel } = await adminT(row);
  const tomorrow = addDays(today, 1);
  const orders = await prisma.scheduledOrder.findMany({ where: { shop, date: tomorrow, status: { not: "cancelled" } }, select: { method: true, slotLabel: true, itemCount: true } });
  const week = await dayCounts(shop, config, tomorrow, addDays(today, 7));
  const methodName = (m: string) => settings.methods[m as MethodId]?.names[row.adminLocale] || t(`method.${m}`);

  const byMethod = new Map<string, Map<string, number>>();
  for (const o of orders) {
    const slots = byMethod.get(o.method) ?? new Map<string, number>();
    slots.set(o.slotLabel ?? "", (slots.get(o.slotLabel ?? "") ?? 0) + 1);
    byMethod.set(o.method, slots);
  }
  const lines: string[] = [];
  let html = `<h2 style="margin:0 0 8px">${esc(t("digest.heading", { date: dateLabel(tomorrow) }))}</h2>`;
  if (!orders.length) {
    html += `<p>${esc(t("digest.none"))}</p>`;
    lines.push(t("digest.none"));
  }
  for (const [m, slots] of byMethod) {
    const total = [...slots.values()].reduce((a, b) => a + b, 0);
    html += `<h3 style="margin:16px 0 4px">${esc(methodName(m))}: ${total}</h3>`;
    lines.push(`${methodName(m)}: ${total}`);
    const timed = [...slots].filter(([s]) => s).sort(([a], [b]) => a.localeCompare(b));
    if (timed.length) {
      html += `<ul style="margin:0;padding-inline-start:18px">${timed.map(([s, n]) => `<li>${esc(s.replace("-", "–"))}: ${n}</li>`).join("")}</ul>`;
      for (const [s, n] of timed) lines.push(`  ${s}: ${n}`);
    }
  }
  if (settings.notifications.digest.includeProduction && hasFeature(planOf(row), "production")) {
    const prod = await production(shop, tomorrow, tomorrow, {}, settings.productionPrepOffsetDays);
    if (prod.length) {
      html += `<h3 style="margin:16px 0 4px">${esc(t("production.title"))}</h3><table cellpadding="4" style="border-collapse:collapse">${prod.map((p) => `<tr><td style="border-bottom:1px solid #eee"><strong>${p.qty}</strong></td><td style="border-bottom:1px solid #eee">${esc(p.title)}${p.variant ? ` (${esc(p.variant)})` : ""}</td></tr>`).join("")}</table>`;
      lines.push("", t("production.title"), ...prod.map((p) => `  ${p.qty} x ${p.title}${p.variant ? ` (${p.variant})` : ""}`));
    }
  }
  const busy = Object.entries(week).filter(([, d]) => d.max && d.used / d.max >= 0.8);
  if (busy.length) {
    html += `<h3 style="margin:16px 0 4px">${esc(t("digest.capacity"))}</h3><ul style="margin:0;padding-inline-start:18px">${busy.map(([d, c]) => `<li>${esc(dateLabel(d))}: ${c.used} / ${c.max}</li>`).join("")}</ul>`;
    lines.push("", t("digest.capacity"), ...busy.map(([d, c]) => `  ${dateLabel(d)}: ${c.used} / ${c.max}`));
  }
  const link = `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/apps/${process.env.SHOPIFY_APP_HANDLE ?? "pickday"}/app/orders?range=tomorrow`;
  html += `<p style="margin-top:20px"><a href="${esc(link)}">${esc(t("digest.open"))}</a></p><p style="color:#777;font-size:12px">${esc(t("digest.footer"))}</p>`;
  lines.push("", `${t("digest.open")}: ${link}`);
  return {
    subject: t("digest.subject", { count: orders.length, date: dateLabel(tomorrow) }),
    html: `<div style="font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;max-width:600px">${html}</div>`,
    text: lines.join("\n"),
    recipients: settings.notifications.digest.recipients,
  };
}

/** Send if due. Records the day first so a crash can never send twice. */
export async function sendDigestIfDue(shop: string): Promise<boolean> {
  const { due, today } = await digestDue(shop);
  if (!due) return false;
  try {
    await prisma.digestLog.create({ data: { shop, day: today } });
  } catch {
    return false; // another run got there first
  }
  const d = await buildDigest(shop, today);
  return sendEmail(d.recipients, d.subject, d.html, d.text);
}
