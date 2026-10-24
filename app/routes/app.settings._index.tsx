/**
 * Settings: store & region (country, date format, week start), what shoppers choose
 * (method order, default, one date per order or per item), customer date changes, order tags, and links to
 * everything else (product rules, fees, checkout, notifications, import/export, plan).
 */
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { applyCountry } from "../../core/defaults";
import { DATE_FORMATS, formatDate } from "../../core/dateformat";
import { hasFeature } from "../../core/publish";
import { regionDefaults } from "../../core/regions";
import type { DateFormat, MethodId, Settings } from "../../core/types";
import { Button, Checkbox, ChoiceList, Locked, NumberField, Page, Section, Select, Switch, TextField } from "../components/polaris";
import { SettingsChrome, fieldId, useSettingsForm } from "../components/settings-form";
import { CountrySelect, countryName, useMethodLabel, useWeekdays } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { holidayCountries } from "../services/holidays.server";
import { adminContext, patchSettingsAction, shopMeta } from "../services/settings.server";

type Edited = Pick<Settings, "country" | "dateFormat" | "weekStart" | "holidays" | "methods" | "locations" | "methodOrder" | "defaultMethod" | "dateMode" | "tagging" | "customerChanges">;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const s = ctx.settings;
  // The holiday dataset's countries (about 200): every country Pickday can load public holidays for.
  const countries = new Set(holidayCountries("en").map((c) => c.code));
  if (s.country) countries.add(s.country);
  return {
    meta: shopMeta(ctx),
    countries: [...countries],
    shopifyCountry: ctx.row.country,
    initial: {
      country: s.country,
      dateFormat: s.dateFormat,
      weekStart: s.weekStart,
      holidays: s.holidays,
      methods: s.methods,
      locations: s.locations,
      methodOrder: s.methodOrder,
      defaultMethod: s.defaultMethod,
      dateMode: s.dateMode,
      tagging: s.tagging,
      customerChanges: s.customerChanges,
    } as Edited,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => patchSettingsAction(request);

const LINKS: { key: string; href: string; icon: string; plan?: string; feature?: string }[] = [
  { key: "products", href: "/app/settings/products", icon: "product", plan: "Pro", feature: "productRules" },
  { key: "fees", href: "/app/settings/fees", icon: "money", plan: "Pro", feature: "surcharges" },
  { key: "checkout", href: "/app/settings/checkout", icon: "cart", plan: "Starter", feature: "checkoutMatching" },
  { key: "notifications", href: "/app/notifications", icon: "email" },
  { key: "transfer", href: "/app/settings/transfer", icon: "import", plan: "Pro", feature: "importExport" },
  { key: "plans", href: "/app/plans", icon: "money" },
];

export default function SettingsPage() {
  const d = useLoaderData<typeof loader>();
  const t = useT();
  const { locale } = useI18n();
  const label = useMethodLabel();
  const days = useWeekdays();
  const form = useSettingsForm(d.initial);
  const { draft, update, setDraft } = form;
  const [pending, setPending] = useState<string | null>(null);
  const [alsoDays, setAlsoDays] = useState(true);
  const [alsoFormat, setAlsoFormat] = useState(true);

  const countries = d.countries;
  const dayNames = (wds: number[]) => days.filter((x) => wds.includes(x.value)).map((x) => x.short).join(", ");
  const sample = "2026-10-18";
  const formatLabel = (f: DateFormat) => `${t(`settingsPage.format.${f}`)} — ${formatDate(sample, f, d.meta.primaryLocale)}`;
  const target = pending ? regionDefaults(pending) : null;
  const weekStartName = (w: number) => days.find((x) => x.value === w)?.long ?? "";

  const move = (id: MethodId, dir: -1 | 1) =>
    update((x) => {
      const i = x.methodOrder.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= x.methodOrder.length) return;
      [x.methodOrder[i], x.methodOrder[j]] = [x.methodOrder[j], x.methodOrder[i]];
    });

  return (
    <Page title={t("settingsPage.title")} subtitle={t("settingsPage.subtitle")}>
      <SettingsChrome form={form} />

      <Section heading={t("settingsPage.regionHeading")}>
        <s-stack gap="large">
          <CountrySelect
            id={fieldId("country")}
            label={t("settingsPage.country")}
            details={t("settingsPage.countryHelp")}
            value={pending ?? draft.country}
            countries={countries}
            onChange={(c) => {
              if (c === draft.country) return setPending(null);
              setPending(c);
              setAlsoDays(true);
              setAlsoFormat(draft.dateFormat !== "auto");
            }}
          />
          {pending && target ? (
            <s-banner tone="info" heading={t("settingsPage.applyHeading", { country: countryName(pending, locale) })}>
              <s-stack gap="small-200">
                <s-unordered-list>
                  <s-list-item>{t("settingsPage.applyWeek", { day: weekStartName(target.weekStart) })}</s-list-item>
                  <s-list-item>{t("settingsPage.applyHolidays", { country: countryName(pending, locale) })}</s-list-item>
                </s-unordered-list>
                <Checkbox label={t("settingsPage.applyDays", { days: dayNames(target.workdays) })} checked={alsoDays} onChange={setAlsoDays} />
                <Checkbox label={t("settingsPage.applyFormat", { example: formatDate(sample, target.dateFormat, d.meta.primaryLocale) })} checked={alsoFormat} onChange={setAlsoFormat} />
                <s-stack direction="inline" gap="small-200">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setDraft((x) => applyCountry({ ...(x as Settings) }, pending, { workdays: alsoDays, dateFormat: alsoFormat }) as Edited);
                      setPending(null);
                    }}
                  >
                    {t("settingsPage.apply")}
                  </Button>
                  <Button variant="tertiary" onClick={() => setPending(null)}>
                    {t("common.cancel")}
                  </Button>
                </s-stack>
              </s-stack>
            </s-banner>
          ) : null}
          <Select
            id={fieldId("dateFormat")}
            label={t("settingsPage.dateFormat")}
            details={t("settingsPage.dateFormatHelp")}
            value={draft.dateFormat}
            options={DATE_FORMATS.map((f) => ({ value: f, label: formatLabel(f) }))}
            onChange={(v) => update((x) => (x.dateFormat = v as DateFormat))}
          />
          <Select
            id={fieldId("weekStart")}
            label={t("settingsPage.weekStart")}
            details={t("settingsPage.weekStartHelp")}
            value={draft.weekStart === null ? "" : String(draft.weekStart)}
            options={[
              { value: "", label: t("settingsPage.weekStartAuto") },
              { value: "0", label: weekStartName(0) },
              { value: "1", label: weekStartName(1) },
              { value: "6", label: weekStartName(6) },
            ]}
            onChange={(v) => update((x) => (x.weekStart = v === "" ? null : (Number(v) as 0 | 1 | 6)))}
          />
          <s-text color="subdued">{t("settingsPage.timeZone", { zone: d.meta.timeZone })}</s-text>
        </s-stack>
      </Section>

      <Section heading={t("settingsPage.choiceHeading")}>
        <s-stack gap="base">
          <s-text color="subdued">{t("settingsPage.orderHelp")}</s-text>
          {draft.methodOrder.map((id, i) => (
            <s-box key={id} padding="small-200" borderWidth="base" borderRadius="base">
              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-icon type={id === "delivery" ? "delivery" : id === "pickup" ? "store" : "package"} />
                  <s-text type="strong">{`${i + 1}. ${label(id)}`}</s-text>
                  {draft.methods[id].enabled ? <s-badge tone="success">{t("locations.on")}</s-badge> : <s-badge>{t("locations.off")}</s-badge>}
                </s-stack>
                <s-stack direction="inline" gap="small-200">
                  <Button variant="tertiary" icon="arrow-up" accessibilityLabel={t("methods.moveUp", { method: label(id) })} disabled={i === 0} onClick={() => move(id, -1)}>
                    {""}
                  </Button>
                  <Button variant="tertiary" icon="arrow-down" accessibilityLabel={t("methods.moveDown", { method: label(id) })} disabled={i === draft.methodOrder.length - 1} onClick={() => move(id, 1)}>
                    {""}
                  </Button>
                </s-stack>
              </s-stack>
            </s-box>
          ))}
          <Select
            label={t("methods.defaultMethod")}
            details={t("methods.defaultMethodHelp")}
            value={draft.defaultMethod ?? ""}
            options={[{ value: "", label: t("methods.noDefault") }, ...draft.methodOrder.filter((id) => draft.methods[id].enabled).map((id) => ({ value: id, label: label(id) }))]}
            onChange={(v) => update((x) => (x.defaultMethod = (v || null) as MethodId | null))}
          />
          <ChoiceList
            label={t("schedule.dateMode")}
            value={draft.dateMode}
            options={[
              { value: "order", label: t("schedule.modeOrder"), details: t("schedule.modeOrderHelp") },
              {
                value: "item",
                label: t("schedule.modeItem"),
                details: hasFeature(d.meta.plan, "dateMode") ? t("schedule.modeItemHelp") : `${t("schedule.modeItemHelp")} ${t("common.availableOn", { plan: "Pro" })}`,
                disabled: !hasFeature(d.meta.plan, "dateMode"),
              },
            ]}
            onChange={(v) => update((x) => (x.dateMode = v as "order" | "item"))}
          />
        </s-stack>
      </Section>

      <Section heading={t("customerChanges.heading")} id={fieldId("customerChanges")}>
        {!hasFeature(d.meta.plan, "customerChanges") ? <Locked plan="Starter" label={t("customerChanges.locked")} upgradeLabel={t("common.upgrade")} /> : null}
        <s-stack gap="base">
          <s-text color="subdued">{t("customerChanges.help")}</s-text>
          <Switch
            label={t("customerChanges.enabled")}
            checked={draft.customerChanges.enabled}
            disabled={!hasFeature(d.meta.plan, "customerChanges")}
            onChange={(v) => update((x) => (x.customerChanges.enabled = v))}
          />
          {draft.customerChanges.enabled ? (
            <s-stack direction="inline" gap="base">
              <NumberField
                label={t("customerChanges.hoursBefore")}
                details={t("customerChanges.hoursBeforeHelp")}
                value={draft.customerChanges.hoursBefore}
                min={0}
                max={336}
                suffix={t("customerChanges.hours")}
                onChange={(v) => update((x) => (x.customerChanges.hoursBefore = Math.min(336, Math.max(0, Math.round(v ?? 0)))))}
              />
              <NumberField
                label={t("customerChanges.maxChanges")}
                details={t("customerChanges.maxChangesHelp")}
                value={draft.customerChanges.maxChanges}
                min={1}
                max={10}
                onChange={(v) => update((x) => (x.customerChanges.maxChanges = Math.min(10, Math.max(1, Math.round(v ?? 1)))))}
              />
            </s-stack>
          ) : null}
          <s-text color="subdued">{t("customerChanges.where")}</s-text>
        </s-stack>
      </Section>

      <Section heading={t("settingsPage.tagsHeading")}>
        <s-stack gap="base">
          <Switch label={t("settingsPage.tagsOn")} details={t("settingsPage.tagsHelp")} checked={draft.tagging.enabled} onChange={(v) => update((x) => (x.tagging.enabled = v))} />
          {draft.tagging.enabled ? (
            <TextField
              label={t("settingsPage.tagPrefix")}
              details={t("settingsPage.tagPrefixHelp", { example: `${draft.tagging.prefix}Date: ${sample}` })}
              value={draft.tagging.prefix}
              maxLength={20}
              onChange={(v) => update((x) => (x.tagging.prefix = v))}
            />
          ) : null}
        </s-stack>
      </Section>

      <Section heading={t("settingsPage.moreHeading")}>
        <s-grid gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))" gap="base">
          {LINKS.map((c) => {
            const locked = c.feature && !hasFeature(d.meta.plan, c.feature);
            return (
              <s-clickable key={c.key} href={c.href} border="base" borderRadius="base" padding="base" background="base">
                <s-stack gap="small-200">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-icon type={c.icon as "money"} />
                    <s-heading>{t(`settingsPage.link.${c.key}`)}</s-heading>
                    {locked ? (
                      <s-badge icon="lock" tone="info">
                        {c.plan}
                      </s-badge>
                    ) : null}
                  </s-stack>
                  <s-text color="subdued">{t(`settingsPage.link.${c.key}Help`)}</s-text>
                </s-stack>
              </s-clickable>
            );
          })}
        </s-grid>
      </Section>
    </Page>
  );
}
