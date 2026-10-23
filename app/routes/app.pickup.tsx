/**
 * Pickup: on/off, pickup hours for all locations, the pickup locations (each can have its own
 * hours, limits and days off), who can choose pickup, and a live preview.
 */
import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { hasFeature, PLAN_LOCATION_LIMIT } from "../../core/publish";
import type { Location, MethodSettings, Settings } from "../../core/types";
import { CapacityEditor, ScheduleEditor } from "../components/editors";
import { MethodPreview } from "../components/live-preview";
import { Button, Checkbox, closeModal, Locked, Modal, MoneyField, openModal, Page, Section, Select, Switch, TextField } from "../components/polaris";
import { SettingsChrome, fieldId, useSettingsForm } from "../components/settings-form";
import { CountryPicker, newId, useMethodLabel } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { shopCountries } from "../services/countries.server";
import { fetchShopifyLocations, type ShopifyLocation } from "../services/locations.server";
import { adminContext, patchSettingsAction, previewData, shopMeta } from "../services/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await adminContext(request);
  const { countries, markets } = await shopCountries(ctx.admin);
  let timeZones: string[] = [];
  try {
    timeZones = Intl.supportedValuesOf("timeZone");
  } catch {
    timeZones = [];
  }
  const s = ctx.settings;
  const daysOff: Record<string, number> = {};
  for (const l of s.locations) daysOff[l.id] = s.closures.filter((c) => c.locations !== "all" && c.locations.includes(l.id) && (c.yearly || c.end >= ctx.today)).length;
  return {
    meta: shopMeta(ctx),
    ...previewData(ctx),
    countries,
    markets,
    timeZones,
    daysOff,
    full: s,
    initial: { methods: s.methods, locations: s.locations } as Pick<Settings, "methods" | "locations">,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = (await request.clone().json()) as { intent?: string };
  if (body.intent === "importShopify") {
    const ctx = await adminContext(request);
    try {
      return { ok: true as const, intent: "importShopify" as const, locations: await fetchShopifyLocations(ctx.admin) };
    } catch (e) {
      console.error(`[pickup] import ${ctx.shop}`, e);
      return { ok: false as const, intent: "importShopify" as const, locations: [] as ShopifyLocation[] };
    }
  }
  return patchSettingsAction(request);
};

const DELETE_MODAL = "loc-delete";
const IMPORT_MODAL = "loc-import";

function languageName(code: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export default function PickupPage() {
  const d = useLoaderData<typeof loader>();
  const { meta, countries, markets, timeZones } = d;
  const t = useT();
  const label = useMethodLabel();
  const form = useSettingsForm(d.initial, {
    validate: (x) => (Object.values(x.methods).some((m) => m.enabled) ? [] : [{ path: "methods", message: t("methods.atLeastOne") }]),
  });
  const { draft, update } = form;
  const m = draft.methods.pickup;
  const set = (fn: (m: MethodSettings) => void) => update((x) => fn(x.methods.pickup));
  const limit = PLAN_LOCATION_LIMIT[meta.plan];
  const atLimit = limit !== null && draft.locations.length >= limit;
  const [open, setOpen] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const importer = useFetcher<typeof action>();
  const importing = importer.state !== "idle";
  const imported = importer.data && "intent" in importer.data && importer.data.intent === "importShopify" ? importer.data : null;

  useEffect(() => {
    const hit = form.issues.map((i) => /^locations\.(\d+)/.exec(i.path)).find(Boolean);
    const loc = hit ? draft.locations[Number(hit[1])] : undefined;
    if (loc) setOpen(loc.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.issues]);

  useEffect(() => {
    if (imported && importer.state === "idle") openModal(IMPORT_MODAL);
  }, [imported, importer.state]);

  const blank = (): Location => ({ id: newId("loc_"), shopifyLocationId: null, name: "", address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null });
  const add = (loc: Location) => {
    update((x) => void x.locations.push(loc));
    setOpen(loc.id);
  };
  const fromShopify = (s: ShopifyLocation): Location => ({
    ...blank(),
    shopifyLocationId: s.id,
    name: s.name.slice(0, 100),
    address: s.address,
    instructions: s.instructions ? { [meta.primaryLocale]: s.instructions.slice(0, 1000) } : {},
  });
  const linked = new Set(draft.locations.map((l) => l.shopifyLocationId).filter(Boolean));
  const unlinked = (imported?.locations ?? []).filter((s) => !linked.has(s.id));
  const deleting = draft.locations.find((l) => l.id === toDelete);
  const fieldLabels = { methods: label("pickup"), ...Object.fromEntries(draft.locations.map((l, i) => [`locations.${i}`, l.name || t("locations.untitled")])) };
  const capacityAllowed = hasFeature(meta.plan, "capacity");

  const addButton = (
    <Button variant="primary" icon="plus" disabled={atLimit} onClick={() => add(blank())}>
      {t("locations.add")}
    </Button>
  );
  const importButton = (
    <Button icon="import" loading={importing} onClick={() => importer.submit({ intent: "importShopify" }, { method: "post", encType: "application/json" })}>
      {t("locations.import")}
    </Button>
  );

  return (
    <Page title={t("pickup.title")} subtitle={t("pickup.subtitle")}>
      <SettingsChrome form={form} fieldLabels={fieldLabels} />

      <Section heading={t("delivery.onOff", { method: label("pickup") })} id={fieldId("methods.pickup")}>
        <Switch label={t("methods.offer", { method: label("pickup") })} details={t("pickup.switchHelp")} checked={m.enabled} onChange={(v) => set((x) => (x.enabled = v))} />
      </Section>

      {m.enabled ? (
        <>
          <Section heading={t("pickup.locationsHeading")}>
            <s-stack gap="base">
              <s-text color="subdued">{draft.locations.length ? t("pickup.locationsHelp") : t("pickup.noLocationsHelp")}</s-text>
              {atLimit && limit !== null ? <Locked plan={limit === 1 ? "Starter" : "Pro"} label={t("locations.limitReached", { count: limit })} upgradeLabel={t("common.upgrade")} /> : null}
              <s-stack direction="inline" gap="base">
                {addButton}
                {importButton}
              </s-stack>
            </s-stack>
          </Section>
          {draft.locations.map((loc, index) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              index={index}
              expanded={open === loc.id}
              onToggle={() => setOpen(open === loc.id ? null : loc.id)}
              onDelete={() => {
                setToDelete(loc.id);
                openModal(DELETE_MODAL);
              }}
              update={(fn) => update((x) => fn(x.locations[index]))}
              errorFor={form.errorFor}
              meta={meta}
              countries={countries}
              markets={markets}
              timeZones={timeZones}
              pickup={{ schedule: m.schedule, capacity: m.capacity, slotsEnabled: m.slotsEnabled }}
              daysOff={d.daysOff[loc.id] ?? 0}
            />
          ))}

          <Section heading={t("pickup.hoursHeading")} id="pickup-hours">
            <s-stack gap="base">
              <s-text color="subdued">{t("pickup.hoursHelp")}</s-text>
              <ScheduleEditor path="methods.pickup.schedule" value={m.schedule} errorFor={form.errorFor} onChange={(s) => set((x) => (x.schedule = s))} />
            </s-stack>
          </Section>

          <Section heading={t("delivery.slotsHeading")}>
            <s-stack gap="base">
              <Switch label={t("methods.slots")} details={t("pickup.slotsHelp")} checked={m.slotsEnabled} onChange={(v) => set((x) => (x.slotsEnabled = v))} />
              <CapacityEditor
                modalPrefix="cap-pickup"
                path="methods.pickup.capacity"
                value={m.capacity}
                errorFor={form.errorFor}
                slotsEnabled={m.slotsEnabled}
                capacityAllowed={capacityAllowed}
                onChange={(c) => set((x) => (x.capacity = c))}
              />
            </s-stack>
          </Section>

          <Section heading={t("delivery.whoHeading")}>
            <s-stack gap="base">
              <s-stack gap="small-200">
                <s-text type="strong">{t("methods.shopperName")}</s-text>
                <s-text color="subdued">{t("methods.shopperNameHelp")}</s-text>
                {meta.locales.map((loc) => (
                  <TextField
                    key={loc}
                    label={`${t("methods.nameIn")} ${loc}`}
                    value={m.names[loc] ?? ""}
                    placeholder={label("pickup")}
                    maxLength={40}
                    onChange={(v) =>
                      set((x) => {
                        if (v) x.names[loc] = v;
                        else delete x.names[loc];
                      })
                    }
                  />
                ))}
              </s-stack>
              <CountryPicker label={t("methods.whereOffered")} value={m.countries} countries={countries} markets={markets} onChange={(v) => set((x) => (x.countries = v))} />
              <Checkbox label={t("methods.dateRequired")} details={t("methods.dateRequiredHelp")} checked={m.dateRequired} onChange={(v) => set((x) => (x.dateRequired = v))} />
              <MoneyField
                id={fieldId("methods.pickup.minOrder")}
                label={t("methods.minOrder", { currency: meta.currency })}
                details={t("methods.minOrderHelp", { method: label("pickup") })}
                value={m.minOrder}
                error={form.errorFor("methods.pickup.minOrder")}
                onChange={(v) => set((x) => (x.minOrder = v))}
              />
            </s-stack>
          </Section>
        </>
      ) : null}

      <Section heading={t("preview.heading")} aside>
        <MethodPreview settings={{ ...d.full, ...draft }} meta={d.preview} holidayItems={d.holidayItems} method="pickup" locationId={draft.locations.find((l) => l.enabled)?.id ?? null} />
      </Section>

      <Modal
        id={DELETE_MODAL}
        heading={t("locations.deleteHeading")}
        primary={
          <Button
            slot="primary-action"
            variant="primary"
            tone="critical"
            onClick={() => {
              if (toDelete) update((x) => (x.locations = x.locations.filter((l) => l.id !== toDelete)));
              setToDelete(null);
              closeModal(DELETE_MODAL);
            }}
          >
            {t("common.delete")}
          </Button>
        }
        secondary={
          <Button slot="secondary-actions" onClick={() => closeModal(DELETE_MODAL)}>
            {t("common.cancel")}
          </Button>
        }
      >
        <s-paragraph>{t("locations.deleteText", { name: deleting?.name || t("locations.untitled") })}</s-paragraph>
      </Modal>

      <Modal
        id={IMPORT_MODAL}
        heading={t("locations.importHeading")}
        secondary={
          <Button slot="secondary-actions" onClick={() => closeModal(IMPORT_MODAL)}>
            {t("common.done")}
          </Button>
        }
      >
        {imported && !imported.ok ? (
          <s-banner tone="critical">{t("locations.importFailed")}</s-banner>
        ) : unlinked.length === 0 ? (
          <s-paragraph>{(imported?.locations.length ?? 0) === 0 ? t("locations.importNone") : t("locations.importAllLinked")}</s-paragraph>
        ) : (
          <s-stack gap="base">
            <s-paragraph>{t("locations.importText")}</s-paragraph>
            {atLimit ? <s-text color="subdued">{t("locations.importLimit")}</s-text> : null}
            {unlinked.map((s) => (
              <s-box key={s.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="inline" gap="base" justifyContent="space-between" alignItems="center">
                  <s-stack gap="small-100">
                    <s-text type="strong">{s.name}</s-text>
                    {s.address ? <s-text color="subdued">{s.address}</s-text> : null}
                  </s-stack>
                  <Button disabled={atLimit} accessibilityLabel={t("locations.importOne", { name: s.name })} onClick={() => add(fromShopify(s))}>
                    {t("locations.importAdd")}
                  </Button>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </Modal>
    </Page>
  );
}

type Meta = ReturnType<typeof useLoaderData<typeof loader>>["meta"];
type Pickup = { schedule: Settings["methods"]["pickup"]["schedule"]; capacity: Settings["methods"]["pickup"]["capacity"]; slotsEnabled: boolean };

function LocationCard(p: {
  loc: Location;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  update: (fn: (l: Location) => void) => void;
  errorFor: (path: string) => string | undefined;
  meta: Meta;
  countries: string[];
  markets: { name: string; countries: string[] }[];
  timeZones: string[];
  pickup: Pickup;
  daysOff: number;
}) {
  const t = useT();
  const { locale } = useI18n();
  const { loc, index, meta, update } = p;
  const path = `locations.${index}`;
  const primary = meta.primaryLocale;
  const [extra, setExtra] = useState<string[]>(() => Object.keys(loc.instructions).filter((l) => l !== primary));
  const shown = [primary, ...extra.filter((l) => l !== primary)];
  const addable = meta.locales.filter((l) => !shown.includes(l));
  const hasError = !!p.errorFor(path);

  const tzOptions = useMemo(() => {
    const list = p.timeZones.includes(loc.timeZone ?? "") || !loc.timeZone ? p.timeZones : [...p.timeZones, loc.timeZone];
    return [{ value: "", label: t("locations.storeTimeZone", { zone: meta.timeZone }) }, ...list.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))];
  }, [p.timeZones, loc.timeZone, meta.timeZone, t]);

  const setText = (lang: string, v: string) =>
    update((l) => {
      if (v) l.instructions[lang] = v;
      else delete l.instructions[lang];
    });

  return (
    <Section id={fieldId(path)}>
      <s-stack gap="base">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
          <s-stack gap="small-100">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-heading>{loc.name || t("locations.untitled")}</s-heading>
              {loc.enabled ? <s-badge tone="success">{t("locations.on")}</s-badge> : <s-badge>{t("locations.off")}</s-badge>}
              {loc.custom ? <s-badge>{t("locations.ownSchedule")}</s-badge> : null}
              {hasError ? <s-badge tone="critical">{t("locations.needsFixing")}</s-badge> : null}
            </s-stack>
            {loc.address ? <s-text color="subdued">{loc.address}</s-text> : null}
          </s-stack>
          <s-stack direction="inline" gap="small-200">
            <Button variant="secondary" onClick={p.onToggle} accessibilityLabel={`${p.expanded ? t("common.done") : t("common.edit")}: ${loc.name || t("locations.untitled")}`}>
              {p.expanded ? t("common.done") : t("common.edit")}
            </Button>
            <Button
              variant="tertiary"
              tone="critical"
              icon="delete"
              accessibilityLabel={t("locations.deleteOne", { name: loc.name || t("locations.untitled") })}
              onClick={p.onDelete}
            >
              {""}
            </Button>
          </s-stack>
        </s-stack>

        {p.expanded ? (
          <>
            <Switch label={t("locations.enabled")} details={t("locations.enabledHelp")} checked={loc.enabled} onChange={(v) => update((l) => (l.enabled = v))} />
            <TextField
              id={fieldId(`${path}.name`)}
              label={t("locations.name")}
              details={t("locations.nameHelp")}
              value={loc.name}
              maxLength={100}
              required
              error={p.errorFor(`${path}.name`)}
              onChange={(v) => update((l) => (l.name = v))}
            />
            <TextField
              id={fieldId(`${path}.address`)}
              label={t("locations.address")}
              value={loc.address}
              multiline={2}
              maxLength={300}
              error={p.errorFor(`${path}.address`)}
              onChange={(v) => update((l) => (l.address = v))}
            />
            <TextField
              id={fieldId(`${path}.mapUrl`)}
              type="url"
              label={t("locations.mapUrl")}
              details={t("locations.mapUrlHelp")}
              value={loc.mapUrl}
              error={p.errorFor(`${path}.mapUrl`)}
              onChange={(v) => update((l) => (l.mapUrl = v.trim()))}
            />

            <s-stack gap="small-200" id={fieldId(`${path}.instructions`)}>
              <s-text type="strong">{t("locations.instructions")}</s-text>
              <s-text color="subdued">{t("locations.instructionsHelp")}</s-text>
              {shown.map((lang) => (
                <s-stack key={lang} direction="inline" gap="small-200" alignItems="end">
                  <s-box inlineSize="100%">
                    <TextField
                      label={t("locations.instructionsIn", { language: languageName(lang, locale) })}
                      value={loc.instructions[lang] ?? ""}
                      multiline={3}
                      maxLength={1000}
                      error={p.errorFor(`${path}.instructions.${lang}`)}
                      onChange={(v) => setText(lang, v)}
                    />
                  </s-box>
                  {lang !== primary ? (
                    <Button
                      variant="tertiary"
                      icon="x"
                      accessibilityLabel={t("locations.removeLanguage", { language: languageName(lang, locale) })}
                      onClick={() => {
                        setExtra(extra.filter((x) => x !== lang));
                        setText(lang, "");
                      }}
                    >
                      {""}
                    </Button>
                  ) : null}
                </s-stack>
              ))}
              {addable.length ? (
                <Select
                  label={t("locations.addLanguage")}
                  value=""
                  options={[{ value: "", label: t("locations.chooseLanguage") }, ...addable.map((l) => ({ value: l, label: languageName(l, locale) }))]}
                  onChange={(v) => v && setExtra([...extra, v])}
                />
              ) : null}
            </s-stack>

            <Select
              id={fieldId(`${path}.timeZone`)}
              label={t("locations.timeZone")}
              details={t("locations.timeZoneHelp")}
              value={loc.timeZone ?? ""}
              options={tzOptions}
              onChange={(v) => update((l) => (l.timeZone = v || null))}
            />

            <CountryPicker
              label={t("locations.countries")}
              value={loc.countries}
              countries={p.countries}
              markets={p.markets}
              onChange={(v) => update((l) => (l.countries = v))}
            />

            <s-divider />
            <Switch
              label={t("locations.ownScheduleToggle")}
              details={loc.custom ? t("locations.ownScheduleOnHelp") : t("locations.ownScheduleOffHelp")}
              checked={!!loc.custom}
              onChange={(v) =>
                update((l) => {
                  l.custom = v ? JSON.parse(JSON.stringify({ schedule: p.pickup.schedule, capacity: p.pickup.capacity })) : null;
                })
              }
            />
            {!loc.custom ? (
              <s-text color="subdued">
                <s-link href="#pickup-hours">{t("locations.storeSchedule")}</s-link>
              </s-text>
            ) : (
              <>
                <s-heading>{t("locations.scheduleHeading")}</s-heading>
                <ScheduleEditor
                  path={`${path}.custom.schedule`}
                  value={loc.custom.schedule}
                  errorFor={p.errorFor}
                  onChange={(s) => update((l) => l.custom && (l.custom.schedule = s))}
                />
                <s-heading>{t("locations.capacityHeading")}</s-heading>
                <CapacityEditor
                  modalPrefix={`cap-${loc.id}`}
                  path={`${path}.custom.capacity`}
                  value={loc.custom.capacity}
                  errorFor={p.errorFor}
                  slotsEnabled={p.pickup.slotsEnabled}
                  capacityAllowed={hasFeature(meta.plan, "capacity")}
                  onChange={(c) => update((l) => l.custom && (l.custom.capacity = c))}
                />
              </>
            )}
            <s-divider />
            <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-text color="subdued">{t("pickup.locationDaysOff", { count: p.daysOff })}</s-text>
              <Button href={`/app/days-off?location=${encodeURIComponent(loc.id)}`} icon="calendar-check">
                {t("pickup.manageDaysOff")}
              </Button>
            </s-stack>
          </>
        ) : null}
      </s-stack>
    </Section>
  );
}
