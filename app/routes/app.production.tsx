import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { addDays, isValidDate } from "../../core/civil";
import { hasFeature } from "../../core/publish";
import { Button, Locked, Page, Section, Select, Stack, TextField } from "../components/polaris";
import { downloadUrl, printUrl } from "../components/print";
import { useFormatDate, useMethodLabel } from "../components/shared";
import { useT } from "../i18n/react";
import { adminContext } from "../services/settings.server";
import { production } from "../services/orders-query.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const url = new URL(request.url);
  const tomorrow = addDays(ctx.today, 1);
  const from = isValidDate(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : tomorrow;
  const to = isValidDate(url.searchParams.get("to") ?? "") && url.searchParams.get("to")! >= from ? url.searchParams.get("to")! : from;
  const method = url.searchParams.get("method") ?? "";
  const location = url.searchParams.get("location") ?? "";
  const allowed = hasFeature(ctx.plan, "production");
  const s = ctx.settings;
  return {
    allowed,
    from,
    to,
    method,
    location,
    today: ctx.today,
    offset: s.productionPrepOffsetDays,
    methods: s.methodOrder.filter((m) => s.methods[m].enabled),
    locations: s.locations.map((l) => ({ id: l.id, name: l.name })),
    rows: allowed ? await production(ctx.shop, from, to, { method: method || undefined, location: location || undefined }, s.productionPrepOffsetDays) : [],
  };
};

export default function ProductionPage() {
  const d = useLoaderData<typeof loader>();
  const t = useT();
  const fmt = useFormatDate();
  const label = useMethodLabel();
  const shopify = useAppBridge();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    setParams(n, { preventScrollReset: true });
  };
  const q = new URLSearchParams({ from: d.from, to: d.to, ...(d.method ? { method: d.method } : {}), ...(d.location ? { location: d.location } : {}) }).toString();
  const run = (fn: () => Promise<void>) => fn().catch(() => shopify.toast.show(t("orders.actionFailed"), { isError: true }));
  const total = d.rows.reduce((n, r) => n + r.qty, 0);

  return (
    <Page
      title={t("production.title")}
      subtitle={t("production.subtitle")}
      primary={<Button slot="primary-action" variant="primary" icon="print" disabled={!d.allowed} onClick={() => run(() => printUrl(`/app/print?kind=production&${q}`))}>{t("production.print")}</Button>}
      secondary={<Button slot="secondary-actions" icon="export" disabled={!d.allowed} onClick={() => run(() => downloadUrl(`/app/orders/export?kind=production&${q}`, "production.csv"))}>{t("orders.exportCsv")}</Button>}
    >
      {!d.allowed ? <Locked plan="Pro" label={t("production.locked")} upgradeLabel={t("common.upgrade")} /> : null}
      <Section>
        <Stack direction="inline" gap="small-200" wrap>
          <Button variant={d.from === d.today && d.to === d.today ? "primary" : "secondary"} onClick={() => set({ from: d.today, to: d.today })}>{t("orders.range.today")}</Button>
          <Button variant={d.from === addDays(d.today, 1) && d.to === d.from ? "primary" : "secondary"} onClick={() => set({ from: addDays(d.today, 1), to: addDays(d.today, 1) })}>{t("orders.range.tomorrow")}</Button>
          <Button variant={d.from === d.today && d.to === addDays(d.today, 6) ? "primary" : "secondary"} onClick={() => set({ from: d.today, to: addDays(d.today, 6) })}>{t("orders.range.next7")}</Button>
        </Stack>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
          <TextField label={t("orders.from")} value={d.from} details="YYYY-MM-DD" onChange={(v) => isValidDate(v) && set({ from: v, ...(v > d.to ? { to: v } : {}) })} />
          <TextField label={t("orders.to")} value={d.to} details="YYYY-MM-DD" onChange={(v) => isValidDate(v) && set({ to: v })} />
          {d.methods.length > 1 ? <Select label={t("orders.colMethod")} value={d.method} options={[{ value: "", label: t("orders.any") }, ...d.methods.map((m) => ({ value: m, label: label(m) }))]} onChange={(v) => set({ method: v })} /> : null}
          {d.locations.length > 1 ? <Select label={t("orders.location")} value={d.location} options={[{ value: "", label: t("orders.any") }, ...d.locations.map((l) => ({ value: l.id, label: l.name }))]} onChange={(v) => set({ location: v })} /> : null}
        </s-grid>
        {d.offset ? <s-text color="subdued">{t("production.offsetNote", { count: d.offset })}</s-text> : null}
      </Section>
      <Section heading={d.from === d.to ? fmt(d.from, true) : `${fmt(d.from)} – ${fmt(d.to, true)}`}>
        {!d.rows.length ? (
          <s-text color="subdued">{t("production.empty")}</s-text>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">{t("production.colProduct")}</s-table-header>
              <s-table-header>{t("production.colVariant")}</s-table-header>
              <s-table-header format="numeric" listSlot="secondary">{t("production.colQty")}</s-table-header>
              <s-table-header format="numeric">{t("production.colOrders")}</s-table-header>
              <s-table-header>{t("production.colSlots")}</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.rows.map((r, i) => (
                <s-table-row key={i}>
                  <s-table-cell>{r.title}</s-table-cell>
                  <s-table-cell>{r.variant ?? ""}</s-table-cell>
                  <s-table-cell><s-text type="strong">{r.qty}</s-text></s-table-cell>
                  <s-table-cell>{r.orders}</s-table-cell>
                  <s-table-cell>
                    {r.slots.length ? (
                      open.has(i) ? (
                        <Stack gap="none">
                          {r.slots.map((s) => <s-text key={s.slot}>{s.slot.replace("-", "–")}: {s.qty}</s-text>)}
                        </Stack>
                      ) : (
                        <Button variant="tertiary" onClick={() => setOpen((o) => new Set(o).add(i))}>{t("production.showSlots", { count: r.slots.length })}</Button>
                      )
                    ) : (
                      ""
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
        {d.rows.length ? <s-text color="subdued">{t("production.total", { count: total })}</s-text> : null}
      </Section>
    </Page>
  );
}
