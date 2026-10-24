import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { hasFeature } from "../../core/publish";
import { SNIPPET_IDS, snippetFor, type SnippetId } from "../../core/snippets";
import type { Settings } from "../../core/types";
import { Button, Checkbox, ChoiceList, Locked, Page, Section, Select, Stack, Switch, TextField } from "../components/polaris";
import { SettingsChrome, useSettingsForm } from "../components/settings-form";
import { useI18n, useT } from "../i18n/react";
import { regenerateFeedToken } from "../services/feed.server";
import { adminContext, patchSettingsAction, saveSettings, shopMeta } from "../services/settings.server";

const appUrl = () => (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  return {
    meta: shopMeta(ctx),
    initial: { notifications: ctx.settings.notifications } as Pick<Settings, "notifications">,
    feedUrl: ctx.row.feedToken ? `${appUrl()}/feeds/${ctx.row.feedToken}.ics` : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = (await request.clone().json()) as { intent?: string };
  if (body.intent === "regenerateFeed") {
    const ctx = await adminContext(request);
    if (!hasFeature(ctx.plan, "calendarFeed")) return { ok: false as const, intent: "regenerateFeed" };
    const token = await regenerateFeedToken(ctx.shop);
    return { ok: true as const, intent: "regenerateFeed", feedUrl: `${appUrl()}/feeds/${token}.ics` };
  }
  if (body.intent === "confirmSnippet") {
    const ctx = await adminContext(request);
    const next = { ...ctx.settings, notifications: { ...ctx.settings.notifications, emailSnippetConfirmed: true } };
    const r = await saveSettings(ctx, next, "Order email snippet added");
    return { ok: r.ok, intent: "confirmSnippet" };
  }
  return patchSettingsAction(request);
};

export default function NotificationsPage() {
  const { meta, initial, feedUrl } = useLoaderData<typeof loader>();
  const t = useT();
  const { locale } = useI18n();
  const shopify = useAppBridge();
  const form = useSettingsForm(initial);
  const { draft, update } = form;
  const n = draft.notifications;
  const feedAllowed = hasFeature(meta.plan, "calendarFeed");
  const flowAllowed = hasFeature(meta.plan, "flow");
  const feed = useFetcher<typeof action>();
  const confirm = useFetcher<typeof action>();
  const [url, setUrl] = useState(feedUrl);
  const [confirmed, setConfirmed] = useState(initial.notifications.emailSnippetConfirmed);

  useEffect(() => {
    const d = feed.data as { intent?: string; feedUrl?: string } | undefined;
    if (d?.intent === "regenerateFeed" && d.feedUrl) {
      setUrl(d.feedUrl);
      shopify.toast.show(t("notifications.feedCreated"));
    }
  }, [feed.data]);
  useEffect(() => {
    if ((confirm.data as { ok?: boolean } | undefined)?.ok) setConfirmed(true);
  }, [confirm.data]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      shopify.toast.show(t("notifications.copied"));
    } catch {
      shopify.toast.show(t("notifications.copyFailed"), { isError: true });
    }
  };
  const labels = {
    heading: t("snippet.heading"),
    method: t("snippet.method"),
    date: t("snippet.date"),
    slot: t("snippet.slot"),
    location: t("snippet.location"),
  };

  return (
    <Page title={t("notifications.title")} subtitle={t("notifications.subtitle")}>
      <SettingsChrome form={form} />

      <DailySummarySection
        value={n.dailySummary}
        timeZone={meta.timeZone}
        locale={locale}
        onCopy={copy}
        onChange={(fn) => update((d) => fn(d.notifications.dailySummary))}
      />

      <Section heading={t("notifications.snippetsHeading")}>
        <Stack gap="base">
          <s-text color="subdued">{t("notifications.snippetsHelp")}</s-text>
          {confirmed ? (
            <s-banner tone="success">{t("notifications.snippetConfirmed")}</s-banner>
          ) : null}
          {SNIPPET_IDS.map((id) => (
            <SnippetCard key={id} id={id} code={snippetFor(id, labels)} onCopy={copy} />
          ))}
          {!confirmed ? (
            <Button onClick={() => confirm.submit({ intent: "confirmSnippet" }, { method: "post", encType: "application/json" })} loading={confirm.state !== "idle"}>
              {t("notifications.snippetDone")}
            </Button>
          ) : null}
        </Stack>
      </Section>

      <Section heading={t("notifications.feedHeading")}>
        {!feedAllowed ? <Locked plan="Pro" label={t("notifications.feedLocked")} upgradeLabel={t("common.upgrade")} /> : null}
        <Stack gap="base">
          <s-text color="subdued">{t("notifications.feedHelp")}</s-text>
          {url ? (
            <TextField label={t("notifications.feedUrl")} value={url} readOnly details={t("notifications.feedSecret")} onChange={() => {}} />
          ) : null}
          <Stack direction="inline" gap="small-200" wrap>
            {url ? <Button icon="clipboard" disabled={!feedAllowed} onClick={() => copy(url)}>{t("notifications.copy")}</Button> : null}
            <Button
              disabled={!feedAllowed}
              loading={feed.state !== "idle"}
              onClick={() => {
                if (url && !window.confirm(t("notifications.regenerateConfirm"))) return;
                feed.submit({ intent: "regenerateFeed" }, { method: "post", encType: "application/json" });
              }}
            >
              {url ? t("notifications.regenerate") : t("notifications.createFeed")}
            </Button>
          </Stack>
          <ChoiceList
            label={t("notifications.feedMode")}
            value={n.calendarFeed.mode}
            disabled={!feedAllowed}
            options={[
              { value: "order", label: t("notifications.feedPerOrder") },
              { value: "day", label: t("notifications.feedPerDay") },
            ]}
            onChange={(v) => update((d) => (d.notifications.calendarFeed.mode = v as "order" | "day"))}
          />
          <Checkbox
            label={t("notifications.feedDetails")}
            details={t("notifications.feedDetailsHelp")}
            checked={n.calendarFeed.includeDetails}
            disabled={!feedAllowed}
            onChange={(v) => update((d) => (d.notifications.calendarFeed.includeDetails = v))}
          />
        </Stack>
      </Section>

      <Section heading={t("notifications.flowHeading")}>
        {!flowAllowed ? <Locked plan="Pro" label={t("notifications.flowLocked")} upgradeLabel={t("common.upgrade")} /> : null}
        <Stack gap="base">
          <s-text color="subdued">{t("notifications.flowHelp")}</s-text>
          <Switch label={t("notifications.flowEnabled")} checked={n.flowEnabled} disabled={!flowAllowed} onChange={(v) => update((d) => (d.notifications.flowEnabled = v))} />
        </Stack>
      </Section>
    </Page>
  );
}

/** Free daily summary email: Pickday fires a Flow trigger, Flow's "Send internal email" sends it. */
function DailySummarySection({
  value,
  timeZone,
  locale,
  onCopy,
  onChange,
}: {
  value: Settings["notifications"]["dailySummary"];
  timeZone: string;
  locale: string;
  onCopy: (s: string) => void;
  onChange: (fn: (v: Settings["notifications"]["dailySummary"]) => void) => void;
}) {
  const t = useT();
  const hourLabel = (h: number) => {
    try {
      return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, h)));
    } catch {
      return `${String(h).padStart(2, "0")}:00`;
    }
  };
  // Flow turns each trigger field into a camelCase Liquid variable ("Orders page" → ordersPage).
  const subject = t("summary.mailSubject", { day: "{{day}}" });
  const message = [
    t("summary.mailTotals", { orders: "{{orders | round}}", items: "{{items | round}}" }),
    "{{summary}}",
    "",
    t("summary.mailOpen", { url: "{{ordersPage}}" }),
  ].join("\n");
  return (
    <Section heading={t("summary.heading")}>
      <Stack gap="base">
        <s-text color="subdued">{t("summary.help")}</s-text>
        <Switch label={t("summary.enabled")} checked={value.enabled} onChange={(v) => onChange((x) => (x.enabled = v))} />
        {value.enabled ? (
          <>
            <Stack direction="inline" gap="base" wrap>
              <Select
                label={t("summary.hour")}
                details={t("summary.hourHelp", { zone: timeZone })}
                value={String(value.hour)}
                options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }))}
                onChange={(v) => onChange((x) => (x.hour = Number(v)))}
              />
              <Select
                label={t("summary.day")}
                value={value.day}
                options={[
                  { value: "tomorrow", label: t("summary.tomorrow") },
                  { value: "today", label: t("summary.today") },
                ]}
                onChange={(v) => onChange((x) => (x.day = v as "today" | "tomorrow"))}
              />
            </Stack>
            <s-box border="base" borderRadius="base" padding="base">
              <Stack gap="small-200">
                <s-heading>{t("summary.stepsHeading")}</s-heading>
                <s-ordered-list>
                  <s-list-item>{t("summary.step1")}</s-list-item>
                  <s-list-item>{t("summary.step2")}</s-list-item>
                  <s-list-item>{t("summary.step3")}</s-list-item>
                  <s-list-item>{t("summary.step4")}</s-list-item>
                </s-ordered-list>
                <s-text color="subdued">{t("summary.tip")}</s-text>
                <Stack direction="inline" gap="small-200" alignItems="end" wrap>
                  <TextField label={t("summary.subjectLabel")} value={subject} readOnly onChange={() => {}} />
                  <Button icon="clipboard" onClick={() => onCopy(subject)}>{t("notifications.copy")}</Button>
                </Stack>
                <s-text type="strong">{t("summary.messageLabel")}</s-text>
                <pre style={{ margin: 0, fontSize: 12, background: "var(--s-color-bg-surface-secondary, #f6f6f7)", padding: 8, borderRadius: 6, whiteSpace: "pre-wrap" }}>{message}</pre>
                <Stack direction="inline" gap="small-200" wrap>
                  <Button icon="clipboard" onClick={() => onCopy(message)}>{t("notifications.copy")}</Button>
                  <Button href="shopify://admin/apps/flow" target="_top" icon="external">{t("summary.openFlow")}</Button>
                </Stack>
              </Stack>
            </s-box>
          </>
        ) : null}
      </Stack>
    </Section>
  );
}

function SnippetCard({ id, code, onCopy }: { id: SnippetId; code: string; onCopy: (s: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <s-box border="base" borderRadius="base" padding="base">
      <Stack gap="small-200">
        <Stack direction="inline" justifyContent="space-between" alignItems="center" wrap>
          <s-heading>{t(`snippet.${id}.title`)}</s-heading>
          <Stack direction="inline" gap="small-200">
            <Button variant="tertiary" onClick={() => setOpen((o) => !o)}>{open ? t("notifications.hideGuide") : t("notifications.whereToPaste")}</Button>
            <Button icon="clipboard" onClick={() => onCopy(code)}>{t("notifications.copy")}</Button>
          </Stack>
        </Stack>
        {open ? (
          <s-ordered-list>
            <s-list-item>{t(`snippet.${id}.step1`)}</s-list-item>
            <s-list-item>{t(`snippet.${id}.step2`)}</s-list-item>
            <s-list-item>{t(`snippet.${id}.step3`)}</s-list-item>
          </s-ordered-list>
        ) : null}
        <pre style={{ margin: 0, maxHeight: 160, overflow: "auto", fontSize: 12, background: "var(--s-color-bg-surface-secondary, #f6f6f7)", padding: 8, borderRadius: 6, whiteSpace: "pre-wrap" }}>{code}</pre>
      </Stack>
    </s-box>
  );
}
