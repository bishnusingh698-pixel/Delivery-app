/**
 * Language of the Pickday admin (D-82): Automatic (each person's Shopify admin language, the default)
 * or one language for everyone in the store. Each choice shows its flag and its own name. Saved at
 * once; the whole admin switches language when the page reloads its data.
 */
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ADMIN_LANGS, ADMIN_LANGUAGE_NAMES, type AdminLang } from "../i18n";
import { useT } from "../i18n/react";
import { Flag } from "./flags";
import { Section, Stack } from "./polaris";

type Choice = AdminLang | "auto";

export function AdminLanguagePicker({ value, automatic }: { value: Choice; automatic: AdminLang }) {
  const t = useT();
  const shopify = useAppBridge();
  const fetcher = useFetcher<{ ok: boolean; intent: "adminLang" }>();
  // Show the new choice straight away while it saves.
  const pending = fetcher.json as { lang?: Choice } | undefined;
  const current: Choice = pending?.lang ?? value;
  const busy = fetcher.state !== "idle";
  const choose = (lang: Choice) => {
    if (lang === current || busy) return;
    fetcher.submit({ intent: "adminLang", lang }, { method: "post", encType: "application/json" });
  };
  // After the save and the reload of the page's data, so the message is in the new language.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || fetcher.data.intent !== "adminLang") return;
    if (fetcher.data.ok) shopify.toast.show(t("settingsPage.adminLangSaved"));
    else shopify.toast.show(t("settingsPage.adminLangFailed"), { isError: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const options: { id: Choice; label: string; hint?: string }[] = [
    { id: "auto", label: t("settingsPage.adminLangAuto"), hint: t("settingsPage.adminLangAutoHelp", { language: ADMIN_LANGUAGE_NAMES[automatic] }) },
    ...ADMIN_LANGS.map((l) => ({ id: l as Choice, label: ADMIN_LANGUAGE_NAMES[l] })),
  ];
  return (
    <Section heading={t("settingsPage.adminLangHeading")} id="admin-language">
      <Stack gap="base">
        <s-text color="subdued">{t("settingsPage.adminLangHelp")}</s-text>
        <style>{CSS}</style>
        <fieldset className="pd-langs" disabled={busy}>
          <legend className="pd-visually-hidden">{t("settingsPage.adminLangHeading")}</legend>
          {options.map((o) => (
            <label key={o.id} className={`pd-lang${current === o.id ? " is-on" : ""}${o.id === "auto" ? " is-auto" : ""}`}>
              <input type="radio" name="pd-admin-lang" value={o.id} checked={current === o.id} onChange={() => choose(o.id)} />
              {o.id === "auto" ? <s-icon type="globe" /> : <Flag lang={o.id} />}
              <span className="pd-lang-text">
                <span lang={o.id === "auto" ? undefined : o.id}>{o.label}</span>
                {o.hint ? <span className="pd-lang-hint">{o.hint}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
      </Stack>
    </Section>
  );
}

const CSS = `
.pd-langs{border:0;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
.pd-langs[disabled]{opacity:.7}
.pd-lang{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #d4d4d4;border-radius:10px;cursor:pointer;background:#fff;min-height:44px}
.pd-lang.is-auto{grid-column:1/-1}
.pd-lang:hover{background:#f7f7f7}
.pd-lang.is-on{border-color:#303030;box-shadow:inset 0 0 0 1px #303030;background:#f3f3f3}
.pd-lang input{margin:0;accent-color:#303030}
.pd-lang input:focus-visible{outline:2px solid #005bd3;outline-offset:2px}
.pd-lang-text{display:flex;flex-direction:column;gap:2px;font-size:13px;font-weight:550}
.pd-lang-hint{font-weight:400;color:#616161}
.pd-visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;
