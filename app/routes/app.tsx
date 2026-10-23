import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { loadMessages, resolveAdminLang } from "../i18n";
import { I18nProvider } from "../i18n/react";
import { requireShop } from "../models/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopRow = await requireShop(session.shop);
  // Shopify adds ?locale= on the embedded app's first load; remember it.
  let lang = resolveAdminLang(url.searchParams.get("locale") ?? shopRow.adminLocale);
  if (url.searchParams.get("locale") && lang !== shopRow.adminLocale) {
    await prisma.shop.update({ where: { shop: session.shop }, data: { adminLocale: lang } });
  }
  if (!url.searchParams.get("locale")) lang = resolveAdminLang(shopRow.adminLocale);
  const messages = await loadMessages(lang);
  return { apiKey: process.env.SHOPIFY_API_KEY || "", lang, messages };
};

export default function App() {
  const { apiKey, lang, messages } = useLoaderData<typeof loader>();
  const t = (k: string) => messages[k] ?? k;
  return (
    <AppProvider apiKey={apiKey}>
      <I18nProvider messages={messages} lang={lang}>
        <s-app-nav>
          <s-link href="/app" {...({ rel: "home" } as object)}>
            {t("nav.home")}
          </s-link>
          <s-link href="/app/orders">{t("nav.orders")}</s-link>
          <s-link href="/app/delivery">{t("nav.delivery")}</s-link>
          <s-link href="/app/pickup">{t("nav.pickup")}</s-link>
          <s-link href="/app/days-off">{t("nav.daysOff")}</s-link>
          <s-link href="/app/appearance">{t("nav.appearance")}</s-link>
          <s-link href="/app/settings">{t("nav.settings")}</s-link>
          <s-link href="/app/help">{t("nav.help")}</s-link>
        </s-app-nav>
        <Outlet />
      </I18nProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
