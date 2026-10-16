import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { hasFeature } from "../../core/publish";
import { Button, Locked, Page, Section, Stack, TextField } from "../components/polaris";
import { useT } from "../i18n/react";
import { logActivity, recentActivity } from "../models/settings.server";
import { adminContext, saveSettings } from "../services/settings.server";
import { createShareCode, exportDocument, prepareImport, readShareCode } from "../services/transfer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const activity = await recentActivity(ctx.shop, 50);
  return {
    allowed: hasFeature(ctx.plan, "importExport"),
    doc: exportDocument(ctx.shop, ctx.settings),
    activity: activity.map((a) => ({ id: a.id, at: a.at.toISOString(), actor: a.actor, kind: a.kind, summary: a.summary })),
  };
};

type Result =
  | { intent: "share"; code: string; expiresAt: string }
  | { intent: "preview"; ok: true; changes: string[]; productIds: boolean; fees: boolean }
  | { intent: "preview" | "apply"; ok: false; error: string }
  | { intent: "apply"; ok: true };

export const action = async ({ request }: ActionFunctionArgs): Promise<Result | null> => {
  const ctx = await adminContext(request);
  if (!hasFeature(ctx.plan, "importExport")) return { intent: "apply", ok: false, error: "locked" };
  const body = (await request.json()) as { intent: string; doc?: unknown; code?: string };
  if (body.intent === "share") return { intent: "share", ...(await createShareCode(ctx.shop, ctx.settings)) };
  const doc = body.code ? await readShareCode(body.code) : body.doc;
  if (body.code && !doc) return { intent: body.intent === "apply" ? "apply" : "preview", ok: false, error: "badCode" };
  const prep = prepareImport(ctx.settings, doc);
  if (!prep.ok) return { intent: body.intent === "apply" ? "apply" : "preview", ok: false, error: prep.error };
  if (body.intent === "preview") return { intent: "preview", ok: true, changes: prep.changes, productIds: prep.productIds, fees: prep.fees };
  // Keep this store's own links (fee product, Shopify location ids are re-linked on the pages).
  const r = await saveSettings(ctx, prep.settings, `Imported settings${body.code ? " (share code)" : " (file)"}`);
  if (!r.ok) return { intent: "apply", ok: false, error: "invalid" };
  await logActivity(ctx.shop, "import", `Changed: ${prep.changes.join(", ") || "nothing"}`, ctx.actor);
  return { intent: "apply", ok: true };
};

export default function TransferPage() {
  const { allowed, doc, activity } = useLoaderData<typeof loader>();
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
      {!allowed ? <Locked plan="Pro" label={t("transfer.locked")} upgradeLabel={t("common.upgrade")} /> : null}
      <Section heading={t("transfer.exportHeading")}>
        <Stack gap="base">
          <s-text color="subdued">{t("transfer.exportHelp")}</s-text>
          <Stack direction="inline" gap="small-200" wrap>
            <Button icon="export" disabled={!allowed} onClick={download}>{t("transfer.download")}</Button>
            <Button disabled={!allowed} loading={share.state !== "idle"} onClick={() => share.submit({ intent: "share" }, { method: "post", encType: "application/json" })}>{t("transfer.createCode")}</Button>
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
            <TextField label={t("transfer.codeLabel")} value={code} placeholder="ABCD234XYZ" disabled={!allowed} onChange={setCode} />
            <Button disabled={!allowed || code.replace(/\W/g, "").length !== 10} onClick={() => preview({ code })}>{t("transfer.useCode")}</Button>
          </Stack>
          {res && "ok" in res && !res.ok ? <s-banner tone="critical">{t(`transfer.error.${res.error}`)}</s-banner> : null}
          {res?.intent === "preview" && res.ok && pending ? (
            <s-banner tone="warning" heading={t("transfer.previewHeading")}>
              <Stack gap="small-200">
                <s-text>{res.changes.length ? t("transfer.willChange", { list: res.changes.join(", ") }) : t("transfer.noChanges")}</s-text>
                {res.productIds ? <s-text>{t("transfer.productNote")}</s-text> : null}
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
