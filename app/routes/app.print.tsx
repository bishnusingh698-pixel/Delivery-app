import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { isValidDate } from "../../core/civil";
import { adminContext } from "../services/settings.server";
import { adminT } from "../services/admin-t.server";
import { daySheet, liveDetails, productionSheet, routeSheet } from "../services/print.server";
import { parseFilters, production, whereFor } from "../services/orders-query.server";
import { hasFeature } from "../../core/publish";

/**
 * Printable HTML (fetched by the admin with the session token, then printed from
 * an iframe). kind=day|route|production.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const url = new URL(request.url);
  const { t, lang, dateLabel } = await adminT(ctx.row);
  const kind = url.searchParams.get("kind");
  const html = (s: string) => new Response(s, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

  if (kind === "production") {
    const from = url.searchParams.get("from") ?? ctx.today;
    const to = url.searchParams.get("to") ?? from;
    if (!isValidDate(from) || !isValidDate(to)) return new Response("Bad date", { status: 400 });
    const rows = await production(ctx.shop, from, to, { method: url.searchParams.get("method") ?? undefined, location: url.searchParams.get("location") ?? undefined }, ctx.settings.productionPrepOffsetDays);
    return html(productionSheet(t, lang, from === to ? dateLabel(from) : `${dateLabel(from)} – ${dateLabel(to)}`, rows));
  }

  if (kind === "route" && !hasFeature(ctx.plan, "routeSheet")) return new Response("Upgrade", { status: 402 });
  // Day and route sheets use the Orders page filters, or explicit order ids (selection).
  const f = parseFilters(url, ctx.today);
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean).slice(0, 500);
  const where = ids?.length ? { shop: ctx.shop, orderId: { in: ids } } : whereFor(ctx.shop, f);
  const orders = await prisma.scheduledOrder.findMany({ where, orderBy: [{ date: "asc" }, { slotLabel: "asc" }, { orderName: "asc" }], take: 500 });
  const live = await liveDetails(ctx.admin, orders.map((o) => o.orderId));
  const dates = [...new Set(orders.map((o) => o.date).filter(Boolean))] as string[];
  const label = dates.length === 1 ? dateLabel(dates[0]) : dates.length ? `${dateLabel(dates[0])} – ${dateLabel(dates[dates.length - 1])}` : f.dateFrom ? dateLabel(f.dateFrom) : "";
  if (kind === "route") return html(routeSheet(t, lang, ctx.settings, label, orders, live));
  return html(daySheet(t, lang, ctx.settings, dates[0] ?? ctx.today, label, orders, live));
};
