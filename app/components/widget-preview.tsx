/**
 * Static mock of the storefront date picker for the "Widget & text" page.
 * Mimics widget/src/styles.css roughly (not pixel-identical) and uses the
 * storefront texts of the chosen preview language, overrides included.
 */
import type { CSSProperties } from "react";
import { format } from "../../core/i18n/format";
import { isRtl } from "../../core/i18n/locales";
import { firstDayOfWeek } from "../../core/i18n/week";
import type { MethodId, WidgetSettings } from "../../core/types";

const ICONS: Record<MethodId, string> = {
  delivery: "M3 6h11v9H3zM14 9h4l3 3v3h-7zM6.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  pickup: "M4 9l2-5h12l2 5M4 9h16v11H4zM9 20v-6h6v6",
  shipping: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
};

const CSS = `
.pdp { --pd-muted: color-mix(in srgb, currentColor 62%, transparent); --pd-line: color-mix(in srgb, currentColor 22%, transparent);
  --pd-soft: color-mix(in srgb, currentColor 6%, transparent); --pd-on-accent: #fff; --pd-ok: #1a7f37;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.4; text-align: start;
  color: #1a1a1a; background: #fff; padding: 12px; border-radius: var(--pd-radius); max-inline-size: 26em; }
.pdp[data-theme="match"] { border: 1px dashed #c9c9c9; border-radius: 8px; }
.pdp[data-theme="dark"] { --pd-ok: #7ee2a8; color: #f2f2f2; background: #1d1d1f; }
.pdp *, .pdp *::before, .pdp *::after { box-sizing: border-box; }
.pdp-root { display: flex; flex-direction: column; gap: 0.75em; }
.pdp.is-compact .pdp-root { gap: 0.5em; font-size: 0.92em; }
.pdp-heading { font-weight: 600; margin: 0; }
.pdp-label { display: block; font-weight: 600; margin-block-end: 0.35em; }
.pdp-methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 7em), 1fr)); gap: 0.5em; }
.pdp-method { font: inherit; color: inherit; background: none; display: flex; align-items: center; justify-content: center; gap: 0.4em;
  min-block-size: 44px; padding: 0.4em 0.6em; border: 1px solid var(--pd-line); border-radius: var(--pd-radius); cursor: pointer; overflow-wrap: anywhere; }
.pdp.is-compact .pdp-method, .pdp.is-compact .pdp-chip { min-block-size: 38px; }
.pdp-method.is-active { border-color: var(--pd-accent); box-shadow: inset 0 0 0 1px var(--pd-accent); font-weight: 600; }
.pdp-cal { max-inline-size: 22em; }
.pdp-cal-head { display: flex; align-items: center; justify-content: space-between; margin-block-end: 0.25em; }
.pdp-month { font-weight: 600; text-transform: capitalize; }
.pdp-nav { inline-size: 36px; block-size: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; }
.pdp-nav.is-off { opacity: 0.3; }
.pdp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
.pdp-wd { font-size: 0.8em; font-weight: 500; color: var(--pd-muted); padding-block: 0.3em; }
.pdp-day { min-block-size: 34px; display: flex; align-items: center; justify-content: center; border-radius: var(--pd-radius);
  color: var(--pd-muted); text-decoration: line-through; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); }
.pdp.is-compact .pdp-day { min-block-size: 30px; }
.pdp-day.is-available { color: inherit; text-decoration: none; font-weight: 500; background: var(--pd-soft); }
.pdp-day.is-today { box-shadow: inset 0 0 0 1px var(--pd-line); }
.pdp-day.is-selected { background: var(--pd-accent); color: var(--pd-on-accent); font-weight: 700; }
.pdp-select { display: flex; justify-content: space-between; align-items: center; min-block-size: 44px; padding: 0.4em 0.7em;
  border: 1px solid var(--pd-line); border-radius: var(--pd-radius); }
.pdp-chips { display: flex; flex-wrap: wrap; gap: 0.5em; }
.pdp-chip { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; min-block-size: 44px;
  padding: 0.35em 0.8em; border: 1px solid var(--pd-line); border-radius: var(--pd-radius); }
.pdp-chip.is-active { border-color: var(--pd-accent); background: var(--pd-accent); color: var(--pd-on-accent); }
.pdp-chip.is-full { opacity: 0.5; text-decoration: line-through; }
.pdp-chip-meta { font-size: 0.78em; }
.pdp-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5em; padding: 0.6em 0.75em; border: 1px solid var(--pd-line); border-radius: var(--pd-radius); }
.pdp-check { color: var(--pd-ok); display: inline-flex; }
.pdp-link { margin-inline-start: auto; text-decoration: underline; }
`;

function Svg({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const utc = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
const iso = (d: Date) => d.toISOString().slice(0, 10);

function fmt(locale: string, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" });
  } catch {
    return new Intl.DateTimeFormat("en", { ...opts, timeZone: "UTC" });
  }
}

export function WidgetPreview(p: {
  widget: WidgetSettings;
  /** Effective storefront texts for the preview language (built-in + overrides). */
  texts: Record<string, string>;
  lang: string;
  methods: MethodId[];
  method: MethodId;
  onMethod: (m: MethodId) => void;
  today: string;
  /** Accessible name of the preview region. */
  label: string;
}) {
  const { widget: w, lang } = p;
  const rtl = isRtl(lang);
  const st = (key: string, values: Record<string, string | number> = {}) => {
    const msg = p.texts[key] ?? key;
    try {
      return format(msg, values, { locale: lang });
    } catch {
      return msg;
    }
  };
  const methods = p.methods.length ? p.methods : (["delivery", "pickup", "shipping"] as MethodId[]);
  const method = methods.includes(p.method) ? p.method : methods[0];

  // A month with a few unavailable days: past days, a weekly closed day, one fully booked day.
  const today = utc(p.today);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const closedWd = 0;
  const fullDay = today.getUTCDate() + 3;
  const available = (day: number) => {
    const d = new Date(Date.UTC(year, month, day));
    return day > today.getUTCDate() && d.getUTCDay() !== closedWd && day !== fullDay;
  };
  let selectedDay = 0;
  for (let d = today.getUTCDate() + 1; d <= daysInMonth && !selectedDay; d++) if (available(d)) selectedDay = d;
  if (!selectedDay) selectedDay = today.getUTCDate();
  const selected = iso(new Date(Date.UTC(year, month, selectedDay)));

  const first = firstDayOfWeek(lang);
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() - first + 7) % 7;
  const wdFmt = fmt(lang, { weekday: "narrow" });
  const weekdays = Array.from({ length: 7 }, (_, i) => wdFmt.format(new Date(Date.UTC(2023, 0, 1 + ((first + i) % 7)))));
  const monthTitle = fmt(lang, { month: "long", year: "numeric" }).format(today);
  const dayNum = fmt(lang, { day: "numeric" });
  const shortDate = fmt(lang, { weekday: "short", day: "numeric", month: "short" }).format(utc(selected));
  const longDate = fmt(lang, { weekday: "long", day: "numeric", month: "long" }).format(utc(selected));
  const tf = fmt(lang, { hour: "numeric", minute: "2-digit" });
  const time = (h: number) => tf.format(new Date(Date.UTC(2000, 0, 1, h, 0)));
  const range = (a: number, b: number) => `${time(a)}–${time(b)}`;

  const hasSlots = method !== "shipping";
  const dateLabel = st(method === "shipping" ? "date.label.dispatch" : `date.label.${method}`);
  const summary =
    method === "delivery"
      ? st("summary.deliveryTime", { date: longDate, time: range(9, 12) })
      : method === "pickup"
        ? st("summary.pickupTime", { date: longDate, time: range(9, 12) })
        : st("summary.dispatch", { date: longDate });
  const arrow = (dir: "prev" | "next") => (rtl ? (dir === "prev" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6") : dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6");

  const style = { "--pd-accent": w.accent, "--pd-radius": `${w.radius}px` } as CSSProperties;

  return (
    <div
      className={`pdp${w.compact ? " is-compact" : ""}`}
      data-theme={w.theme}
      dir={rtl ? "rtl" : "ltr"}
      lang={lang}
      style={style}
      role="region"
      aria-label={p.label}
    >
      <style>{CSS}</style>
      <div className="pdp-root">
        <p className="pdp-heading">{st("heading")}</p>
        {methods.length > 1 ? (
          <div className="pdp-methods" role="group" aria-label={st("methodGroup")}>
            {methods.map((m) => (
              <button key={m} type="button" className={`pdp-method${m === method ? " is-active" : ""}`} aria-pressed={m === method} onClick={() => p.onMethod(m)}>
                {w.icons ? (
                  <span style={{ display: "inline-flex" }}>
                    <Svg d={ICONS[m]} />
                  </span>
                ) : null}
                <span>{st(`method.${m}`)}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div>
          <span className="pdp-label">{dateLabel}</span>
          {w.input === "calendar" ? (
            <div className="pdp-cal" aria-hidden="true">
              <div className="pdp-cal-head">
                <span className="pdp-nav is-off">
                  <Svg d={arrow("prev")} />
                </span>
                <span className="pdp-month">{monthTitle}</span>
                <span className="pdp-nav">
                  <Svg d={arrow("next")} />
                </span>
              </div>
              <div className="pdp-grid">
                {weekdays.map((wd, i) => (
                  <span key={`wd${i}`} className="pdp-wd">
                    {wd}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`e${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const cls = ["pdp-day"];
                  if (available(day)) cls.push("is-available");
                  if (day === today.getUTCDate()) cls.push("is-today");
                  if (day === selectedDay) cls.push("is-selected");
                  return (
                    <span key={day} className={cls.join(" ")}>
                      {dayNum.format(new Date(Date.UTC(year, month, day)))}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="pdp-select" aria-hidden="true">
              <span>{shortDate}</span>
              <span>▾</span>
            </div>
          )}
        </div>

        {hasSlots ? (
          <div aria-hidden="true">
            <span className="pdp-label">{st("slot.label")}</span>
            <div className="pdp-chips">
              <span className="pdp-chip is-active">{range(9, 12)}</span>
              <span className="pdp-chip">
                {range(12, 15)}
                {w.showSpotsLeft ? <span className="pdp-chip-meta">{st("slot.left", { count: 2 })}</span> : null}
              </span>
              <span className="pdp-chip is-full">
                {range(15, 18)}
                <span className="pdp-chip-meta">{st("slot.full")}</span>
              </span>
            </div>
          </div>
        ) : null}

        <div className="pdp-summary" aria-hidden="true">
          <span className="pdp-check">
            <Svg d="M5 12l5 5 9-10" />
          </span>
          <span>{summary}</span>
          <span className="pdp-link">{st("change")}</span>
        </div>
      </div>
    </div>
  );
}
