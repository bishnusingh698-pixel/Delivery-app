import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { hasFeature } from "../../core/publish";
import type { MethodId, Settings } from "../../core/types";
import { Button, Checkbox, ChoiceList, Locked, MoneyField, Page, Section, Select, Switch, TextField } from "../components/polaris";
import { SettingsChrome, fieldId, useSettingsForm } from "../components/settings-form";
import { CountryPicker, useMethodLabel } from "../components/shared";
import { useT } from "../i18n/react";
import { shopCountries } from "../services/countries.server";
import { adminContext, patchSettingsAction, shopMeta } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const { countries, markets } = await shopCountries(ctx.admin);
  const s = ctx.settings;
  return {
    meta: shopMeta(ctx),
    countries,
    markets,
    initial: { methods: s.methods, methodOrder: s.methodOrder, defaultMethod: s.defaultMethod } as Pick<Settings, "methods" | "methodOrder" | "defaultMethod">,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => patchSettingsAction(request);

export default function MethodsPage() {
  const { meta, countries, markets, initial } = useLoaderData<typeof loader>();
  const t = useT();
  const label = useMethodLabel();
  const allMethods = hasFeature(meta.plan, "allMethods");
  const slotsAllowed = hasFeature(meta.plan, "slots");
  const form = useSettingsForm(initial, {
    validate: (d) => (Object.values(d.methods).some((m) => m.enabled) ? [] : [{ path: "methods", message: t("methods.atLeastOne") }]),
  });
  const { draft, update } = form;
  const enabledCount = Object.values(draft.methods).filter((m) => m.enabled).length;

  const move = (id: MethodId, dir: -1 | 1) =>
    update((d) => {
      const i = d.methodOrder.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= d.methodOrder.length) return;
      [d.methodOrder[i], d.methodOrder[j]] = [d.methodOrder[j], d.methodOrder[i]];
    });

  return (
    <Page title={t("methods.title")} subtitle={t("methods.subtitle")} backTo={{ href: "/app/settings", label: t("nav.settings") }}>
      <SettingsChrome form={form} fieldLabels={{ methods: t("methods.title") }} />
      <s-banner tone="info">
        {t("methods.shopifyNote")} <s-link href="/app/settings/checkout">{t("checkout.title")}</s-link>
      </s-banner>
      {!allMethods ? <Locked plan="Starter" label={t("methods.freeOneMethod")} upgradeLabel={t("common.upgrade")} /> : null}

      {draft.methodOrder.map((id, index) => {
        const m = draft.methods[id];
        const lockedOn = !allMethods && !m.enabled && enabledCount >= 1;
        return (
          <Section key={id} heading={label(id)} id={fieldId(`methods.${id}`)}>
            <s-stack gap="base">
              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <Switch
                  label={t("methods.offer", { method: label(id) })}
                  checked={m.enabled}
                  disabled={lockedOn}
                  onChange={(v) => update((d) => (d.methods[id].enabled = v))}
                />
                <s-stack direction="inline" gap="small-200">
                  <Button variant="tertiary" icon="arrow-up" accessibilityLabel={t("methods.moveUp", { method: label(id) })} disabled={index === 0} onClick={() => move(id, -1)}>
                    {""}
                  </Button>
                  <Button
                    variant="tertiary"
                    icon="arrow-down"
                    accessibilityLabel={t("methods.moveDown", { method: label(id) })}
                    disabled={index === draft.methodOrder.length - 1}
                    onClick={() => move(id, 1)}
                  >
                    {""}
                  </Button>
                </s-stack>
              </s-stack>
              {m.enabled ? (
                <>
                  <s-stack gap="small-200">
                    <s-text type="strong">{t("methods.shopperName")}</s-text>
                    <s-text color="subdued">{t("methods.shopperNameHelp")}</s-text>
                    {meta.locales.map((loc) => (
                      <TextField
                        key={loc}
                        label={`${t("methods.nameIn")} ${loc}`}
                        value={m.names[loc] ?? ""}
                        placeholder={t("methods.defaultName")}
                        maxLength={40}
                        onChange={(v) =>
                          update((d) => {
                            if (v) d.methods[id].names[loc] = v;
                            else delete d.methods[id].names[loc];
                          })
                        }
                      />
                    ))}
                  </s-stack>
                  <CountryPicker
                    label={t("methods.whereOffered")}
                    value={m.countries}
                    countries={countries}
                    markets={markets}
                    onChange={(v) => update((d) => (d.methods[id].countries = v))}
                  />
                  <Checkbox
                    label={t("methods.dateRequired")}
                    details={t("methods.dateRequiredHelp")}
                    checked={m.dateRequired}
                    onChange={(v) => update((d) => (d.methods[id].dateRequired = v))}
                  />
                  <Checkbox
                    label={t("methods.slots")}
                    details={slotsAllowed ? t("methods.slotsHelp") : t("common.availableOn", { plan: "Starter" })}
                    checked={m.slotsEnabled}
                    disabled={!slotsAllowed}
                    onChange={(v) => update((d) => (d.methods[id].slotsEnabled = v))}
                  />
                  {id === "shipping" ? (
                    <ChoiceList
                      label={t("methods.dateMeaning")}
                      value={m.dateMeaning}
                      options={[
                        { value: "delivery", label: t("methods.meaningDelivery"), details: t("methods.meaningDeliveryHelp") },
                        { value: "dispatch", label: t("methods.meaningDispatch"), details: t("methods.meaningDispatchHelp") },
                      ]}
                      onChange={(v) => update((d) => (d.methods[id].dateMeaning = v as "delivery" | "dispatch"))}
                    />
                  ) : null}
                  <MoneyField
                    id={fieldId(`methods.${id}.minOrder`)}
                    label={t("methods.minOrder", { currency: meta.currency })}
                    details={t("methods.minOrderHelp", { method: label(id) })}
                    value={m.minOrder}
                    error={form.errorFor(`methods.${id}.minOrder`)}
                    onChange={(v) => update((d) => (d.methods[id].minOrder = v))}
                  />
                </>
              ) : null}
            </s-stack>
          </Section>
        );
      })}

      <Section heading={t("methods.defaultHeading")}>
        <Select
          label={t("methods.defaultMethod")}
          details={t("methods.defaultMethodHelp")}
          value={draft.defaultMethod ?? ""}
          options={[
            { value: "", label: t("methods.noDefault") },
            ...draft.methodOrder.filter((id) => draft.methods[id].enabled).map((id) => ({ value: id, label: label(id) })),
          ]}
          onChange={(v) => update((d) => (d.defaultMethod = (v || null) as MethodId | null))}
        />
      </Section>
    </Page>
  );
}
