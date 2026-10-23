/**
 * Delivery: local delivery and shipping on one page (one tab each): on/off, days and times,
 * time slots and limits, who can choose it, delivery areas, and a live preview.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { hasFeature } from "../../core/publish";
import type { MethodId, MethodSettings, Settings } from "../../core/types";
import { CapacityEditor, ScheduleEditor } from "../components/editors";
import { MethodPreview } from "../components/live-preview";
import { Button, Checkbox, ChoiceList, MoneyField, Page, Section, Switch, TextField } from "../components/polaris";
import { SettingsChrome, fieldId, useSettingsForm } from "../components/settings-form";
import { CountryPicker, useMethodLabel } from "../components/shared";
import { useT } from "../i18n/react";
import { shopCountries } from "../services/countries.server";
import { adminContext, patchSettingsAction, previewData, shopMeta } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const { countries, markets } = await shopCountries(ctx.admin);
  const s = ctx.settings;
  return {
    meta: shopMeta(ctx),
    ...previewData(ctx),
    countries,
    markets,
    full: s,
    areaCount: s.areas.length,
    zoneCount: s.zones.length,
    initial: { methods: s.methods } as Pick<Settings, "methods">,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => patchSettingsAction(request);

const TABS: MethodId[] = ["delivery", "shipping"];

export default function DeliveryPage() {
  const d = useLoaderData<typeof loader>();
  const t = useT();
  const label = useMethodLabel();
  const [params, setParams] = useSearchParams();
  const tab: MethodId = params.get("m") === "shipping" ? "shipping" : "delivery";
  const form = useSettingsForm(d.initial, {
    validate: (x) => (Object.values(x.methods).some((m) => m.enabled) ? [] : [{ path: "methods", message: t("methods.atLeastOne") }]),
  });
  const { draft, update } = form;
  const m = draft.methods[tab];
  const set = (fn: (m: MethodSettings) => void) => update((x) => fn(x.methods[tab]));
  const capacityAllowed = hasFeature(d.meta.plan, "capacity");
  const path = `methods.${tab}`;

  return (
    <Page title={t("delivery.title")} subtitle={t("delivery.subtitle")}>
      <SettingsChrome form={form} fieldLabels={{ "methods.delivery": label("delivery"), "methods.shipping": label("shipping"), methods: t("delivery.title") }} />

      <s-section>
        <s-stack gap="small-200">
          <s-button-group>
            {TABS.map((id) => (
              <s-button
                key={id}
                slot="secondary-actions"
                variant={id === tab ? "primary" : "secondary"}
                icon={id === "delivery" ? "delivery" : "package"}
                onClick={() => setParams(id === "delivery" ? {} : { m: id }, { preventScrollReset: true })}
              >
                {label(id)}
                {draft.methods[id].enabled ? "" : ` · ${t("delivery.off")}`}
              </s-button>
            ))}
          </s-button-group>
          <s-text color="subdued">{t(`delivery.${tab}Intro`)}</s-text>
        </s-stack>
      </s-section>

      <Section heading={t("delivery.onOff", { method: label(tab) })} id={fieldId(path)}>
        <Switch
          label={t("methods.offer", { method: label(tab) })}
          details={t(`delivery.${tab}SwitchHelp`)}
          checked={m.enabled}
          onChange={(v) => set((x) => (x.enabled = v))}
        />
      </Section>

      {m.enabled ? (
        <>
          <Section heading={t("delivery.whenHeading")}>
            <s-stack gap="base">
              <s-text color="subdued">{t(`delivery.${tab}WhenHelp`)}</s-text>
              <ScheduleEditor path={`${path}.schedule`} value={m.schedule} errorFor={form.errorFor} onChange={(s) => set((x) => (x.schedule = s))} />
            </s-stack>
          </Section>

          <Section heading={t("delivery.slotsHeading")}>
            <s-stack gap="base">
              <Switch label={t("methods.slots")} details={t("delivery.slotsHelp")} checked={m.slotsEnabled} onChange={(v) => set((x) => (x.slotsEnabled = v))} />
              <CapacityEditor
                key={tab}
                modalPrefix={`cap-${tab}`}
                path={`${path}.capacity`}
                value={m.capacity}
                errorFor={form.errorFor}
                slotsEnabled={m.slotsEnabled}
                capacityAllowed={capacityAllowed}
                onChange={(c) => set((x) => (x.capacity = c))}
              />
            </s-stack>
          </Section>

          <Section heading={t("delivery.whoHeading")}>
            <s-stack gap="base">
              <s-stack gap="small-200">
                <s-text type="strong">{t("methods.shopperName")}</s-text>
                <s-text color="subdued">{t("methods.shopperNameHelp")}</s-text>
                {d.meta.locales.map((loc) => (
                  <TextField
                    key={loc}
                    label={`${t("methods.nameIn")} ${loc}`}
                    value={m.names[loc] ?? ""}
                    placeholder={label(tab)}
                    maxLength={40}
                    onChange={(v) =>
                      set((x) => {
                        if (v) x.names[loc] = v;
                        else delete x.names[loc];
                      })
                    }
                  />
                ))}
              </s-stack>
              <CountryPicker label={t("methods.whereOffered")} value={m.countries} countries={d.countries} markets={d.markets} onChange={(v) => set((x) => (x.countries = v))} />
              <Checkbox label={t("methods.dateRequired")} details={t("methods.dateRequiredHelp")} checked={m.dateRequired} onChange={(v) => set((x) => (x.dateRequired = v))} />
              {tab === "shipping" ? (
                <ChoiceList
                  label={t("methods.dateMeaning")}
                  value={m.dateMeaning}
                  options={[
                    { value: "delivery", label: t("methods.meaningDelivery"), details: t("methods.meaningDeliveryHelp") },
                    { value: "dispatch", label: t("methods.meaningDispatch"), details: t("methods.meaningDispatchHelp") },
                  ]}
                  onChange={(v) => set((x) => (x.dateMeaning = v as "delivery" | "dispatch"))}
                />
              ) : null}
              <MoneyField
                id={fieldId(`${path}.minOrder`)}
                label={t("methods.minOrder", { currency: d.meta.currency })}
                details={t("methods.minOrderHelp", { method: label(tab) })}
                value={m.minOrder}
                error={form.errorFor(`${path}.minOrder`)}
                onChange={(v) => set((x) => (x.minOrder = v))}
              />
            </s-stack>
          </Section>

          {tab === "delivery" ? (
            <Section heading={t("delivery.areasHeading")}>
              <s-stack gap="base">
                <s-text color="subdued">
                  {d.areaCount || d.zoneCount ? t("delivery.areasSummary", { areas: d.areaCount, zones: d.zoneCount }) : t("delivery.areasNone")}
                </s-text>
                <s-box>
                  <Button href="/app/delivery/areas" icon="map">
                    {t("delivery.areasButton")}
                  </Button>
                </s-box>
              </s-stack>
            </Section>
          ) : null}
        </>
      ) : null}

      <Section heading={t("preview.heading")} aside>
        <MethodPreview settings={{ ...d.full, ...draft }} meta={d.preview} holidayItems={d.holidayItems} method={tab} />
      </Section>
    </Page>
  );
}
