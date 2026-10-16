import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { hasFeature } from "../../core/publish";
import type { MethodId, Settings } from "../../core/types";
import { ScheduleEditor } from "../components/editors";
import { ChoiceList, Page, Section } from "../components/polaris";
import { SchedulePreview } from "../components/preview";
import { SettingsChrome, useSettingsForm } from "../components/settings-form";
import { useMethodLabel } from "../components/shared";
import { useT } from "../i18n/react";
import { adminContext, patchSettingsAction, shopMeta } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  return {
    meta: shopMeta(ctx),
    full: ctx.settings,
    initial: { methods: ctx.settings.methods, dateMode: ctx.settings.dateMode } as Pick<Settings, "methods" | "dateMode">,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => patchSettingsAction(request);

export default function SchedulePage() {
  const { meta, full, initial } = useLoaderData<typeof loader>();
  const t = useT();
  const label = useMethodLabel();
  const form = useSettingsForm(initial);
  const { draft, update } = form;
  const enabled = full.methodOrder.filter((id) => draft.methods[id].enabled);
  const [tab, setTab] = useState<MethodId>(enabled[0] ?? "shipping");
  const current = draft.methods[tab];
  const dateModeAllowed = hasFeature(meta.plan, "dateMode");

  return (
    <Page title={t("schedule.title")} subtitle={t("schedule.subtitle")} backTo={{ href: "/app/settings", label: t("nav.settings") }}>
      <SettingsChrome form={form} fieldLabels={{ "methods.delivery": label("delivery"), "methods.pickup": label("pickup"), "methods.shipping": label("shipping") }} />

      <Section heading={t("schedule.dateMode")}>
        <ChoiceList
          label={t("schedule.dateMode")}
          labelAccessibilityVisibility="exclusive"
          value={draft.dateMode}
          options={[
            { value: "order", label: t("schedule.modeOrder"), details: t("schedule.modeOrderHelp") },
            {
              value: "item",
              label: t("schedule.modeItem"),
              details: dateModeAllowed ? t("schedule.modeItemHelp") : `${t("schedule.modeItemHelp")} ${t("common.availableOn", { plan: "Pro" })}`,
              disabled: !dateModeAllowed,
            },
          ]}
          onChange={(v) => update((d) => (d.dateMode = v as "order" | "item"))}
        />
      </Section>

      {enabled.length > 1 ? (
        <s-section>
          <s-button-group>
            {enabled.map((id) => (
              <s-button key={id} slot="secondary-actions" variant={id === tab ? "primary" : "secondary"} onClick={() => setTab(id)}>
                {label(id)}
              </s-button>
            ))}
          </s-button-group>
        </s-section>
      ) : null}

      {enabled.length === 0 ? (
        <s-banner tone="warning">
          {t("schedule.noMethods")} <s-link href="/app/settings/methods">{t("methods.title")}</s-link>
        </s-banner>
      ) : (
        <>
          <Section heading={t("schedule.forMethod", { method: label(tab) })}>
            {tab === "pickup" ? (
              <s-box paddingBlockEnd="base">
                <s-text color="subdued">
                  {t("schedule.pickupOverride")} <s-link href="/app/settings/locations">{t("locations.title")}</s-link>
                </s-text>
              </s-box>
            ) : null}
            <ScheduleEditor
              path={`methods.${tab}.schedule`}
              value={current.schedule}
              errorFor={form.errorFor}
              onChange={(s) => update((d) => (d.methods[tab].schedule = s))}
            />
          </Section>
          <Section heading={t("preview.heading")}>
            <SchedulePreview settings={{ ...full, ...draft }} plan={meta.plan} timeZone={meta.timeZone} method={tab} />
            <s-box paddingBlockStart="base">
              <s-link href={`/app/widget?method=${tab}`}>{t("preview.openFull")}</s-link>
            </s-box>
          </Section>
        </>
      )}
    </Page>
  );
}
