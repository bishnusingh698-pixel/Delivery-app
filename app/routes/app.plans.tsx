import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import {
  PLANS,
  TRIAL_DAYS,
  billingName,
  formatUsd,
  fromBillingName,
  yearlyPerMonth,
  type BillingIntervalId,
} from "../../core/plans";
import type { PlanId } from "../../core/types";
import { BRAND } from "../config/brand";
import { Button, Page, Section, Stack } from "../components/polaris";
import { useT } from "../i18n/react";
import { logActivity } from "../models/settings.server";
import { applySubscription, billingTest } from "../services/billing.server";
import { releaseAfterUpgrade } from "../services/orders.server";
import { adminContext } from "../services/settings.server";
import { monthlyUsage } from "../services/usage.server";
import { authenticate, BILLING_PLAN_NAMES } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const { billing } = await authenticate.admin(request);
  // Shopify is the source of truth: mirror the active subscription on every visit.
  let plan = ctx.plan;
  let interval: BillingIntervalId | null = null;
  try {
    const check = await billing.check({ plans: BILLING_PLAN_NAMES, isTest: billingTest() });
    const sub = check.appSubscriptions[0] ?? null;
    if (sub) interval = fromBillingName(sub.name).interval;
    const change = await applySubscription(ctx.shop, sub ? { id: sub.id, name: sub.name, status: sub.status } : null);
    if (change) {
      plan = ctx.row.isDevStore ? "pro" : change.to;
      await releaseAfterUpgrade(ctx.shop, ctx.admin, change);
    }
  } catch (e) {
    console.error("[plans] billing check", (e as Error).message);
  }
  const usage = await monthlyUsage(ctx.shop, { ...ctx.row, plan });
  return { plan, interval, devStore: ctx.row.isDevStore, usage, test: billingTest(), supportEmail: BRAND.supportEmail };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await adminContext(request);
  const { billing, redirect } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const isTest = billingTest();
  // Intents: "starter:monthly", "starter:yearly", "pro:monthly", "pro:yearly", "free".
  const [planId, int] = intent.split(":");
  if ((planId === "starter" || planId === "pro") && (int === "monthly" || int === "yearly")) {
    const name = billingName(planId, int);
    const handle = ctx.shop.replace(".myshopify.com", "");
    const returnUrl = `https://admin.shopify.com/store/${handle}/apps/${process.env.SHOPIFY_APP_HANDLE ?? "pickday"}/app/plans`;
    await logActivity(ctx.shop, "plan", `Started ${name} subscription`, ctx.actor);
    // Throws a redirect to Shopify's approval page.
    await billing.request({ plan: name, isTest, returnUrl });
  }
  if (intent === "free") {
    const check = await billing.check({ plans: BILLING_PLAN_NAMES, isTest });
    for (const sub of check.appSubscriptions) {
      await billing.cancel({ subscriptionId: sub.id, isTest, prorate: true });
    }
    await applySubscription(ctx.shop, null);
    await logActivity(ctx.shop, "plan", "Switched to Free", ctx.actor);
    return redirect("/app/plans");
  }
  return null;
};

/** Feature lines per plan (plans.feature.<key>); the lists match the pricing in core/plans.ts. */
const FEATURES: Record<PlanId, string[]> = {
  free: ["oneMethod", "schedule", "closuresFree", "datePicker", "orderData", "checkoutBlock", "orders", "languages", "branding"],
  starter: ["everythingFree", "allMethods", "slots", "capacity", "closures", "checkoutMatching", "ordersCalendar", "production", "productBasics", "importExport", "noBranding"],
  pro: ["everythingStarter", "areas", "productRules", "dateMode", "surcharges", "routeSheet", "calendarFeed", "flow", "digest", "shareCodes", "customCss", "prioritySupport"],
};

export default function PlansPage() {
  const { plan, interval, devStore, usage, test, supportEmail } = useLoaderData<typeof loader>();
  const t = useT();
  const fetcher = useFetcher();
  const [view, setView] = useState<BillingIntervalId>(interval ?? "yearly");
  const busy = fetcher.state !== "idle" ? String(fetcher.formData?.get("intent")) : null;
  const choose = (intent: string) => {
    if (intent === "free" && !window.confirm(t("plans.downgradeConfirm"))) return;
    fetcher.submit({ intent }, { method: "post" });
  };
  const planName = (id: PlanId) => t(`plans.${id}.name`);

  return (
    <Page title={t("plans.title")} subtitle={t("plans.subtitle", { days: TRIAL_DAYS })}>
      {devStore ? <s-banner tone="info">{t("plans.devStore")}</s-banner> : null}
      {test && !devStore ? <s-banner tone="warning">{t("plans.testMode")}</s-banner> : null}
      {usage.limit !== null ? (
        <Section heading={t("plans.usageHeading")}>
          <Stack gap="small-200">
            <s-text>{t("plans.usage", { count: usage.count, limit: usage.limit })}</s-text>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, usage.pct)} aria-label={t("plans.usageHeading")} style={{ height: 8, borderRadius: 4, background: "var(--s-color-bg-fill-secondary, #e3e3e3)", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, usage.pct)}%`, height: "100%", background: usage.over ? "#c70a24" : usage.pct >= 80 ? "#b28400" : "#2c6ecb" }} />
            </div>
            {usage.paused ? (
              <s-banner tone="critical">{t("plans.usagePaused")}</s-banner>
            ) : usage.over ? (
              <s-banner tone="warning">{t("plans.usageGrace", { left: usage.graceLeft })}</s-banner>
            ) : (
              <s-text color="subdued">{t("plans.usageHelp")}</s-text>
            )}
          </Stack>
        </Section>
      ) : null}
      <Stack direction="inline" gap="small-200" alignItems="center">
        <s-button-group>
          <Button variant={view === "monthly" ? "primary" : "secondary"} onClick={() => setView("monthly")}>{t("plans.monthly")}</Button>
          <Button variant={view === "yearly" ? "primary" : "secondary"} onClick={() => setView("yearly")}>{t("plans.yearly")}</Button>
        </s-button-group>
        <s-badge tone="success">{t("plans.yearlySave")}</s-badge>
      </Stack>
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))" gap="base">
        {(["free", "starter", "pro"] as PlanId[]).map((id) => {
          const p = PLANS[id];
          const paid = id !== "free";
          const samePlan = id === plan;
          // A paid plan is "current" only on the interval the merchant pays (unknown interval: either).
          const current = samePlan && (!paid || devStore || interval === null || interval === view);
          const intent = paid ? `${id}:${view}` : "free";
          const yearly = paid && view === "yearly";
          return (
            <s-section key={id} heading={planName(id)}>
              <Stack gap="base">
                <Stack direction="inline" gap="small-200" alignItems="center">
                  {id === "starter" ? <s-badge tone="info">{t("plans.mostPopular")}</s-badge> : null}
                  {current ? <s-badge tone="success">{t("plans.current")}</s-badge> : null}
                  {samePlan && paid && !devStore && interval ? <s-badge>{interval === "yearly" ? t("plans.billedYearlyShort") : t("plans.billedMonthlyShort")}</s-badge> : null}
                </Stack>
                <Stack gap="small-100">
                  <Stack direction="inline" gap="small-200" alignItems="baseline">
                    <s-heading>{formatUsd(yearly ? yearlyPerMonth(id) : p.monthly)}</s-heading>
                    <s-text color="subdued">{t("plans.perMonth")}</s-text>
                  </Stack>
                  {yearly ? <s-text color="subdued">{t("plans.billedYearly", { total: formatUsd(p.yearly) })}</s-text> : null}
                </Stack>
                <s-text>{p.orderLimit === null ? t("plans.pro.orders") : t(`plans.${id}.orders`, { count: p.orderLimit })}</s-text>
                <s-text color="subdued">{p.locationLimit === null ? t("plans.unlimitedLocations") : t("plans.oneLocation")}</s-text>
                <s-unordered-list>
                  {FEATURES[id].map((f) => (
                    <s-list-item key={f}>{t(`plans.feature.${f}`, { count: p.closureLimit ?? 0 })}</s-list-item>
                  ))}
                </s-unordered-list>
                {paid ? <s-text color="subdued">{t("plans.trial", { days: TRIAL_DAYS })}</s-text> : null}
                {devStore ? null : current ? (
                  <Button disabled>{t("plans.current")}</Button>
                ) : (
                  <Button variant={id === "starter" ? "primary" : "secondary"} loading={busy === intent} onClick={() => choose(intent)}>
                    {!paid
                      ? t("plans.downgrade")
                      : samePlan
                        ? view === "yearly"
                          ? t("plans.switchToYearly")
                          : t("plans.switchToMonthly")
                        : rankOf(id) > rankOf(plan)
                          ? t("plans.upgradeTo", { plan: planName(id) })
                          : t("plans.switchTo", { plan: planName(id) })}
                  </Button>
                )}
              </Stack>
            </s-section>
          );
        })}
      </s-grid>
      <Section heading={t("plans.downgradeHeading")}>
        <Stack gap="small-200">
          <s-text>{t("plans.downgradeNote")}</s-text>
          <s-text color="subdued">{t("plans.footer")}</s-text>
          <s-text>
            {t("plans.questions")} <s-link href={`mailto:${supportEmail}`}>{t("plans.talkToUs")}</s-link>
          </s-text>
        </Stack>
      </Section>
    </Page>
  );
}

const rankOf = (p: PlanId) => (p === "pro" ? 2 : p === "starter" ? 1 : 0);

