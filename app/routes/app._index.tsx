/**
 * Home: the 3-step setup wizard for a new store, then the dashboard (alerts, what's left to
 * set up, today / tomorrow / next 7 days, the next 14 days at a glance, quick actions).
 */
import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { addDays, isValidDate, isValidTime } from "../../core/civil";
import { BUSINESS_TYPES, applyWizard, wizardSuggestion, type BusinessType, type WizardChoices } from "../../core/defaults";
import { alerts, busyDays, checklist, type ChecklistId } from "../../core/home";
import { hasFeature } from "../../core/publish";
import { METHOD_IDS, type MethodId, type Settings } from "../../core/types";
import { LiveWidget } from "../components/live-preview";
import { Button, Checkbox, DateField, Modal, NumberField, Page, Section, Select, Stack, Switch, TextField, TimeSelect, closeModal, openModal } from "../components/polaris";
import { CountrySelect, WeekdayPicker, countryName, newId, useFormatDate, useMethodLabel } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { flagsOf, requireShop, setFlags, warningsOf } from "../models/shop.server";
import { checkEmbed, themeEditorLink } from "../services/embed.server";
import { holidayCountries } from "../services/holidays.server";
import { fetchShopifyLocations } from "../services/locations.server";
import { dayCounts } from "../services/orders-query.server";
import { storefrontConfigFor } from "../services/publish.server";
import { adminContext, previewData, saveSettings } from "../services/settings.server";
import { monthlyUsage } from "../services/usage.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  let flags = flagsOf(ctx.row);
  // Re-check the app embed at most every 10 minutes until it's found.
  const stale = !flags.embedCheckedAt || Date.now() - Date.parse(flags.embedCheckedAt) > 10 * 60_000;
  if (stale && !flags.embedDetected) {
    await checkEmbed(ctx.shop, ctx.admin);
    flags = flagsOf(await requireShop(ctx.shop));
  }
  const common = { shop: ctx.shop, today: ctx.today, plan: ctx.plan, themeLink: themeEditorLink(ctx.shop), embed: flags.embedDetected ?? null };

  if (!flags.welcomeDone) {
    const first = await fetchShopifyLocations(ctx.admin)
      .then((l) => l[0] ?? null)
      .catch(() => null);
    return {
      ...common,
      mode: "wizard" as const,
      ...previewData(ctx),
      full: ctx.settings,
      countries: holidayCountries("en").map((c) => c.code),
      country: ctx.settings.country ?? ctx.row.country,
      firstLocation: first ? { name: first.name, address: first.address } : null,
    };
  }

  const { config } = await storefrontConfigFor(ctx.shop);
  const counts = await dayCounts(ctx.shop, config, ctx.today, addDays(ctx.today, 13));
  const usage = await monthlyUsage(ctx.shop, ctx.row);
  const sum = (days: string[]) => {
    const m: Partial<Record<MethodId, number>> = {};
    let total = 0;
    for (const day of days)
      for (const [k, v] of Object.entries(counts[day]?.methods ?? {})) {
        m[k as MethodId] = (m[k as MethodId] ?? 0) + v!.orders;
        total += v!.orders;
      }
    return { total, methods: m };
  };
  const week = Array.from({ length: 7 }, (_, i) => addDays(ctx.today, i));
  const busy = busyDays(counts, ctx.today);
  return {
    ...common,
    mode: "dashboard" as const,
    checklist: checklist(ctx.settings, flags, hasFeature(ctx.plan, "checkoutMatching")),
    checklistDismissed: !!flags.checklistDismissed,
    overview: { today: sum([ctx.today]), tomorrow: sum([addDays(ctx.today, 1)]), week: sum(week) },
    chart: Object.entries(counts).map(([date, c]) => ({ date, orders: Object.values(c.methods).reduce((n, v) => n + (v?.orders ?? 0), 0), used: c.used, max: c.max })),
    alerts: alerts({ settings: ctx.settings, today: ctx.today, flags, embedChecked: !!flags.embedCheckedAt, busyDays: busy, usagePct: usage.limit === null ? null : usage.pct, warnings: warningsOf(ctx.row), plan: ctx.plan }),
    celebrate: !!flags.firstOrderAt && !flags.firstOrderCelebrated,
    methods: ctx.settings.methodOrder.filter((m) => ctx.settings.methods[m].enabled),
    closedToday: ctx.settings.closures.some((c) => !c.yearly && c.start <= ctx.today && c.end >= ctx.today && c.methods === "all" && c.locations === "all"),
  };
};

function parseChoices(raw: unknown): WizardChoices | null {
  const c = raw as Partial<WizardChoices> | null;
  if (!c || typeof c !== "object") return null;
  const country = typeof c.country === "string" && /^[A-Z]{2}$/.test(c.country) ? c.country : null;
  const businessType = BUSINESS_TYPES.includes(c.businessType as BusinessType) ? (c.businessType as BusinessType) : null;
  const methods = Array.isArray(c.methods) ? (c.methods.filter((m) => METHOD_IDS.includes(m)) as MethodId[]) : [];
  const workdays = Array.isArray(c.workdays) ? c.workdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  const lead = c.lead && typeof c.lead.amount === "number" && (c.lead.unit === "days" || c.lead.unit === "hours") ? c.lead : { amount: 1, unit: "days" as const };
  const cutoff = typeof c.cutoff === "string" && isValidTime(c.cutoff) ? c.cutoff : null;
  const pickup = c.pickup && typeof c.pickup.name === "string" ? { name: String(c.pickup.name).slice(0, 100), address: String(c.pickup.address ?? "").slice(0, 300) } : null;
  if (!workdays.length) return null;
  return { country, businessType, methods, workdays, lead, cutoff, holidays: c.holidays !== false, pickup };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await adminContext(request);
  const isJson = request.headers.get("content-type")?.includes("application/json");
  const body = isJson ? ((await request.json()) as Record<string, unknown>) : Object.fromEntries(await request.formData());
  const intent = String(body.intent ?? "");
  if (intent === "wizard") {
    const choices = parseChoices(body.choices);
    if (!choices) return { ok: false as const, error: "invalid" };
    let next: Settings = applyWizard(ctx.settings, choices);
    // Limits from a business preset need Starter: keep the picker working on Free.
    if (!hasFeature(ctx.plan, "capacity")) for (const id of METHOD_IDS) next.methods[id].capacity.maxPerDay = null;
    next = { ...next, businessType: choices.businessType };
    const r = await saveSettings(ctx, next, `Setup: ${choices.businessType ?? "other"}, ${choices.country ?? "-"}, ${choices.methods.join("+")}`);
    if (r.ok) await setFlags(ctx.shop, { welcomeDone: true });
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.issues[0]?.message ?? "invalid" };
  }
  if (intent === "closeDay") {
    const date = String(body.date ?? "");
    if (!isValidDate(date) || date < ctx.today) return { ok: false as const, error: "date" };
    const label = String(body.label ?? "").slice(0, 100);
    // Already closed for everyone (double click, or closed twice): nothing to add.
    if (ctx.settings.closures.some((c) => !c.yearly && c.start <= date && c.end >= date && c.methods === "all" && c.locations === "all")) return { ok: true as const, closed: date };
    const next = { ...ctx.settings, closures: [...ctx.settings.closures, { id: newId("c"), label, start: date, end: date, yearly: false, methods: "all" as const, locations: "all" as const, kind: "blackout" as const }] };
    const r = await saveSettings(ctx, next, `Closed ${date}${label ? ` (${label})` : ""}`);
    return { ok: r.ok, closed: date };
  }
  if (intent === "showWizard") await setFlags(ctx.shop, { welcomeDone: false });
  if (intent === "skipWelcome") await setFlags(ctx.shop, { welcomeDone: true });
  if (intent === "checkEmbed") return { ok: true, embed: await checkEmbed(ctx.shop, ctx.admin) };
  if (intent === "dismissChecklist") await setFlags(ctx.shop, { checklistDismissed: true });
  if (intent === "showChecklist") await setFlags(ctx.shop, { checklistDismissed: false });
  if (intent === "dismissHolidays") await setFlags(ctx.shop, { holidayYearOffered: Number(ctx.today.slice(0, 4)) });
  if (intent === "celebrated") await setFlags(ctx.shop, { firstOrderCelebrated: true });
  if (intent === "testedCheckout") await setFlags(ctx.shop, { checkoutTested: true });
  return { ok: true };
};

type Data = ReturnType<typeof useLoaderData<typeof loader>>;
type WizardData = Extract<Data, { mode: "wizard" }>;
type DashData = Extract<Data, { mode: "dashboard" }>;

export default function Home() {
  const d = useLoaderData<typeof loader>();
  return d.mode === "wizard" ? <Wizard d={d} /> : <Dashboard d={d} />;
}

/* ================================================================ wizard */

const METHOD_ICON: Record<MethodId, string> = { delivery: "delivery", pickup: "store", shipping: "package" };

function Wizard({ d }: { d: WizardData }) {
  const t = useT();
  const { locale } = useI18n();
  const label = useMethodLabel();
  const fetcher = useFetcher<typeof action>();
  const embedFetcher = useFetcher<{ embed?: boolean | null }>();
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState<string | null>(d.country);
  const [type, setType] = useState<BusinessType | null>(null);
  const [answers, setAnswers] = useState(() => wizardSuggestion(d.full, country, null));
  const [holidays, setHolidays] = useState(true);
  const [pickup, setPickup] = useState(d.firstLocation ?? { name: "", address: "" });
  const choices: WizardChoices = { country, businessType: type, ...answers, holidays, pickup: answers.methods.includes("pickup") ? pickup : null };
  const choicesKey = JSON.stringify(choices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draft = useMemo(() => applyWizard(d.full, choices), [d.full, choicesKey]);
  const embedOn = embedFetcher.data?.embed ?? d.embed;
  const saving = fetcher.state !== "idle";
  const failed = fetcher.data && !fetcher.data.ok;

  const next1 = () => {
    setAnswers(wizardSuggestion(d.full, country, type));
    setStep(2);
  };
  const finish = () => fetcher.submit(JSON.stringify({ intent: "wizard", choices }), { method: "post", encType: "application/json" });
  const toggleMethod = (id: MethodId, on: boolean) => setAnswers({ ...answers, methods: on ? [...new Set([...answers.methods, id])] : answers.methods.filter((m) => m !== id) });

  return (
    <Page title={t("wizard.title")} subtitle={t("wizard.subtitle")} noNav>
      <s-section>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          {[1, 2, 3].map((n) => (
            <s-badge key={n} tone={n === step ? "info" : n < step ? "success" : undefined} icon={n < step ? "check" : undefined}>
              {t("wizard.stepN", { n, total: 3 })}: {t(`wizard.step${n}`)}
            </s-badge>
          ))}
        </s-stack>
      </s-section>

      {step === 1 ? (
        <Section heading={t("wizard.step1Heading")}>
          <s-stack gap="large">
            <CountrySelect label={t("wizard.country")} details={t("wizard.countryHelp")} value={country} countries={d.countries} onChange={setCountry} />
            <s-stack gap="small-200">
              <s-text type="strong">{t("wizard.business")}</s-text>
              <s-text color="subdued">{t("wizard.businessHelp")}</s-text>
              <s-grid gridTemplateColumns="repeat(auto-fill, minmax(150px, 1fr))" gap="small-200">
                {BUSINESS_TYPES.map((b) => (
                  <s-clickable key={b} onClick={() => setType(b)} border="base" borderRadius="base" padding="small-200" background={type === b ? "subdued" : "base"} accessibilityLabel={t(`business.${b}`)}>
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      <s-icon type={type === b ? "check-circle" : "circle"} tone={type === b ? "success" : "neutral"} />
                      <s-text type={type === b ? "strong" : undefined}>{t(`business.${b}`)}</s-text>
                    </s-stack>
                  </s-clickable>
                ))}
              </s-grid>
            </s-stack>
            <s-stack direction="inline" gap="small-200">
              <Button variant="primary" disabled={!country} onClick={next1}>
                {t("wizard.next")}
              </Button>
              <Button variant="tertiary" onClick={() => fetcher.submit({ intent: "skipWelcome" }, { method: "post" })}>
                {t("wizard.skip")}
              </Button>
            </s-stack>
          </s-stack>
        </Section>
      ) : null}

      {step === 2 ? (
        <>
          <Section heading={t("wizard.step2Heading")}>
            <s-stack gap="large">
              <s-stack gap="small-200">
                <s-text type="strong">{t("wizard.methods")}</s-text>
                {(["delivery", "pickup", "shipping"] as MethodId[]).map((id) => (
                  <s-stack key={id} direction="inline" gap="small-200" alignItems="center">
                    <s-icon type={METHOD_ICON[id] as "delivery"} />
                    <Checkbox label={label(id)} details={t(`wizard.method.${id}`)} checked={answers.methods.includes(id)} onChange={(on) => toggleMethod(id, on)} />
                  </s-stack>
                ))}
                {!answers.methods.length ? <s-text tone="critical">{t("methods.atLeastOne")}</s-text> : null}
              </s-stack>
              {answers.methods.includes("pickup") ? (
                <s-box padding="base" background="subdued" borderRadius="base">
                  <s-stack gap="base">
                    <s-text type="strong">{t("wizard.pickupWhere")}</s-text>
                    <s-text color="subdued">{d.firstLocation ? t("wizard.pickupFromShopify") : t("wizard.pickupHelp")}</s-text>
                    <TextField label={t("locations.name")} value={pickup.name} maxLength={100} onChange={(v) => setPickup({ ...pickup, name: v })} />
                    <TextField label={t("locations.address")} value={pickup.address} multiline={2} maxLength={300} onChange={(v) => setPickup({ ...pickup, address: v })} />
                  </s-stack>
                </s-box>
              ) : null}
              <WeekdayPicker label={t("wizard.days")} value={answers.workdays} onChange={(v) => setAnswers({ ...answers, workdays: v })} />
              {!answers.workdays.length ? <s-text tone="critical">{t("wizard.needDays")}</s-text> : null}
              <s-stack direction="inline" gap="base" alignItems="end">
                <NumberField
                  label={t("wizard.lead")}
                  details={t("wizard.leadHelp")}
                  min={0}
                  max={answers.lead.unit === "hours" ? 720 : 365}
                  value={answers.lead.amount}
                  onChange={(v) => setAnswers({ ...answers, lead: { ...answers.lead, amount: v ?? 0 } })}
                />
                <Select
                  label={t("schedule.leadUnit")}
                  value={answers.lead.unit}
                  options={[
                    { value: "days", label: t("schedule.days") },
                    { value: "hours", label: t("schedule.hours") },
                  ]}
                  onChange={(v) => setAnswers({ ...answers, lead: { ...answers.lead, unit: v as "days" | "hours" } })}
                />
                <TimeSelect label={t("wizard.cutoff")} details={t("wizard.cutoffHelp")} allowEmpty={t("schedule.noCutoff")} locale={locale} value={answers.cutoff} onChange={(v) => setAnswers({ ...answers, cutoff: v })} />
              </s-stack>
              {country ? (
                <Switch label={t("wizard.holidays", { country: countryName(country, locale) })} details={t("wizard.holidaysHelp")} checked={holidays} onChange={setHolidays} />
              ) : null}
              <s-stack direction="inline" gap="small-200">
                <Button onClick={() => setStep(1)}>{t("wizard.back")}</Button>
                <Button variant="primary" disabled={!answers.methods.length || !answers.workdays.length} onClick={() => setStep(3)}>
                  {t("wizard.next")}
                </Button>
              </s-stack>
            </s-stack>
          </Section>
          <Section heading={t("preview.heading")} aside>
            <LiveWidget settings={draft} meta={{ ...d.preview, country }} holidayItems={d.holidayItems} />
          </Section>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Section heading={t("wizard.step3Heading")}>
            <s-stack gap="base">
              <s-paragraph>{t("wizard.embedText")}</s-paragraph>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text type="strong">{t("widget.setup.embedTitle")}</s-text>
                {embedOn ? <s-badge tone="success">{t("widget.setup.embedOn")}</s-badge> : <s-badge tone="warning">{t("widget.setup.embedOff")}</s-badge>}
              </s-stack>
              <s-stack direction="inline" gap="small-200">
                <Button variant={embedOn ? "secondary" : "primary"} href={d.themeLink} target="_top" icon="paint-brush-flat">
                  {t("home.check.embedAction")}
                </Button>
                <Button loading={embedFetcher.state !== "idle"} onClick={() => embedFetcher.submit({ intent: "checkEmbed" }, { method: "post" })}>
                  {t("home.check.embedRecheck")}
                </Button>
              </s-stack>
              {!embedOn ? <s-text color="subdued">{t("wizard.embedLater")}</s-text> : null}
              {failed ? <s-banner tone="critical">{t("wizard.saveFailed")}</s-banner> : null}
              <s-stack direction="inline" gap="small-200">
                <Button onClick={() => setStep(2)}>{t("wizard.back")}</Button>
                <Button variant="primary" loading={saving} onClick={finish}>
                  {t("wizard.finish")}
                </Button>
              </s-stack>
            </s-stack>
          </Section>
          <Section heading={t("preview.heading")} aside>
            <LiveWidget settings={draft} meta={{ ...d.preview, country }} holidayItems={d.holidayItems} />
          </Section>
        </>
      ) : null}
    </Page>
  );
}

/* ============================================================= dashboard */

const CHECK_LINKS: Record<ChecklistId, string> = { embed: "", testOrder: "", checkout: "/app/settings/checkout", snippet: "/app/notifications" };

function Dashboard({ d }: { d: DashData }) {
  const t = useT();
  const fetcher = useFetcher();
  return (
    <Page title={t("home.title")} subtitle={t("home.subtitle")}>
      {d.celebrate ? <Celebrate /> : null}
      <Alerts d={d} />
      <Checklist d={d} />
      <Overview d={d} />
      <Chart d={d} />
      <Section heading={t("home.quickActions")}>
        <Stack direction="inline" gap="small-200" wrap>
          <Button variant="primary" icon="calendar-check" onClick={() => openModal("close-day")}>
            {t("home.closeDay")}
          </Button>
          <Button href="/app/orders?range=today" icon="order">{t("home.qaToday")}</Button>
          <Button href="/app/orders?range=tomorrow" icon="calendar">{t("home.qaTomorrow")}</Button>
          <Button href="/app/production" icon="product">{t("home.qaProduction")}</Button>
          <Button href="/app/appearance" icon="paint-brush-flat">{t("home.qaWidget")}</Button>
          <Button variant="tertiary" icon="wand" onClick={() => fetcher.submit({ intent: "showWizard" }, { method: "post" })}>
            {t("home.rerunSetup")}
          </Button>
        </Stack>
      </Section>
      <CloseDayModal d={d} />
    </Page>
  );
}

function CloseDayModal({ d }: { d: DashData }) {
  const t = useT();
  const fmt = useFormatDate();
  const shopify = useAppBridge();
  const fetcher = useFetcher<{ ok: boolean; closed?: string }>();
  const [date, setDate] = useState<string | null>(d.today);
  const [why, setWhy] = useState("");
  // The modal closes at once: say whether the day was really closed.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) shopify.toast.show(t("common.saved"));
    else shopify.toast.show(t("orders.actionFailed"), { isError: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data, fetcher.state]);
  const orders = d.chart.find((c) => c.date === date)?.orders ?? 0;
  return (
    <Modal
      id="close-day"
      heading={t("home.closeDay")}
      primary={
        <Button
          slot="primary-action"
          variant="primary"
          disabled={!date}
          loading={fetcher.state !== "idle"}
          onClick={() => {
            fetcher.submit({ intent: "closeDay", date: date ?? "", label: why }, { method: "post" });
            closeModal("close-day");
          }}
        >
          {t("home.closeDayConfirm")}
        </Button>
      }
      secondary={
        <Button slot="secondary-actions" onClick={() => closeModal("close-day")}>
          {t("common.cancel")}
        </Button>
      }
    >
      <s-stack gap="base">
        <s-text color="subdued">{t("home.closeDayHelp")}</s-text>
        <s-stack direction="inline" gap="small-200">
          <Button variant={date === d.today ? "primary" : "secondary"} onClick={() => setDate(d.today)}>{t("home.today")}</Button>
          <Button variant={date === addDays(d.today, 1) ? "primary" : "secondary"} onClick={() => setDate(addDays(d.today, 1))}>{t("home.tomorrow")}</Button>
        </s-stack>
        <DateField label={t("closures.date")} value={date} onChange={setDate} />
        <TextField label={t("closures.label")} placeholder={t("home.closeDayReason")} value={why} maxLength={100} onChange={setWhy} />
        {orders ? <s-banner tone="warning">{t("home.closeDayOrders", { count: orders, date: fmt(date) })}</s-banner> : null}
      </s-stack>
    </Modal>
  );
}

function Celebrate() {
  const t = useT();
  const fetcher = useFetcher();
  if (fetcher.state !== "idle" || fetcher.data) return null;
  return (
    <s-banner tone="success" heading={t("home.celebrateHeading")}>
      {t("home.celebrateText")}
      <s-button slot="secondary-actions" href="/app/orders">{t("home.celebrateAction")}</s-button>
      <s-button slot="secondary-actions" variant="tertiary" onClick={() => fetcher.submit({ intent: "celebrated" }, { method: "post" })}>{t("home.dismiss")}</s-button>
    </s-banner>
  );
}

function Alerts({ d }: { d: DashData }) {
  const t = useT();
  const { locale } = useI18n();
  const fmt = useFormatDate();
  const fetcher = useFetcher();
  if (!d.alerts.length) return null;
  const link: Partial<Record<string, { href: string; label: string }>> = {
    busy: { href: `/app/orders?view=calendar`, label: t("home.alert.busyAction") },
    vacation: { href: "/app/days-off", label: t("home.alert.vacationAction") },
    embedOff: { href: d.themeLink, label: t("home.alert.embedOffAction") },
    usage: { href: "/app/plans", label: t("home.alert.usageAction") },
    planOff: { href: "/app/plans", label: t("home.alert.planOffAction") },
    holidays: { href: "/app/days-off", label: t("home.alert.holidaysAction") },
    checkoutMismatch: { href: "/app/settings/checkout", label: t("home.alert.checkoutMismatchAction") },
    configLarge: { href: "/app/delivery/areas", label: t("home.alert.configLargeAction") },
    functionsMissing: { href: "/app/help", label: t("home.alert.functionsMissingAction") },
  };
  return (
    <Stack gap="small-200">
      {d.alerts.map((a) => {
        const p = { ...a.params } as Record<string, string | number>;
        if (typeof p.first === "string") p.first = fmt(p.first);
        if (typeof p.start === "string" && p.start) p.start = fmt(p.start);
        if (typeof p.end === "string" && p.end) p.end = fmt(p.end);
        if (typeof p.country === "string") p.country = countryName(p.country, locale);
        if (typeof p.keys === "string") p.features = p.keys.split(",").map((k) => t(`planOff.${k}`)).join(", ");
        const l = link[a.id];
        return (
          <s-banner key={a.id} tone={a.tone} heading={t(`home.alert.${a.id}`, p)}>
            {t(`home.alert.${a.id}Text`, p)}
            {l ? (
              <s-button slot="secondary-actions" href={l.href} target={a.id === "embedOff" ? "_top" : undefined}>
                {l.label}
              </s-button>
            ) : null}
            {a.id === "holidays" ? (
              <s-button slot="secondary-actions" variant="tertiary" onClick={() => fetcher.submit({ intent: "dismissHolidays" }, { method: "post" })}>
                {t("home.dismiss")}
              </s-button>
            ) : null}
          </s-banner>
        );
      })}
    </Stack>
  );
}

function Checklist({ d }: { d: DashData }) {
  const t = useT();
  const fetcher = useFetcher();
  const done = d.checklist.filter((c) => c.done).length;
  const post = (intent: string) => fetcher.submit({ intent }, { method: "post" });
  if (done === d.checklist.length) return null;
  if (d.checklistDismissed) {
    return (
      <Section>
        <Button variant="tertiary" onClick={() => post("showChecklist")}>{t("home.showChecklist", { done, total: d.checklist.length })}</Button>
      </Section>
    );
  }
  return (
    <Section heading={t("home.checklistHeading")}>
      <Stack gap="base">
        <s-text color="subdued">{t("home.checklistProgress", { done, total: d.checklist.length })}</s-text>
        {d.checklist.map((c, i) => (
          <s-box key={c.id} padding="small-200" borderRadius="base" background={c.done ? "subdued" : "base"} border="base">
            <Stack direction="inline" gap="base" alignItems="center" justifyContent="space-between" wrap>
              <Stack direction="inline" gap="small-200" alignItems="center">
                <s-icon type={c.done ? "check-circle" : "circle"} tone={c.done ? "success" : "neutral"} />
                <Stack gap="none">
                  <s-text type="strong">{`${i + 1}. ${t(`home.check.${c.id}`)}`}</s-text>
                  {!c.done ? <s-text color="subdued">{t(`home.check.${c.id}Help`)}</s-text> : null}
                </Stack>
              </Stack>
              {!c.done ? (
                c.id === "embed" ? (
                  <Stack direction="inline" gap="small-200">
                    <Button variant="primary" href={d.themeLink} target="_top">{t("home.check.embedAction")}</Button>
                    <Button loading={fetcher.state !== "idle"} onClick={() => post("checkEmbed")}>{t("home.check.embedRecheck")}</Button>
                  </Stack>
                ) : c.id === "testOrder" ? (
                  <Stack direction="inline" gap="small-200">
                    <Button href={`https://${d.shop}/cart`} target="_blank">{t("home.check.testOrderAction")}</Button>
                    <Button variant="tertiary" onClick={() => post("testedCheckout")}>{t("home.check.testOrderDone")}</Button>
                  </Stack>
                ) : (
                  <Button href={CHECK_LINKS[c.id]}>{t("home.check.open")}</Button>
                )
              ) : null}
            </Stack>
          </s-box>
        ))}
        <Button variant="tertiary" onClick={() => post("dismissChecklist")}>{t("home.hideChecklist")}</Button>
      </Stack>
    </Section>
  );
}

function Overview({ d }: { d: DashData }) {
  const t = useT();
  const label = useMethodLabel();
  const cards = [
    { key: "today", href: "/app/orders?range=today", v: d.overview.today },
    { key: "tomorrow", href: "/app/orders?range=tomorrow", v: d.overview.tomorrow },
    { key: "week", href: "/app/orders?range=next7", v: d.overview.week },
  ] as const;
  return (
    <Section heading={t("home.overview")}>
      {d.closedToday ? (
        <s-box paddingBlockEnd="base">
          <s-badge tone="warning" icon="calendar-check">{t("home.closedToday")}</s-badge>
        </s-box>
      ) : null}
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
        {cards.map((c) => (
          <s-clickable key={c.key} href={c.href} border="base" borderRadius="base" padding="base">
            <Stack gap="small-200">
              <s-text color="subdued">{t(`home.${c.key}`)}</s-text>
              <s-heading>{t("home.orders", { count: c.v.total })}</s-heading>
              {d.methods.length > 1
                ? d.methods.map((m) => (
                    <s-text key={m} color="subdued">
                      {label(m)}: {c.v.methods[m] ?? 0}
                    </s-text>
                  ))
                : null}
            </Stack>
          </s-clickable>
        ))}
      </s-grid>
    </Section>
  );
}

/** The next 14 days: orders per day as bars, with the daily limit when there is one. */
function Chart({ d }: { d: DashData }) {
  const t = useT();
  const { locale } = useI18n();
  const wd = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const utc = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
  const top = Math.max(1, ...d.chart.map((c) => Math.max(c.orders, c.max ?? 0)));
  return (
    <Section heading={t("home.chartHeading")}>
      <style>{CHART_CSS}</style>
      <ol className="pd-chart" aria-label={t("home.chartHeading")}>
        {d.chart.map((c) => {
          const pct = c.max ? Math.round((c.used / c.max) * 100) : null;
          const tone = pct === null ? "" : pct >= 100 ? "full" : pct >= 80 ? "busy" : "";
          const text = [`${wd.format(utc(c.date))} ${day.format(utc(c.date))}`, t("home.orders", { count: c.orders }), c.max ? t("home.chartLimit", { used: c.used, max: c.max }) : ""].filter(Boolean).join(", ");
          return (
            <li key={c.date}>
              <Link to={`/app/orders?range=custom&from=${c.date}&to=${c.date}`} aria-label={text} title={text} className={c.date === d.today ? "is-today" : undefined}>
                <span className="pd-chart-n">{c.orders}</span>
                <span className="pd-chart-track">
                  {c.max ? <span className="pd-chart-max" style={{ bottom: `${(c.max / top) * 100}%` }} /> : null}
                  <span className={`pd-chart-bar ${tone}`} style={{ height: `${(c.orders / top) * 100}%` }} />
                </span>
                <span className="pd-chart-wd">{wd.format(utc(c.date))}</span>
                <span className="pd-chart-d">{day.format(utc(c.date))}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <s-text color="subdued">{t("home.chartHelp")}</s-text>
    </Section>
  );
}

const CHART_CSS = `
.pd-chart{display:grid;grid-template-columns:repeat(14,minmax(34px,1fr));gap:4px;list-style:none;margin:0 0 8px;padding:0;overflow-x:auto}
.pd-chart a{display:flex;flex-direction:column;align-items:center;gap:2px;text-decoration:none;color:#303030;padding:4px 0;border-radius:6px}
.pd-chart a:hover{background:#f7f7f7}.pd-chart a:focus-visible{outline:2px solid #005bd3}
.pd-chart a.is-today .pd-chart-wd{font-weight:700}
.pd-chart-track{position:relative;width:60%;height:90px;background:#f1f1f1;border-radius:4px;overflow:hidden}
.pd-chart-bar{position:absolute;left:0;right:0;bottom:0;background:#2c6ecb;border-radius:4px 4px 0 0;min-height:1px}
.pd-chart-bar.busy{background:#e5a00d}.pd-chart-bar.full{background:#c5280c}
.pd-chart-max{position:absolute;left:-2px;right:-2px;border-top:2px dashed #8a8a8a;z-index:1}
.pd-chart-n{font-size:12px;font-weight:600}.pd-chart-wd{font-size:11px}.pd-chart-d{font-size:10px;color:#616161;white-space:nowrap}
`;
