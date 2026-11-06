/**
 * Reports (Pro, D-77): busiest days, weekdays and time slots, orders by method and pickup location,
 * how far ahead customers book, date changes and cancellations, and this month against last month.
 * Computed from Pickday's own order records (core/reports.ts), in the store's time zone.
 */
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { addDays } from "../../core/civil";
import { CUSTOMER_ACTOR } from "../../core/customer-change";
import { hasFeature } from "../../core/publish";
import { REPORT_RANGES, computeReport, monthComparison, rangeDates, type ReportRange, type ReportRow } from "../../core/reports";
import { zonedToUtc } from "../../core/tz";
import prisma from "../db.server";
import { Locked, Page, Section, Select, Stack } from "../components/polaris";
import { useFormatDate, useMethodLabel, useWeekdays } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { adminContext } from "../services/settings.server";

/** Most orders read for one report (a store this busy would read a year in a few seconds). */
const MAX_ROWS = 20_000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const url = new URL(request.url);
  const range = (REPORT_RANGES as string[]).includes(url.searchParams.get("range") ?? "") ? (url.searchParams.get("range") as ReportRange) : "last90";
  const allowed = hasFeature(ctx.plan, "reports");
  const { from, to } = rangeDates(range, ctx.today);
  const base = { allowed, range, from, to, today: ctx.today, locations: ctx.settings.locations.map((l) => ({ id: l.id, name: l.name })) };
  if (!allowed) return { ...base, report: null, month: null, truncated: false };

  const select = { orderId: true, date: true, method: true, locationId: true, slotLabel: true, status: true, createdAt: true, history: true } as const;
  const direct = await prisma.scheduledOrder.findMany({ where: { shop: ctx.shop, date: { gte: from, lte: to } }, select, take: MAX_ROWS });
  // Orders with a date per item on different days: counted on the first of their days in the range.
  const items = await prisma.scheduledItem.findMany({ where: { shop: ctx.shop, date: { gte: from, lte: to } }, select: { orderId: true, date: true }, orderBy: { date: "asc" }, take: MAX_ROWS });
  const firstItemDate = new Map<string, string>();
  for (const i of items) if (!firstItemDate.has(i.orderId)) firstItemDate.set(i.orderId, i.date);
  const perItem = firstItemDate.size
    ? await prisma.scheduledOrder.findMany({ where: { shop: ctx.shop, date: null, orderId: { in: [...firstItemDate.keys()] } }, select })
    : [];
  const rows: ReportRow[] = [...direct, ...perItem].map((o) => ({
    date: o.date ?? firstItemDate.get(o.orderId)!,
    method: o.method,
    locationId: o.locationId,
    slotLabel: o.slotLabel,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    changes: Array.isArray(o.history) ? (o.history as { by?: string | null }[]).map((h) => ({ by: h?.by ?? null })) : [],
  }));
  const report = computeReport(rows, ctx.row.timeZone, (by) => by === CUSTOMER_ACTOR);

  // This month against last month, by when orders were placed.
  const lastStart = addDays(ctx.today.slice(0, 8) + "01", -1).slice(0, 8) + "01";
  const placed = await prisma.scheduledOrder.findMany({
    where: { shop: ctx.shop, createdAt: { gte: zonedToUtc(lastStart, "00:00", ctx.row.timeZone || "UTC") } },
    select: { createdAt: true },
    take: MAX_ROWS,
  });
  const month = monthComparison(
    placed.map((p) => p.createdAt.toISOString()),
    ctx.today,
    ctx.row.timeZone,
  );
  return { ...base, report, month, truncated: direct.length >= MAX_ROWS };
};

export default function ReportsPage() {
  const d = useLoaderData<typeof loader>();
  const t = useT();
  const { locale } = useI18n();
  const fmt = useFormatDate();
  const method = useMethodLabel();
  const weekdays = useWeekdays();
  const [params, setParams] = useSearchParams();
  const num = new Intl.NumberFormat(locale);
  const r = d.report;
  const setRange = (v: string) => {
    const n = new URLSearchParams(params);
    n.set("range", v);
    setParams(n, { preventScrollReset: true });
  };

  return (
    <Page title={t("reports.title")} subtitle={t("reports.subtitle")}>
      {!d.allowed ? (
        <Section>
          <Stack gap="base">
            <Locked plan="Pro" label={t("reports.locked")} upgradeLabel={t("common.upgrade")} />
            <s-paragraph>{t("reports.lockedText")}</s-paragraph>
          </Stack>
        </Section>
      ) : (
        <>
          <Section>
            <Stack gap="small-200">
              <Select label={t("reports.range")} value={d.range} options={REPORT_RANGES.map((x) => ({ value: x, label: t(`reports.range.${x}`) }))} onChange={setRange} />
              <s-text color="subdued">{t("reports.rangeHelp", { from: fmt(d.from, true), to: fmt(d.to, true) })}</s-text>
              {d.truncated ? <s-banner tone="warning">{t("reports.truncated")}</s-banner> : null}
            </Stack>
          </Section>

          {d.month ? (
            <Section heading={t("reports.monthHeading")}>
              <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
                <Stat label={t("reports.thisMonth")} value={num.format(d.month.thisMonth)} />
                <Stat label={t("reports.lastMonthSoFar")} value={num.format(d.month.lastMonthSoFar)} />
                <Stat label={t("reports.lastMonth")} value={num.format(d.month.lastMonth)} />
              </s-grid>
              <s-box paddingBlockStart="small-200">
                <s-text color="subdued">
                  {d.month.change === null ? t("reports.noComparison") : d.month.change >= 0 ? t("reports.up", { pct: d.month.change }) : t("reports.down", { pct: -d.month.change })}
                </s-text>
              </s-box>
            </Section>
          ) : null}

          {r && r.orders + r.cancelled === 0 ? (
            <Section>
              <Stack gap="small-200">
                <s-heading>{t("reports.emptyHeading")}</s-heading>
                <s-paragraph>{t("reports.emptyText")}</s-paragraph>
              </Stack>
            </Section>
          ) : r ? (
            <>
              <Section heading={t("reports.summaryHeading")}>
                <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
                  <Stat label={t("reports.orders")} value={num.format(r.orders)} />
                  <Stat label={t("reports.cancelled")} value={num.format(r.cancelled)} />
                  <Stat label={t("reports.changed")} value={num.format(r.changedOrders)} hint={t("reports.changedHint", { customer: r.changesByCustomer, staff: r.changesByStaff })} />
                  <Stat label={t("reports.avgLead")} value={r.avgLeadDays === null ? "—" : t("reports.days", { count: r.avgLeadDays })} />
                </s-grid>
              </Section>

              <Section heading={t("reports.methodHeading")}>
                <Bars rows={r.byMethod.map((m) => ({ label: method(m.method), value: m.orders, note: `${m.pct}%` }))} />
                {r.byLocation.length > 1 || (r.byLocation.length === 1 && r.byLocation[0].id) ? (
                  <s-box paddingBlockStart="base">
                    <s-text type="strong">{t("reports.locationHeading")}</s-text>
                    <Bars rows={r.byLocation.map((l) => ({ label: d.locations.find((x) => x.id === l.id)?.name ?? t("reports.atStore"), value: l.orders }))} />
                  </s-box>
                ) : null}
              </Section>

              <Section heading={t("reports.weekdayHeading")}>
                <Bars rows={weekdays.map((w) => ({ label: w.long, value: r.weekdays[w.value] }))} />
              </Section>

              <Section heading={t("reports.busiestHeading")}>
                <Stack gap="base">
                  <Bars rows={r.busiestDays.map((x) => ({ label: fmt(x.date, true), value: x.orders }))} />
                  {r.slots.length ? (
                    <>
                      <s-text type="strong">{t("reports.slotHeading")}</s-text>
                      <Bars rows={r.slots.map((x) => ({ label: x.label.replace("-", "–"), value: x.orders }))} />
                    </>
                  ) : null}
                </Stack>
              </Section>

              <Section heading={t("reports.leadHeading")}>
                <Stack gap="small-200">
                  <s-text color="subdued">{t("reports.leadHelp")}</s-text>
                  <Bars rows={r.lead.map((x) => ({ label: t(`reports.lead.${x.bucket}`), value: x.orders, note: `${x.pct}%` }))} />
                </Stack>
              </Section>
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}

function Stat(p: { label: string; value: string; hint?: string }) {
  return (
    <s-box border="base" borderRadius="base" padding="base">
      <Stack gap="small-200">
        <s-text color="subdued">{p.label}</s-text>
        <s-heading>{p.value}</s-heading>
        {p.hint ? <s-text color="subdued">{p.hint}</s-text> : null}
      </Stack>
    </s-box>
  );
}

/** Horizontal bars: readable on a phone, and as a list for screen readers. */
function Bars({ rows }: { rows: { label: string; value: number; note?: string }[] }) {
  const { locale } = useI18n();
  const num = new Intl.NumberFormat(locale);
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="pd-bars">
      <style>{BARS_CSS}</style>
      {rows.map((r) => (
        <li key={r.label}>
          <span className="pd-bar-label">{r.label}</span>
          <span className="pd-bar-track" aria-hidden="true">
            <span className="pd-bar-fill" style={{ width: `${Math.round((r.value / top) * 100)}%` }} />
          </span>
          <span className="pd-bar-value">
            {num.format(r.value)}
            {r.note ? ` · ${r.note}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

const BARS_CSS = `
.pd-bars{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}
.pd-bars li{display:grid;grid-template-columns:minmax(90px,30%) 1fr auto;gap:8px;align-items:center;font-size:13px}
.pd-bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-bar-track{height:10px;border-radius:5px;background:#ebebeb;overflow:hidden}
.pd-bar-fill{display:block;height:100%;background:#2c6ecb;border-radius:5px}
.pd-bar-value{font-variant-numeric:tabular-nums;color:#4a4a4a;white-space:nowrap}
`;
