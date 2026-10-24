import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { isValidDate } from "../../core/civil";
import { CUSTOMER_ACTOR } from "../../core/customer-change";
import { METHOD_IDS, type MethodId } from "../../core/types";
import { Button, Checkbox, EmptyState, Modal, Page, Section, Select, Stack, closeModal, openModal } from "../components/polaris";
import { useFormatDate, useMethodLabel } from "../components/shared";
import { useT } from "../i18n/react";
import { adminContext } from "../services/settings.server";
import { adminCalendar, getOrderSchedule, setOrderSchedule } from "../services/reschedule.server";
import { toLine, type StoredItem } from "../services/counts.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const url = new URL(request.url);
  const id = String(params.id).replace(/\D/g, "");
  let base;
  try {
    base = await getOrderSchedule(ctx.shop, ctx.admin, id);
  } catch {
    return { found: false as const, id };
  }
  const lines = (base.info.items as StoredItem[]).filter((i) => i.needsDate !== false).map(toLine);
  const method = (url.searchParams.get("method") as MethodId) || (base.existing?.method as MethodId) || ctx.settings.defaultMethod || "shipping";
  const location = url.searchParams.get("location") || base.existing?.locationId || null;
  const cal = method === base.existing?.method && location === (base.existing?.locationId ?? null) ? base : await adminCalendar(ctx.shop, method, location, base.existing, lines);
  const s = ctx.settings;
  const o = base.existing;
  return {
    found: true as const,
    id,
    name: base.info.name,
    customer: base.info.first,
    order: o ? { method: o.method as MethodId, date: o.date, slot: o.slotLabel, slotId: o.slotId, locationId: o.locationId, status: o.status, limited: o.limited, tags: o.tags, history: (o.history ?? []) as { at: string; by: string | null; from: { method: string; date: string | null; slot: string | null } | null; to: { method: string; date: string; slot: string | null }; forced?: boolean }[] } : null,
    items: (base.info.items as StoredItem[]).map((i) => ({ title: i.title, variant: i.variant ?? null, qty: i.qty, needsDate: i.needsDate !== false })),
    methods: s.methodOrder.filter((m) => s.methods[m].enabled),
    locations: s.locations.filter((l) => l.enabled).map((l) => ({ id: l.id, name: l.name })),
    place: s.locations.find((l) => l.id === o?.locationId)?.name ?? s.zones.find((z) => z.id === o?.zoneId)?.name ?? o?.area ?? null,
    pick: { method, location, days: cal.days.slice(0, 120).map((d) => ({ date: d.date, available: d.available, reason: d.reason, left: d.left, slots: d.slots.map((x) => ({ id: x.slot.id, label: `${x.slot.start}–${x.slot.end}`, available: x.available, left: x.left })) })) },
    timeZone: ctx.row.timeZone,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const ctx = await adminContext(request);
  const body = (await request.json()) as { method: MethodId; date: string; slotId: string | null; locationId: string | null; force: boolean };
  if (!METHOD_IDS.includes(body.method) || !isValidDate(body.date)) return { ok: false as const, reason: "invalid" };
  const r = await setOrderSchedule(ctx.shop, ctx.admin, String(params.id).replace(/\D/g, ""), { method: body.method, date: body.date, slotId: body.slotId, locationId: body.locationId }, { force: !!body.force, actor: ctx.actor });
  return r.ok ? { ok: true as const } : { ok: false as const, reason: r.reason };
};

export default function OrderDetail() {
  const data = useLoaderData<typeof loader>();
  const t = useT();
  const fmt = useFormatDate();
  const label = useMethodLabel();
  const [params] = useSearchParams();
  const back = { href: `/app/orders${params.get("back") ? `?${params.get("back")}` : ""}`, label: t("orders.title") };
  if (!data.found) {
    return (
      <Page title={t("order.notFound")} backTo={back}>
        <EmptyState heading={t("order.notFound")} text={t("order.notFoundText")} action={<Button href={back.href}>{t("orders.title")}</Button>} />
      </Page>
    );
  }
  const o = data.order;
  return (
    <Page
      title={data.name}
      subtitle={data.customer ?? undefined}
      backTo={back}
      primary={<Button slot="primary-action" variant="primary" onClick={() => openModal("change-modal")}>{o?.date ? t("order.change") : t("order.set")}</Button>}
      secondary={<Button slot="secondary-actions" href={`shopify://admin/orders/${data.id}`} target="_top">{t("order.openInShopify")}</Button>}
    >
      <Section heading={t("order.schedule")}>
        {o?.date ? (
          <Stack gap="small-200">
            <s-text type="strong">{fmt(o.date, true)}{o.slot ? `, ${o.slot.replace("-", "–")}` : ""}</s-text>
            <s-text>{label(o.method)}{data.place ? ` · ${data.place}` : ""}</s-text>
            <s-stack direction="inline" gap="small-200">
              <s-badge tone={o.status === "cancelled" ? "critical" : o.status === "fulfilled" ? "success" : "info"}>{t(`orders.status.${o.status}`)}</s-badge>
              {o.limited ? <s-badge tone="warning">{t("order.limited")}</s-badge> : null}
            </s-stack>
          </Stack>
        ) : (
          <s-text>{t("order.noSchedule")}</s-text>
        )}
      </Section>
      <Section heading={t("print.items")}>
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">{t("production.colProduct")}</s-table-header>
            <s-table-header>{t("production.colVariant")}</s-table-header>
            <s-table-header format="numeric">{t("production.colQty")}</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.items.map((i, n) => (
              <s-table-row key={n}>
                <s-table-cell>{i.title}{i.needsDate ? "" : ` (${t("order.noDateNeeded")})`}</s-table-cell>
                <s-table-cell>{i.variant ?? ""}</s-table-cell>
                <s-table-cell>{i.qty}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </Section>
      <Section heading={t("order.history")}>
        {o?.history.length ? (
          <Stack gap="small-200">
            {[...o.history].reverse().map((h, n) => (
              <s-text key={n}>
                {new Date(h.at).toLocaleString()} · {h.by === CUSTOMER_ACTOR ? t("customerChanges.byCustomer") : h.by ?? t("order.staff")}: {h.from?.date ? fmt(h.from.date) : "—"} → {fmt(h.to.date)}{h.to.slot ? ` ${h.to.slot}` : ""}{h.forced ? ` (${t("order.override")})` : ""}
              </s-text>
            ))}
          </Stack>
        ) : (
          <s-text color="subdued">{t("order.noHistory")}</s-text>
        )}
      </Section>
      <ChangeModal data={data} />
    </Page>
  );
}

type Found = Extract<ReturnType<typeof useLoaderData<typeof loader>>, { found: true }>;

function ChangeModal({ data }: { data: Found }) {
  const t = useT();
  const fmt = useFormatDate();
  const label = useMethodLabel();
  const shopify = useAppBridge();
  const revalidator = useRevalidator();
  const days = useFetcher<typeof loader>();
  const save = useFetcher<typeof action>();
  const [method, setMethod] = useState<MethodId>(data.pick.method);
  const [location, setLocation] = useState<string | null>(data.pick.location);
  const [date, setDate] = useState(data.order?.date ?? "");
  const [slot, setSlot] = useState(data.order?.slotId ?? "");
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (method === data.pick.method && location === data.pick.location) return;
    days.load(`/app/orders/${data.id}?method=${method}${location ? `&location=${location}` : ""}`);
  }, [method, location]);
  const pick = days.data && days.data.found && (days.data.pick.method === method) ? days.data.pick : data.pick;
  const day = pick.days.find((d) => d.date === date);

  useEffect(() => {
    if (!save.data) return;
    if (save.data.ok) {
      shopify.toast.show(t("order.saved"));
      closeModal("change-modal");
      revalidator.revalidate();
    }
  }, [save.data]);

  return (
    <Modal
      id="change-modal"
      heading={t("order.changeHeading")}
      primary={
        <Button slot="primary-action" variant="primary" loading={save.state !== "idle"} disabled={!date || (!!day?.slots.length && !slot)}
          onClick={() => save.submit({ method, date, slotId: slot || null, locationId: method === "pickup" ? location : null, force } as any, { method: "post", encType: "application/json" })}>
          {t("common.save")}
        </Button>
      }
      secondary={<Button slot="secondary-actions" commandFor="change-modal" command="--hide">{t("common.cancel")}</Button>}
    >
      <Stack gap="base">
        {save.data && !save.data.ok ? <s-banner tone="critical">{t("order.rejected", { reason: t(`reason.${save.data.reason}`, { detail: "" }) })}</s-banner> : null}
        {data.methods.length > 1 ? (
          <Select label={t("orders.colMethod")} value={method} options={data.methods.map((m) => ({ value: m, label: label(m) }))} onChange={(v) => { setMethod(v as MethodId); setDate(""); setSlot(""); }} />
        ) : null}
        {method === "pickup" && data.locations.length ? (
          <Select label={t("orders.location")} value={location ?? ""} options={data.locations.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => { setLocation(v || null); setDate(""); setSlot(""); }} />
        ) : null}
        <Select
          label={t("orders.colDate")}
          value={date}
          options={[
            { value: "", label: t("order.chooseDate") },
            ...pick.days.filter((d) => d.available || force).map((d) => ({ value: d.date, label: `${fmt(d.date)}${d.available ? (d.left !== null ? ` · ${t("order.left", { count: d.left })}` : "") : ` · ${t(`reason.${d.reason}`, { detail: "" })}`}` })),
          ]}
          onChange={(v) => { setDate(v); setSlot(""); }}
        />
        {day?.slots.length ? (
          <Select
            label={t("orders.colSlot")}
            value={slot}
            options={[{ value: "", label: t("order.chooseSlot") }, ...day.slots.filter((s) => s.available || force).map((s) => ({ value: s.id, label: `${s.label}${s.available ? (s.left !== null ? ` · ${t("order.left", { count: s.left })}` : "") : ` · ${t("reason.full", { detail: "" })}`}` }))]}
            onChange={setSlot}
          />
        ) : null}
        <Checkbox label={t("orders.ignoreLimits")} details={t("orders.ignoreLimitsHelp")} checked={force} onChange={setForce} />
        <s-text color="subdued">{t("order.tzNote", { zone: data.timeZone })}</s-text>
        <s-text color="subdued">{t("order.changeNote")}</s-text>
      </Stack>
    </Modal>
  );
}
