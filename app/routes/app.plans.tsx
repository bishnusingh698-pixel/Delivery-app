import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { PLAN_LOCATION_LIMIT, PLAN_ORDER_LIMIT } from "../../core/publish";
import type { PlanId } from "../../core/types";
import { Button, Page, Section, Stack } from "../components/polaris";
import { useT } from "../i18n/react";
import { logActivity } from "../models/settings.server";
import { applySubscription, billingTest } from "../services/billing.server";
import { releaseAfterUpgrade } from "../services/orders.server";
import { adminContext } from "../services/settings.server";
import { monthlyUsage } from "../services/usage.server";
import { authenticate, PLAN_PRO, PLAN_STARTER } from "../shopify.server";

const NAMES: Record<Exclude<PlanId, "free">, typeof PLAN_STARTER | typeof PLAN_PRO> = { starter: PLAN_STARTER, pro: PLAN_PRO };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const { billing } = await authenticate.admin(request);
  // Shopify is the source of truth: mirror the active subscription on every visit.
  let plan = ctx.plan;
  try {
    const check = await billing.check({ plans: [PLAN_STARTER, PLAN_PRO], isTest: billingTest() });
    const sub = check.appSubscriptions[0] ?? null;
    const change = await applySubscription(ctx.shop, sub ? { id: sub.id, name: sub.name, status: sub.status } : null);
    if (change) {
      plan = ctx.row.isDevStore ? "pro" : change.to;
      await releaseAfterUpgrade(ctx.shop, ctx.admin, change);
    }
  } catch (e) {
    console.error("[plans] billing check", (e as Error).message);
  }
  const usage = await monthlyUsage(ctx.shop, { ...ctx.row, plan });
  return { plan, devStore: ctx.row.isDevStore, usage, test: billingTest() };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await adminContext(request);
  const { billing, redirect } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const isTest = billingTest();
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

const PLANS: { id: PlanId; price: string; features: string[] }[] = [
  { id: "free", price: "$0", features: ["oneMethod", "datePicker", "languages", "checkoutBlock", "orders", "branding"] },
  { id: "starter", price: "$7.99", features: ["allMethods", "slots", "capacity", "closures", "checkoutMatching", "noBranding"] },
  { id: "pro", price: "$14.99", features: ["everythingStarter", "locations", "areas", "productRules", "surcharges", "production", "routeSheet", "digest", "calendarFeed", "flow", "importExport"] },
];

export default function PlansPage() {
  const { plan, devStore, usage, test } = useLoaderData<typeof loader>();
  const t = useT();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle" ? String(fetcher.formData?.get("intent")) : null;
  const choose = (id: PlanId) => {
    if (id === "free" && !window.confirm(t("plans.downgradeConfirm"))) return;
    fetcher.submit({ intent: id }, { method: "post" });
  };

  return (
    <Page title={t("plans.title")} subtitle={t("plans.subtitle")}>
      {devStore ? <s-banner tone="info">{t("plans.devStore")}</s-banner> : null}
      {test && !devStore ? <s-banner tone="warning">{t("plans.testMode")}</s-banner> : null}
      {usage.limit !== null ? (
        <Section heading={t("plans.usageHeading")}>
          <Stack gap="small-200">
            <s-text>{t("plans.usage", { count: usage.count, limit: usage.limit })}</s-text>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, usage.pct)} aria-label={t("plans.usageHeading")} style={{ height: 8, borderRadius: 4, background: "var(--s-color-bg-fill-secondary, #e3e3e3)", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, usage.pct)}%`, height: "100%", background: usage.pct >= 100 ? "#c70a24" : usage.pct >= 80 ? "#b28400" : "#2c6ecb" }} />
            </div>
            <s-text color="subdued">{usage.over ? t("plans.overLimit") : t("plans.usageHelp")}</s-text>
          </Stack>
        </Section>
      ) : null}
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="base">
        {PLANS.map((p) => {
          const current = p.id === plan;
          return (
            <s-section key={p.id} heading={t(`plans.${p.id}.name`)}>
              <Stack gap="base">
                <Stack direction="inline" gap="small-200" alignItems="baseline">
                  <s-heading>{p.price}</s-heading>
                  <s-text color="subdued">{t("plans.perMonth")}</s-text>
                  {current ? <s-badge tone="success">{t("plans.current")}</s-badge> : null}
                </Stack>
                <s-text>{t(`plans.${p.id}.orders`, { count: PLAN_ORDER_LIMIT[p.id] ?? 0 })}</s-text>
                <s-text color="subdued">
                  {PLAN_LOCATION_LIMIT[p.id] === null ? t("plans.unlimitedLocations") : t("plans.oneLocation")}
                </s-text>
                <s-unordered-list>
                  {p.features.map((f) => (
                    <s-list-item key={f}>{t(`plans.feature.${f}`)}</s-list-item>
                  ))}
                </s-unordered-list>
                {p.id !== "free" ? <s-text color="subdued">{t("plans.trial")}</s-text> : null}
                {devStore ? null : current ? (
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
        <s-text color="subdued">{t("plans.footer")}</s-text>
      </Section>
    </Page>
  );
}

const rankOf = (p: PlanId) => (p === "pro" ? 2 : p === "starter" ? 1 : 0);
