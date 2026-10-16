import { useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { hasFeature } from "../../core/publish";
import type { MethodId, Settings, Slot, Surcharge } from "../../core/types";
import { Button, Checkbox, ChoiceList, DateField, Locked, Modal, MoneyField, MultiChoice, Page, Section, Switch, TextField, closeModal, openModal } from "../components/polaris";
import { SettingsChrome, fieldId, useSettingsForm } from "../components/settings-form";
import { WeekdayPicker, newId, useFormatDate, useMethodLabel, useWeekdays } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { normalizeAmount } from "../../core/fees";
import { FeeProductError, feeProductStatus, syncFeeProduct } from "../services/fee-product.server";
import { adminContext, saveSettings, shopMeta, type SaveResult } from "../services/settings.server";
import { validateSettings } from "../services/settings-schema.server";

const METHODS: MethodId[] = ["delivery", "pickup", "shipping"];

type SlotChoice = { id: string; method: MethodId; where: string | null; start: string; end: string; weekdays: number[] };

/** Every slot a shopper can pick: method capacity slots and custom pickup location slots. */
function allSlots(s: Settings): SlotChoice[] {
  const out: SlotChoice[] = [];
  const seen = new Set<string>();
  const add = (method: MethodId, where: string | null, slots: Slot[]) => {
    for (const sl of slots) {
      if (seen.has(sl.id)) continue;
      seen.add(sl.id);
      out.push({ id: sl.id, method, where, start: sl.start, end: sl.end, weekdays: sl.weekdays });
    }
  };
  for (const m of METHODS) add(m, null, s.methods[m].capacity.slots);
  for (const l of s.locations) if (l.custom) add("pickup", l.name, l.custom.capacity.slots);
  return out;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const s = ctx.settings;
  return {
    meta: shopMeta(ctx),
    slots: allSlots(s),
    feeProduct: await feeProductStatus(ctx.admin),
    initial: { surcharges: s.surcharges, surchargeTaxable: s.surchargeTaxable } as Pick<Settings, "surcharges" | "surchargeTaxable">,
  };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<SaveResult> => {
  const ctx = await adminContext(request);
  const body = (await request.clone().json()) as { patch?: Partial<Settings> };
  const patch = body.patch ?? {};
  let next: Settings = {
    ...ctx.settings,
    surcharges: patch.surcharges ?? ctx.settings.surcharges,
    surchargeTaxable: patch.surchargeTaxable ?? ctx.settings.surchargeTaxable,
  };
  // Check the form first so we never create variants for invalid amounts.
  const v = validateSettings(next);
  if (!v.ok) return { ok: false, issues: v.issues };
  if (hasFeature(ctx.plan, "surcharges")) {
    try {
      next = await syncFeeProduct(ctx.admin, ctx.shop, v.data);
    } catch (e) {
      if (e instanceof FeeProductError) return { ok: false, issues: [{ path: "surcharges", message: e.message }] };
      throw e;
    }
  }
  return saveSettings(ctx, next, "Changed: surcharges");
};

const blank = (): Surcharge => ({
  id: newId("fee_"),
  label: "",
  kind: "weekday",
  weekdays: [],
  dates: [],
  slotIds: [],
  methods: "all",
  amount: "",
  variantId: null,
});

export default function SurchargesPage() {
  const { meta, slots, feeProduct, initial } = useLoaderData<typeof loader>();
  const t = useT();
  const { locale } = useI18n();
  const label = useMethodLabel();
  const fmt = useFormatDate();
  const days = useWeekdays();
  const allowed = hasFeature(meta.plan, "surcharges");
  const form = useSettingsForm(initial);
  const { draft, update } = form;

  const money = useMemo(() => {
    try {
      const f = new Intl.NumberFormat(locale, { style: "currency", currency: meta.currency });
      return (a: string) => f.format(Number(a));
    } catch {
      return (a: string) => `${a} ${meta.currency}`;
    }
  }, [locale, meta.currency]);

  const slotLabel = (sl: SlotChoice) => {
    const wd = sl.weekdays.length === 7 || !sl.weekdays.length ? "" : ` (${days.filter((d) => sl.weekdays.includes(d.value)).map((d) => d.short).join(", ")})`;
    return `${sl.where ?? label(sl.method)}: ${sl.start}–${sl.end}${wd}`;
  };

  const whenText = (f: Surcharge) => {
    if (f.kind === "weekday") return days.filter((d) => f.weekdays.includes(d.value)).map((d) => d.short).join(", ");
    if (f.kind === "date") return f.dates.map((d) => fmt(d, true)).join(", ");
    if (f.kind === "slot") {
      const names = f.slotIds.map((id) => slots.find((s) => s.id === id)).map((s) => (s ? slotLabel(s) : t("surcharges.slotGone")));
      return names.join(", ");
    }
    return t("surcharges.kind_sameDay");
  };

  /* ------------------------------------------------------------ editor */
  const [editing, setEditing] = useState<Surcharge>(blank);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const isNew = !draft.surcharges.some((f) => f.id === editing.id);
  const edit = (patch: Partial<Surcharge>) => setEditing((e) => ({ ...e, ...patch }));

  const openEditor = (f?: Surcharge) => {
    setEditing(f ? JSON.parse(JSON.stringify(f)) : blank());
    setEditErrors({});
    openModal("fee-modal");
  };

  const saveFee = () => {
    const errs: Record<string, string> = {};
    if (!editing.label.trim()) errs.label = t("surcharges.errLabel");
    if (!editing.amount || !/^\d{1,7}(\.\d{1,2})?$/.test(editing.amount.trim()) || Number(editing.amount) <= 0) errs.amount = t("surcharges.errAmount");
    if (editing.kind === "weekday" && !editing.weekdays.length) errs.when = t("surcharges.errWeekdays");
    if (editing.kind === "date" && !editing.dates.length) errs.when = t("surcharges.errDates");
    if (editing.kind === "slot" && !editing.slotIds.length) errs.when = t("surcharges.errSlots");
    if (editing.methods !== "all" && !editing.methods.length) errs.methods = t("surcharges.errMethods");
    setEditErrors(errs);
    if (Object.keys(errs).length) return;
    const clean: Surcharge = {
      ...editing,
      label: editing.label.trim(),
      amount: editing.amount.trim(),
      // Keep only the fields used by the chosen kind.
      weekdays: editing.kind === "weekday" ? editing.weekdays : [],
      dates: editing.kind === "date" ? [...editing.dates].sort() : [],
      slotIds: editing.kind === "slot" ? editing.slotIds : [],
      // The server sets the variant on save.
      variantId: normalizeAmount(editing.amount) === normalizeAmount(draft.surcharges.find((f) => f.id === editing.id)?.amount) ? editing.variantId : null,
    };
    update((d) => {
      const i = d.surcharges.findIndex((x) => x.id === clean.id);
      if (i >= 0) d.surcharges[i] = clean;
      else d.surcharges.push(clean);
    });
    closeModal("fee-modal");
  };

  const productUrl = feeProduct.id ? `shopify://admin/products/${feeProduct.id}` : null;

  return (
    <Page title={t("surcharges.title")} subtitle={t("surcharges.subtitle")} backTo={{ href: "/app/settings", label: t("nav.settings") }}>
      <SettingsChrome form={form} fieldLabels={{ surcharges: t("surcharges.title"), surchargeTaxable: t("surcharges.taxHeading") }} />
      {!allowed ? <Locked plan="Pro" label={t("surcharges.locked")} upgradeLabel={t("common.upgrade")} /> : null}

      <s-banner tone="info" heading={t("surcharges.howHeading")}>
        <s-stack gap="small-200">
          <s-text>{t("surcharges.howLine")}</s-text>
          <s-text>{t("surcharges.howBefore")}</s-text>
        </s-stack>
      </s-banner>

      <Section heading={t("surcharges.listHeading")} id={fieldId("surcharges")}>
        <s-stack gap="base">
          <s-stack direction="inline" gap="small-200">
            <Button variant="primary" disabled={!allowed} onClick={() => openEditor()}>
              {t("surcharges.add")}
            </Button>
          </s-stack>
          {draft.surcharges.length ? (
            <s-table>
              <s-table-header-row>
                <s-table-header>{t("surcharges.name")}</s-table-header>
                <s-table-header>{t("surcharges.when")}</s-table-header>
                <s-table-header>{t("surcharges.appliesTo")}</s-table-header>
                <s-table-header>{t("surcharges.amountShort")}</s-table-header>
                <s-table-header>{t("common.actions")}</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {draft.surcharges.map((f, i) => {
                  const err = form.errorFor(`surcharges.${i}`);
                  return (
                    <s-table-row key={f.id}>
                      <s-table-cell>
                        <div id={fieldId(`surcharges.${i}`)} data-path={`surcharges.${i}`}>
                          <s-stack gap="small-100">
                            <s-text type="strong">{f.label}</s-text>
                            {err ? <s-text tone="critical">{err}</s-text> : null}
                          </s-stack>
                        </div>
                      </s-table-cell>
                      <s-table-cell>
                        <s-stack gap="small-100">
                          <s-text>{t(`surcharges.kind_${f.kind}`)}</s-text>
                          {f.kind !== "sameDay" ? <s-text color="subdued">{whenText(f)}</s-text> : null}
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>{f.methods === "all" ? t("surcharges.allMethods") : f.methods.map(label).join(", ")}</s-table-cell>
                      <s-table-cell>{normalizeAmount(f.amount) ? money(f.amount) : f.amount}</s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small-200">
                          <Button variant="tertiary" icon="edit" disabled={!allowed} accessibilityLabel={t("surcharges.editNamed", { name: f.label })} onClick={() => openEditor(f)}>
                            {""}
                          </Button>
                          <Button
                            variant="tertiary"
                            tone="critical"
                            icon="delete"
                            accessibilityLabel={t("surcharges.deleteNamed", { name: f.label })}
                            onClick={() => update((d) => (d.surcharges = d.surcharges.filter((x) => x.id !== f.id)))}
                          >
                            {""}
                          </Button>
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          ) : (
            <s-text color="subdued">{t("surcharges.none")}</s-text>
          )}
        </s-stack>
      </Section>

      <Section heading={t("surcharges.taxHeading")}>
        <Switch
          id={fieldId("surchargeTaxable")}
          label={t("surcharges.taxable")}
          details={t("surcharges.taxableHelp")}
          checked={draft.surchargeTaxable}
          disabled={!allowed}
          onChange={(v) => update((d) => (d.surchargeTaxable = v))}
        />
      </Section>

      <Section heading={t("surcharges.productHeading")}>
        <s-stack gap="small-300">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            {feeProduct.id ? (
              <s-badge tone="success">{t("surcharges.productReady")}</s-badge>
            ) : (
              <s-badge>{t("surcharges.productLater")}</s-badge>
            )}
            {productUrl ? (
              <s-link href={productUrl} target="_blank">
                {t("surcharges.productOpen")}
              </s-link>
            ) : null}
          </s-stack>
          {feeProduct.id && (!feeProduct.active || feeProduct.published === false) ? (
            <s-banner tone="warning">{t("surcharges.productNotLive")}</s-banner>
          ) : null}
          <s-text color="subdued">{t("surcharges.productHelp")}</s-text>
          <s-text color="subdued">{t("surcharges.productHidden")}</s-text>
        </s-stack>
      </Section>

      <Modal
        id="fee-modal"
        heading={isNew ? t("surcharges.add") : t("surcharges.edit")}
        primary={
          <Button slot="primary-action" variant="primary" onClick={saveFee}>
            {t("common.done")}
          </Button>
        }
        secondary={
          <Button slot="secondary-actions" onClick={() => closeModal("fee-modal")}>
            {t("common.cancel")}
          </Button>
        }
      >
        <s-stack gap="base">
          <TextField
            label={t("surcharges.name")}
            details={t("surcharges.nameHelp")}
            placeholder={t("surcharges.nameExample")}
            maxLength={60}
            value={editing.label}
            error={editErrors.label}
            onChange={(v) => edit({ label: v })}
          />
          <ChoiceList
            label={t("surcharges.whenCharge")}
            value={editing.kind}
            options={[
              { value: "weekday", label: t("surcharges.kind_weekday"), details: t("surcharges.kindWeekdayHelp") },
              { value: "date", label: t("surcharges.kind_date"), details: t("surcharges.kindDateHelp") },
              { value: "slot", label: t("surcharges.kind_slot"), details: t("surcharges.kindSlotHelp") },
              { value: "sameDay", label: t("surcharges.kind_sameDay"), details: t("surcharges.kindSameDayHelp") },
            ]}
            onChange={(v) => edit({ kind: v as Surcharge["kind"] })}
          />

          {editing.kind === "weekday" ? (
            <WeekdayPicker label={t("surcharges.weekdays")} value={editing.weekdays} error={editErrors.when} onChange={(v) => edit({ weekdays: v })} />
          ) : null}

          {editing.kind === "date" ? (
            <s-stack gap="small-200">
              <DateField
                label={t("surcharges.addDate")}
                allow={`${meta.today}--`}
                value={null}
                error={editErrors.when}
                onChange={(v) => v && !editing.dates.includes(v) && edit({ dates: [...editing.dates, v].sort() })}
              />
              {editing.dates.length ? (
                <s-stack direction="inline" gap="small-200">
                  {editing.dates.map((d) => (
                    <s-stack key={d} direction="inline" gap="small-100" alignItems="center">
                      <s-badge>{fmt(d, true)}</s-badge>
                      <Button
                        variant="tertiary"
                        icon="x"
                        accessibilityLabel={t("surcharges.removeDate", { date: fmt(d, true) })}
                        onClick={() => edit({ dates: editing.dates.filter((x) => x !== d) })}
                      >
                        {""}
                      </Button>
                    </s-stack>
                  ))}
                </s-stack>
              ) : (
                <s-text color="subdued">{t("surcharges.noDates")}</s-text>
              )}
            </s-stack>
          ) : null}

          {editing.kind === "slot" ? (
            slots.length ? (
              <MultiChoice
                label={t("surcharges.slots")}
                values={editing.slotIds}
                error={editErrors.when}
                options={slots.map((s) => ({ value: s.id, label: slotLabel(s) }))}
                onChange={(v) => edit({ slotIds: v })}
              />
            ) : (
              <s-banner tone="warning">
                {t("surcharges.noSlots")} <s-link href="/app/settings/capacity">{t("surcharges.setUpSlots")}</s-link>
              </s-banner>
            )
          ) : null}

          {editing.kind === "sameDay" ? <s-text color="subdued">{t("surcharges.sameDayNote")}</s-text> : null}

          <s-stack gap="small-200">
            <Checkbox
              label={t("surcharges.allMethods")}
              checked={editing.methods === "all"}
              onChange={(on) => edit({ methods: on ? "all" : [...METHODS] })}
            />
            {editing.methods !== "all" ? (
              <MultiChoice
                label={t("surcharges.methods")}
                values={editing.methods}
                error={editErrors.methods}
                options={METHODS.map((m) => ({ value: m, label: label(m) }))}
                onChange={(v) => edit({ methods: v as MethodId[] })}
              />
            ) : null}
          </s-stack>

          <MoneyField
            label={t("surcharges.amount", { currency: meta.currency })}
            details={t("surcharges.amountHelp")}
            value={editing.amount || null}
            error={editErrors.amount}
            onChange={(v) => edit({ amount: v ?? "" })}
          />
        </s-stack>
      </Modal>
    </Page>
  );
}
