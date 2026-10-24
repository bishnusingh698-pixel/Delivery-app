import fs from "node:fs";
import path from "node:path";
import { useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { matchLocale } from "../../core/i18n/locales";
import { hasFeature } from "../../core/publish";
import {
  checkOverride,
  groupKeys,
  matchesSearch,
  overrideCount,
  placeholderTokens,
  setOverride,
  textIssues,
  type OverrideCheck,
} from "../../core/texts-ui";
import type { MethodId, Settings, WidgetSettings } from "../../core/types";
import { Button, Checkbox, ChoiceList, ColorField, Locked, MultiChoice, NumberField, Page, Section, Select, Stack, Switch, TextField } from "../components/polaris";
import { SettingsChrome, fieldId, useSettingsForm, type Issue } from "../components/settings-form";
import { LiveWidget } from "../components/live-preview";
import { useMethodLabel } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { flagsOf, requireShop } from "../models/shop.server";
import { checkEmbed, themeEditorLink } from "../services/embed.server";
import { adminContext, patchSettingsAction, previewData, shopMeta } from "../services/settings.server";

type Context = Record<string, { where?: string; max?: number }>;

const LOCALE_DIR = path.join(process.cwd(), "locales", "storefront");
function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Matches the server schema (settings-schema.server.ts). */
const MAX_TEXT = 600;
const MAX_CSS = 5000;
const MAX_SELECTOR = 200;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const meta = shopMeta(ctx);
  let flags = flagsOf(ctx.row);
  // Same as Home: re-check the app embed at most every 10 minutes until it's found.
  const stale = !flags.embedCheckedAt || Date.now() - Date.parse(flags.embedCheckedAt) > 10 * 60_000;
  if (stale && !flags.embedDetected) {
    await checkEmbed(ctx.shop, ctx.admin);
    flags = flagsOf(await requireShop(ctx.shop));
  }

  const en = readJson<Record<string, string>>("en.json", {});
  const context = readJson<Context>("_context.json", {});
  const langs = [...new Set([...meta.locales, "en"])];
  const defaults: Record<string, Record<string, string>> = {};
  const builtIn: Record<string, boolean> = {};
  for (const l of langs) {
    const file = matchLocale(l);
    builtIn[l] = file !== "en" || l.toLowerCase().split(/[-_]/)[0] === "en";
    defaults[l] = file === "en" ? en : { ...en, ...readJson<Record<string, string>>(`${file}.json`, {}) };
  }

  const s = ctx.settings;
  return {
    meta,
    ...previewData(ctx),
    full: s,
    embed: { detected: flags.embedDetected ?? null, link: themeEditorLink(ctx.shop) },
    keys: Object.keys(en),
    defaults,
    builtIn,
    context,
    methods: s.methodOrder.filter((id) => s.methods[id].enabled),
    initial: { widget: s.widget, texts: s.texts, notes: s.notes } as Pick<Settings, "widget" | "texts" | "notes">,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => patchSettingsAction(request);

const PREFIXES = new Set([
  "general", "method", "location", "area", "date", "calendar", "reason", "slot", "fee", "summary",
  "product", "duration", "item", "validation", "checkout", "thankyou", "snippet", "notes",
]);

export default function AppearancePage() {
  const { meta, embed, keys, defaults, builtIn, context, methods, initial, full, preview, holidayItems } = useLoaderData<typeof loader>();
  const t = useT();
  const methodLabel = useMethodLabel();
  const { locale: adminLocale } = useI18n();
  const [params] = useSearchParams();
  const embedFetcher = useFetcher();

  const langName = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try {
      dn = new Intl.DisplayNames([adminLocale], { type: "language" });
    } catch {
      dn = null;
    }
    return (code: string) => {
      try {
        return dn?.of(code) ?? code;
      } catch {
        return code;
      }
    };
  }, [adminLocale]);

  const defaultsFor = (l: string) => defaults[l] ?? {};
  const labelFor = (key: string) => context[key]?.where ?? key;
  const problemText = (c: OverrideCheck) => {
    if (c.syntax) return t("widget.texts.braces");
    const parts: string[] = [];
    if (c.missing.length) parts.push(t("widget.texts.missing", { list: c.missing.join(", ") }));
    if (c.extra.length) parts.push(t("widget.texts.extra", { list: c.extra.join(", ") }));
    return parts.join(" ");
  };

  const form = useSettingsForm(initial, {
    validate: (d) =>
      textIssues(d.texts, defaultsFor).map<Issue>((i) => ({
        path: `texts.${i.locale}.${i.key}`,
        message: `${langName(i.locale)}, “${labelFor(i.key)}”: ${problemText(i.check)}`,
      })),
  });
  const { draft, update } = form;
  const w = draft.widget;
  const setW = <K extends keyof WidgetSettings>(k: K, v: WidgetSettings[K]) => update((d) => (d.widget[k] = v));

  const previewLangs = Object.keys(defaults);
  const [previewLang, setPreviewLang] = useState(previewLangs.includes(meta.primaryLocale) ? meta.primaryLocale : previewLangs[0]);
  const [editLang, setEditLang] = useState(meta.locales.includes(meta.primaryLocale) ? meta.primaryLocale : meta.locales[0]);
  const qMethod = params.get("method") as MethodId | null;
  const [previewMethod, setPreviewMethod] = useState<MethodId>(qMethod && methods.includes(qMethod) ? qMethod : methods[0] ?? "delivery");
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);

  // When a text error is in another language, switch the editor to it so the error link works
  // (adjusting state during render when the issues change, as React recommends over an effect).
  const [seenIssues, setSeenIssues] = useState(form.issues);
  if (seenIssues !== form.issues) {
    setSeenIssues(form.issues);
    const loc = form.issues.find((i) => i.path.startsWith("texts."))?.path.split(".")[1];
    if (loc && meta.locales.includes(loc) && loc !== editLang) {
      setEditLang(loc);
      setQuery("");
      setOnlyChanged(false);
    }
  }

  const known = useMemo(() => new Set(keys), [keys]);
  const groups = useMemo(() => groupKeys(keys), [keys]);
  const editDefaults = defaultsFor(editLang);
  const editOverrides = draft.texts[editLang] ?? {};
  const changedCount = overrideCount(draft.texts, editLang, known);
  const customCss = hasFeature(meta.plan, "customCss");

  const visibleGroups = groups
    .map((g) => ({
      ...g,
      keys: g.keys.filter(
        (k) =>
          (!onlyChanged || !!editOverrides[k]) &&
          matchesSearch(query, k, editDefaults[k], defaults.en?.[k], editOverrides[k], context[k]?.where),
      ),
    }))
    .filter((g) => g.keys.length);

  const embedStatus =
    embed.detected === true ? (
      <s-badge tone="success">{t("widget.setup.embedOn")}</s-badge>
    ) : embed.detected === false ? (
      <s-badge tone="warning">{t("widget.setup.embedOff")}</s-badge>
    ) : (
      <s-badge>{t("widget.setup.embedUnknown")}</s-badge>
    );

  return (
    <Page title={t("appearance.title")} subtitle={t("appearance.subtitle")}>
      <SettingsChrome
        form={form}
        fieldLabels={{
          "widget.accent": t("widget.accent"),
          "widget.radius": t("widget.radius"),
          "widget.drawerSelector": t("widget.drawerSelector"),
          "widget.customCss": t("widget.customCss"),
          texts: t("widget.texts.heading"),
        }}
      />

      <Section heading={t("widget.setup.heading")}>
        <Stack gap="base">
          <Stack gap="small-200">
            <Stack direction="inline" gap="small-200" alignItems="center">
              <s-heading>{t("widget.setup.embedTitle")}</s-heading>
              {embedStatus}
            </Stack>
            <s-paragraph>{t("widget.setup.embedText")}</s-paragraph>
            <Stack direction="inline" gap="small-200">
              <Button href={embed.link} target="_top" variant={embed.detected ? "secondary" : "primary"}>
                {t("widget.setup.embedButton")}
              </Button>
              <Button
                loading={embedFetcher.state !== "idle"}
                onClick={() => embedFetcher.submit({ intent: "checkEmbed" }, { method: "post", action: "/app?index" })}
              >
                {t("widget.setup.recheck")}
              </Button>
            </Stack>
          </Stack>
          <s-divider />
          <Stack gap="small-200">
            <s-heading>{t("widget.setup.blockTitle")}</s-heading>
            <s-paragraph>{t("widget.setup.blockText")}</s-paragraph>
            <Stack direction="inline" gap="base">
              <s-link href={`https://${meta.shop}/admin/themes/current/editor?template=cart`} target="_top">
                {t("widget.setup.blockCart")}
              </s-link>
              <s-link href={`https://${meta.shop}/admin/themes/current/editor?template=product`} target="_top">
                {t("widget.setup.blockProduct")}
              </s-link>
            </Stack>
          </Stack>
        </Stack>
      </Section>

      <Section heading={t("widget.appearance")}>
        <Stack gap="base">
          <ChoiceList
            id={fieldId("widget.theme")}
            label={t("widget.theme")}
            value={w.theme}
            options={[
              { value: "match", label: t("widget.themeMatch"), details: t("widget.themeMatchHelp") },
              { value: "light", label: t("widget.themeLight"), details: t("widget.themeLightHelp") },
              { value: "dark", label: t("widget.themeDark"), details: t("widget.themeDarkHelp") },
            ]}
            onChange={(v) => setW("theme", v as WidgetSettings["theme"])}
          />
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <ColorField
              id={fieldId("widget.accent")}
              label={t("widget.accent")}
              details={t("widget.accentHelp")}
              value={w.accent}
              error={form.errorFor("widget.accent")}
              onChange={(v) => setW("accent", v)}
            />
            <NumberField
              id={fieldId("widget.radius")}
              label={t("widget.radius")}
              details={t("widget.radiusHelp")}
              value={w.radius}
              min={0}
              max={24}
              suffix="px"
              error={form.errorFor("widget.radius")}
              onChange={(v) => setW("radius", Math.max(0, Math.min(24, Math.round(v ?? 0))))}
            />
          </s-grid>
          <ChoiceList
            id={fieldId("widget.input")}
            label={t("widget.input")}
            value={w.input}
            options={[
              { value: "calendar", label: t("widget.inputCalendar"), details: t("widget.inputCalendarHelp") },
              { value: "dropdown", label: t("widget.inputDropdown"), details: t("widget.inputDropdownHelp") },
            ]}
            onChange={(v) => setW("input", v as WidgetSettings["input"])}
          />
          <Checkbox id={fieldId("widget.compact")} label={t("widget.compact")} details={t("widget.compactHelp")} checked={w.compact} onChange={(v) => setW("compact", v)} />
          <Checkbox id={fieldId("widget.icons")} label={t("widget.icons")} checked={w.icons} onChange={(v) => setW("icons", v)} />
          <Checkbox
            id={fieldId("widget.showSpotsLeft")}
            label={t("widget.showSpotsLeft")}
            details={t("widget.showSpotsLeftHelp")}
            checked={w.showSpotsLeft}
            onChange={(v) => setW("showSpotsLeft", v)}
          />
        </Stack>
      </Section>

      <Section heading={t("appearance.placement")}>
        <Stack gap="base">
          <ChoiceList
            id={fieldId("widget.position")}
            label={t("appearance.position")}
            value={w.position}
            options={[
              { value: "before", label: t("appearance.positionBefore"), details: t("appearance.positionBeforeHelp") },
              { value: "after", label: t("appearance.positionAfter"), details: t("appearance.positionAfterHelp") },
            ]}
            onChange={(v) => setW("position", v as WidgetSettings["position"])}
          />
          <Switch label={t("appearance.drawer")} details={t("appearance.drawerHelp")} checked={w.drawer} onChange={(v) => setW("drawer", v)} />
        </Stack>
      </Section>

      <Section heading={t("appearance.notesHeading")}>
        <Stack gap="base">
          <Switch label={t("appearance.notesOn")} details={t("appearance.notesHelp")} checked={draft.notes.enabled} onChange={(v) => update((x) => (x.notes.enabled = v))} />
          {draft.notes.enabled ? (
            <>
              <MultiChoice
                label={t("appearance.notesMethods")}
                details={t("appearance.notesMethodsHelp")}
                values={draft.notes.methods === "all" ? [] : draft.notes.methods}
                options={(["delivery", "pickup", "shipping"] as MethodId[]).map((id) => ({ value: id, label: methodLabel(id) }))}
                onChange={(v) => update((x) => (x.notes.methods = v.length ? (v as MethodId[]) : "all"))}
              />
              <NumberField
                label={t("appearance.notesMax")}
                min={20}
                max={500}
                value={draft.notes.maxLength}
                onChange={(v) => update((x) => (x.notes.maxLength = Math.max(20, Math.min(500, Math.round(v ?? 250)))))}
              />
              <s-text color="subdued">{t("appearance.notesRename")}</s-text>
            </>
          ) : null}
        </Stack>
      </Section>

      <Section heading={t("widget.preview.heading")} aside>
        <Stack gap="base">
          <s-paragraph>
            <s-text color="subdued">{t("widget.preview.help")}</s-text>
          </s-paragraph>
          <Select
            label={t("widget.preview.language")}
            value={previewLang}
            options={previewLangs.map((l) => ({ value: l, label: langName(l) }))}
            onChange={setPreviewLang}
          />
          {methods.length > 1 ? (
            <Select label={t("appearance.previewMethod")} value={previewMethod} options={methods.map((id) => ({ value: id, label: methodLabel(id) }))} onChange={(v) => setPreviewMethod(v as MethodId)} />
          ) : null}
          <LiveWidget settings={{ ...full, ...draft }} meta={preview} holidayItems={holidayItems} method={previewMethod} locale={previewLang} />
          {w.theme === "match" ? (
            <s-text color="subdued">{t("widget.preview.matchNote")}</s-text>
          ) : null}
        </Stack>
      </Section>

      <Section heading={t("widget.behaviour")}>
        <Stack gap="base">
          <Checkbox
            id={fieldId("widget.preselectEarliest")}
            label={t("widget.preselectEarliest")}
            details={t("widget.preselectEarliestHelp")}
            checked={w.preselectEarliest}
            onChange={(v) => setW("preselectEarliest", v)}
          />
          <ChoiceList
            id={fieldId("widget.productPageMode")}
            label={t("widget.productPageMode")}
            value={w.productPageMode}
            options={[
              { value: "message", label: t("widget.productMessage"), details: t("widget.productMessageHelp") },
              { value: "picker", label: t("widget.productPicker"), details: t("widget.productPickerHelp") },
            ]}
            onChange={(v) => setW("productPageMode", v as WidgetSettings["productPageMode"])}
          />
          <TextField
            id={fieldId("widget.drawerSelector")}
            label={t("widget.drawerSelector")}
            details={t("widget.drawerSelectorHelp")}
            placeholder="#CartDrawer .drawer__footer"
            value={w.drawerSelector}
            maxLength={MAX_SELECTOR}
            error={form.errorFor("widget.drawerSelector")}
            onChange={(v) => setW("drawerSelector", v)}
          />
          {customCss ? (
            <TextField
              id={fieldId("widget.customCss")}
              label={t("widget.customCss")}
              details={t("widget.customCssHelp", { max: MAX_CSS })}
              multiline={6}
              maxLength={MAX_CSS}
              placeholder=".pickday .pd-heading { font-size: 1.2em; }"
              value={w.customCss}
              error={form.errorFor("widget.customCss")}
              onChange={(v) => setW("customCss", v)}
            />
          ) : (
            <Locked plan="Pro" label={t("widget.customCssLocked")} upgradeLabel={t("common.upgrade")} />
          )}
        </Stack>
      </Section>

      <Section heading={t("widget.texts.heading")} id="texts">
        <Stack gap="base">
          <s-paragraph>{t("widget.texts.help")}</s-paragraph>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="end">
            <Select
              label={t("widget.texts.language")}
              value={editLang}
              options={meta.locales.map((l) => ({ value: l, label: langName(l) }))}
              onChange={(l) => {
                setEditLang(l);
                if (previewLangs.includes(l)) setPreviewLang(l);
              }}
            />
            <TextField type="search" label={t("widget.texts.search")} placeholder={t("widget.texts.searchPlaceholder")} value={query} onChange={setQuery} />
          </s-grid>
          <Stack direction="inline" gap="base" alignItems="center">
            {changedCount ? <s-badge tone="info">{t("widget.texts.changedCount", { count: changedCount })}</s-badge> : null}
            <Checkbox label={t("widget.texts.onlyChanged")} checked={onlyChanged} onChange={setOnlyChanged} />
          </Stack>
          {!builtIn[editLang] ? <s-banner tone="info">{t("widget.texts.noBuiltIn", { language: langName(editLang) })}</s-banner> : null}

          {visibleGroups.length === 0 ? (
            <s-text color="subdued">{t("widget.texts.noMatches")}</s-text>
          ) : (
            visibleGroups.map((g) => (
              <Stack key={g.prefix} gap="base">
                <s-divider />
                <s-heading>{PREFIXES.has(g.prefix) ? t(`widget.group.${g.prefix}`) : g.prefix}</s-heading>
                {g.keys.map((k) => {
                  const def = editDefaults[k] ?? "";
                  const value = editOverrides[k] ?? "";
                  const max = context[k]?.max;
                  const check = checkOverride(def, value, max);
                  const tokens = placeholderTokens(def);
                  const long = def.length > 60 || /,\s*(plural|select)\s*,/.test(def);
                  const details = [
                    t("widget.texts.default", { text: def }),
                    tokens.length ? t("widget.texts.keep", { list: tokens.join(", ") }) : "",
                    check.tooLong && max ? t("widget.texts.tooLong", { max }) : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const path = `texts.${editLang}.${k}`;
                  return (
                    <Stack key={k} gap="small-200">
                      <TextField
                        id={fieldId(path)}
                        label={labelFor(k)}
                        details={details}
                        placeholder={def}
                        value={value}
                        multiline={long ? 3 : undefined}
                        maxLength={MAX_TEXT}
                        error={check.ok ? form.errorFor(path) : problemText(check)}
                        onChange={(v) => update((d) => (d.texts = setOverride(d.texts, editLang, k, v)))}
                      />
                      {value ? (
                        <s-stack direction="inline" justifyContent="end">
                          <Button
                            variant="tertiary"
                            accessibilityLabel={t("widget.texts.resetLabel", { label: labelFor(k) })}
                            onClick={() => update((d) => (d.texts = setOverride(d.texts, editLang, k, "")))}
                          >
                            {t("widget.texts.reset")}
                          </Button>
                        </s-stack>
                      ) : null}
                    </Stack>
                  );
                })}
              </Stack>
            ))
          )}
        </Stack>
      </Section>
    </Page>
  );
}
