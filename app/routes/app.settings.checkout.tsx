import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { hasFeature } from "../../core/publish";
import type { CheckoutMatching, Settings } from "../../core/types";
import { Button, Locked, Page, Section, Select, Switch, TextField } from "../components/polaris";
import { SettingsChrome, fieldId, useSettingsForm, type Issue } from "../components/settings-form";
import { useMethodLabel } from "../components/shared";
import { useT } from "../i18n/react";
import { clearWarning, warningsOf } from "../models/shop.server";
import { adminContext, patchSettingsAction, shopMeta } from "../services/settings.server";

/** Same limits as the settings schema. */
const MAX_ROWS = 100;
const MAX_TITLE = 255;

type RateMethod = CheckoutMatching["rateMap"][number]["method"];
const RATE_METHODS: RateMethod[] = ["delivery", "pickup", "shipping", "ignore"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const mismatch = warningsOf(ctx.row).find((w) => w.code === "checkoutMismatch");
  return {
    meta: shopMeta(ctx),
    mismatch: mismatch ? { order: mismatch.detail ?? "" } : null,
    initial: { checkoutMatching: ctx.settings.checkoutMatching } as Pick<Settings, "checkoutMatching">,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = (await request.clone().json()) as { intent?: string };
  if (body.intent === "dismissMismatch") {
    const ctx = await adminContext(request);
    await clearWarning(ctx.shop, "checkoutMismatch");
    return { dismissed: true as const };
  }
  return patchSettingsAction(request);
};

export default function CheckoutPage() {
  const { meta, mismatch, initial } = useLoaderData<typeof loader>();
  const t = useT();
  const label = useMethodLabel();
  const allowed = hasFeature(meta.plan, "checkoutMatching");
  const dismiss = useFetcher();

  const form = useSettingsForm(initial, {
    validate: (d) => {
      const issues: Issue[] = [];
      const seen = new Set<string>();
      d.checkoutMatching.rateMap.forEach((r, i) => {
        const key = r.title.trim().toLowerCase();
        const path = `checkoutMatching.rateMap.${i}.title`;
        if (!key) issues.push({ path, message: t("checkout.rateErrEmpty") });
        else if (seen.has(key)) issues.push({ path, message: t("checkout.rateErrDuplicate", { name: r.title.trim() }) });
        seen.add(key);
      });
      return issues;
    },
  });
  const { draft, update } = form;
  const cm = draft.checkoutMatching;
  const rateLabel = (m: RateMethod) => (m === "ignore" ? t("checkout.rateIgnore") : label(m));

  return (
    <Page title={t("checkout.title")} subtitle={t("checkout.subtitle")} backTo={{ href: "/app/settings", label: t("nav.settings") }}>
      <SettingsChrome form={form} fieldLabels={{ checkoutMatching: t("checkout.title"), "checkoutMatching.rateMap": t("checkout.rateMapHeading") }} />
      {!allowed ? <Locked plan="Starter" label={t("checkout.locked")} upgradeLabel={t("common.upgrade")} /> : null}

      {mismatch ? (
        <s-banner tone="warning" heading={t("checkout.mismatchHeading")}>
          <s-stack gap="small-200">
            <s-text>{t("checkout.mismatchText", { order: mismatch.order })}</s-text>
            <s-text>{cm.enabled ? t("checkout.mismatchWhenOn") : t("checkout.mismatchWhenOff")}</s-text>
            <s-stack direction="inline" gap="small-200">
              <Button
                variant="secondary"
                loading={dismiss.state !== "idle"}
                onClick={() => dismiss.submit(JSON.stringify({ intent: "dismissMismatch" }), { method: "post", encType: "application/json" })}
              >
                {t("checkout.mismatchDismiss")}
              </Button>
            </s-stack>
          </s-stack>
        </s-banner>
      ) : null}

      <Section heading={t("checkout.matchHeading")}>
        <s-stack gap="base">
          <Switch
            id={fieldId("checkoutMatching.enabled")}
            label={t("checkout.enabled")}
            details={t("checkout.enabledHelp")}
            checked={cm.enabled}
            disabled={!allowed}
            onChange={(v) => update((d) => (d.checkoutMatching.enabled = v))}
          />
          <s-text color="subdued">{t("checkout.shopifyDecides")}</s-text>
          <s-text color="subdued">{t("checkout.noMatchFallback")}</s-text>
        </s-stack>
      </Section>

      <Section heading={t("checkout.renameHeading")}>
        <s-stack gap="base">
          <Switch
            id={fieldId("checkoutMatching.renameWithDate")}
            label={t("checkout.renameWithDate")}
            details={t("checkout.renameWithDateHelp", { example: t("checkout.renameExample") })}
            checked={cm.renameWithDate}
            disabled={!allowed}
            onChange={(v) => update((d) => (d.checkoutMatching.renameWithDate = v))}
          />
          <Switch
            id={fieldId("checkoutMatching.renameShipping")}
            label={t("checkout.renameShipping")}
            details={cm.renameWithDate ? t("checkout.renameShippingHelp") : t("checkout.renameShippingNeedsDate")}
            checked={cm.renameShipping}
            disabled={!allowed || !cm.renameWithDate}
            onChange={(v) => update((d) => (d.checkoutMatching.renameShipping = v))}
          />
          <s-banner tone="warning">{t("checkout.renameShippingWarning")}</s-banner>
        </s-stack>
      </Section>

      <Section heading={t("checkout.rateMapHeading")} id={fieldId("checkoutMatching.rateMap")}>
        <s-stack gap="base">
          <s-stack gap="small-200">
            <s-text>{t("checkout.autoIntro")}</s-text>
            <s-unordered-list>
              <s-list-item>{t("checkout.autoDelivery")}</s-list-item>
              <s-list-item>{t("checkout.autoPickup")}</s-list-item>
              <s-list-item>{t("checkout.autoShipping")}</s-list-item>
              <s-list-item>{t("checkout.autoLocation")}</s-list-item>
            </s-unordered-list>
            <s-text color="subdued">{t("checkout.rateMapHelp")}</s-text>
          </s-stack>

          {cm.rateMap.length ? (
            <s-table>
              <s-table-header-row>
                <s-table-header>{t("checkout.rateName")}</s-table-header>
                <s-table-header>{t("checkout.rateMethod")}</s-table-header>
                <s-table-header>{t("common.actions")}</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {cm.rateMap.map((r, i) => (
                  <s-table-row key={i}>
                    <s-table-cell>
                      <div data-path={`checkoutMatching.rateMap.${i}`}>
                        <TextField
                          id={fieldId(`checkoutMatching.rateMap.${i}.title`)}
                          label={t("checkout.rateName")}
                          labelAccessibilityVisibility="exclusive"
                          placeholder={t("checkout.rateNameExample")}
                          maxLength={MAX_TITLE}
                          value={r.title}
                          disabled={!allowed}
                          error={form.errorFor(`checkoutMatching.rateMap.${i}`)}
                          onChange={(v) => update((d) => (d.checkoutMatching.rateMap[i].title = v))}
                        />
                      </div>
                    </s-table-cell>
                    <s-table-cell>
                      <Select
                        label={t("checkout.rateMethod")}
                        labelAccessibilityVisibility="exclusive"
                        value={r.method}
                        disabled={!allowed}
                        options={RATE_METHODS.map((m) => ({ value: m, label: rateLabel(m) }))}
                        onChange={(v) => update((d) => (d.checkoutMatching.rateMap[i].method = v as RateMethod))}
                      />
                    </s-table-cell>
                    <s-table-cell>
                      <Button
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        disabled={!allowed}
                        accessibilityLabel={t("checkout.rateRemove", { name: r.title.trim() || String(i + 1) })}
                        onClick={() => update((d) => d.checkoutMatching.rateMap.splice(i, 1))}
                      >
                        {""}
                      </Button>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          ) : (
            <s-text color="subdued">{t("checkout.rateNone")}</s-text>
          )}

          <s-stack direction="inline" gap="small-200" alignItems="center">
            <Button
              icon="plus"
              disabled={!allowed || cm.rateMap.length >= MAX_ROWS}
              onClick={() => update((d) => d.checkoutMatching.rateMap.push({ title: "", method: "delivery" }))}
            >
              {t("checkout.rateAdd")}
            </Button>
            {cm.rateMap.length >= MAX_ROWS ? <s-text color="subdued">{t("checkout.rateMax", { max: String(MAX_ROWS) })}</s-text> : null}
          </s-stack>
        </s-stack>
      </Section>
    </Page>
  );
}
