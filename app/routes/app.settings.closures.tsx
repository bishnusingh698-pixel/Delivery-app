import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { addDays, addMonths, daysInMonth, weekday } from "../../core/civil";
import { closureMatches } from "../../core/engine";
import { weekOrder } from "../../core/i18n/week";
import { hasFeature } from "../../core/publish";
import type { Closure, MethodId, Settings, SpecialDay } from "../../core/types";
import prisma from "../db.server";
import { Button, Checkbox, DateField, Locked, Modal, MultiChoice, NumberField, Page, Section, Select, Switch, TextField, closeModal, openModal } from "../components/polaris";
import { SettingsChrome, useSettingsForm } from "../components/settings-form";
import { countryName, newId, useFormatDate, useMethodLabel } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { holidayCountries } from "../services/holidays.server";
import { adminContext, patchSettingsAction, shopMeta } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const counts = await prisma.capacityCount.groupBy({
    by: ["date"],
    where: { shop: ctx.shop, slotId: "", date: { gte: ctx.today } },
    _sum: { orders: true },
  });
  const s = ctx.settings;
  return {
    meta: shopMeta(ctx),
    lang: ctx.row.adminLocale,
    holidayCountries: holidayCountries(ctx.row.adminLocale).map((c) => c.code),
    ordersByDate: Object.fromEntries(counts.map((c) => [c.date, c._sum.orders ?? 0])),
    locations: s.locations.map((l) => ({ id: l.id, name: l.name })),
    initial: { closures: s.closures, specialDays: s.specialDays, vacation: s.vacation } as Pick<Settings, "closures" | "specialDays" | "vacation">,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => patchSettingsAction(request);

type HolidayResp = {
  country: string;
  region: string | null;
  regions: { code: string; name: string }[];
  holidays: { id: string; date: string; end: string; name: string; mayShift: boolean }[];
};

export default function ClosuresPage() {
  const { meta, lang, holidayCountries, ordersByDate, locations, initial } = useLoaderData<typeof loader>();
  const t = useT();
  const { locale } = useI18n();
  const label = useMethodLabel();
  const fmt = useFormatDate();
  const form = useSettingsForm(initial);
  const { draft, update } = form;
  const allowed = hasFeature(meta.plan, "closures");
  const methods: MethodId[] = ["delivery", "pickup", "shipping"];

  const ordersIn = (start: string, end: string) => {
    let n = 0;
    for (const [d, c] of Object.entries(ordersByDate)) if (d >= start && d <= end) n += c;
    return n;
  };

  /* ---------------- closure modal */
  const blank = (): Closure => ({ id: newId("c"), label: "", start: meta.today, end: meta.today, yearly: false, methods: "all", locations: "all", kind: "blackout" });
  const [editing, setEditing] = useState<Closure>(blank);
  const overlap = ordersIn(editing.start, editing.end || editing.start);
  const saveClosure = () => {
    update((d) => {
      const c = { ...editing, end: editing.end < editing.start ? editing.start : editing.end };
      const i = d.closures.findIndex((x) => x.id === c.id);
      if (i >= 0) d.closures[i] = c;
      else d.closures.push(c);
    });
    closeModal("closure-modal");
  };

  /* ---------------- special day modal */
  const [special, setSpecial] = useState<SpecialDay>({ id: newId("o"), date: meta.today, label: "", methods: "all", locations: "all", slots: null, maxPerDay: null });

  /* ---------------- holiday import */
  const hf = useFetcher<HolidayResp>();
  const [hCountry, setHCountry] = useState(meta.country || "US");
  const [hRegion, setHRegion] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const loadHolidays = (c = hCountry, r = hRegion) => hf.load(`/app/api/holidays?country=${c}&region=${r}&lang=${lang}`);
  useEffect(() => {
    if (hf.data) {
      const existing = new Set(draft.closures.filter((c) => c.kind === "holiday").map((c) => c.start + c.label));
      setPicked(hf.data.holidays.filter((h) => !existing.has(h.date + h.name)).map((h) => h.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hf.data]);
  const addHolidays = () => {
    const list = hf.data?.holidays.filter((h) => picked.includes(h.id)) ?? [];
    update((d) => {
      for (const h of list) {
        if (d.closures.some((c) => c.kind === "holiday" && c.start === h.date && c.label === h.name)) continue;
        d.closures.push({ id: newId("h"), label: h.name, start: h.date, end: h.end, yearly: false, methods: "all", locations: "all", kind: "holiday", mayShift: h.mayShift });
      }
    });
    closeModal("holiday-modal");
  };

  const visible = draft.closures.filter((c) => c.yearly || c.end >= meta.today).sort((a, b) => (a.start < b.start ? -1 : 1));
  const appliesText = (c: { methods: "all" | MethodId[]; locations: "all" | string[] }) =>
    [
      c.methods === "all" ? t("closures.allMethods") : c.methods.map(label).join(", "),
      c.locations === "all" ? null : locations.filter((l) => (c.locations as string[]).includes(l.id)).map((l) => l.name).join(", "),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <Page
      title={t("closures.title")}
      subtitle={t("closures.subtitle")}
      backTo={{ href: "/app/settings", label: t("nav.settings") }}
    >
      <SettingsChrome form={form} />
      {!allowed ? <Locked plan="Starter" label={t("closures.locked")} upgradeLabel={t("common.upgrade")} /> : null}

      <Section heading={t("closures.vacation")}>
        <s-stack gap="base">
          <Switch label={t("closures.vacationOn")} details={t("closures.vacationHelp")} checked={draft.vacation.enabled} onChange={(v) => update((d) => (d.vacation.enabled = v))} />
          {draft.vacation.enabled ? (
            <>
              <s-stack direction="inline" gap="base">
                <DateField label={t("closures.closedFrom")} value={draft.vacation.start} onChange={(v) => update((d) => (d.vacation.start = v))} />
                <DateField label={t("closures.closedUntil")} value={draft.vacation.end} onChange={(v) => update((d) => (d.vacation.end = v))} />
              </s-stack>
              {meta.locales.map((loc) => (
                <TextField
                  key={loc}
                  label={`${t("closures.vacationMessage")} (${loc})`}
                  placeholder={t("closures.vacationMessageExample")}
                  multiline={2}
                  maxLength={200}
                  value={draft.vacation.message[loc] ?? ""}
                  onChange={(v) => update((d) => (v ? (d.vacation.message[loc] = v) : delete d.vacation.message[loc]))}
                />
              ))}
              {draft.vacation.start && ordersIn(draft.vacation.start, draft.vacation.end ?? "9999-12-31") ? (
                <s-banner tone="warning">
                  {t("closures.overlap", { count: ordersIn(draft.vacation.start, draft.vacation.end ?? "9999-12-31") })}{" "}
                  <s-link href={`/app/orders?from=${draft.vacation.start}&to=${draft.vacation.end ?? ""}`}>{t("closures.viewThem")}</s-link>
                </s-banner>
              ) : null}
            </>
          ) : null}
        </s-stack>
      </Section>

      <Section heading={t("closures.year")}>
        <YearCalendar
          today={meta.today}
          closures={draft.closures}
          specials={draft.specialDays}
          locale={locale}
          onToggle={(date) =>
            update((d) => {
              const hit = d.closures.find((c) => !c.yearly && c.start === date && c.end === date && c.methods === "all" && c.locations === "all");
              if (hit) d.closures = d.closures.filter((c) => c !== hit);
              else d.closures.push({ id: newId("c"), label: "", start: date, end: date, yearly: false, methods: "all", locations: "all", kind: "blackout" });
            })
          }
        />
      </Section>

      <Section heading={t("closures.list")}>
        <s-stack gap="base">
          <s-stack direction="inline" gap="small-200">
            <Button
              variant="primary"
              disabled={!allowed}
              onClick={() => {
                setEditing(blank());
                openModal("closure-modal");
              }}
            >
              {t("closures.add")}
            </Button>
            <Button disabled={!allowed} onClick={() => openModal("special-modal")}>
              {t("closures.addSpecial")}
            </Button>
            <Button
              disabled={!allowed}
              onClick={() => {
                loadHolidays();
                openModal("holiday-modal");
              }}
            >
              {t("closures.importHolidays")}
            </Button>
          </s-stack>
          {visible.length ? (
            <s-table>
              <s-table-header-row>
                <s-table-header>{t("closures.label")}</s-table-header>
                <s-table-header>{t("closures.dates")}</s-table-header>
                <s-table-header>{t("closures.appliesTo")}</s-table-header>
                <s-table-header>{t("common.actions")}</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {visible.map((c) => (
                  <s-table-row key={c.id}>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-text>{c.label || t("closures.closed")}</s-text>
                        {c.kind === "holiday" ? <s-badge tone="info">{t("closures.holiday")}</s-badge> : null}
                        {c.yearly ? <s-badge>{t("closures.yearly")}</s-badge> : null}
                        {c.mayShift ? <s-badge tone="warning">{t("closures.mayShift")}</s-badge> : null}
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>{c.yearly ? `${c.start.slice(-5)} – ${c.end.slice(-5)}` : c.start === c.end ? fmt(c.start, true) : `${fmt(c.start)} – ${fmt(c.end, true)}`}</s-table-cell>
                    <s-table-cell>{appliesText(c)}</s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200">
                        <Button
                          variant="tertiary"
                          icon="edit"
                          accessibilityLabel={t("common.edit")}
                          onClick={() => {
                            setEditing({ ...c });
                            openModal("closure-modal");
                          }}
                        >
                          {""}
                        </Button>
                        <Button variant="tertiary" tone="critical" icon="delete" accessibilityLabel={t("common.delete")} onClick={() => update((d) => (d.closures = d.closures.filter((x) => x.id !== c.id)))}>
                          {""}
                        </Button>
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          ) : (
            <s-text color="subdued">{t("closures.none")}</s-text>
          )}
          {draft.closures.some((c) => c.mayShift) ? <s-text color="subdued">{t("closures.mayShiftNote")}</s-text> : null}

          {draft.specialDays.filter((s) => s.date >= meta.today).length ? (
            <s-stack gap="small-200">
              <s-heading>{t("closures.specials")}</s-heading>
              {draft.specialDays
                .filter((s) => s.date >= meta.today)
                .map((s) => (
                  <s-stack key={s.id} direction="inline" gap="base" alignItems="center">
                    <s-badge tone="success">{fmt(s.date, true)}</s-badge>
                    <s-text>{s.label}</s-text>
                    <s-text color="subdued">{appliesText(s)}</s-text>
                    <Button variant="tertiary" tone="critical" onClick={() => update((d) => (d.specialDays = d.specialDays.filter((x) => x.id !== s.id)))}>
                      {t("common.remove")}
                    </Button>
                  </s-stack>
                ))}
            </s-stack>
          ) : null}
        </s-stack>
      </Section>

      <Modal
        id="closure-modal"
        heading={t("closures.add")}
        primary={
          <Button slot="primary-action" variant="primary" onClick={saveClosure}>
            {t("common.done")}
          </Button>
        }
        secondary={
          <Button slot="secondary-actions" onClick={() => closeModal("closure-modal")}>
            {t("common.cancel")}
          </Button>
        }
      >
        <s-stack gap="base">
          <TextField label={t("closures.label")} placeholder={t("closures.labelExample")} value={editing.label} maxLength={100} onChange={(v) => setEditing({ ...editing, label: v })} />
          <s-stack direction="inline" gap="base">
            <DateField label={t("closures.from")} value={editing.start.length === 10 ? editing.start : null} onChange={(v) => v && setEditing({ ...editing, start: v, end: editing.end < v ? v : editing.end })} />
            <DateField label={t("closures.to")} value={editing.end.length === 10 ? editing.end : null} onChange={(v) => v && setEditing({ ...editing, end: v })} />
          </s-stack>
          <Checkbox label={t("closures.repeatYearly")} checked={editing.yearly} onChange={(v) => setEditing({ ...editing, yearly: v })} />
          <MethodsChoice value={editing.methods} onChange={(v) => setEditing({ ...editing, methods: v })} />
          {locations.length ? (
            <MultiChoice
              label={t("closures.locations")}
              details={t("closures.locationsHelp")}
              values={editing.locations === "all" ? [] : editing.locations}
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
              onChange={(v) => setEditing({ ...editing, locations: v.length ? v : "all" })}
            />
          ) : null}
          {overlap ? (
            <s-banner tone="warning">
              {t("closures.overlap", { count: overlap })} <s-link href={`/app/orders?from=${editing.start}&to=${editing.end}`}>{t("closures.viewThem")}</s-link>
            </s-banner>
          ) : null}
        </s-stack>
      </Modal>

      <Modal
        id="special-modal"
        heading={t("closures.addSpecial")}
        primary={
          <Button
            slot="primary-action"
            variant="primary"
            onClick={() => {
              update((d) => d.specialDays.push(special));
              setSpecial({ ...special, id: newId("o") });
              closeModal("special-modal");
            }}
          >
            {t("common.done")}
          </Button>
        }
        secondary={
          <Button slot="secondary-actions" onClick={() => closeModal("special-modal")}>
            {t("common.cancel")}
          </Button>
        }
      >
        <s-stack gap="base">
          <s-text color="subdued">{t("closures.specialHelp")}</s-text>
          <DateField label={t("closures.date")} value={special.date} onChange={(v) => v && setSpecial({ ...special, date: v })} />
          <TextField label={t("closures.label")} placeholder={t("closures.specialExample")} value={special.label} onChange={(v) => setSpecial({ ...special, label: v })} />
          <MethodsChoice value={special.methods} onChange={(v) => setSpecial({ ...special, methods: v })} />
          <NumberField label={t("capacity.maxPerDay")} details={t("closures.specialMaxHelp")} min={0} value={special.maxPerDay} onChange={(v) => setSpecial({ ...special, maxPerDay: v })} />
        </s-stack>
      </Modal>

      <Modal
        id="holiday-modal"
        heading={t("closures.importHolidays")}
        size="large"
        primary={
          <Button slot="primary-action" variant="primary" disabled={!picked.length} onClick={addHolidays}>
            {t("closures.addSelected", { count: picked.length })}
          </Button>
        }
        secondary={
          <Button slot="secondary-actions" onClick={() => closeModal("holiday-modal")}>
            {t("common.cancel")}
          </Button>
        }
      >
        <s-stack gap="base">
          <s-stack direction="inline" gap="base">
            <Select
              label={t("closures.country")}
              value={hCountry}
              options={holidayCountries.map((c) => ({ value: c, label: countryName(c, locale) })).sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(v) => {
                setHCountry(v);
                setHRegion("");
                loadHolidays(v, "");
              }}
            />
            {hf.data?.regions.length ? (
              <Select
                label={t("closures.region")}
                value={hRegion}
                options={[{ value: "", label: t("closures.wholeCountry") }, ...hf.data.regions.map((r) => ({ value: r.code, label: r.name }))]}
                onChange={(v) => {
                  setHRegion(v);
                  loadHolidays(hCountry, v);
                }}
              />
            ) : null}
          </s-stack>
          {hf.state !== "idle" ? <s-spinner accessibilityLabel={t("common.loading")} /> : null}
          {hf.data && !hf.data.holidays.length ? <s-text color="subdued">{t("closures.noHolidays")}</s-text> : null}
          {hf.data?.holidays.map((h) => (
            <Checkbox
              key={h.id}
              label={`${fmt(h.date, true)}${h.end !== h.date ? ` – ${fmt(h.end)}` : ""} · ${h.name}`}
              details={h.mayShift ? t("closures.mayShiftNote") : undefined}
              checked={picked.includes(h.id)}
              onChange={(on) => setPicked(on ? [...picked, h.id] : picked.filter((x) => x !== h.id))}
            />
          ))}
          <s-text color="subdued">{t("closures.holidayDisclaimer")}</s-text>
        </s-stack>
      </Modal>
    </Page>
  );
}

function MethodsChoice(p: { value: "all" | MethodId[]; onChange: (v: "all" | MethodId[]) => void }) {
  const t = useT();
  const label = useMethodLabel();
  return (
    <MultiChoice
      label={t("closures.methods")}
      details={t("closures.methodsHelp")}
      values={p.value === "all" ? [] : p.value}
      options={(["delivery", "pickup", "shipping"] as MethodId[]).map((m) => ({ value: m, label: label(m) }))}
      onChange={(v) => p.onChange(v.length ? (v as MethodId[]) : "all")}
    />
  );
}

function YearCalendar(p: { today: string; closures: Closure[]; specials: SpecialDay[]; locale: string; onToggle: (d: string) => void }) {
  const t = useT();
  const order = weekOrder(p.locale);
  const start = p.today.slice(0, 8) + "01";
  const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  const num = useMemo(() => new Intl.NumberFormat(p.locale), [p.locale]);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(p.locale, { month: "long", year: "numeric", timeZone: "UTC" }), [p.locale]);
  const status = (d: string) => {
    if (p.specials.some((s) => s.date === d)) return "special";
    const c = p.closures.find((x) => closureMatches(x, d));
    if (!c) return "";
    return c.kind === "holiday" ? "holiday" : "blackout";
  };
  return (
    <div>
      <style>{YEAR_CSS}</style>
      <div className="pd-year">
        {months.map((m) => {
          const y = Number(m.slice(0, 4));
          const mo = Number(m.slice(5, 7));
          const lead = (weekday(m) - order[0] + 7) % 7;
          return (
            <div key={m} className="pd-year-month">
              <div className="pd-year-title">{monthFmt.format(new Date(Date.UTC(y, mo - 1, 1)))}</div>
              <div className="pd-year-grid">
                {Array.from({ length: lead }).map((_, i) => (
                  <span key={`e${i}`} />
                ))}
                {Array.from({ length: daysInMonth(y, mo) }).map((_, i) => {
                  const d = addDays(m, i);
                  const st = status(d);
                  const past = d < p.today;
                  return (
                    <button
                      type="button"
                      key={d}
                      disabled={past}
                      className={`pd-y ${st} ${d === p.today ? "today" : ""}`}
                      aria-label={`${d} ${st ? t(`closures.legend.${st}`) : ""}`}
                      aria-pressed={st === "blackout"}
                      onClick={() => p.onToggle(d)}
                    >
                      {num.format(i + 1)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="pd-year-legend">
        <span className="blackout">{t("closures.legend.blackout")}</span>
        <span className="holiday">{t("closures.legend.holiday")}</span>
        <span className="special">{t("closures.legend.special")}</span>
      </div>
      <s-text color="subdued">{t("closures.clickToToggle")}</s-text>
    </div>
  );
}

const YEAR_CSS = `
.pd-year{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
.pd-year-title{font-weight:600;margin-bottom:4px;text-transform:capitalize}
.pd-year-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.pd-y{font:inherit;font-size:12px;padding:4px 0;border:1px solid transparent;border-radius:4px;background:#f7f7f7;cursor:pointer;color:#303030}
.pd-y:disabled{opacity:.4;cursor:default}
.pd-y.blackout{background:#303030;color:#fff}
.pd-y.holiday{background:#ffd6a4;color:#5e4200}
.pd-y.special{background:#cdfee1;color:#0c5132}
.pd-y.today{border-color:#005bd3}
.pd-y:focus-visible{outline:2px solid #005bd3;outline-offset:1px}
.pd-year-legend{display:flex;gap:12px;margin:10px 0;font-size:12px}
.pd-year-legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:4px;vertical-align:middle}
.pd-year-legend .blackout::before{background:#303030}.pd-year-legend .holiday::before{background:#ffd6a4}.pd-year-legend .special::before{background:#cdfee1}
`;
