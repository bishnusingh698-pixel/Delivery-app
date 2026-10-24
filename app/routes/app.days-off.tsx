/**
 * Days off: public holidays (one switch per country, renewed every year, any holiday can be
 * skipped), vacation mode, closed days and yearly dates, special open days.
 */
import { useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { addDays, addMonths, daysInMonth, weekday } from "../../core/civil";
import { closureMatches } from "../../core/engine";
import { countryHolidaySet } from "../../core/defaults";
import { allHolidayClosures } from "../../core/holidays";
import { weekOrder } from "../../core/i18n/week";
import type { Closure, HolidayItem, HolidaySet, MethodId, Settings, SpecialDay } from "../../core/types";
import prisma from "../db.server";
import { Button, Checkbox, DateField, Modal, MultiChoice, NumberField, Page, Section, Select, Switch, TextField, closeModal, openModal } from "../components/polaris";
import { SettingsChrome, useSettingsForm } from "../components/settings-form";
import { countryName, newId, useFormatDate, useMethodLabel } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { holidayCountries, holidayItemsFor, holidayRegions } from "../services/holidays.server";
import { adminContext, patchSettingsAction, shopMeta } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const counts = await prisma.capacityCount.groupBy({
    by: ["date"],
    where: { shop: ctx.shop, slotId: "", date: { gte: ctx.today } },
    _sum: { orders: true },
  });
  const s = ctx.settings;
  const lang = ctx.row.primaryLocale.split("-")[0] || "en";
  return {
    meta: shopMeta(ctx),
    weekStart: s.weekStart,
    holidayCountries: holidayCountries("en").map((c) => c.code),
    holidayItems: holidayItemsFor(s.holidays, ctx.today, lang),
    regions: Object.fromEntries([...new Set(s.holidays.map((h) => h.country))].map((c) => [c, holidayRegions(c, lang)])),
    ordersByDate: Object.fromEntries(counts.map((c) => [c.date, c._sum.orders ?? 0])),
    locations: s.locations.map((l) => ({ id: l.id, name: l.name })),
    initial: { holidays: s.holidays, closures: s.closures, specialDays: s.specialDays, vacation: s.vacation } as Pick<Settings, "holidays" | "closures" | "specialDays" | "vacation">,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => patchSettingsAction(request);

type HolidayResp = { country: string; region: string | null; regions: { code: string; name: string }[]; holidays: HolidayItem[] };

export default function DaysOffPage() {
  const d = useLoaderData<typeof loader>();
  const { meta, locations } = d;
  const t = useT();
  const { locale } = useI18n();
  const label = useMethodLabel();
  const fmt = useFormatDate();
  const [params, setParams] = useSearchParams();
  const only = locations.find((l) => l.id === params.get("location")) ?? null;
  const form = useSettingsForm(d.initial);
  const { draft, update } = form;

  /* Holiday lists per set (loaded for new sets and region changes). */
  const [items, setItems] = useState<Record<string, HolidayItem[]>>(d.holidayItems);
  const [regions, setRegions] = useState<Record<string, { code: string; name: string }[]>>(d.regions);
  const hf = useFetcher<HolidayResp>();
  const [pending, setPending] = useState<string | null>(null);
  const [seen, setSeen] = useState(hf.data);
  if (hf.data !== seen) {
    setSeen(hf.data);
    if (hf.data && pending) {
      const data = hf.data;
      setItems((m) => ({ ...m, [pending]: data.holidays }));
      setRegions((m) => ({ ...m, [data.country]: data.regions }));
      setPending(null);
    }
  }
  const loadSet = (set: HolidaySet) => {
    setPending(set.id);
    hf.load(`/app/api/holidays?country=${set.country}&region=${set.region ?? ""}`);
  };
  const holidayClosures = useMemo(() => allHolidayClosures(draft.holidays, items), [draft.holidays, items]);

  const ordersIn = (start: string, end: string) => {
    let n = 0;
    for (const [day, c] of Object.entries(d.ordersByDate)) if (day >= start && day <= end) n += c;
    return n;
  };

  /* Closed day modal */
  const blank = (): Closure => ({ id: newId("c"), label: "", start: meta.today, end: meta.today, yearly: false, methods: "all", locations: only ? [only.id] : "all", kind: "blackout" });
  const [editing, setEditing] = useState<Closure>(blank);
  const isNew = !draft.closures.some((c) => c.id === editing.id);
  const fullDate = (v: string) => (v.length === 10 ? v : `${meta.today.slice(0, 4)}-${v}`);
  const overlap = ordersIn(fullDate(editing.start), fullDate(editing.end || editing.start));
  const saveClosure = () => {
    update((x) => {
      const start = fullDate(editing.start);
      const end = fullDate(editing.end) < start ? start : fullDate(editing.end);
      const c = { ...editing, start, end };
      const i = x.closures.findIndex((y) => y.id === c.id);
      if (i >= 0) x.closures[i] = c;
      else x.closures.push(c);
    });
    closeModal("closure-modal");
  };

  /* Special open day modal */
  const [special, setSpecial] = useState<SpecialDay>({ id: newId("o"), date: meta.today, label: "", methods: "all", locations: "all", slots: null, maxPerDay: null });

  /* Add another country's holidays */
  const storeCountry = meta.country ?? "";
  const countryOptions = useMemo(
    () => d.holidayCountries.map((c) => ({ value: c, label: countryName(c, locale) })).sort((a, b) => a.label.localeCompare(b.label, locale)),
    [d.holidayCountries, locale],
  );
  const [addCountry, setAddCountry] = useState(storeCountry && !draft.holidays.some((h) => h.country === storeCountry) ? storeCountry : "");
  const addSet = (country: string) => {
    if (!country || draft.holidays.some((h) => h.country === country && !h.region)) return;
    const set = { ...countryHolidaySet(country), id: newId("hs_") };
    update((x) => void x.holidays.push(set));
    loadSet(set);
  };

  const forLocation = (c: { locations: "all" | string[] }) => !only || c.locations === "all" || c.locations.includes(only.id);
  const visible = draft.closures.filter((c) => (c.yearly || c.end >= meta.today) && forLocation(c)).sort((a, b) => (a.start < b.start ? -1 : 1));
  const appliesText = (c: { methods: "all" | MethodId[]; locations: "all" | string[] }) =>
    [
      c.methods === "all" ? t("closures.allMethods") : c.methods.map(label).join(", "),
      c.locations === "all" ? null : locations.filter((l) => (c.locations as string[]).includes(l.id)).map((l) => l.name).join(", "),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <Page title={t("daysoff.title")} subtitle={t("daysoff.subtitle")}>
      <SettingsChrome form={form} />
      {only ? (
        <s-banner tone="info">
          {t("daysoff.onlyLocation", { name: only.name })}{" "}
          <s-link
            href="#"
            onClick={(e: Event) => {
              e.preventDefault();
              setParams({});
            }}
          >
            {t("daysoff.showAll")}
          </s-link>
        </s-banner>
      ) : null}

      <Section heading={t("daysoff.holidaysHeading")}>
        <s-stack gap="base">
          <s-text color="subdued">{t("daysoff.holidaysHelp")}</s-text>
          {draft.holidays.length === 0 && storeCountry ? (
            <Switch label={t("daysoff.closeOnHolidays", { country: countryName(storeCountry, locale) })} details={t("daysoff.closeOnHolidaysHelp")} checked={false} onChange={(on) => on && addSet(storeCountry)} />
          ) : null}
          {draft.holidays.map((set, i) => {
            const list = items[set.id];
            const regs = regions[set.country] ?? [];
            const closedCount = (list ?? []).filter((h) => !set.skip.includes(h.key)).length;
            return (
              <s-box key={set.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="base">
                  <s-stack direction="inline" gap="base" justifyContent="space-between" alignItems="center">
                    <s-stack gap="small-100">
                      <s-heading>{t("daysoff.setHeading", { country: countryName(set.country, locale) })}</s-heading>
                      {list ? <s-text color="subdued">{t("daysoff.setSummary", { closed: closedCount, total: list.length })}</s-text> : null}
                    </s-stack>
                    <Button variant="tertiary" tone="critical" icon="delete" onClick={() => update((x) => void x.holidays.splice(i, 1))}>
                      {t("daysoff.removeSet")}
                    </Button>
                  </s-stack>
                  {regs.length ? (
                    <Select
                      label={t("closures.region")}
                      details={t("daysoff.regionHelp")}
                      value={set.region ?? ""}
                      options={[{ value: "", label: t("closures.wholeCountry") }, ...regs.map((r) => ({ value: r.code, label: r.name }))]}
                      onChange={(v) => {
                        const next = { ...set, region: v || null, skip: [] };
                        update((x) => (x.holidays[i] = next));
                        loadSet(next);
                      }}
                    />
                  ) : null}
                  <MethodsChoice value={set.methods} onChange={(v) => update((x) => (x.holidays[i].methods = v))} />
                  {!list || pending === set.id ? (
                    <s-spinner accessibilityLabel={t("common.loading")} />
                  ) : list.length === 0 ? (
                    <s-text color="subdued">{t("closures.noHolidays")}</s-text>
                  ) : (
                    <s-stack gap="small-100">
                      <s-text color="subdued">{t("daysoff.uncheckToOpen")}</s-text>
                      {list.map((h) => (
                        <Checkbox
                          key={h.key + h.date}
                          label={`${fmt(h.date, true)}${h.end !== h.date ? ` – ${fmt(h.end)}` : ""} · ${h.name}`}
                          details={h.mayShift ? t("closures.mayShiftNote") : undefined}
                          checked={!set.skip.includes(h.key)}
                          onChange={(on) =>
                            update((x) => {
                              const sk = new Set(x.holidays[i].skip);
                              if (on) sk.delete(h.key);
                              else sk.add(h.key);
                              x.holidays[i].skip = [...sk];
                            })
                          }
                        />
                      ))}
                    </s-stack>
                  )}
                </s-stack>
              </s-box>
            );
          })}
          <s-stack direction="inline" gap="base" alignItems="end">
            <Select
              label={t("daysoff.addCountry")}
              value={addCountry}
              options={[{ value: "", label: t("home.chooseOne") }, ...countryOptions.filter((c) => !draft.holidays.some((h) => h.country === c.value))]}
              onChange={setAddCountry}
            />
            <Button icon="plus" disabled={!addCountry} onClick={() => addSet(addCountry)}>
              {t("daysoff.addSet")}
            </Button>
          </s-stack>
          <s-text color="subdued">{t("closures.holidayDisclaimer")}</s-text>
        </s-stack>
      </Section>

      <Section heading={t("closures.vacation")}>
        <s-stack gap="base">
          <Switch label={t("closures.vacationOn")} details={t("closures.vacationHelp")} checked={draft.vacation.enabled} onChange={(v) => update((x) => (x.vacation.enabled = v))} />
          {draft.vacation.enabled ? (
            <>
              <s-stack direction="inline" gap="base">
                <DateField label={t("closures.closedFrom")} value={draft.vacation.start} onChange={(v) => update((x) => (x.vacation.start = v))} />
                <DateField label={t("closures.closedUntil")} value={draft.vacation.end} onChange={(v) => update((x) => (x.vacation.end = v))} />
              </s-stack>
              {meta.locales.map((loc) => (
                <TextField
                  key={loc}
                  label={`${t("closures.vacationMessage")} (${loc})`}
                  placeholder={t("closures.vacationMessageExample")}
                  multiline={2}
                  maxLength={200}
                  value={draft.vacation.message[loc] ?? ""}
                  onChange={(v) => update((x) => (v ? (x.vacation.message[loc] = v) : delete x.vacation.message[loc]))}
                />
              ))}
              {draft.vacation.start && ordersIn(draft.vacation.start, draft.vacation.end ?? "9999-12-31") ? (
                <s-banner tone="warning">
                  {t("closures.overlap", { count: ordersIn(draft.vacation.start, draft.vacation.end ?? "9999-12-31") })}{" "}
                  <s-link href={`/app/orders?range=custom&from=${draft.vacation.start}&to=${draft.vacation.end ?? ""}`}>{t("closures.viewThem")}</s-link>
                </s-banner>
              ) : null}
            </>
          ) : null}
        </s-stack>
      </Section>

      <Section heading={t("closures.year")}>
        <YearCalendar
          today={meta.today}
          closures={[...draft.closures.filter(forLocation), ...holidayClosures]}
          specials={draft.specialDays}
          locale={locale}
          weekStart={d.weekStart}
          onToggle={(date) =>
            update((x) => {
              const hit = x.closures.find((c) => !c.yearly && c.start === date && c.end === date && c.methods === "all" && (only ? Array.isArray(c.locations) && c.locations.length === 1 && c.locations[0] === only.id : c.locations === "all"));
              if (hit) x.closures = x.closures.filter((c) => c !== hit);
              else x.closures.push({ id: newId("c"), label: "", start: date, end: date, yearly: false, methods: "all", locations: only ? [only.id] : "all", kind: "blackout" });
            })
          }
        />
      </Section>

      <Section heading={t("closures.list")}>
        <s-stack gap="base">
          <s-stack direction="inline" gap="small-200">
            <Button
              variant="primary"
              icon="plus"
              onClick={() => {
                setEditing(blank());
                openModal("closure-modal");
              }}
            >
              {t("closures.add")}
            </Button>
            <Button onClick={() => openModal("special-modal")}>{t("closures.addSpecial")}</Button>
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
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>{c.yearly ? `${fmt(fullDate(c.start))} – ${fmt(fullDate(c.end))}` : c.start === c.end ? fmt(c.start, true) : `${fmt(c.start)} – ${fmt(c.end, true)}`}</s-table-cell>
                    <s-table-cell>{appliesText(c)}</s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200">
                        <Button
                          variant="tertiary"
                          icon="edit"
                          accessibilityLabel={t("common.edit")}
                          onClick={() => {
                            setEditing({ ...c, start: fullDate(c.start), end: fullDate(c.end) });
                            openModal("closure-modal");
                          }}
                        >
                          {""}
                        </Button>
                        <Button variant="tertiary" tone="critical" icon="delete" accessibilityLabel={t("common.delete")} onClick={() => update((x) => (x.closures = x.closures.filter((y) => y.id !== c.id)))}>
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
                    <Button variant="tertiary" tone="critical" onClick={() => update((x) => (x.specialDays = x.specialDays.filter((y) => y.id !== s.id)))}>
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
        heading={isNew ? t("closures.add") : t("daysoff.editClosure")}
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
            <DateField label={t("closures.from")} value={fullDate(editing.start)} onChange={(v) => v && setEditing({ ...editing, start: v, end: fullDate(editing.end) < v ? v : editing.end })} />
            <DateField label={t("closures.to")} value={fullDate(editing.end)} onChange={(v) => v && setEditing({ ...editing, end: v })} />
          </s-stack>
          <Checkbox label={t("closures.repeatYearly")} details={t("daysoff.repeatYearlyHelp")} checked={editing.yearly} onChange={(v) => setEditing({ ...editing, yearly: v })} />
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
              {t("closures.overlap", { count: overlap })} <s-link href={`/app/orders?range=custom&from=${fullDate(editing.start)}&to=${fullDate(editing.end)}`}>{t("closures.viewThem")}</s-link>
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
              update((x) => void x.specialDays.push(special));
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

function YearCalendar(p: { today: string; closures: Closure[]; specials: SpecialDay[]; locale: string; weekStart: number | null; onToggle: (d: string) => void }) {
  const t = useT();
  const order = weekOrder(p.locale, p.weekStart);
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
