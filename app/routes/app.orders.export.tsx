import { hasFeature } from "../../core/publish";
import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { adminContext } from "../services/settings.server";
import { adminT } from "../services/admin-t.server";
import { isValidDate } from "../../core/civil";
import { orderRow, parseFilters, production, resolveWhere, toCsv } from "../services/orders-query.server";

/** CSV export of the filtered (or selected) orders, or of the production list (?kind=production). */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const url = new URL(request.url);
  const { t } = await adminT(ctx.row);
  const csv = (name: string, body: string) =>
    new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });

  if (url.searchParams.get("kind") === "production") {
    if (!hasFeature(ctx.plan, "production")) return new Response("Upgrade", { status: 402 });
    const from = url.searchParams.get("from") ?? ctx.today;
    const to = url.searchParams.get("to") ?? from;
    if (!isValidDate(from) || !isValidDate(to)) return new Response("Bad date", { status: 400 });
    const rows = await production(ctx.shop, from, to, { method: url.searchParams.get("method") ?? undefined, location: url.searchParams.get("location") ?? undefined }, ctx.settings.productionPrepOffsetDays);
    return csv(`production-${from}${to !== from ? `_${to}` : ""}.csv`, toCsv(
      [t("production.colProduct"), t("production.colVariant"), t("production.colQty"), t("production.colOrders"), t("production.colSlots")],
      rows.map((r) => [r.title, r.variant, r.qty, r.orders, r.slots.map((s) => `${s.slot}: ${s.qty}`).join("; ")]),
    ));
  }

  const f = parseFilters(url, ctx.today, ctx.settings.weekStart);
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean).slice(0, 5000);
  const where = ids?.length ? { shop: ctx.shop, orderId: { in: ids } } : await resolveWhere(ctx.shop, f);
  const orders = await prisma.scheduledOrder.findMany({ where, orderBy: [{ date: "asc" }, { slotLabel: "asc" }], take: 5000 });
  const rows = orders.map((o) => orderRow(o, ctx.settings));
  return csv(`orders-${ctx.today}.csv`, toCsv(
    [t("orders.colOrder"), t("orders.colCustomer"), t("orders.colMethod"), t("orders.colDate"), t("orders.colSlot"), t("orders.colPlace"), t("orders.colItems"), t("orders.colStatus"), t("print.items")],
    rows.map((r) => [r.name, r.customer, t(`method.${r.method}`), r.date ?? r.itemDates.join(" "), r.slot, r.place, r.items, t(`orders.status.${r.status}`), r.lines.map((l) => `${l.qty} x ${l.title}${l.variant ? ` (${l.variant})` : ""}`).join("; ")]),
  ));
};
