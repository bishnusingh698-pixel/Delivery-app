/**
 * Live preview: the real storefront widget (widget/src), running the real date engine on the
 * merchant's unsaved settings, with an in-memory cart. What the merchant sees here is what
 * shoppers see in the cart, minus the theme's own fonts and colours.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import widgetCss from "../../widget/src/styles.css?inline";
import { Pickday, type BootData } from "../../widget/src/widget";
import type { Cart, CartApi } from "../../widget/src/cart";
import { buildCalendar, engineTimeZone } from "../../core/engine";
import { allHolidayClosures } from "../../core/holidays";
import { matchLocale } from "../../core/i18n/locales";
import { toStorefrontConfig } from "../../core/publish";
import { addDays, fromMinutes } from "../../core/civil";
import { nowInZone, zoneCity } from "../../core/tz";
import type { HolidayItem, LocalNow, MethodId, PlanId, Settings } from "../../core/types";
import { useI18n, useT } from "../i18n/react";
import { Checkbox, DateField, TimeSelect } from "./polaris";
import { useFormatDate } from "./shared";

const LOCALES = import.meta.glob<Record<string, string>>("../../locales/storefront/[a-z]*.json", { import: "default" });

async function loadStrings(locale: string) {
  const w = window as Window & { PickdayI18n?: Record<string, Record<string, string>> };
  w.PickdayI18n = w.PickdayI18n ?? {};
  const file = matchLocale(locale);
  if (w.PickdayI18n[file]) return;
  const load = LOCALES[`../../locales/storefront/${file}.json`];
  if (load) w.PickdayI18n[file] = await load();
}

/** A cart that lives in memory: the widget can save its choice without touching any store. */
function previewCart(title: string): CartApi {
  const cart: Cart = {
    token: "preview",
    item_count: 1,
    items: [{ key: "preview:1", id: 1, product_id: 1, variant_id: 1, quantity: 1, title, product_title: title, handle: "", gift_card: false, requires_shipping: true, properties: {}, final_line_price: 100000 }],
    attributes: {},
    total_price: 100000,
    currency: "USD",
  };
  const copy = () => JSON.parse(JSON.stringify(cart)) as Cart;
  return {
    getCart: async () => copy(),
    updateAttributes: async (attrs) => {
      for (const [k, v] of Object.entries(attrs)) if (v) cart.attributes[k] = v;
      else delete cart.attributes[k];
      return copy();
    },
    changeLine: async (key, change) => {
      const it = cart.items.find((i) => i.key === key);
      if (it && change.properties) it.properties = change.properties;
      if (it && change.quantity === 0) cart.items = cart.items.filter((i) => i !== it);
      return copy();
    },
    addVariant: async () => copy(),
    productTags: async () => [],
    notifyTheme: () => {},
  };
}

export interface PreviewMeta {
  plan: PlanId;
  timeZone: string;
  primaryLocale: string;
  currency: string;
  country: string | null;
}

export function usePreviewConfig(settings: Settings, meta: PreviewMeta, holidayItems: Record<string, HolidayItem[]>) {
  return useMemo(
    () =>
      toStorefrontConfig(settings, {
        version: 0,
        timeZone: meta.timeZone,
        primaryLocale: meta.primaryLocale,
        plan: meta.plan,
        overLimit: false,
        currency: meta.currency,
        debugUntil: null,
        today: nowInZone(meta.timeZone).date,
        holidayClosures: allHolidayClosures(settings.holidays, holidayItems),
      }),
    [settings, meta.timeZone, meta.primaryLocale, meta.plan, meta.currency, holidayItems],
  );
}

/** The storefront widget itself. */
export function LiveWidget(p: {
  settings: Settings;
  meta: PreviewMeta;
  holidayItems: Record<string, HolidayItem[]>;
  method?: MethodId | null;
  locale?: string;
  nowAt?: LocalNow | null;
}) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const locale = p.locale ?? p.meta.primaryLocale;
  const [loaded, setLoaded] = useState("");
  const config = usePreviewConfig(p.settings, p.meta, p.holidayItems);
  const sample = t("preview.sampleProduct");

  useEffect(() => {
    let live = true;
    void Promise.all([loadStrings("en"), loadStrings(locale), loadStrings(p.meta.primaryLocale)]).then(() => live && setLoaded(`${locale}|${p.meta.primaryLocale}`));
    return () => {
      live = false;
    };
  }, [locale, p.meta.primaryLocale]);

  const nowKey = p.nowAt ? `${p.nowAt.date} ${p.nowAt.minutes}` : "";
  useEffect(() => {
    if (!loaded || !host.current) return;
    const cfg = { ...config, defaultMethod: p.method && config.methods.some((m) => m.id === p.method && m.enabled) ? p.method : config.defaultMethod };
    const boot: BootData = {
      config: cfg,
      availability: null,
      locale,
      country: p.meta.country,
      currency: p.meta.currency,
      rate: 1,
      template: "cart",
      assetBase: "",
      nowAt: p.nowAt ?? null,
    };
    const el = document.createElement("div");
    el.className = "pickday";
    host.current.replaceChildren(el);
    const pd = new Pickday(boot, previewCart(sample));
    pd.mount(el);
    void pd.start().catch(() => {});
    return () => pd.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, config, locale, p.method, nowKey, sample]);

  return (
    <div className="pd-preview" data-theme={p.settings.widget.theme}>
      <style>{widgetCss + PREVIEW_CSS}</style>
      <div ref={host} aria-live="polite" />
    </div>
  );
}

const PREVIEW_CSS = `
.pd-preview{font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;padding:4px 12px 12px;border:1px dashed #c9c9c9;border-radius:12px;background:#fff;max-width:26em}
.pd-preview[data-theme="dark"]{background:#1d1d1f}
.pd-preview .pickday{margin-block:.5em}
`;

/** Real widget + "right now / earliest date" line + simulate a date and time. */
export function MethodPreview(p: {
  settings: Settings;
  meta: PreviewMeta;
  holidayItems: Record<string, HolidayItem[]>;
  method: MethodId;
  locationId?: string | null;
}) {
  const t = useT();
  const { locale } = useI18n();
  const fmtDate = useFormatDate();
  const config = usePreviewConfig(p.settings, p.meta, p.holidayItems);
  const zone = engineTimeZone(config, p.method, p.locationId);
  const [sim, setSim] = useState<{ on: boolean; date: string | null; time: string | null }>({ on: false, date: null, time: null });
  const [real, setReal] = useState<LocalNow | null>(null);
  useEffect(() => {
    const tick = () => setReal(nowInZone(zone));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [zone]);
  if (!real) return <s-spinner accessibilityLabel={t("common.loading")} />;
  const now: LocalNow = sim.on && sim.date ? { date: sim.date, minutes: sim.time ? Number(sim.time.slice(0, 2)) * 60 + Number(sim.time.slice(3, 5)) : 0 } : real;
  const method = config.methods.find((m) => m.id === p.method);
  const cal = buildCalendar(
    { config, method: p.method, locationId: p.locationId ?? null, zoneId: null, now, lines: [{ key: "p", productId: "1", variantId: "1", quantity: 1, title: "" }] },
    now.date,
    addDays(now.date, 120),
  );
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const [h, m] = fromMinutes(now.minutes).split(":").map(Number);
  const nowText = `${fmtDate(now.date)}, ${timeFmt.format(new Date(Date.UTC(2000, 0, 1, h, m)))}`;
  return (
    <s-stack gap="base">
      <s-paragraph>
        {t("preview.rightNow", { now: nowText, zone: zoneCity(zone) })}{" "}
        <s-text type="strong">
          {method?.enabled ? (cal.firstAvailable ? t("preview.earliest", { date: fmtDate(cal.firstAvailable, true) }) : t("preview.noneAvailable")) : t("preview.methodOff")}
        </s-text>
      </s-paragraph>
      {method?.enabled ? <LiveWidget settings={p.settings} meta={p.meta} holidayItems={p.holidayItems} method={p.method} nowAt={sim.on ? now : null} /> : null}
      <s-box padding="base" background="subdued" borderRadius="base">
        <s-stack gap="small-300">
          <Checkbox
            label={t("preview.simulate")}
            details={t("preview.simulateHelp")}
            checked={sim.on}
            onChange={(on) => setSim({ ...sim, on, date: sim.date ?? real.date, time: sim.time ?? fromMinutes(real.minutes - (real.minutes % 15)) })}
          />
          {sim.on ? (
            <s-stack direction="inline" gap="base">
              <DateField label={t("preview.simDate")} value={sim.date} onChange={(v) => setSim({ ...sim, date: v })} />
              <TimeSelect label={t("preview.simTime")} value={sim.time} locale={locale} onChange={(v) => setSim({ ...sim, time: v })} />
            </s-stack>
          ) : null}
        </s-stack>
      </s-box>
    </s-stack>
  );
}
