import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Button, Page, Section, Stack, TextField } from "../components/polaris";
import { BRAND } from "../config/brand";
import { useT } from "../i18n/react";
import prisma from "../db.server";
import { logActivity } from "../models/settings.server";
import { flagsOf, warningsOf } from "../models/shop.server";
import { checkEmbed, themeEditorLink } from "../services/embed.server";
import { publishShop } from "../services/publish.server";
import { adminContext } from "../services/settings.server";

export const FAQ_IDS = [
  "notShowing", "drawer", "checkoutBlocked", "expressButtons", "wrongDates", "timeZone", "fullDays", "changeDate",
  "emails", "language", "pickupMatch", "fees", "productRules", "serverAsleep", "privacy", "uninstall", "plans",
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const r = ctx.row;
  const lastOrder = await prisma.scheduledOrder.findFirst({ where: { shop: ctx.shop }, orderBy: { createdAt: "desc" }, select: { createdAt: true, orderName: true } });
  return {
    support: BRAND.supportEmail,
    themeLink: themeEditorLink(ctx.shop),
    diag: {
      shop: ctx.shop,
      plan: ctx.plan,
      timeZone: r.timeZone,
      locale: r.primaryLocale,
      settingsVersion: ctx.version,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      publishedFor: r.publishedFor,
      today: ctx.today,
      embed: flagsOf(r).embedDetected ?? null,
      validation: !!r.validationId,
      delivery: !!r.deliveryCustomizationId,
      lastOrder: lastOrder ? `${lastOrder.orderName} (${lastOrder.createdAt.toISOString()})` : null,
      warnings: warningsOf(r).map((w) => w.code),
      debugUntil: r.debugUntil && r.debugUntil > new Date() ? r.debugUntil.toISOString() : null,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await adminContext(request);
  const intent = String((await request.formData()).get("intent"));
  if (intent === "republish") {
    try {
      await publishShop(ctx.shop, ctx.admin, { functions: true });
      await checkEmbed(ctx.shop, ctx.admin);
      return { ok: true, intent };
    } catch (e) {
      return { ok: false, intent, error: (e as Error).message.slice(0, 300) };
    }
  }
  if (intent === "debugOn" || intent === "debugOff") {
    await prisma.shop.update({ where: { shop: ctx.shop }, data: { debugUntil: intent === "debugOn" ? new Date(Date.now() + 24 * 3600_000) : null } });
    await logActivity(ctx.shop, "settings", intent === "debugOn" ? "Debug mode on for 24 hours" : "Debug mode off", ctx.actor);
    await publishShop(ctx.shop, ctx.admin, { functions: false }).catch(() => {});
    return { ok: true, intent };
  }
  return { ok: false, intent };
};

export default function HelpPage() {
  const { support, themeLink, diag } = useLoaderData<typeof loader>();
  const t = useT();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const faqs = FAQ_IDS.filter((id) => !needle || `${t(`help.faq.${id}.q`)} ${t(`help.faq.${id}.a`)}`.toLowerCase().includes(needle));
  const busy = fetcher.state !== "idle" ? String(fetcher.formData?.get("intent")) : null;
  const post = (intent: string) => fetcher.submit({ intent }, { method: "post" });
  const diagText = Object.entries(diag).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") || "-" : v ?? "-"}`).join("\n");
  const yes = (v: boolean | null) => (v === null ? t("help.unknown") : v ? t("help.yes") : t("help.no"));

  return (
    <Page title={t("help.title")} subtitle={t("help.subtitle")}>
      <Section heading={t("help.guides")}>
        <s-ordered-list>
          <s-list-item>{t("help.guide1")} <s-link href={themeLink} target="_top">{t("help.openThemeEditor")}</s-link></s-list-item>
          <s-list-item>{t("help.guide2")} <s-link href="/app/settings/methods">{t("methods.title")}</s-link></s-list-item>
          <s-list-item>{t("help.guide3")} <s-link href="/app/settings/schedule">{t("schedule.title")}</s-link></s-list-item>
          <s-list-item>{t("help.guide4")} <s-link href="/app/settings/checkout">{t("checkout.title")}</s-link></s-list-item>
          <s-list-item>{t("help.guide5")} <s-link href="/app/notifications">{t("notifications.title")}</s-link></s-list-item>
        </s-ordered-list>
      </Section>

      <Section heading={t("help.faqHeading")}>
        <Stack gap="base">
          <TextField label={t("help.search")} type="search" value={q} onChange={setQ} />
          {faqs.length ? (
            faqs.map((id) => (
              <s-box key={id} border="base" borderRadius="base" padding="small-200">
                <Stack gap="small-200">
                  <s-clickable onClick={() => setOpen(open === id ? null : id)} accessibilityLabel={t(`help.faq.${id}.q`)}>
                    <Stack direction="inline" justifyContent="space-between" alignItems="center">
                      <s-text type="strong">{t(`help.faq.${id}.q`)}</s-text>
                      <s-icon type={open === id ? "chevron-up" : "chevron-down"} />
                    </Stack>
                  </s-clickable>
                  {open === id || needle ? <s-paragraph>{t(`help.faq.${id}.a`)}</s-paragraph> : null}
                </Stack>
              </s-box>
            ))
          ) : (
            <s-text color="subdued">{t("help.noResults")}</s-text>
          )}
        </Stack>
      </Section>

      <Section heading={t("help.diagHeading")}>
        <Stack gap="base">
          <s-text color="subdued">{t("help.diagHelp")}</s-text>
          <s-table>
            <s-table-body>
              <s-table-row><s-table-cell>{t("help.diag.embed")}</s-table-cell><s-table-cell>{yes(diag.embed)}</s-table-cell></s-table-row>
              <s-table-row><s-table-cell>{t("help.diag.validation")}</s-table-cell><s-table-cell>{yes(diag.validation)}</s-table-cell></s-table-row>
              <s-table-row><s-table-cell>{t("help.diag.delivery")}</s-table-cell><s-table-cell>{yes(diag.delivery)}</s-table-cell></s-table-row>
              <s-table-row><s-table-cell>{t("help.diag.published")}</s-table-cell><s-table-cell>{diag.publishedAt ? new Date(diag.publishedAt).toLocaleString() : t("help.never")}</s-table-cell></s-table-row>
              <s-table-row><s-table-cell>{t("help.diag.lastOrder")}</s-table-cell><s-table-cell>{diag.lastOrder ?? t("help.never")}</s-table-cell></s-table-row>
              <s-table-row><s-table-cell>{t("help.diag.timeZone")}</s-table-cell><s-table-cell>{diag.timeZone}</s-table-cell></s-table-row>
            </s-table-body>
          </s-table>
          {fetcher.data?.intent === "republish" ? (
            <s-banner tone={fetcher.data.ok ? "success" : "critical"}>{fetcher.data.ok ? t("help.republished") : `${t("help.republishFailed")} ${"error" in fetcher.data ? fetcher.data.error : ""}`}</s-banner>
          ) : null}
          <Stack direction="inline" gap="small-200" wrap>
            <Button loading={busy === "republish"} onClick={() => post("republish")}>{t("help.republish")}</Button>
            <Button
              icon="clipboard"
              onClick={() =>
                navigator.clipboard.writeText(diagText).then(
                  () => shopify.toast.show(t("notifications.copied")),
                  () => shopify.toast.show(t("notifications.copyFailed"), { isError: true }),
                )
              }
            >
              {t("help.copyDiag")}
            </Button>
          </Stack>
        </Stack>
      </Section>

      <Section heading={t("help.debugHeading")}>
        <Stack gap="small-200">
          <s-text color="subdued">{t("help.debugHelp")}</s-text>
          {diag.debugUntil ? (
            <>
              <s-text>{t("help.debugOnUntil", { time: new Date(diag.debugUntil).toLocaleString() })}</s-text>
              <Button loading={busy === "debugOff"} onClick={() => post("debugOff")}>{t("help.debugOff")}</Button>
            </>
          ) : (
            <Button loading={busy === "debugOn"} onClick={() => post("debugOn")}>{t("help.debugOn")}</Button>
          )}
        </Stack>
      </Section>

      <Section heading={t("help.contactHeading")}>
        <Stack gap="small-200">
          <s-text>{t("help.contactText")}</s-text>
          <Button href={`mailto:${support}?subject=${encodeURIComponent("Pickday help: " + diag.shop)}&body=${encodeURIComponent("\n\n---\n" + diagText)}`} target="_blank">
            {t("help.email", { email: support })}
          </Button>
        </Stack>
      </Section>
    </Page>
  );
}
