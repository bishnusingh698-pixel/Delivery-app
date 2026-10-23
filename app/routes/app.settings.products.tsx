import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { emptyTarget } from "../../core/defaults";
import { hasFeature } from "../../core/plans";
import { targetIsEmpty } from "../../core/rules";
import { METHOD_IDS, type MethodId, type ProductRules, type Settings } from "../../core/types";
import { Button, Checkbox, ChoiceList, DateField, Locked, MultiChoice, NumberField, Page, Section, TextField } from "../components/polaris";
import { SettingsChrome, fieldId, useSettingsForm, type Issue } from "../components/settings-form";
import { WeekdayPicker, newId, useFormatDate, useMethodLabel } from "../components/shared";
import { TargetPicker, type TitleMap } from "../components/target-picker";
import { useT } from "../i18n/react";
import { resolveRuleProducts, resolveTargetTitles, ruleTargets } from "../services/collections.server";
import { adminContext, saveSettings, shopMeta } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const rules = ctx.settings.productRules;
  let titles: TitleMap = {};
  try {
    titles = await resolveTargetTitles(ctx.admin, ruleTargets(rules));
  } catch (e) {
    console.error(`[products] titles ${ctx.shop}`, e);
  }
  return {
    meta: shopMeta(ctx),
    dateMode: ctx.settings.dateMode,
    titles,
    // Collection membership is server-managed and can be large: not sent to the page.
    initial: { productRules: { ...rules, collectionProducts: {}, tagProducts: {} } } as Pick<Settings, "productRules">,
  };
};

/**
 * Like patchSettingsAction, but resolves the collections used in rule targets
 * to product ids (order webhooks and Functions only see product ids).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await adminContext(request);
  const body = (await request.json()) as { patch?: Partial<Settings> };
  const incoming = body.patch?.productRules ?? ctx.settings.productRules;
  let resolved: Pick<ProductRules, "collectionProducts" | "tagProducts"> = { collectionProducts: {}, tagProducts: {} };
  try {
    resolved = await resolveRuleProducts(ctx.admin, incoming, ctx.settings.productRules);
  } catch {
    // Malformed input: validation in saveSettings reports it.
  }
  const next: Settings = { ...ctx.settings, productRules: { ...incoming, ...resolved } };
  return saveSettings(ctx, next);
};

type Lists = "extraLead" | "restrictions" | "limits" | "methodOnly";

export default function ProductsPage() {
  const { meta, dateMode, titles: initialTitles, initial } = useLoaderData<typeof loader>();
  const t = useT();
  const label = useMethodLabel();
  const fmt = useFormatDate();
  // Products without a date and extra preparation time are Starter; the other rules are Pro.
  const basicsAllowed = hasFeature(meta.plan, "productBasics");
  const allowed = hasFeature(meta.plan, "productRules");
  const [titles, setTitles] = useState<TitleMap>(initialTitles);
  const onTitles = (fresh: TitleMap) => setTitles((prev) => ({ ...prev, ...fresh }));

  const form = useSettingsForm(initial, { validate: (d) => validate(d.productRules) });
  const { draft, update } = form;
  const r = draft.productRules;
  const set = (fn: (p: ProductRules) => void) => update((d) => fn(d.productRules));
  const removeAt = (list: Lists, i: number) => set((p) => void (p[list] as unknown[]).splice(i, 1));

  function validate(p: ProductRules): Issue[] {
    const issues: Issue[] = [];
    const lists: Lists[] = ["extraLead", "restrictions", "limits", "methodOnly"];
    for (const list of lists)
      p[list].forEach((rule, i) => {
        if (targetIsEmpty(rule.target)) issues.push({ path: `productRules.${list}.${i}.target`, message: t("products.targetRequired") });
      });
    p.restrictions.forEach((x, i) => {
      if (!x.weekdays?.length && !x.ranges.length && !x.dates.length)
        issues.push({ path: `productRules.restrictions.${i}.weekdays`, message: t("products.restrictionEmpty") });
      x.ranges.forEach((rg, j) => {
        if (!rg.start || !rg.end) issues.push({ path: `productRules.restrictions.${i}.ranges.${j}`, message: t("products.rangeMissing") });
        else if (!rg.yearly && rg.start > rg.end) issues.push({ path: `productRules.restrictions.${i}.ranges.${j}`, message: t("products.rangeOrder") });
      });
    });
    p.methodOnly.forEach((x, i) => {
      if (!x.methods.length) issues.push({ path: `productRules.methodOnly.${i}.methods`, message: t("products.methodsRequired") });
    });
    return issues;
  }

  const err = (path: string) => form.issues.find((i) => i.path === path)?.message;
  const picker = (path: string, value: ProductRules["exclude"], onChange: (v: ProductRules["exclude"]) => void, disabled = false) => (
    <TargetPicker
      id={fieldId(path)}
      label={t("products.appliesTo")}
      value={value}
      onChange={onChange}
      titles={titles}
      onTitles={onTitles}
      error={err(path)}
      disabled={disabled}
    />
  );
  const locked = !allowed;
  const basicsLocked = !basicsAllowed;

  return (
    <Page title={t("products.title")} subtitle={t("products.subtitle")} backTo={{ href: "/app/settings", label: t("nav.settings") }}>
      <SettingsChrome
        form={form}
        fieldLabels={{
          "productRules.extraLead": t("products.leadHeading"),
          "productRules.restrictions": t("products.restrictHeading"),
          "productRules.limits": t("products.limitsHeading"),
          "productRules.methodOnly": t("products.methodHeading"),
          "productRules.exclude": t("products.excludeHeading"),
        }}
      />
      {dateMode === "item" ? (
        <s-banner tone="info">
          {t("products.itemModeNote")} <s-link href="/app/settings/schedule">{t("schedule.title")}</s-link>
        </s-banner>
      ) : null}

      {basicsLocked ? <Locked plan="Starter" label={t("products.lockedStarter")} upgradeLabel={t("common.upgrade")} /> : null}

      <Section heading={t("products.excludeHeading")}>
        <s-stack gap="base">
          <s-text color="subdued">{t("products.excludeHelp")}</s-text>
          <TargetPicker
            id={fieldId("productRules.exclude")}
            label={t("products.excludeLabel")}
            value={r.exclude}
            onChange={(v) => set((p) => (p.exclude = v))}
            titles={titles}
            onTitles={onTitles}
            disabled={basicsLocked}
          />
          <ChoiceList
            label={t("products.mixedCart")}
            value={r.mixedCart}
            disabled={basicsLocked}
            options={[
              { value: "any", label: t("products.mixedAny"), details: t("products.mixedAnyHelp") },
              { value: "all", label: t("products.mixedAll"), details: t("products.mixedAllHelp") },
            ]}
            onChange={(v) => set((p) => (p.mixedCart = v as "any" | "all"))}
          />
        </s-stack>
      </Section>

      {/* Extra preparation time */}
      <Section heading={t("products.leadHeading")}>
        <s-stack gap="base">
          <s-text color="subdued">{t("products.leadHelp")}</s-text>
          {r.extraLead.map((x, i) => (
            <s-box key={x.id} padding="base" border="base" borderRadius="base">
              <s-stack gap="base">
                {picker(`productRules.extraLead.${i}.target`, x.target, (v) => set((p) => (p.extraLead[i].target = v)), basicsLocked)}
                <s-box inlineSize="200px">
                  <NumberField
                    label={t("products.leadDays")}
                    value={x.days}
                    min={0}
                    max={365}
                    suffix={t("products.days")}
                    disabled={basicsLocked}
                    onChange={(v) => set((p) => (p.extraLead[i].days = Math.max(0, Math.round(v ?? 0))))}
                  />
                </s-box>
                <RemoveButton label={t("products.removeRule")} onClick={() => removeAt("extraLead", i)} />
              </s-stack>
            </s-box>
          ))}
          <s-box>
            <Button icon="plus" disabled={basicsLocked} onClick={() => set((p) => p.extraLead.push({ id: newId("rule_"), target: emptyTarget(), days: 1 }))}>
              {t("products.addLead")}
            </Button>
          </s-box>
        </s-stack>
      </Section>

      {locked ? <Locked plan="Pro" label={t("products.locked")} upgradeLabel={t("common.upgrade")} /> : null}

      {/* Only available on some days */}
      <Section heading={t("products.restrictHeading")}>
        <s-stack gap="base">
          <s-text color="subdued">{t("products.restrictHelp")}</s-text>
          {r.restrictions.map((x, i) => (
            <s-box key={x.id} padding="base" border="base" borderRadius="base">
              <s-stack gap="base">
                <TextField
                  label={t("products.ruleName")}
                  details={t("products.ruleNameHelp")}
                  value={x.name}
                  maxLength={100}
                  disabled={locked}
                  onChange={(v) => set((p) => (p.restrictions[i].name = v))}
                />
                {picker(`productRules.restrictions.${i}.target`, x.target, (v) => set((p) => (p.restrictions[i].target = v)), locked)}
                <WeekdayPicker
                  id={fieldId(`productRules.restrictions.${i}.weekdays`)}
                  label={t("products.onlyWeekdays")}
                  value={x.weekdays ?? []}
                  error={err(`productRules.restrictions.${i}.weekdays`)}
                  onChange={(v) => set((p) => (p.restrictions[i].weekdays = v.length ? v : null))}
                />
                <s-text color="subdued">{t("products.weekdaysHelp")}</s-text>

                <s-stack gap="small-200">
                  <s-text type="strong">{t("products.ranges")}</s-text>
                  {x.ranges.map((rg, j) => (
                    <s-stack key={j} direction="inline" gap="base" alignItems="end" id={fieldId(`productRules.restrictions.${i}.ranges.${j}`)}>
                      <DateField
                        label={t("products.rangeFrom")}
                        value={rg.start || null}
                        disabled={locked}
                        error={err(`productRules.restrictions.${i}.ranges.${j}`)}
                        onChange={(v) => set((p) => (p.restrictions[i].ranges[j].start = v ?? ""))}
                      />
                      <DateField
                        label={t("products.rangeTo")}
                        value={rg.end || null}
                        disabled={locked}
                        onChange={(v) => set((p) => (p.restrictions[i].ranges[j].end = v ?? ""))}
                      />
                      <Checkbox
                        label={t("products.yearly")}
                        checked={rg.yearly}
                        disabled={locked}
                        onChange={(v) => set((p) => (p.restrictions[i].ranges[j].yearly = v))}
                      />
                      <RemoveButton label={t("products.removeRange")} icon onClick={() => set((p) => void p.restrictions[i].ranges.splice(j, 1))} />
                    </s-stack>
                  ))}
                  <s-box>
                    <Button
                      variant="tertiary"
                      icon="plus"
                      disabled={locked}
                      onClick={() => set((p) => p.restrictions[i].ranges.push({ start: meta.today, end: meta.today, yearly: false }))}
                    >
                      {t("products.addRange")}
                    </Button>
                  </s-box>
                </s-stack>

                <s-stack gap="small-200">
                  <s-text type="strong">{t("products.dates")}</s-text>
                  {x.dates.length ? (
                    <s-stack direction="inline" gap="small-200">
                      {x.dates.map((d) => (
                        <s-stack key={d} direction="inline" gap="small-100" alignItems="center">
                          <s-badge>{fmt(d, true)}</s-badge>
                          <Button
                            variant="tertiary"
                            icon="x"
                            disabled={locked}
                            accessibilityLabel={t("products.removeDate", { date: fmt(d, true) })}
                            onClick={() => set((p) => (p.restrictions[i].dates = p.restrictions[i].dates.filter((y) => y !== d)))}
                          >
                            {""}
                          </Button>
                        </s-stack>
                      ))}
                    </s-stack>
                  ) : null}
                  <s-box inlineSize="240px">
                    <DateField
                      label={t("products.addDate")}
                      value={null}
                      disabled={locked}
                      onChange={(v) =>
                        v &&
                        set((p) => {
                          const ds = p.restrictions[i].dates;
                          if (!ds.includes(v)) p.restrictions[i].dates = [...ds, v].sort();
                        })
                      }
                    />
                  </s-box>
                </s-stack>
                <RemoveButton label={t("products.removeRule")} onClick={() => removeAt("restrictions", i)} />
              </s-stack>
            </s-box>
          ))}
          <s-box>
            <Button
              icon="plus"
              disabled={locked}
              onClick={() =>
                set((p) => p.restrictions.push({ id: newId("rule_"), name: "", target: emptyTarget(), weekdays: null, ranges: [], dates: [] }))
              }
            >
              {t("products.addRestriction")}
            </Button>
          </s-box>
        </s-stack>
      </Section>

      {/* Daily limits */}
      <Section heading={t("products.limitsHeading")}>
        <s-stack gap="base">
          <s-text color="subdued">{t("products.limitsHelp")}</s-text>
          {r.limits.map((x, i) => (
            <s-box key={x.id} padding="base" border="base" borderRadius="base">
              <s-stack gap="base">
                <TextField
                  label={t("products.ruleName")}
                  details={t("products.ruleNameHelp")}
                  value={x.name}
                  maxLength={100}
                  disabled={locked}
                  onChange={(v) => set((p) => (p.limits[i].name = v))}
                />
                {picker(`productRules.limits.${i}.target`, x.target, (v) => set((p) => (p.limits[i].target = v)), locked)}
                <s-box inlineSize="200px">
                  <NumberField
                    label={t("products.limitMax")}
                    details={t("products.limitMaxHelp")}
                    value={x.max}
                    min={0}
                    max={100000}
                    disabled={locked}
                    onChange={(v) => set((p) => (p.limits[i].max = Math.max(0, Math.round(v ?? 0))))}
                  />
                </s-box>
                <Checkbox
                  label={t("products.perLocation")}
                  details={t("products.perLocationHelp")}
                  checked={x.perLocation}
                  disabled={locked}
                  onChange={(v) => set((p) => (p.limits[i].perLocation = v))}
                />
                <RemoveButton label={t("products.removeRule")} onClick={() => removeAt("limits", i)} />
              </s-stack>
            </s-box>
          ))}
          <s-box>
            <Button
              icon="plus"
              disabled={locked}
              onClick={() => set((p) => p.limits.push({ id: newId("rule_"), name: "", target: emptyTarget(), max: 10, perLocation: false }))}
            >
              {t("products.addLimit")}
            </Button>
          </s-box>
        </s-stack>
      </Section>

      {/* Only for some methods */}
      <Section heading={t("products.methodHeading")}>
        <s-stack gap="base">
          <s-text color="subdued">{t("products.methodHelp")}</s-text>
          {r.methodOnly.map((x, i) => (
            <s-box key={x.id} padding="base" border="base" borderRadius="base">
              <s-stack gap="base">
                {picker(`productRules.methodOnly.${i}.target`, x.target, (v) => set((p) => (p.methodOnly[i].target = v)), locked)}
                <MultiChoice
                  id={fieldId(`productRules.methodOnly.${i}.methods`)}
                  label={t("products.onlyMethods")}
                  values={x.methods}
                  options={METHOD_IDS.map((id) => ({ value: id, label: label(id) }))}
                  error={err(`productRules.methodOnly.${i}.methods`)}
                  disabled={locked}
                  onChange={(v) => set((p) => (p.methodOnly[i].methods = v as MethodId[]))}
                />
                <RemoveButton label={t("products.removeRule")} onClick={() => removeAt("methodOnly", i)} />
              </s-stack>
            </s-box>
          ))}
          <s-box>
            <Button
              icon="plus"
              disabled={locked}
              onClick={() => set((p) => p.methodOnly.push({ id: newId("rule_"), target: emptyTarget(), methods: ["pickup"] }))}
            >
              {t("products.addMethodRule")}
            </Button>
          </s-box>
        </s-stack>
      </Section>
    </Page>
  );
}

function RemoveButton(p: { label: string; onClick: () => void; icon?: boolean }) {
  return (
    <s-box>
      {p.icon ? (
        <Button variant="tertiary" tone="critical" icon="delete" accessibilityLabel={p.label} onClick={p.onClick}>
          {""}
        </Button>
      ) : (
        <Button variant="tertiary" tone="critical" icon="delete" onClick={p.onClick}>
          {p.label}
        </Button>
      )}
    </s-box>
  );
}
