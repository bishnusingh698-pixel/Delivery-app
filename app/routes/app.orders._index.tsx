import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { addDays, addMonths, daysInMonth, firstOfMonth, isValidDate, weekday } from "../../core/civil";
import { weekOrder } from "../../core/i18n/week";
import { hasFeature } from "../../core/publish";
import type { MethodId } from "../../core/types";
import prisma from "../db.server";
import { Button, Checkbox, EmptyState, Locked, Modal, Page, Section, Select, Stack, TextField, closeModal, openModal } from "../components/polaris";
import { downloadUrl, printUrl } from "../components/print";
import { useFormatDate, useMethodLabel } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { adminContext } from "../services/settings.server";
import { dayCounts, listOrders, orderRow, parseFilters } from "../services/orders-query.server";
import { setOrderSchedule } from "../services/reschedule.server";
import { retryThrottled } from "../services/graphql.server";
import { storefrontConfigFor } from "../services/publish.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") === "calendar" ? "calendar" : "list";
  const f = parseFilters(url, ctx.today);
  const s = ctx.settings;
  const base = {
    view,
    today: ctx.today,
    plan: ctx.plan,
    filters: f,
    methods: s.methodOrder.filter((m) => s.methods[m].enabled),
    locations: s.locations.map((l) => ({ id: l.id, name: l.name })),
    zones: s.zones.map((z) => ({ id: z.id, name: z.name })),
    slotsByMethod: Object.fromEntries(s.methodOrder.map((m) => [m, s.methods[m].capacity.slots.map((x) => ({ id: x.id, label: `${x.start}–${x.end}` }))])) as Record<MethodId, { id: string; label: string }[]>,
    anyOrders: (await prisma.scheduledOrder.count({ where: { shop: ctx.shop } })) > 0,
  };
  if (view === "calendar" && !hasFeature(ctx.plan, "ordersCalendar")) return { ...base, month: null, days: null, rows: [], total: 0, pages: 1 };
  if (view === "calendar") {
    const month = isValidDate(url.searchParams.get("month") ?? "") ? firstOfMonth(url.searchParams.get("month")!) : firstOfMonth(ctx.today);
    const { config } = await storefrontConfigFor(ctx.shop);
    const end = addDays(addMonths(month, 1), -1);
    return { ...base, month, days: await dayCounts(ctx.shop, config, month, end), rows: [], total: 0, pages: 1 };
  }
  const { rows, total, pages } = await listOrders(ctx.shop, f);
  return { ...base, month: null, days: null, rows: rows.map((o) => orderRow(o, s)), total, pages };
};

/** Bulk reschedule: preview (capacity impact) then commit. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await adminContext(request);
  const body = (await request.json()) as { intent: "preview" | "commit"; ids: string[]; date: string; slotId: string | null; force: boolean };
  if (!hasFeature(ctx.plan, "bulkReschedule")) return { ok: false as const, error: "plan" };
  if (!isValidDate(body.date) || !Array.isArray(body.ids) || !body.ids.length) return { ok: false as const, error: "invalid" };
  const ids = body.ids.slice(0, 200).map(String);
  const orders = await prisma.scheduledOrder.findMany({ where: { shop: ctx.shop, orderId: { in: ids } } });
  if (body.intent === "preview") {
    const { config } = await storefrontConfigFor(ctx.shop);
    const day = (await dayCounts(ctx.shop, config, body.date, body.date))[body.date];
    const adding = orders.filter((o) => o.date !== body.date).reduce((n, o) => n + (config.methods.find((m) => m.id === o.method)?.capacity.unit === "items" ? o.itemCount : 1), 0);
    return { ok: true as const, preview: { count: orders.length, used: day.used, max: day.max, after: day.used + adding } };
  }
  const moved: string[] = [];
  const failed: { name: string; reason: string }[] = [];
  for (const o of orders) {
    const slotId = body.slotId && ctx.settings.methods[o.method as MethodId]?.capacity.slots.some((s) => s.id === body.slotId) ? body.slotId : o.slotId;
    try {
      // Shopify is updated before our record, so a rate-limited order can simply be tried again.
      const r = await retryThrottled(() => setOrderSchedule(ctx.shop, ctx.admin, o.orderId, { method: o.method as MethodId, date: body.date, slotId, locationId: o.locationId }, { force: body.force, actor: ctx.actor }));
      if (r.ok) moved.push(o.orderName);
      else failed.push({ name: o.orderName, reason: r.reason });
    } catch (e) {
      failed.push({ name: o.orderName, reason: (e as Error).message });
    }
  }
  return { ok: true as const, moved, failed };
};

type Data = ReturnType<typeof useLoaderData<typeof loader>>;

export default function OrdersPage() {
  const data = useLoaderData<typeof loader>();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { preventScrollReset: true });
  };

  return (
    <Page
      title={t("orders.title")}
      subtitle={t("orders.subtitle")}
      wide
      secondary={
        <s-button-group slot="secondary-actions">
          <Button variant={data.view === "list" ? "primary" : "secondary"} onClick={() => set({ view: null })}>{t("orders.viewList")}</Button>
          <Button variant={data.view === "calendar" ? "primary" : "secondary"} onClick={() => set({ view: "calendar" })}>{t("orders.viewCalendar")}</Button>
        </s-button-group>
      }
    >
      {!data.anyOrders ? (
        <EmptyState heading={t("orders.emptyHeading")} text={t("orders.emptyText")} action={<Button href="/app" variant="primary">{t("orders.emptyAction")}</Button>} />
      ) : data.view === "calendar" && !hasFeature(data.plan, "ordersCalendar") ? (
        <Locked plan="Starter" label={t("orders.calendarLocked")} upgradeLabel={t("common.upgrade")} />
      ) : data.view === "calendar" ? (
        <CalendarView data={data} onPick={(d) => navigate(`/app/orders?range=custom&from=${d}&to=${d}`)} onMonth={(m) => set({ month: m })} />
      ) : (
        <ListView data={data} set={set} />
      )}
    </Page>
  );
}

function Filters({ data, set }: { data: Data; set: (p: Record<string, string | null>) => void }) {
  const t = useT();
  const label = useMethodLabel();
  const f = data.filters;
  const [q, setQ] = useState(f.q);
  useEffect(() => setQ(f.q), [f.q]);
  useEffect(() => {
    if (q === f.q) return;
    const h = setTimeout(() => set({ q }), 400);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
      <TextField label={t("orders.search")} value={q} onChange={setQ} />
      <Select
        label={t("orders.range")}
        value={f.range}
        options={(["upcoming", "today", "tomorrow", "week", "next7", "custom", "all"] as const).map((r) => ({ value: r, label: t(`orders.range.${r}`) }))}
        onChange={(v) => set({ range: v, ...(v !== "custom" ? { from: null, to: null } : { from: data.today, to: data.today }) })}
      />
      {f.range === "custom" ? (
        <>
          <TextField label={t("orders.from")} value={f.from ?? ""} onChange={(v) => isValidDate(v) && set({ from: v })} />
          <TextField label={t("orders.to")} value={f.to ?? ""} onChange={(v) => isValidDate(v) && set({ to: v })} />
        </>
      ) : null}
      {data.methods.length > 1 ? (
        <Select label={t("orders.colMethod")} value={f.method} options={[{ value: "", label: t("orders.any") }, ...data.methods.map((m) => ({ value: m, label: label(m) }))]} onChange={(v) => set({ method: v })} />
      ) : null}
      {data.locations.length > 1 ? (
        <Select label={t("orders.location")} value={f.location} options={[{ value: "", label: t("orders.any") }, ...data.locations.map((l) => ({ value: l.id, label: l.name }))]} onChange={(v) => set({ location: v })} />
      ) : null}
      {data.zones.length ? (
        <Select label={t("orders.zone")} value={f.zone} options={[{ value: "", label: t("orders.any") }, ...data.zones.map((z) => ({ value: z.id, label: z.name }))]} onChange={(v) => set({ zone: v })} />
      ) : null}
      <Select
        label={t("orders.colStatus")}
        value={f.status}
        options={[{ value: "", label: t("orders.status.active") }, ...(["scheduled", "fulfilled", "cancelled"] as const).map((s) => ({ value: s, label: t(`orders.status.${s}`) }))]}
        onChange={(v) => set({ status: v })}
      />
      <TextField label={t("orders.tag")} value={f.tag} onChange={(v) => set({ tag: v })} />
    </s-grid>
  );
}

function ListView({ data, set }: { data: Data; set: (p: Record<string, string | null>) => void }) {
  const t = useT();
  const fmt = useFormatDate();
  const label = useMethodLabel();
  const shopify = useAppBridge();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [params.toString()]);
  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));
  const query = () => {
    const q = new URLSearchParams(params);
    q.delete("view");
    if (selected.size) q.set("ids", [...selected].join(","));
    return q.toString();
  };
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch {
      shopify.toast.show(t("orders.actionFailed"), { isError: true });
    }
  };
  const routeAllowed = hasFeature(data.plan, "routeSheet");
  const bulkAllowed = hasFeature(data.plan, "bulkReschedule");
  const csvAllowed = hasFeature(data.plan, "csvExport");

  return (
    <>
      <Section>
        <Filters data={data} set={set} />
      </Section>
      <Section>
        <Stack direction="inline" gap="small-200" justifyContent="space-between" alignItems="center">
          <s-text color="subdued">{selected.size ? t("orders.selected", { count: selected.size }) : t("orders.count", { count: data.total })}</s-text>
          <s-button-group>
            <Button disabled={!csvAllowed} onClick={() => run(() => downloadUrl(`/app/orders/export?${query()}`, "orders.csv"))} icon={csvAllowed ? "export" : "lock"}>{t("orders.exportCsv")}{csvAllowed ? "" : " (Starter)"}</Button>
            <Button onClick={() => run(() => printUrl(`/app/print?kind=day&${query()}`))} icon="print">{t("orders.printDay")}</Button>
            <Button disabled={!routeAllowed} onClick={() => run(() => printUrl(`/app/print?kind=route&${query()}`))} icon="location">{t("orders.printRoute")}{routeAllowed ? "" : " (Pro)"}</Button>
            <Button disabled={!selected.size || !bulkAllowed} onClick={() => openModal("bulk-modal")} icon="calendar">{t("orders.bulkReschedule")}{bulkAllowed ? "" : " (Pro)"}</Button>
          </s-button-group>
        </Stack>
        {data.rows.length === 0 ? (
          <s-box padding="large-200"><s-text>{t("orders.noMatch")}</s-text></s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>
                <Checkbox label={t("orders.selectAll")} labelAccessibilityVisibility="exclusive" checked={allOnPage} onChange={(v) => setSelected(v ? new Set(data.rows.map((r) => r.id)) : new Set())} />
              </s-table-header>
              <s-table-header listSlot="primary">{t("orders.colOrder")}</s-table-header>
              <s-table-header>{t("orders.colCustomer")}</s-table-header>
              <s-table-header>{t("orders.colMethod")}</s-table-header>
              <s-table-header listSlot="secondary">{t("orders.colDate")}</s-table-header>
              <s-table-header>{t("orders.colSlot")}</s-table-header>
              <s-table-header>{t("orders.colPlace")}</s-table-header>
              <s-table-header format="numeric">{t("orders.colItems")}</s-table-header>
              <s-table-header listSlot="inline">{t("orders.colStatus")}</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.rows.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>
                    <Checkbox label={r.name} labelAccessibilityVisibility="exclusive" checked={selected.has(r.id)} onChange={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} />
                  </s-table-cell>
                  <s-table-cell>
                    <s-link href={`/app/orders/${r.id}?back=${encodeURIComponent(params.toString())}`}>{r.name}</s-link>
                  </s-table-cell>
                  <s-table-cell>{r.customer ?? ""}</s-table-cell>
                  <s-table-cell>{label(r.method)}</s-table-cell>
                  <s-table-cell>{fmt(r.date)}</s-table-cell>
                  <s-table-cell>{r.slot?.replace("-", "–") ?? ""}</s-table-cell>
                  <s-table-cell>{r.place ?? ""}</s-table-cell>
                  <s-table-cell>{r.items}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={r.status === "cancelled" ? "critical" : r.status === "fulfilled" ? "success" : "info"}>{t(`orders.status.${r.status}`)}</s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
        {data.pages > 1 ? (
          <Stack direction="inline" gap="small-200" justifyContent="center" alignItems="center">
            <Button disabled={data.filters.page <= 1} onClick={() => set({ page: String(data.filters.page - 1) })} icon="chevron-left" accessibilityLabel={t("orders.prev")}>{""}</Button>
            <s-text>{t("orders.pageOf", { page: data.filters.page, pages: data.pages })}</s-text>
            <Button disabled={data.filters.page >= data.pages} onClick={() => set({ page: String(data.filters.page + 1) })} icon="chevron-right" accessibilityLabel={t("orders.next")}>{""}</Button>
          </Stack>
        ) : null}
      </Section>
      <BulkModal ids={[...selected]} data={data} rows={data.rows.filter((r) => selected.has(r.id))} />
    </>
  );
}

function BulkModal({ ids, data, rows }: { ids: string[]; data: Data; rows: Data["rows"] }) {
  const t = useT();
  const fmt = useFormatDate();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const [date, setDate] = useState(addDays(data.today, 1));
  const [slot, setSlot] = useState("");
  const [force, setForce] = useState(false);
  const methods = [...new Set(rows.map((r) => r.method))];
  const slots = methods.length === 1 ? data.slotsByMethod[methods[0]] ?? [] : [];
  const res = fetcher.data;

  useEffect(() => {
    if (ids.length && isValidDate(date)) fetcher.submit({ intent: "preview", ids, date, slotId: slot || null, force } as any, { method: "post", encType: "application/json" });
  }, [ids.join(","), date]);
  useEffect(() => {
    if (res && res.ok && "moved" in res) {
      shopify.toast.show(t("orders.bulkDone", { count: (res.moved ?? []).length }));
      if (!(res.failed ?? []).length) closeModal("bulk-modal");
    }
  }, [res]);

  const preview = res && res.ok && "preview" in res ? res.preview : null;
  return (
    <Modal
      id="bulk-modal"
      heading={t("orders.bulkHeading", { count: ids.length })}
      primary={
        <Button slot="primary-action" variant="primary" loading={fetcher.state !== "idle"} disabled={!isValidDate(date)} onClick={() => fetcher.submit({ intent: "commit", ids, date, slotId: slot || null, force } as any, { method: "post", encType: "application/json" })}>
          {t("orders.bulkConfirm", { count: ids.length, date: fmt(date) })}
        </Button>
      }
      secondary={<Button slot="secondary-actions" commandFor="bulk-modal" command="--hide">{t("common.cancel")}</Button>}
    >
      <Stack gap="base">
        <s-text>{t("orders.bulkHelp")}</s-text>
        <TextField label={t("orders.bulkDate")} value={date} onChange={setDate} details="YYYY-MM-DD" />
        {slots.length ? <Select label={t("orders.colSlot")} value={slot} options={[{ value: "", label: t("orders.bulkKeepSlot") }, ...slots.map((s) => ({ value: s.id, label: s.label }))]} onChange={setSlot} /> : null}
        {preview ? (
          <s-banner tone={preview.max !== null && preview.after > preview.max ? "warning" : "info"}>
            {preview.max !== null ? t("orders.bulkImpact", { date: fmt(date), used: preview.used, after: preview.after, max: preview.max }) : t("orders.bulkImpactNoLimit", { date: fmt(date), count: preview.count })}
          </s-banner>
        ) : null}
        <Checkbox label={t("orders.ignoreLimits")} checked={force} onChange={setForce} details={t("orders.ignoreLimitsHelp")} />
        {res && res.ok && "failed" in res && (res.failed ?? []).length ? (
          <s-banner tone="critical" heading={t("orders.bulkFailed", { count: (res.failed ?? []).length })}>
            {(res.failed ?? []).map((f) => `${f.name}: ${t(`reason.${f.reason}`, { detail: "" })}`).join(", ")}
          </s-banner>
        ) : null}
      </Stack>
    </Modal>
  );
}

function CalendarView({ data, onPick, onMonth }: { data: Data; onPick: (d: string) => void; onMonth: (m: string) => void }) {
  const t = useT();
  const { locale } = useI18n();
  const label = useMethodLabel();
  const month = data.month!;
  const days = data.days!;
  const order = weekOrder(locale);
  const lead = (weekday(month) - order[0] + 7) % 7;
  const n = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => addDays(month, i))] as (string | null)[];
  const title = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`)), [locale, month]);
  const wd = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const num = new Intl.NumberFormat(locale);
  return (
    <Section>
      <style>{CAL_CSS}</style>
      <Stack direction="inline" justifyContent="space-between" alignItems="center">
        <Button variant="tertiary" icon="chevron-left" accessibilityLabel={t("preview.prevMonth")} onClick={() => onMonth(addMonths(month, -1))}>{""}</Button>
        <s-heading>{title}</s-heading>
        <Button variant="tertiary" icon="chevron-right" accessibilityLabel={t("preview.nextMonth")} onClick={() => onMonth(addMonths(month, 1))}>{""}</Button>
      </Stack>
      <div className="pdc-grid" role="grid" aria-label={title}>
        {order.map((w) => (
          <div key={w} className="pdc-wd" role="columnheader">{wd.format(new Date(Date.UTC(2023, 0, 1 + w)))}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="pdc-empty" />;
          const day = days[d];
          const total = Object.values(day?.methods ?? {}).reduce((s, m) => s + (m?.orders ?? 0), 0);
          const pct = day?.max ? Math.min(100, Math.round((day.used / day.max) * 100)) : 0;
          const tone = pct >= 100 ? "full" : pct >= 80 ? "busy" : "ok";
          const desc = [
            ...Object.entries(day?.methods ?? {}).map(([m, c]) => `${label(m as MethodId)}: ${c?.orders}`),
            day?.max ? t("orders.capacity", { used: day.used, max: day.max }) : "",
          ].filter(Boolean).join(", ");
          return (
            <button key={d} type="button" className={`pdc-day ${d === data.today ? "today" : ""}`} onClick={() => onPick(d)} aria-label={`${d}: ${total ? desc : t("orders.noOrders")}`}>
              <span className="pdc-num">{num.format(Number(d.slice(8)))}</span>
              {Object.entries(day?.methods ?? {}).map(([m, c]) => (
                <span key={m} className="pdc-line">{label(m as MethodId)}: <strong>{c?.orders}</strong></span>
              ))}
              {day?.max ? (
                <span className={`pdc-bar ${tone}`} title={t("orders.capacity", { used: day.used, max: day.max })}>
                  <span style={{ width: `${pct}%` }} />
                  <em>{day.used} / {day.max}</em>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

const CAL_CSS = `
.pdc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:8px}
.pdc-wd{font-size:12px;color:#616161;text-align:center;padding:4px 0}
.pdc-day{display:flex;flex-direction:column;align-items:stretch;gap:2px;min-height:84px;padding:6px;border:1px solid #e3e3e3;border-radius:8px;background:#fff;font:inherit;font-size:12px;text-align:start;cursor:pointer;min-width:0;overflow:hidden}
.pdc-day:hover{border-color:#8a8a8a}.pdc-day:focus-visible{outline:2px solid #005bd3;outline-offset:1px}
.pdc-day.today{border-color:#303030;border-width:2px}
.pdc-num{font-weight:600;font-size:13px}
.pdc-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pdc-bar{position:relative;display:block;height:16px;border-radius:4px;background:#f1f1f1;margin-top:auto;overflow:hidden}
.pdc-bar span{position:absolute;inset-block:0;inset-inline-start:0;background:#91d0ff}
.pdc-bar.busy span{background:#ffd79d}.pdc-bar.full span{background:#fea3b4}
.pdc-bar em{position:relative;font-style:normal;font-size:11px;padding-inline-start:4px}
@media (max-width:600px){.pdc-day{min-height:56px;padding:3px}.pdc-line{display:none}}
`;
