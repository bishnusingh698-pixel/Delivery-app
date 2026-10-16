/**
 * Admin building blocks shared by several pages.
 */
import { useMemo, useState } from "react";
import { addDays, addMonths, daysInMonth, firstOfMonth, weekday } from "../../core/civil";
import { weekOrder } from "../../core/i18n/week";
import type { DayStatus, MethodId } from "../../core/types";
import { useI18n, useT } from "../i18n/react";
import { Checkbox, TextField } from "./polaris";

export function useWeekdays() {
  const { locale } = useI18n();
  return useMemo(() => {
    const long = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    const short = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    // 2023-01-01 was a Sunday.
    const label = (wd: number, f: Intl.DateTimeFormat) => f.format(new Date(Date.UTC(2023, 0, 1 + wd)));
    return weekOrder(locale).map((wd) => ({ value: wd, long: label(wd, long), short: label(wd, short) }));
  }, [locale]);
}

export function useMethodLabel() {
  const t = useT();
  return (id: MethodId) => t(`method.${id}`);
}

export function useFormatDate() {
  const { locale } = useI18n();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    const fy = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return (iso: string | null | undefined, withYear = false) => {
      if (!iso) return "";
      const [y, m, d] = iso.split("-").map(Number);
      return (withYear ? fy : f).format(new Date(Date.UTC(y, m - 1, d)));
    };
  }, [locale]);
}

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Weekday checkboxes in the merchant's week order. */
export function WeekdayPicker(p: { label: string; value: number[]; onChange: (v: number[]) => void; id?: string; error?: string }) {
  const days = useWeekdays();
  return (
    <s-stack gap="small-200" id={p.id}>
      <s-text type="strong">{p.label}</s-text>
      <s-stack direction="inline" gap="base">
        {days.map((d) => (
          <Checkbox
            key={d.value}
            label={d.long}
            checked={p.value.includes(d.value)}
            onChange={(on) => p.onChange(on ? [...p.value, d.value].sort() : p.value.filter((x) => x !== d.value))}
          />
        ))}
      </s-stack>
      {p.error ? <s-text tone="critical">{p.error}</s-text> : null}
    </s-stack>
  );
}

/** "All countries" or a searchable list of countries. */
export function CountryPicker(p: {
  label: string;
  value: "all" | string[];
  onChange: (v: "all" | string[]) => void;
  countries: string[];
  markets?: { name: string; countries: string[] }[];
}) {
  const t = useT();
  const { locale } = useI18n();
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      p.countries
        .map((c) => ({ code: c, name: countryName(c, locale) }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [p.countries, locale],
  );
  const selected = p.value === "all" ? [] : p.value;
  const shown = list.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase() === q.toLowerCase());
  return (
    <s-stack gap="small-300">
      <s-text type="strong">{p.label}</s-text>
      <Checkbox label={t("countries.all")} checked={p.value === "all"} onChange={(on) => p.onChange(on ? "all" : [])} />
      {p.value !== "all" ? (
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack gap="small-300">
            {p.markets?.length ? (
              <s-stack direction="inline" gap="small-200">
                {p.markets.map((m) => (
                  <s-clickable-chip
                    key={m.name}
                    onClick={() => p.onChange([...new Set([...selected, ...m.countries])])}
                    accessibilityLabel={t("countries.addMarket", { market: m.name })}
                  >
                    + {m.name}
                  </s-clickable-chip>
                ))}
              </s-stack>
            ) : null}
            <TextField label={t("countries.search")} type="search" value={q} onChange={setQ} labelAccessibilityVisibility="exclusive" placeholder={t("countries.search")} />
            <s-text color="subdued">{t("countries.selected", { count: selected.length })}</s-text>
            <s-box maxBlockSize="240px" overflow="hidden">
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                <s-stack gap="small-100">
                  {shown.map((c) => (
                    <Checkbox
                      key={c.code}
                      label={c.name}
                      checked={selected.includes(c.code)}
                      onChange={(on) => p.onChange(on ? [...selected, c.code] : selected.filter((x) => x !== c.code))}
                    />
                  ))}
                </s-stack>
              </div>
            </s-box>
          </s-stack>
        </s-box>
      ) : null}
    </s-stack>
  );
}

/** Small month calendar that shows engine day statuses (admin preview). */
export function MiniCalendar(p: { days: DayStatus[]; start: string; months?: number; onPick?: (d: string) => void; selected?: string | null }) {
  const { locale } = useI18n();
  const t = useT();
  const [month, setMonth] = useState(firstOfMonth(p.start));
  const order = weekOrder(locale);
  const byDate = new Map(p.days.map((d) => [d.date, d]));
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)),
  );
  const short = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  const num = new Intl.NumberFormat(locale);
  const lead = (weekday(month) - order[0] + 7) % 7;
  const n = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => addDays(month, i))];
  const reasonText = (d: DayStatus) => (d.available ? t("preview.available") : t(`reason.${d.reason}`, { detail: d.detail ?? "" }));
  return (
    <div className="pd-mini">
      <style>{MINI_CSS}</style>
      <div className="pd-mini-head">
        <s-button variant="tertiary" icon="chevron-left" accessibilityLabel={t("preview.prevMonth")} onClick={() => setMonth(addMonths(month, -1))} />
        <strong>{monthName}</strong>
        <s-button variant="tertiary" icon="chevron-right" accessibilityLabel={t("preview.nextMonth")} onClick={() => setMonth(addMonths(month, 1))} />
      </div>
      <div className="pd-mini-grid" role="grid" aria-label={monthName}>
        {order.map((wd) => (
          <div key={wd} className="pd-mini-wd" aria-hidden="true">
            {short.format(new Date(Date.UTC(2023, 0, 1 + wd)))}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const st = byDate.get(d);
          const cls = !st ? "out" : st.available ? "ok" : st.reason === "holiday" || st.reason === "closed" || st.reason === "vacation" ? "closed" : st.reason === "full" || st.reason === "soldOut" ? "full" : "no";
          return (
            <button
              type="button"
              key={d}
              className={`pd-mini-day ${cls} ${p.selected === d ? "sel" : ""} ${st?.isToday ? "today" : ""}`}
              title={st ? reasonText(st) : ""}
              aria-label={`${d}: ${st ? reasonText(st) : ""}`}
              onClick={() => p.onPick?.(d)}
            >
              {num.format(Number(d.slice(8)))}
            </button>
          );
        })}
      </div>
      <div className="pd-mini-legend">
        <span className="ok">{t("preview.legendAvailable")}</span>
        <span className="closed">{t("preview.legendClosed")}</span>
        <span className="full">{t("preview.legendFull")}</span>
        <span className="no">{t("preview.legendUnavailable")}</span>
      </div>
    </div>
  );
}

const MINI_CSS = `
.pd-mini{max-width:340px}
.pd-mini-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.pd-mini-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.pd-mini-wd{font-size:11px;text-align:center;color:#616161}
.pd-mini-day{border:1px solid transparent;border-radius:6px;padding:6px 0;font:inherit;font-size:13px;cursor:pointer;background:#f1f1f1;color:#303030}
.pd-mini-day.ok{background:#cdfee1;color:#0c5132}
.pd-mini-day.closed{background:#f1f1f1;color:#8a8a8a;text-decoration:line-through}
.pd-mini-day.full{background:#fed1d7;color:#8e0b21}
.pd-mini-day.no{background:#fafafa;color:#8a8a8a}
.pd-mini-day.out{background:transparent;color:#b5b5b5}
.pd-mini-day.today{border-color:#303030}
.pd-mini-day.sel{outline:2px solid #005bd3;outline-offset:1px}
.pd-mini-day:focus-visible{outline:2px solid #005bd3;outline-offset:2px}
.pd-mini-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:12px}
.pd-mini-legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:4px;vertical-align:middle;background:#f1f1f1}
.pd-mini-legend .ok::before{background:#cdfee1}.pd-mini-legend .full::before{background:#fed1d7}.pd-mini-legend .no::before{background:#fafafa;border:1px solid #ddd}
`;

export function newId(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}
