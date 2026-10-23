import { syncFeeProduct } from "../services/fee-product.server";
import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { hasFeature } from "../../core/plans";
import { Button, Locked, Page, Section, Stack, TextField } from "../components/polaris";
import { useT } from "../i18n/react";
import { logActivity, recentActivity } from "../models/settings.server";
import { adminContext, saveSettings } from "../services/settings.server";
import { resolveRuleProducts } from "../services/collections.server";
import { createShareCode, exportDocument, prepareImport, readShareCode, refsFor, remapTargets, consumeShareCode, type Refs } from "../services/transfer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const activity = await recentActivity(ctx.shop, 50);
  return {
    allowed: hasFeature(ctx.plan, "importExport"),
    shareAllowed: hasFeature(ctx.plan, "shareCodes"),
    doc: exportDocument(ctx.shop, ctx.settings, await refsFor(ctx.admin, ctx.settings)),
    activity: activity.map((a) => ({ id: a.id, at: a.at.toISOString(), actor: a.actor, kind: a.kind, summary: a.summary })),
  };
};

type Result =
  | { intent: "share"; code: string; expiresAt: string }
  | { intent: "preview"; ok: true; changes: string[]; productIds: boolean; fees: boolean; missing: string[] }
  | { intent: "preview" | "apply"; ok: false; error: string }
  | { intent: "apply"; ok: true };

export const action = async ({ request }: ActionFunctionArgs): Promise<Result | null> => {
  const ctx = await adminContext(request);
  if (!hasFeature(ctx.plan, "importExport")) return { intent: "apply", ok: false, error: "locked" };
  const body = (await request.json()) as { intent: string; doc?: unknown; code?: string };
  // Files are Starter; share codes (create or use) are Pro.
  if ((body.intent === "share" || body.code) && !hasFeature(ctx.plan, "shareCodes")) {
    return { intent: body.intent === "apply" ? "apply" : "preview", ok: false, error: "shareLocked" };
  }
  if (body.intent === "share") {
    const res = await createShareCode(ctx.shop, ctx.settings, await refsFor(ctx.admin, ctx.settings));
    await logActivity(ctx.shop, "export", "Created a share code (valid 24 hours, works once)", ctx.actor);
    return { intent: "share" as const, ...res };
  }
  const doc = body.code ? await readShareCode(body.code) : body.doc;
  if (body.code && !doc) return { intent: body.intent === "apply" ? "apply" : "preview", ok: false, error: "badCode" };
  const prep = prepareImport(ctx.settings, doc);
  if (!prep.ok) return { intent: body.intent === "apply" ? "apply" : "preview", ok: false, error: prep.error };
  const src = doc as { from?: string; refs?: Refs };
  const { settings: mapped, missing } = await remapTargets(ctx.admin, prep.settings, src.refs, src.from === ctx.shop);
  if (body.intent === "preview") return { intent: "preview", ok: true, changes: prep.changes, productIds: prep.productIds, fees: prep.fees, missing };
  // Notification settings (daily summary, feed, Flow switch) never come along: keep this store's own.
  mapped.notifications = ctx.settings.notifications;
  Object.assign(mapped.productRules, await resolveRuleProducts(ctx.admin, mapped.productRules, { collectionProducts: {}, tagProducts: {} }));
  // Imported fees need this store's own fee variants, or they would never be charged:
  // if Shopify refuses them, import nothing (and keep the share code usable).
  let next = mapped;
  if (hasFeature(ctx.plan, "surcharges") && mapped.surcharges.length) {
    try {
      next = await syncFeeProduct(ctx.admin, ctx.shop, mapped);
    } catch (e) {
      console.error("[transfer] fee product", (e as Error).message);
      return { intent: "apply", ok: false, error: "feeProduct" };
    }
  }
  if (body.code) {
    const used = await consumeShareCode(body.code);
    if (!used) return { intent: "apply", ok: false, error: "badCode" };
    if (used.from !== ctx.shop) await logActivity(used.from, "export", `Your share code was used by ${ctx.shop}`, null).catch(() => {});
  }
  const r = await saveSettings(ctx, next, `Imported settings${body.code ? " (share code)" : " (file)"}`);
  if (!r.ok) return { intent: "apply", ok: false, error: "invalid" };
  await logActivity(ctx.shop, "import", `Changed: ${prep.changes.join(", ") || "nothing"}`, ctx.actor);
  return { intent: "apply", ok: true };
};

export default function TransferPage() {
  const { allowed, shareAllowed, doc, activity } = useLoaderData<typeof loader>();
  const t = useT();
  const shopify = useAppBridge();
  const share = useFetcher<typeof action>();
  const imp = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const fileRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<{ doc?: unknown; code?: string } | null>(null);

  const download = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pickday-settings-${doc.from.replace(".myshopify.com", "")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const preview = (src: { doc?: unknown; code?: string }) => {
    setPending(src);
    imp.submit({ intent: "preview", ...src } as never, { method: "post", encType: "application/json" });
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      preview({ doc: JSON.parse(await f.text()) });
    } catch {
      shopify.toast.show(t("transfer.error.notPickday"), { isError: true });
    }
  };
  const res = imp.data;
  useEffect(() => {
    if (res?.intent === "apply" && res.ok) {
      shopify.toast.show(t("transfer.imported"));
      setPending(null);
      revalidator.revalidate();
    }
  }, [res]);
  const sh = share.data && share.data.intent === "share" ? share.data : null;

  return (
    <Page title={t("transfer.title")} subtitle={t("transfer.subtitle")} backTo={{ href: "/app/settings", label: t("nav.settings") }}>
      {!allowed ? <Locked plan="Starter" label={t("transfer.locked")} upgradeLabel={t("common.upgrade")} /> : null}
      {allowed && !shareAllowed ? <Locked plan="Pro" label={t("transfer.shareLocked")} upgradeLabel={t("common.upgrade")} /> : null}
      <Section heading={t("transfer.exportHeading")}>
        <Stack gap="base">
          <s-text color="subdued">{t("transfer.exportHelp")}</s-text>
          <Stack direction="inline" gap="small-200" wrap>
            <Button icon="export" disabled={!allowed} onClick={download}>{t("transfer.download")}</Button>
            <Button disabled={!shareAllowed} icon={shareAllowed ? undefined : "lock"} loading={share.state !== "idle"} onClick={() => share.submit({ intent: "share" }, { method: "post", encType: "application/json" })}>{shareAllowed ? t("transfer.createCode") : `${t("transfer.createCode")} (Pro)`}</Button>
          </Stack>
          {sh ? (
            <s-banner tone="success" heading={t("transfer.codeReady", { code: sh.code })}>
              {t("transfer.codeHelp", { time: new Date(sh.expiresAt).toLocaleString() })}
            </s-banner>
          ) : null}
        </Stack>
      </Section>

      <Section heading={t("transfer.importHeading")}>
        <Stack gap="base">
          <s-text color="subdued">{t("transfer.importHelp")}</s-text>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.currentTarget.files?.[0])} />
          <Stack direction="inline" gap="small-200" alignItems="end" wrap>
            <Button icon="import" disabled={!allowed} onClick={() => fileRef.current?.click()}>{t("transfer.chooseFile")}</Button>
            <TextField label={shareAllowed ? t("transfer.codeLabel") : `${t("transfer.codeLabel")} (Pro)`} value={code} placeholder="ABCD234XYZ" disabled={!shareAllowed} onChange={setCode} />
            <Button disabled={!shareAllowed || code.replace(/\W/g, "").length !== 10} onClick={() => preview({ code })}>{t("transfer.useCode")}</Button>
          </Stack>
          {res && "ok" in res && !res.ok ? <s-banner tone="critical">{t(`transfer.error.${res.error}`)}</s-banner> : null}
          {res?.intent === "preview" && res.ok && pending ? (
            <s-banner tone="warning" heading={t("transfer.previewHeading")}>
              <Stack gap="small-200">
                <s-text>{res.changes.length ? t("transfer.willChange", { list: res.changes.join(", ") }) : t("transfer.noChanges")}</s-text>
                {res.productIds ? <s-text>{res.missing.length ? t("transfer.productMissing", { list: res.missing.slice(0, 10).join(", ") }) : t("transfer.productMapped")}</s-text> : null}
                {res.fees ? <s-text>{t("transfer.feeNote")}</s-text> : null}
                <s-text>{t("transfer.locationNote")}</s-text>
                <Stack direction="inline" gap="small-200">
                  <Button variant="primary" loading={imp.state !== "idle"} onClick={() => imp.submit({ intent: "apply", ...pending } as never, { method: "post", encType: "application/json" })}>{t("transfer.apply")}</Button>
                  <Button variant="tertiary" onClick={() => setPending(null)}>{t("common.cancel")}</Button>
                </Stack>
              </Stack>
            </s-banner>
          ) : null}
        </Stack>
      </Section>

      <Section heading={t("transfer.activityHeading")}>
        {activity.length ? (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="secondary">{t("transfer.when")}</s-table-header>
              <s-table-header listSlot="primary">{t("transfer.what")}</s-table-header>
              <s-table-header>{t("transfer.who")}</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {activity.map((a) => (
                <s-table-row key={a.id}>
                  <s-table-cell>{new Date(a.at).toLocaleString()}</s-table-cell>
                  <s-table-cell>{a.summary}</s-table-cell>
                  <s-table-cell>{a.actor ?? "Pickday"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-text color="subdued">{t("transfer.noActivity")}</s-text>
        )}
      </Section>
    </Page>
  );
}
