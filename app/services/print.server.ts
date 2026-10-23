/**
 * Printable sheets (day sheet, route sheet, production list). Addresses, phones and
 * notes are fetched live from Shopify for printing and never stored (privacy).
 */
import type { ScheduledOrder } from "@prisma/client";
import type { T } from "../i18n";
import type { MethodId, Settings } from "../../core/types";
import { gql, gid, type AdminGraphql } from "./graphql.server";
import { orderRow } from "./orders-query.server";
import { normalizePostcode } from "../../core/postcode";
import { isRtl } from "../../core/i18n/locales";

export interface LiveOrder {
  note: string | null;
  phone: string | null;
  address: { name: string | null; address1: string | null; address2: string | null; zip: string | null; city: string | null; phone: string | null } | null;
}

/** Notes, addresses and phones for printing (chunks of 100). Fails soft: sheets still print without them. */
export async function liveDetails(admin: AdminGraphql, orderIds: string[]): Promise<Map<string, LiveOrder>> {
  const out = new Map<string, LiveOrder>();
  for (let i = 0; i < orderIds.length; i += 100) {
    const ids = orderIds.slice(i, i + 100).map((id) => gid("Order", id));
    try {
      const d = await gql(admin, `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Order { id note phone shippingAddress { name address1 address2 zip city phone } } } }`, { ids });
      for (const n of d.nodes ?? []) {
        if (!n?.id) continue;
        out.set(String(n.id).split("/").pop()!, { note: n.note ?? null, phone: n.phone ?? n.shippingAddress?.phone ?? null, address: n.shippingAddress ?? null });
      }
    } catch (e) {
      console.error("[print] live details", (e as Error).message);
    }
  }
  return out;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, lang: string) {
  return `<!doctype html><html lang="${esc(lang)}" dir="${isRtl(lang) ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  body{font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:24px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:16px;margin:20px 0 6px;border-bottom:2px solid #111;padding-bottom:2px} h3{font-size:14px;margin:12px 0 4px}
  table{border-collapse:collapse;width:100%;margin-bottom:8px} th,td{border:1px solid #bbb;padding:4px 6px;text-align:start;vertical-align:top} th{background:#f2f2f2}
  .muted{color:#555} .box{display:inline-block;width:14px;height:14px;border:1px solid #111;vertical-align:middle}
  @media print{body{margin:0} h2{break-after:avoid} tr{break-inside:avoid}}
  </style></head><body>${body}</body></html>`;
}

function methodName(settings: Settings, m: MethodId, lang: string, t: T) {
  const names = settings.methods[m]?.names ?? {};
  return names[lang] || names.en || t(`method.${m}`);
}

/** Day sheet: grouped method → slot → order, with items and notes; address for local delivery. */
export function daySheet(t: T, lang: string, settings: Settings, date: string, dateLabel: string, orders: ScheduledOrder[], live: Map<string, LiveOrder>) {
  const byMethod = new Map<MethodId, ScheduledOrder[]>();
  for (const o of orders) byMethod.set(o.method as MethodId, [...(byMethod.get(o.method as MethodId) ?? []), o]);
  let body = `<h1>${esc(t("print.dayTitle", { date: dateLabel }))}</h1><p class="muted">${esc(t("print.orderCount", { count: orders.length }))}</p>`;
  for (const [m, list] of byMethod) {
    body += `<h2>${esc(methodName(settings, m, lang, t))} (${list.length})</h2>`;
    const bySlot = new Map<string, ScheduledOrder[]>();
    for (const o of list) bySlot.set(o.slotLabel ?? "", [...(bySlot.get(o.slotLabel ?? "") ?? []), o]);
    for (const [slot, group] of [...bySlot].sort(([a], [b]) => a.localeCompare(b))) {
      if (slot) body += `<h3>${esc(slot.replace("-", "–"))}</h3>`;
      body += `<table><thead><tr><th style="width:24px"></th><th>${esc(t("orders.colOrder"))}</th><th>${esc(t("orders.colCustomer"))}</th><th>${esc(t("print.items"))}</th>${m === "delivery" ? `<th>${esc(t("print.address"))}</th>` : m === "pickup" ? `<th>${esc(t("orders.colPlace"))}</th>` : ""}<th>${esc(t("print.note"))}</th></tr></thead><tbody>`;
      for (const o of group) {
        const r = orderRow(o, settings);
        const l = live.get(o.orderId);
        const addr = l?.address ? [l.address.name, l.address.address1, l.address.address2, [l.address.zip, l.address.city].filter(Boolean).join(" "), l.phone].filter(Boolean).map(esc).join("<br>") : "";
        body += `<tr><td><span class="box"></span></td><td>${esc(r.name)}</td><td>${esc(r.customer ?? "")}</td><td>${r.lines.map((i) => `${i.qty} × ${esc(i.title)}${i.variant ? ` <span class="muted">(${esc(i.variant)})</span>` : ""}`).join("<br>")}</td>${m === "delivery" ? `<td>${addr}</td>` : m === "pickup" ? `<td>${esc(r.place ?? "")}</td>` : ""}<td>${esc(l?.note ?? "")}</td></tr>`;
      }
      body += `</tbody></table>`;
    }
  }
  if (!orders.length) body += `<p>${esc(t("print.none"))}</p>`;
  return page(t("print.dayTitle", { date: dateLabel }), body, lang);
}

/** Route sheet: local delivery orders sorted by zone, then postcode. */
export function routeSheet(t: T, lang: string, settings: Settings, dateLabel: string, orders: ScheduledOrder[], live: Map<string, LiveOrder>) {
  const zoneName = (id: string | null) => settings.zones.find((z) => z.id === id)?.name ?? "";
  // Zones are routed in the order the merchant listed them; orders without a zone go last.
  const zoneRank = (id: string | null) => {
    const i = settings.zones.findIndex((z) => z.id === id);
    return i < 0 ? settings.zones.length : i;
  };
  const sorted = orders
    .filter((o) => o.method === "delivery")
    .map((o) => ({ o, zip: normalizePostcode(live.get(o.orderId)?.address?.zip ?? o.area ?? ""), zone: zoneName(o.zoneId), rank: zoneRank(o.zoneId) }))
    .sort((a, b) => a.rank - b.rank || a.zip.localeCompare(b.zip, undefined, { numeric: true }) || (a.o.slotLabel ?? "").localeCompare(b.o.slotLabel ?? ""));
  let body = `<h1>${esc(t("print.routeTitle", { date: dateLabel }))}</h1><p class="muted">${esc(t("print.orderCount", { count: sorted.length }))}</p>`;
  body += `<table><thead><tr><th>#</th><th>${esc(t("print.zone"))}</th><th>${esc(t("orders.colSlot"))}</th><th>${esc(t("orders.colOrder"))}</th><th>${esc(t("print.address"))}</th><th>${esc(t("print.phone"))}</th><th>${esc(t("print.items"))}</th><th>${esc(t("print.note"))}</th></tr></thead><tbody>`;
  sorted.forEach(({ o, zone }, i) => {
    const l = live.get(o.orderId);
    const a = l?.address;
    const r = orderRow(o, settings);
    body += `<tr><td>${i + 1}</td><td>${esc(zone)}</td><td>${esc((o.slotLabel ?? "").replace("-", "–"))}</td><td>${esc(o.orderName)}<br>${esc(o.customerFirst ?? "")}</td><td>${a ? [a.name, a.address1, a.address2, [a.zip, a.city].filter(Boolean).join(" ")].filter(Boolean).map(esc).join("<br>") : `<span class="muted">${esc(o.area ?? "")}</span>`}</td><td>${esc(l?.phone ?? "")}</td><td>${r.items}</td><td>${esc(l?.note ?? "")}</td></tr>`;
  });
  body += `</tbody></table>`;
  if (!sorted.length) body += `<p>${esc(t("print.none"))}</p>`;
  return page(t("print.routeTitle", { date: dateLabel }), body, lang);
}

export function productionSheet(t: T, lang: string, rangeLabel: string, rows: { title: string; variant: string | null; qty: number; orders: number; slots: { slot: string; qty: number }[] }[]) {
  let body = `<h1>${esc(t("production.printTitle", { range: rangeLabel }))}</h1>`;
  body += `<table><thead><tr><th style="width:24px"></th><th>${esc(t("production.colProduct"))}</th><th>${esc(t("production.colVariant"))}</th><th>${esc(t("production.colQty"))}</th><th>${esc(t("production.colOrders"))}</th><th>${esc(t("production.colSlots"))}</th></tr></thead><tbody>`;
  for (const r of rows) {
    body += `<tr><td><span class="box"></span></td><td>${esc(r.title)}</td><td>${esc(r.variant ?? "")}</td><td><strong>${r.qty}</strong></td><td>${r.orders}</td><td>${r.slots.map((s) => `${esc(s.slot.replace("-", "–"))}: ${s.qty}`).join("<br>")}</td></tr>`;
  }
  body += `</tbody></table>`;
  if (!rows.length) body += `<p>${esc(t("print.none"))}</p>`;
  return page(t("production.printTitle", { range: rangeLabel }), body, lang);
}
