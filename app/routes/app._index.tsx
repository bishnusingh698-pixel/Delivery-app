import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { addDays } from "../../core/civil";
import { BUSINESS_TYPES, applyBusinessPreset, type BusinessType } from "../../core/defaults";
import { alerts, busyDays, checklist, type ChecklistId } from "../../core/home";
import { hasFeature } from "../../core/publish";
import type { MethodId } from "../../core/types";
import { Button, Page, Section, Select, Stack } from "../components/polaris";
import { countryName, useFormatDate, useMethodLabel } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { flagsOf, requireShop, setFlags, warningsOf } from "../models/shop.server";
import { shopCountries } from "../services/countries.server";
import { checkEmbed, themeEditorLink } from "../services/embed.server";
import { dayCounts } from "../services/orders-query.server";
import { storefrontConfigFor } from "../services/publish.server";
import { adminContext, saveSettings } from "../services/settings.server";
import { monthlyUsage } from "../services/usage.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  let flags = flagsOf(ctx.row);
  // Re-check the app embed at most every 10 minutes while the merchant is on Home.
  const stale = !flags.embedCheckedAt || Date.now() - Date.parse(flags.embedCheckedAt) > 10 * 60_000;
  if (stale && !flags.embedDetected) {
    await checkEmbed(ctx.shop, ctx.admin);
    flags = flagsOf(await requireShop(ctx.shop));
  }
  const { config } = await storefrontConfigFor(ctx.shop);
  const counts = await dayCounts(ctx.shop, config, ctx.today, addDays(ctx.today, 6));
  const usage = await monthlyUsage(ctx.shop, ctx.row);
  const sum = (d: string[]) => {
    const m: Partial<Record<MethodId, number>> = {};
    let total = 0;
    for (const day of d) for (const [k, v] of Object.entries(counts[day]?.methods ?? {})) {
      m[k as MethodId] = (m[k as MethodId] ?? 0) + v!.orders;
      total += v!.orders;
    }
    return { total, methods: m };
  };
  const week = Array.from({ length: 7 }, (_, i) => addDays(ctx.today, i));
  const busy = busyDays(counts, ctx.today);
  const welcome = !flags.welcomeDone;
  return {
    shop: ctx.shop,
    today: ctx.today,
    welcome,
    countries: welcome ? (await shopCountries(ctx.admin).catch(() => ({ countries: [] as string[] }))).countries : [],
    country: ctx.settings.country ?? ctx.row.country,
    checklist: checklist(ctx.settings, flags, ctx.version, hasFeature(ctx.plan, "checkoutMatching")),
    checklistDismissed: !!flags.checklistDismissed,
    themeLink: themeEditorLink(ctx.shop),
    overview: { today: sum([ctx.today]), tomorrow: sum([addDays(ctx.today, 1)]), week: sum(week) },
    alerts: alerts({ settings: ctx.settings, today: ctx.today, flags, embedChecked: !!flags.embedCheckedAt, busyDays: busy, usagePct: usage.limit === null ? null : usage.pct, warnings: warningsOf(ctx.row) }),
    busy,
    celebrate: !!flags.firstOrderAt && !flags.firstOrderCelebrated,
    methods: ctx.settings.methodOrder.filter((m) => ctx.settings.methods[m].enabled),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await adminContext(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  if (intent === "welcome") {
    const type = String(form.get("businessType")) as BusinessType;
    const country = String(form.get("country") || "") || null;
    let next = { ...ctx.settings, country };
    if (BUSINESS_TYPES.includes(type)) next = applyBusinessPreset(next, type);
    const r = await saveSettings(ctx, next, `Welcome: ${type}`);
    if (r.ok) await setFlags(ctx.shop, { welcomeDone: true });
    return { ok: r.ok };
  }
  if (intent === "skipWelcome") await setFlags(ctx.shop, { welcomeDone: true });
  if (intent === "checkEmbed") return { ok: true, embed: await checkEmbed(ctx.shop, ctx.admin) };
  if (intent === "dismissChecklist") await setFlags(ctx.shop, { checklistDismissed: true });
  if (intent === "showChecklist") await setFlags(ctx.shop, { checklistDismissed: false });
  if (intent === "dismissHolidays") await setFlags(ctx.shop, { holidayYearOffered: Number(ctx.today.slice(0, 4)) + 1 });
  if (intent === "celebrated") await setFlags(ctx.shop, { firstOrderCelebrated: true });
  if (intent === "testedCheckout") await setFlags(ctx.shop, { checkoutTested: true });
  return { ok: true };
};

const CHECK_LINKS: Record<ChecklistId, string> = {
  embed: "",
  methods: "/app/settings/methods",
  schedule: "/app/settings/schedule",
  checkout: "/app/settings/checkout",
  snippet: "/app/notifications",
  testOrder: "",
};

export default function Home() {
  const d = useLoaderData<typeof loader>();
  const t = useT();
  return (
    <Page title={t("home.title")} subtitle={t("home.subtitle")}>
      {d.welcome ? <Welcome countries={d.countries} country={d.country} /> : null}
      {d.celebrate ? <Celebrate /> : null}
      <Alerts />
      <Checklist />
      <Overview />
      <Section heading={t("home.quickActions")}>
        <Stack direction="inline" gap="small-200" wrap>
          <Button href="/app/orders?range=today" icon="order">{t("home.qaToday")}</Button>
          <Button href="/app/orders?range=tomorrow" icon="calendar">{t("home.qaTomorrow")}</Button>
          <Button href="/app/production" icon="product">{t("home.qaProduction")}</Button>
          <Button href="/app/settings/closures" icon="calendar-check">{t("home.qaClose")}</Button>
          <Button href="/app/widget" icon="paint-brush-flat">{t("home.qaWidget")}</Button>
        </Stack>
      </Section>
    </Page>
  );
}

function Welcome({ countries, country }: { countries: string[]; country: string | null }) {
  const t = useT();
  const { locale } = useI18n();
  const fetcher = useFetcher();
  const [type, setType] = useState<string>("");
  const [c, setC] = useState(country ?? "");
  const list = countries.map((x) => ({ value: x, label: countryName(x, locale) })).sort((a, b) => a.label.localeCompare(b.label, locale));
  return (
    <Section heading={t("home.welcomeHeading")}>
      <Stack gap="base">
        <s-text>{t("home.welcomeText")}</s-text>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
          <Select
            label={t("home.businessType")}
            value={type}
            options={[{ value: "", label: t("home.chooseOne") }, ...BUSINESS_TYPES.map((b) => ({ value: b, label: t(`business.${b}`) }))]}
            onChange={setType}
          />
          {list.length ? <Select label={t("home.country")} value={c} options={[{ value: "", label: t("home.chooseOne") }, ...list]} onChange={setC} /> : null}
        </s-grid>
        <s-text color="subdued">{t("home.welcomeHelp")}</s-text>
        <Stack direction="inline" gap="small-200">
          <Button variant="primary" disabled={!type} loading={fetcher.state !== "idle"} onClick={() => fetcher.submit({ intent: "welcome", businessType: type, country: c }, { method: "post" })}>
            {t("home.welcomeSave")}
          </Button>
          <Button variant="tertiary" onClick={() => fetcher.submit({ intent: "skipWelcome" }, { method: "post" })}>{t("home.welcomeSkip")}</Button>
        </Stack>
      </Stack>
    </Section>
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

function Alerts() {
  const d = useLoaderData<typeof loader>();
  const t = useT();
  const fmt = useFormatDate();
  const fetcher = useFetcher();
  if (!d.alerts.length) return null;
  const link: Partial<Record<string, { href: string; label: string }>> = {
    busy: { href: `/app/orders?view=calendar`, label: t("home.alert.busyAction") },
    vacation: { href: "/app/settings/closures", label: t("home.alert.vacationAction") },
    embedOff: { href: d.themeLink, label: t("home.alert.embedOffAction") },
    usage: { href: "/app/plans", label: t("home.alert.usageAction") },
    holidays: { href: "/app/settings/closures", label: t("home.alert.holidaysAction") },
    checkoutMismatch: { href: "/app/settings/checkout", label: t("home.alert.checkoutMismatchAction") },
    configLarge: { href: "/app/settings/areas", label: t("home.alert.configLargeAction") },
    functionsMissing: { href: "/app/help", label: t("home.alert.functionsMissingAction") },
  };
  return (
    <Stack gap="small-200">
      {d.alerts.map((a) => {
        const p = { ...a.params } as Record<string, string | number>;
        if (typeof p.first === "string") p.first = fmt(p.first);
        if (typeof p.start === "string" && p.start) p.start = fmt(p.start);
        if (typeof p.end === "string" && p.end) p.end = fmt(p.end);
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

function Checklist() {
  const d = useLoaderData<typeof loader>();
  const t = useT();
  const fetcher = useFetcher();
  const done = d.checklist.filter((c) => c.done).length;
  const post = (intent: string) => fetcher.submit({ intent }, { method: "post" });
  if (d.checklistDismissed) {
    return done < d.checklist.length ? (
      <Section>
        <Button variant="tertiary" onClick={() => post("showChecklist")}>{t("home.showChecklist", { done, total: d.checklist.length })}</Button>
      </Section>
    ) : null;
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

function Overview() {
  const d = useLoaderData<typeof loader>();
  const t = useT();
  const label = useMethodLabel();
  const cards = [
    { key: "today", href: "/app/orders?range=today", v: d.overview.today },
    { key: "tomorrow", href: "/app/orders?range=tomorrow", v: d.overview.tomorrow },
    { key: "week", href: "/app/orders?range=next7", v: d.overview.week },
  ] as const;
  return (
    <Section heading={t("home.overview")}>
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
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
