import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { planCards } from "../../core/plans";
import type { PlanId } from "../../core/types";
import { Button, Page, Section, Stack } from "../components/polaris";
import { useT } from "../i18n/react";
import { logActivity } from "../models/settings.server";
import { applySubscription, billingTest } from "../services/billing.server";
import { planStatus } from "../services/plan-status.server";
import { UsageBar } from "../components/usage";
import { adminContext } from "../services/settings.server";
import { monthlyUsage } from "../services/usage.server";
import { authenticate, PLAN_PRO, PLAN_STARTER } from "../shopify.server";

const NAMES: Record<Exclude<PlanId, "free">, typeof PLAN_STARTER | typeof PLAN_PRO> = { starter: PLAN_STARTER, pro: PLAN_PRO };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  // Shopify is the source of truth: mirror the active subscription on every visit.
  const status = await planStatus(request, ctx);
  const usage = await monthlyUsage(ctx.shop, { ...ctx.row, plan: status.plan });
  return { plan: status.plan, trialEndsOn: status.trialEndsOn, devStore: ctx.row.isDevStore, usage, test: billingTest(ctx.row), cards: planCards() };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await adminContext(request);
  const { billing, redirect } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const isTest = billingTest(ctx.row);
  if (intent === "starter" || intent === "pro") {
    const handle = ctx.shop.replace(".myshopify.com", "");
    const returnUrl = `https://admin.shopify.com/store/${handle}/apps/${process.env.SHOPIFY_APP_HANDLE ?? "pickday"}/app/plans`;
    await logActivity(ctx.shop, "plan", `Started ${NAMES[intent]} subscription`, ctx.actor);
    // Throws a redirect to Shopify's approval page.
    await billing.request({ plan: NAMES[intent], isTest, returnUrl });
  }
  if (intent === "free") {
    const check = await billing.check({ plans: [PLAN_STARTER, PLAN_PRO], isTest });
    for (const sub of check.appSubscriptions) {
      await billing.cancel({ subscriptionId: sub.id, isTest, prorate: true });
    }
    await applySubscription(ctx.shop, null);
    await logActivity(ctx.shop, "plan", "Switched to Free", ctx.actor);
    return redirect("/app/plans");
  }
  return null;
};

export default function PlansPage() {
  const { plan, trialEndsOn, devStore, usage, test, cards } = useLoaderData<typeof loader>();
  const t = useT();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle" ? String(fetcher.formData?.get("intent")) : null;
  const choose = (id: PlanId) => {
    // Going down a plan switches features off at once: say so first (settings are kept).
    if (rankOf(id) < rankOf(plan) && !window.confirm(id === "free" ? t("plans.downgradeConfirm") : t("plans.switchDownConfirm", { plan: t(`plans.${id}.name`) }))) return;
    fetcher.submit({ intent: id }, { method: "post" });
  };

  return (
    <Page title={t("plans.title")} subtitle={t("plans.subtitle")}>
      {devStore ? <s-banner tone="info">{t("plans.devStore")}</s-banner> : null}
      {test && !devStore ? <s-banner tone="warning">{t("plans.testMode")}</s-banner> : null}
      <Section heading={t("plans.usageHeading")}>
        <UsageBar usage={usage} plan={plan} trialEndsOn={trialEndsOn} showPlan />
      </Section>
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="base">
        {cards.map((p) => {
          const current = p.id === plan;
          return (
            <s-section key={p.id} heading={t(`plans.${p.id}.name`)}>
              <Stack gap="base">
                <Stack direction="inline" gap="small-200" alignItems="baseline" wrap>
                  <s-heading>{p.price}</s-heading>
                  <s-text color="subdued">{t("plans.perMonth")}</s-text>
                  {current ? <s-badge tone="success">{t("plans.current")}</s-badge> : null}
                  {p.id === "pro" && !current ? <s-badge tone="info">{t("plans.recommended")}</s-badge> : null}
                </Stack>
                <s-text color="subdued">{t(`plans.${p.id}.for`)}</s-text>
                <s-text type="strong">{p.orders === null ? t("plans.pro.orders") : t(`plans.${p.id}.orders`, { count: p.orders })}</s-text>
                <s-text>{p.locations === null ? t("plans.unlimitedLocations") : t("plans.locations", { count: p.locations })}</s-text>
                <s-unordered-list>
                  {p.includes ? <s-list-item>{t(`plans.feature.${p.includes}`)}</s-list-item> : null}
                  {p.features.map((f) => (
                    <s-list-item key={f}>{t(`plans.feature.${f}`)}</s-list-item>
                  ))}
                </s-unordered-list>
                {p.id !== "free" ? <s-text color="subdued">{t("plans.trial")}</s-text> : null}
                {current ? (
                  <Button disabled>{t("plans.current")}</Button>
                ) : (
                  <Button variant={p.id === "pro" ? "primary" : "secondary"} loading={busy === p.id} onClick={() => choose(p.id)}>
                    {p.id === "free" ? t("plans.downgrade") : rankOf(p.id) > rankOf(plan) ? t("plans.upgradeTo", { plan: t(`plans.${p.id}.name`) }) : t("plans.switchTo", { plan: t(`plans.${p.id}.name`) })}
                  </Button>
                )}
              </Stack>
            </s-section>
          );
        })}
      </s-grid>
      <Section>
        <Stack gap="small-200">
          <s-text color="subdued">{t("plans.keepData")}</s-text>
          <s-text color="subdued">{t("plans.footer")}</s-text>
        </Stack>
      </Section>
    </Page>
  );
}

const rankOf = (p: PlanId) => (p === "pro" ? 2 : p === "starter" ? 1 : 0);
