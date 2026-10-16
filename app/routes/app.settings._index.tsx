import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { hasFeature } from "../../core/publish";
import { Page } from "../components/polaris";
import { useT } from "../i18n/react";
import { adminContext } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  return { plan: ctx.plan };
};

const CARDS: { key: string; href: string; icon: string; feature?: string; plan?: string }[] = [
  { key: "methods", href: "/app/settings/methods", icon: "delivery" },
  { key: "schedule", href: "/app/settings/schedule", icon: "calendar" },
  { key: "capacity", href: "/app/settings/capacity", icon: "clock", feature: "slots", plan: "Starter" },
  { key: "closures", href: "/app/settings/closures", icon: "calendar-check", feature: "closures", plan: "Starter" },
  { key: "locations", href: "/app/settings/locations", icon: "location" },
  { key: "areas", href: "/app/settings/areas", icon: "map", feature: "areas", plan: "Pro" },
  { key: "products", href: "/app/settings/products", icon: "product", feature: "productRules", plan: "Pro" },
  { key: "checkout", href: "/app/settings/checkout", icon: "cart", feature: "checkoutMatching", plan: "Starter" },
  { key: "surcharges", href: "/app/settings/surcharges", icon: "money", feature: "surcharges", plan: "Pro" },
  { key: "transfer", href: "/app/settings/transfer", icon: "import", feature: "importExport", plan: "Pro" },
];

export default function SettingsHub() {
  const { plan } = useLoaderData<typeof loader>();
  const t = useT();
  return (
    <Page title={t("settings.title")} subtitle={t("settings.subtitle")}>
      <s-grid gridTemplateColumns="repeat(auto-fill, minmax(260px, 1fr))" gap="base">
        {CARDS.map((c) => {
          const locked = c.feature && !hasFeature(plan, c.feature);
          return (
            <s-clickable key={c.key} href={c.href} border="base" borderRadius="base" padding="base" background="base">
              <s-stack gap="small-200">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-icon type={c.icon as any} />
                  <s-heading>{t(`${c.key}.title`)}</s-heading>
                  {locked ? (
                    <s-badge icon="lock" tone="info">
                      {c.plan}
                    </s-badge>
                  ) : null}
                </s-stack>
                <s-text color="subdued">{t(`${c.key}.subtitle`)}</s-text>
              </s-stack>
            </s-clickable>
          );
        })}
      </s-grid>
    </Page>
  );
}
