/**
 * Settings page plumbing: draft state, App Bridge contextual Save Bar,
 * "Settings saved" toast, critical banner with links to each invalid field.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import type { Settings } from "../../core/types";
import { useT } from "../i18n/react";

export type Issue = { path: string; message: string };
type SaveResponse = { ok: true; version: number; settings: Settings; warnings?: string[] } | { ok: false; issues: Issue[] };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function useSettingsForm<K extends keyof Settings>(initial: Pick<Settings, K>, opts: { validate?: (d: Pick<Settings, K>) => Issue[] } = {}) {
  const shopify = useAppBridge();
  const t = useT();
  const fetcher = useFetcher<SaveResponse>();
  const [base, setBase] = useState(() => clone(initial));
  const [draft, setDraft] = useState(() => clone(initial));
  const [issues, setIssues] = useState<Issue[]>([]);
  const dirty = useMemo(() => JSON.stringify(base) !== JSON.stringify(draft), [base, draft]);
  const saving = fetcher.state !== "idle";

  useEffect(() => {
    const d = fetcher.data;
    if (!d || fetcher.state !== "idle") return;
    if (d.ok) {
      const keys = Object.keys(base) as K[];
      const fresh = Object.fromEntries(keys.map((k) => [k, d.settings[k]])) as Pick<Settings, K>;
      setBase(clone(fresh));
      setDraft(clone(fresh));
      setIssues([]);
      shopify.toast.show(t("common.saved"));
      if (d.warnings?.includes("publishFailed")) shopify.toast.show(t("common.publishLater"), { isError: true });
    } else {
      setIssues(d.issues);
      shopify.toast.show(t("common.fixErrors"), { isError: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data, fetcher.state]);

  const save = useCallback(() => {
    const local = opts.validate?.(draft) ?? [];
    if (local.length) {
      setIssues(local);
      return;
    }
    // Only the sections changed here: a page's untouched copy of other sections (e.g. the Settings page's
    // delivery hours) must not undo changes saved meanwhile somewhere else.
    const keys = (Object.keys(draft) as K[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(base[k]));
    const patch = Object.fromEntries(keys.map((k) => [k, draft[k]]));
    fetcher.submit(JSON.stringify({ patch }), { method: "post", encType: "application/json" });
  }, [base, draft, fetcher, opts]);

  const discard = useCallback(() => {
    setDraft(clone(base));
    setIssues([]);
  }, [base]);

  /** Immutable update helper: update(d => { d.methods.delivery.enabled = true }). */
  const update = useCallback((fn: (d: Pick<Settings, K>) => void) => {
    setDraft((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
  }, []);

  const errorFor = useCallback(
    (path: string) => issues.find((i) => i.path === path || i.path.startsWith(path + "."))?.message,
    [issues],
  );

  return { draft, setDraft, update, dirty, save, discard, saving, issues, errorFor };
}

/** Save bar + error banner. Place at the top of the page content. */
export function SettingsChrome(p: {
  form: { dirty: boolean; save: () => void; discard: () => void; saving: boolean; issues: Issue[] };
  fieldLabels?: Record<string, string>;
  children?: ReactNode;
}) {
  const t = useT();
  const { form } = p;
  return (
    <>
      <SaveBar id="pickday-save-bar" open={form.dirty} discardConfirmation>
        <button variant="primary" onClick={form.save} {...(form.saving ? { loading: "" } : {})}>
          {t("common.save")}
        </button>
        <button onClick={form.discard}>{t("common.discard")}</button>
      </SaveBar>
      {form.issues.length ? (
        <s-banner tone="critical" heading={t("common.errorsHeading", { count: form.issues.length })}>
          <s-unordered-list>
            {form.issues.map((i) => {
              const anchor = fieldId(i.path);
              const label = labelFor(i.path, p.fieldLabels);
              return (
                <s-list-item key={i.path + i.message}>
                  <s-link
                    href={`#${anchor}`}
                    onClick={(e: Event) => {
                      e.preventDefault();
                      const el = document.getElementById(anchor) ?? document.querySelector(`[data-path^="${i.path.split(".").slice(0, 2).join(".")}"]`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      (el as HTMLElement | null)?.focus?.();
                    }}
                  >
                    {label ? `${label}: ` : ""}
                    {i.message}
                  </s-link>
                </s-list-item>
              );
            })}
          </s-unordered-list>
        </s-banner>
      ) : null}
      {p.children}
    </>
  );
}

export const fieldId = (path: string) => "f-" + path.replace(/[^a-zA-Z0-9]+/g, "-");

function labelFor(path: string, labels?: Record<string, string>) {
  if (!labels) return "";
  let best = "";
  for (const k of Object.keys(labels)) if (path.startsWith(k) && k.length > best.length) best = k;
  return best ? labels[best] : "";
}
