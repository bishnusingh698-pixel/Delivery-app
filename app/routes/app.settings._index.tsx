import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { settingsStatus, type CardStatus, type SettingsCardKey } from "../../core/home";
import { hasFeature, minPlanFor } from "../../core/plans";
import { Page, Section } from "../components/polaris";
import { useT } from "../i18n/react";
import { flagsOf } from "../models/shop.server";
import { adminContext } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  return { plan: ctx.plan, status: settingsStatus(ctx.settings, flagsOf(ctx.row)) };
};

type Card = { key: SettingsCardKey; href: string; icon: string; feature?: string };

/**
 * Cards grouped by what the merchant is trying to do. `feature`: the card shows a lock with the
 * plan that unlocks the page (pages partly usable on a plan show none). Locked cards are never hidden.
 */
const GROUPS: { id: string; cards: Card[] }[] = [
  {
    id: "basics",
    cards: [
      { key: "methods", href: "/app/settings/methods", icon: "delivery" },
      { key: "schedule", href: "/app/settings/schedule", icon: "calendar" },
      { key: "closures", href: "/app/settings/closures", icon: "calendar-check" },
      { key: "locations", href: "/app/settings/locations", icon: "location" },
    ],
  },
  {
    id: "limits",
    cards: [
      { key: "capacity", href: "/app/settings/capacity", icon: "clock", feature: "slots" },
      { key: "areas", href: "/app/settings/areas", icon: "map", feature: "areas" },
      { key: "products", href: "/app/settings/products", icon: "product", feature: "productBasics" },
    ],
  },
  {
    id: "checkout",
    cards: [
      { key: "checkout", href: "/app/settings/checkout", icon: "cart", feature: "checkoutMatching" },
      { key: "surcharges", href: "/app/settings/surcharges", icon: "money", feature: "surcharges" },
    ],
  },
  {
    id: "tools",
    cards: [
      { key: "notifications", href: "/app/notifications", icon: "email" },
      { key: "transfer", href: "/app/settings/transfer", icon: "import", feature: "importExport" },
    ],
  },
];

const TONE: Record<Exclude<CardStatus, null>, "success" | "neutral" | "warning"> = { on: "success", off: "neutral", todo: "warning" };

export default function SettingsHub() {
  const { plan, status } = useLoaderData<typeof loader>();
  const t = useT();
  return (
    <Page title={t("settings.title")} subtitle={t("settings.subtitle")}>
      {GROUPS.map((g) => (
        <Section key={g.id} heading={t(`settings.group.${g.id}`)}>
          <s-stack gap="base">
            <s-text color="subdued">{t(`settings.group.${g.id}Help`)}</s-text>
            <s-grid gridTemplateColumns="repeat(auto-fill, minmax(260px, 1fr))" gap="base">
              {g.cards.map((c) => {
                const locked = !!c.feature && !hasFeature(plan, c.feature);
                const st = status[c.key];
                return (
                  <s-clickable key={c.key} href={c.href} border="base" borderRadius="base" padding="base" background="base">
                    <s-stack gap="small-200">
                      <s-stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
                        <s-stack direction="inline" gap="small-200" alignItems="center">
                          <s-icon type={c.icon as any} />
                          <s-heading>{t(`${c.key}.title`)}</s-heading>
                        </s-stack>
                        {locked ? (
                          <s-badge icon="lock" tone="info">
                            {t("common.availableOn", { plan: minPlanFor(c.feature!) })}
                          </s-badge>
                        ) : st ? (
                          <s-badge tone={TONE[st]}>{t(`settings.status.${st}`)}</s-badge>
                        ) : null}
                      </s-stack>
                      <s-text color="subdued">{t(`${c.key}.subtitle`)}</s-text>
                    </s-stack>
                  </s-clickable>
                );
              })}
            </s-grid>
          </s-stack>
        </Section>
      ))}
    </Page>
  );
}
