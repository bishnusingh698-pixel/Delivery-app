/**
 * Live preview of the date engine with unsaved settings, plus "Simulate time".
 */
import { useEffect, useMemo, useState } from "react";
import { addDays, fromMinutes, toMinutes } from "../../core/civil";
import { buildCalendar, engineTimeZone } from "../../core/engine";
import { toStorefrontConfig } from "../../core/publish";
import { nowInZone, zoneCity } from "../../core/tz";
import type { LocalNow, MethodId, PlanId, Settings } from "../../core/types";
import { useI18n, useT } from "../i18n/react";
import { Checkbox, DateField, TimeSelect } from "./polaris";
import { MiniCalendar, useFormatDate } from "./shared";

export function useSimulatedNow(timeZone: string) {
  const [sim, setSim] = useState<{ on: boolean; date: string | null; time: string | null }>({ on: false, date: null, time: null });
  const [real, setReal] = useState<LocalNow | null>(null);
  useEffect(() => {
    const tick = () => setReal(nowInZone(timeZone));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [timeZone]);
  const now: LocalNow | null =
    sim.on && sim.date ? { date: sim.date, minutes: sim.time ? toMinutes(sim.time) : 0 } : real;
  return { now, sim, setSim };
}

export function SchedulePreview(p: {
  settings: Settings;
  plan: PlanId;
  timeZone: string;
  method: MethodId;
  locationId?: string | null;
  zoneId?: string | null;
}) {
  const t = useT();
  const { locale } = useI18n();
  const fmtDate = useFormatDate();
  const config = useMemo(
    () =>
      toStorefrontConfig(p.settings, {
        version: 0,
        timeZone: p.timeZone,
        primaryLocale: "en",
        plan: p.plan,
        overLimit: false,
        currency: "",
        debugUntil: null,
        today: "1970-01-01",
      }),
    [p.settings, p.plan, p.timeZone],
  );
  const zone = engineTimeZone(config, p.method, p.locationId);
  const { now, sim, setSim } = useSimulatedNow(zone);
  if (!now) return <s-spinner accessibilityLabel={t("common.loading")} />;
  const cal = buildCalendar(
    { config, method: p.method, locationId: p.locationId ?? null, zoneId: p.zoneId ?? null, now, lines: [{ key: "p", productId: "0", variantId: "0", quantity: 1, title: "" }] },
    now.date,
    addDays(now.date, 120),
  );
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const [h, m] = fromMinutes(now.minutes).split(":").map(Number);
  const nowText = `${fmtDate(now.date)}, ${timeFmt.format(new Date(Date.UTC(2000, 0, 1, h, m)))}`;
  const method = config.methods.find((x) => x.id === p.method);
  return (
    <s-stack gap="base">
      <s-paragraph>
        {t("preview.rightNow", { now: nowText, zone: zoneCity(zone) })}{" "}
        <s-text type="strong">
          {method?.enabled
            ? cal.firstAvailable
              ? t("preview.earliest", { date: fmtDate(cal.firstAvailable, true) })
              : t("preview.noneAvailable")
            : t("preview.methodOff")}
        </s-text>
      </s-paragraph>
      <MiniCalendar days={cal.days} start={now.date} />
      <s-box padding="base" background="subdued" borderRadius="base">
        <s-stack gap="small-300">
          <Checkbox label={t("preview.simulate")} details={t("preview.simulateHelp")} checked={sim.on} onChange={(on) => setSim({ ...sim, on, date: sim.date ?? now.date, time: sim.time ?? fromMinutes(now.minutes - (now.minutes % 15)) })} />
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
