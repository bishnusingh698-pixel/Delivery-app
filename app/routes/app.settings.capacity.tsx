import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { hasFeature } from "../../core/publish";
import type { MethodId, Settings } from "../../core/types";
import { CapacityEditor } from "../components/editors";
import { Page, Section } from "../components/polaris";
import { SchedulePreview } from "../components/preview";
import { SettingsChrome, useSettingsForm } from "../components/settings-form";
import { useMethodLabel } from "../components/shared";
import { useT } from "../i18n/react";
import { adminContext, patchSettingsAction, shopMeta } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  return { meta: shopMeta(ctx), full: ctx.settings, initial: { methods: ctx.settings.methods } as Pick<Settings, "methods"> };
};

export const action = async ({ request }: ActionFunctionArgs) => patchSettingsAction(request);

export default function CapacityPage() {
  const { meta, full, initial } = useLoaderData<typeof loader>();
  const t = useT();
  const label = useMethodLabel();
  const form = useSettingsForm(initial);
  const { draft, update } = form;
  const enabled = full.methodOrder.filter((id) => draft.methods[id].enabled);
  const [tab, setTab] = useState<MethodId>(enabled[0] ?? "shipping");
  const m = draft.methods[tab];

  return (
    <Page title={t("capacity.title")} subtitle={t("capacity.subtitle")} backTo={{ href: "/app/settings", label: t("nav.settings") }}>
      <SettingsChrome form={form} />
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
      {tab === "pickup" ? (
        <s-banner tone="info">
          {t("capacity.pickupPerLocation")} <s-link href="/app/settings/locations">{t("locations.title")}</s-link>
        </s-banner>
      ) : null}
      {!m.slotsEnabled ? (
        <s-banner tone="info">
          {t("capacity.turnOnSlots", { method: label(tab) })} <s-link href="/app/settings/methods">{t("methods.title")}</s-link>
        </s-banner>
      ) : null}
      <Section heading={t("capacity.forMethod", { method: label(tab) })}>
        <CapacityEditor
          key={tab}
          modalPrefix={`cap-${tab}`}
          path={`methods.${tab}.capacity`}
          value={m.capacity}
          errorFor={form.errorFor}
          slotsEnabled={m.slotsEnabled}
          capacityAllowed={hasFeature(meta.plan, "capacity")}
          onChange={(c) => update((d) => (d.methods[tab].capacity = c))}
        />
      </Section>
      <Section heading={t("preview.heading")}>
        <SchedulePreview settings={{ ...full, ...draft }} plan={meta.plan} timeZone={meta.timeZone} method={tab} />
      </Section>
    </Page>
  );
}
