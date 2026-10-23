import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import {
  areaLabel,
  linesToText,
  newCountryAreas,
  newZone,
  parseRegionCodes,
  postcodeMessage,
  postcodeProblems,
  pruneZoneAreas,
  sameLines,
  testAddress,
  textToLines,
  validateAreas,
  zoneFields,
  zoneHasOverrides,
} from "../../core/areas-ui";
import { hasFeature } from "../../core/publish";
import type { AreaMode, CountryAreas, LeadTime, Settings, Zone } from "../../core/types";
import { CapacityEditor } from "../components/editors";
import { Button, Checkbox, ChoiceList, Locked, MultiChoice, NumberField, Page, Section, Select, Switch, TextField, TimeSelect } from "../components/polaris";
import { SettingsChrome, fieldId, useSettingsForm } from "../components/settings-form";
import { WeekdayPicker, countryName, newId } from "../components/shared";
import { useI18n, useT } from "../i18n/react";
import { shopCountries } from "../services/countries.server";
import { regionsByCountry, regionsFor, type Region } from "../services/regions.server";
import { adminContext, patchSettingsAction, shopMeta } from "../services/settings.server";

type RegionMap = Record<string, Region[]>;

async function loadPage(request: Request) {
  const ctx = await adminContext(request);
  const { countries } = await shopCountries(ctx.admin);
  const s = ctx.settings;
  const lang = ctx.row.primaryLocale;
  const used = [...s.areas.filter((a) => a.mode === "region").map((a) => a.country), ...s.zones.filter((z) => z.regions.length).map((z) => z.country)];
  return {
    meta: shopMeta(ctx),
    countries,
    regions: regionsByCountry(used, lang) as RegionMap,
    delivery: s.methods.delivery,
    initial: { areas: s.areas, zones: s.zones } as Pick<Settings, "areas" | "zones">,
  };
}
type PageData = Awaited<ReturnType<typeof loadPage>>;
type RegionsData = { regionsFor: { country: string; list: Region[] } };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const country = new URL(request.url).searchParams.get("regions");
  if (country) {
    const ctx = await adminContext(request);
    const code = country.toUpperCase();
    return { regionsFor: { country: code, list: regionsFor(code, ctx.row.primaryLocale) } } as RegionsData;
  }
  return loadPage(request);
};

export const action = async ({ request }: ActionFunctionArgs) => patchSettingsAction(request);

function langName(code: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export default function AreasPage() {
  const { meta, countries, regions: initialRegions, delivery, initial } = useLoaderData() as PageData;
  const t = useT();
  const { locale } = useI18n();
  const allowed = hasFeature(meta.plan, "areas");
  const locked = !allowed;
  const form = useSettingsForm(initial, { validate: (d) => validateAreas(d, meta.primaryLocale, t) });
  const { draft, update } = form;

  /* Province lists, fetched per country when first needed. */
  const [regionMap, setRegionMap] = useState<RegionMap>(initialRegions);
  const requested = useRef(new Set(Object.keys(initialRegions)));
  const regionFetcher = useFetcher<RegionsData>();
  const [testCountry, setTestCountry] = useState<string>(draft.areas[0]?.country ?? draft.zones[0]?.country ?? meta.country ?? countries[0] ?? "");
  const needed = useMemo(
    () => [
      ...draft.areas.filter((a) => a.mode === "region").map((a) => a.country),
      ...draft.zones.filter((z) => zoneFields(z, draft.areas.find((a) => a.country === z.country)).regions).map((z) => z.country),
      testCountry,
    ],
    [draft, testCountry],
  );
  const [seenData, setSeenData] = useState(regionFetcher.data);
  if (regionFetcher.data !== seenData) {
    const d = regionFetcher.data;
    setSeenData(d);
    if (d?.regionsFor) setRegionMap((m) => ({ ...m, [d.regionsFor.country]: d.regionsFor.list }));
  }
  useEffect(() => {
    if (regionFetcher.state !== "idle") return;
    const next = needed.find((c) => c && !requested.current.has(c));
    if (!next) return;
    requested.current.add(next);
    regionFetcher.load(`/app/delivery/areas?regions=${next}`);
  }, [needed, regionFetcher, regionFetcher.state]);
  const regionsLoading = (c: string) => !regionMap[c] && regionFetcher.state !== "idle";

  const sortedCountries = useMemo(
    () => countries.map((c) => ({ value: c, label: countryName(c, locale) })).sort((a, b) => a.label.localeCompare(b.label, locale)),
    [countries, locale],
  );
  const unused = sortedCountries.filter((c) => !draft.areas.some((a) => a.country === c.value));
  const [addCountry, setAddCountry] = useState("");
  const addValue = unused.some((c) => c.value === addCountry) ? addCountry : (unused[0]?.value ?? "");

  return (
    <Page title={t("areas.title")} subtitle={t("areas.subtitle")} backTo={{ href: "/app/delivery", label: t("nav.delivery") }}>
      <SettingsChrome form={form} fieldLabels={{ areas: t("areas.title"), zones: t("areas.zonesHeading") }} />
      {locked ? <Locked plan="Pro" label={t("areas.locked")} upgradeLabel={t("common.upgrade")} /> : null}
      {!delivery.enabled ? (
        <s-banner tone="warning">
          {t("areas.deliveryOff")} <s-link href="/app/delivery">{t("nav.delivery")}</s-link>
        </s-banner>
      ) : null}

      <Section heading={t("areas.whereHeading")}>
        <s-stack gap="base">
          <s-text color="subdued">{t("areas.whereHelp")}</s-text>
          {!draft.areas.length ? <s-text>{t("areas.noCountries")}</s-text> : null}
          {unused.length ? (
            <s-stack direction="inline" gap="base" alignItems="end">
              <Select label={t("areas.addCountry")} value={addValue} options={unused} disabled={locked} onChange={setAddCountry} />
              <Button
                icon="plus"
                disabled={locked || !addValue}
                onClick={() => {
                  update((d) => {
                    d.areas.push(newCountryAreas(addValue));
                  });
                  setTestCountry(addValue);
                }}
              >
                {t("areas.add")}
              </Button>
            </s-stack>
          ) : null}
        </s-stack>
      </Section>

      {draft.areas.map((ca, i) => (
        <CountryAreasCard
          key={ca.country}
          index={i}
          value={ca}
          locked={locked}
          locales={meta.locales}
          primaryLocale={meta.primaryLocale}
          regions={regionMap[ca.country]}
          regionsLoading={regionsLoading(ca.country)}
          errorFor={form.errorFor}
          onChange={(next) =>
            update((d) => {
              d.areas[i] = next;
              pruneZoneAreas(d);
            })
          }
          onRemove={() =>
            update((d) => {
              d.areas.splice(i, 1);
              pruneZoneAreas(d);
            })
          }
        />
      ))}

      <Section heading={t("areas.zonesHeading")} id={fieldId("zones")}>
        <s-stack gap="base">
          <s-text color="subdued">{t("areas.zonesHelp")}</s-text>
          <s-text color="subdued">{t("areas.zonesOrderHelp")}</s-text>
          {!draft.zones.length ? <s-text>{t("areas.noZones")}</s-text> : null}
          {draft.zones.map((z, i) => (
            <ZoneCard
              key={z.id}
              index={i}
              count={draft.zones.length}
              value={z}
              locked={locked}
              countries={sortedCountries}
              countryAreas={draft.areas.find((a) => a.country === z.country)}
              regions={regionMap[z.country]}
              regionsLoading={regionsLoading(z.country)}
              delivery={delivery}
              capacityAllowed={hasFeature(meta.plan, "capacity")}
              slotsEnabled={delivery.slotsEnabled && hasFeature(meta.plan, "slots")}
              errorFor={form.errorFor}
              onChange={(next) => update((d) => (d.zones[i] = next))}
              onMove={(dir) =>
                update((d) => {
                  const j = i + dir;
                  if (j < 0 || j >= d.zones.length) return;
                  [d.zones[i], d.zones[j]] = [d.zones[j], d.zones[i]];
                })
              }
              onRemove={() => update((d) => void d.zones.splice(i, 1))}
            />
          ))}
          <s-box>
            <Button
              icon="plus"
              disabled={locked}
              onClick={() =>
                update((d) => {
                  const country = d.areas[0]?.country ?? meta.country ?? countries[0] ?? "US";
                  d.zones.push(newZone(newId("zone_"), t("areas.zoneDefaultName", { count: d.zones.length + 1 }), country));
                })
              }
            >
              {t("areas.addZone")}
            </Button>
          </s-box>
        </s-stack>
      </Section>

      <TestBox
        draft={draft}
        country={testCountry}
        onCountry={setTestCountry}
        countries={sortedCountries}
        regions={regionMap[testCountry]}
      />
    </Page>
  );
}

/* ------------------------------------------------------------ pieces */

type ErrorFor = (path: string) => string | undefined;

/** Textarea of postcode rules with live checking. Keeps the merchant's typing (blank lines) locally. */
function PostcodeLines(p: { path: string; label: string; details: string; value: string[]; onChange: (v: string[]) => void; disabled: boolean; errorFor: ErrorFor }) {
  const t = useT();
  const [text, setText] = useState(() => linesToText(p.value));
  const [prev, setPrev] = useState(p.value);
  if (prev !== p.value) {
    // Saved, discarded or changed elsewhere: show the stored rules unless they match what's typed.
    setPrev(p.value);
    if (!sameLines(text, p.value)) setText(linesToText(p.value));
  }
  const live = postcodeMessage(textToLines(text), t);
  const count = postcodeProblems(textToLines(text)).valid;
  return (
    <s-stack gap="small-200">
      <TextField
        id={fieldId(p.path)}
        label={p.label}
        details={p.details}
        multiline={6}
        value={text}
        disabled={p.disabled}
        error={live ?? p.errorFor(p.path)}
        placeholder={"10115\nSW1*\n1000-1999"}
        onChange={(v) => {
          setText(v);
          p.onChange(textToLines(v));
        }}
      />
      <s-text color="subdued">{t("areas.ruleCount", { count })}</s-text>
    </s-stack>
  );
}

/** Pick provinces from a list, or type codes when there's no list for the country. */
function RegionPicker(p: {
  id: string;
  label: string;
  details?: string;
  regions: Region[] | undefined;
  loading: boolean;
  value: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
  error?: string;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [text, setText] = useState(p.value.join(", "));
  if (p.loading) return <s-text color="subdued">{t("common.loading")}</s-text>;
  if (!p.regions?.length) {
    return (
      <TextField
        id={p.id}
        label={p.label}
        details={t("areas.regionCodesHelp")}
        value={text}
        disabled={p.disabled}
        error={p.error}
        placeholder="CA, NY"
        onChange={(v) => {
          setText(v);
          p.onChange(parseRegionCodes(v));
        }}
      />
    );
  }
  const shown = p.regions.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.code.toLowerCase() === q.toLowerCase());
  const known = new Set(p.regions.map((r) => r.code));
  const extra = p.value.filter((c) => !known.has(c));
  return (
    <s-stack gap="small-200" id={p.id}>
      <s-text type="strong">{p.label}</s-text>
      {p.details ? <s-text color="subdued">{p.details}</s-text> : null}
      <s-text color="subdued">{t("areas.regionsSelected", { count: p.value.length })}</s-text>
      {p.regions.length > 12 ? (
        <TextField label={t("areas.searchRegions")} type="search" value={q} onChange={setQ} labelAccessibilityVisibility="exclusive" placeholder={t("areas.searchRegions")} />
      ) : null}
      <s-box padding="small-200" borderWidth="base" borderRadius="base">
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          <s-stack gap="small-100">
            {shown.map((r) => (
              <Checkbox
                key={r.code}
                label={`${r.name} (${r.code})`}
                checked={p.value.includes(r.code)}
                disabled={p.disabled}
                onChange={(on) => p.onChange(on ? [...p.value, r.code] : p.value.filter((x) => x !== r.code))}
              />
            ))}
            {extra.map((c) => (
              <Checkbox key={c} label={c} checked disabled={p.disabled} onChange={() => p.onChange(p.value.filter((x) => x !== c))} />
            ))}
          </s-stack>
        </div>
      </s-box>
      {p.error ? <s-text tone="critical">{p.error}</s-text> : null}
    </s-stack>
  );
}

function CountryAreasCard(p: {
  index: number;
  value: CountryAreas;
  locked: boolean;
  locales: string[];
  primaryLocale: string;
  regions: Region[] | undefined;
  regionsLoading: boolean;
  errorFor: ErrorFor;
  onChange: (v: CountryAreas) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const ca = p.value;
  const path = `areas.${p.index}`;
  const name = countryName(ca.country, locale);
  const set = (fn: (c: CountryAreas) => void) => {
    const next: CountryAreas = JSON.parse(JSON.stringify(ca));
    fn(next);
    p.onChange(next);
  };
  const otherLocales = p.locales.filter((l) => l !== p.primaryLocale);
  const countryError = p.errorFor(`${path}.country`);

  return (
    <Section heading={name} id={fieldId(path)}>
      <s-stack gap="base">
        {countryError ? <s-text tone="critical">{countryError}</s-text> : null}
        <ChoiceList
          label={t("areas.modeLabel", { country: name })}
          value={ca.mode}
          disabled={p.locked}
          options={[
            { value: "postcode", label: t("areas.modePostcode"), details: t("areas.modePostcodeHelp") },
            { value: "area", label: t("areas.modeArea"), details: t("areas.modeAreaHelp") },
            { value: "region", label: t("areas.modeRegion"), details: t("areas.modeRegionHelp") },
            { value: "none", label: t("areas.modeNone"), details: t("areas.modeNoneHelp") },
          ]}
          onChange={(v) => set((c) => (c.mode = v as AreaMode))}
        />

        {ca.mode === "postcode" ? (
          <PostcodeLines
            path={`${path}.postcodes`}
            label={t("areas.postcodesLabel")}
            details={t("areas.postcodesHelp")}
            value={ca.postcodes}
            disabled={p.locked}
            errorFor={p.errorFor}
            onChange={(v) => set((c) => (c.postcodes = v))}
          />
        ) : null}

        {ca.mode === "area" ? (
          <s-stack gap="small-300" id={fieldId(`${path}.areas`)}>
            <s-text type="strong">{t("areas.areasLabel")}</s-text>
            <s-text color="subdued">{t("areas.areasHelp")}</s-text>
            {ca.areas.map((a, j) => (
              <s-box key={a.id} padding="small-300" borderWidth="base" borderRadius="base">
                <s-stack direction="inline" gap="base" alignItems="end" justifyContent="space-between">
                  <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
                    <TextField
                      id={fieldId(`${path}.areas.${j}.names`)}
                      label={otherLocales.length ? t("areas.areaNameIn", { language: langName(p.primaryLocale, locale) }) : t("areas.areaName")}
                      value={a.names[p.primaryLocale] ?? ""}
                      maxLength={60}
                      disabled={p.locked}
                      error={p.errorFor(`${path}.areas.${j}.names`)}
                      onChange={(v) => set((c) => (c.areas[j].names[p.primaryLocale] = v))}
                    />
                    {otherLocales.map((l) => (
                      <TextField
                        key={l}
                        label={t("areas.areaNameIn", { language: langName(l, locale) })}
                        details={t("areas.optional")}
                        value={a.names[l] ?? ""}
                        maxLength={60}
                        disabled={p.locked}
                        onChange={(v) =>
                          set((c) => {
                            if (v) c.areas[j].names[l] = v;
                            else delete c.areas[j].names[l];
                          })
                        }
                      />
                    ))}
                  </s-grid>
                  <Button
                    variant="tertiary"
                    tone="critical"
                    icon="delete"
                    disabled={p.locked}
                    accessibilityLabel={t("areas.removeArea", { name: areaLabel(a, p.primaryLocale) })}
                    onClick={() => set((c) => void c.areas.splice(j, 1))}
                  >
                    {""}
                  </Button>
                </s-stack>
              </s-box>
            ))}
            {p.errorFor(`${path}.areas`) && !ca.areas.length ? <s-text tone="critical">{p.errorFor(`${path}.areas`)}</s-text> : null}
            <s-box>
              <Button icon="plus" disabled={p.locked} onClick={() => set((c) => void c.areas.push({ id: newId("area_"), names: {} }))}>
                {t("areas.addArea")}
              </Button>
            </s-box>
          </s-stack>
        ) : null}

        {ca.mode === "region" ? (
          <RegionPicker
            key={ca.country}
            id={fieldId(`${path}.regions`)}
            label={t("areas.regionsLabel")}
            details={t("areas.regionsHelp")}
            regions={p.regions}
            loading={p.regionsLoading}
            value={ca.regions}
            disabled={p.locked}
            error={p.errorFor(`${path}.regions`)}
            onChange={(v) => set((c) => (c.regions = v))}
          />
        ) : null}

        {ca.mode !== "none" ? (
          <Switch
            label={ca.mode === "postcode" ? t("areas.askFirstPostcode") : ca.mode === "area" ? t("areas.askFirstArea") : t("areas.askFirstRegion")}
            details={t("areas.askFirstHelp")}
            checked={ca.askFirst}
            disabled={p.locked}
            onChange={(v) => set((c) => (c.askFirst = v))}
          />
        ) : null}

        <s-box>
          <Button variant="tertiary" tone="critical" icon="delete" disabled={p.locked} onClick={p.onRemove}>
            {t("areas.removeCountry", { country: name })}
          </Button>
        </s-box>
      </s-stack>
    </Section>
  );
}

function ZoneCard(p: {
  index: number;
  count: number;
  value: Zone;
  locked: boolean;
  countries: { value: string; label: string }[];
  countryAreas: CountryAreas | undefined;
  regions: Region[] | undefined;
  regionsLoading: boolean;
  delivery: Settings["methods"]["delivery"];
  capacityAllowed: boolean;
  slotsEnabled: boolean;
  errorFor: ErrorFor;
  onChange: (z: Zone) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const z = p.value;
  const path = `zones.${p.index}`;
  const set = (fn: (z: Zone) => void) => {
    const next: Zone = JSON.parse(JSON.stringify(z));
    fn(next);
    p.onChange(next);
  };
  const fields = zoneFields(z, p.countryAreas);
  const own = zoneHasOverrides(z);
  const ds = p.delivery.schedule;
  const lead: LeadTime = z.schedule.lead ?? ds.lead;
  const countryOptions = p.countries.some((c) => c.value === z.country) ? p.countries : [{ value: z.country, label: countryName(z.country, locale) }, ...p.countries];
  const matchError = p.errorFor(`${path}.match`);

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" id={fieldId(path)}>
      <s-stack gap="base">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-heading>{t("areas.zoneNumber", { count: p.index + 1, name: z.name || t("areas.unnamedZone") })}</s-heading>
          <s-stack direction="inline" gap="small-200">
            <Button variant="tertiary" icon="arrow-up" accessibilityLabel={t("areas.moveZoneUp", { name: z.name })} disabled={p.locked || p.index === 0} onClick={() => p.onMove(-1)}>
              {""}
            </Button>
            <Button
              variant="tertiary"
              icon="arrow-down"
              accessibilityLabel={t("areas.moveZoneDown", { name: z.name })}
              disabled={p.locked || p.index === p.count - 1}
              onClick={() => p.onMove(1)}
            >
              {""}
            </Button>
            <Button variant="tertiary" tone="critical" icon="delete" accessibilityLabel={t("areas.removeZone", { name: z.name })} disabled={p.locked} onClick={p.onRemove}>
              {""}
            </Button>
          </s-stack>
        </s-stack>

        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
          <TextField
            id={fieldId(`${path}.name`)}
            label={t("areas.zoneName")}
            details={t("areas.zoneNameHelp")}
            value={z.name}
            maxLength={60}
            disabled={p.locked}
            error={p.errorFor(`${path}.name`)}
            onChange={(v) => set((x) => (x.name = v))}
          />
          <Select
            label={t("areas.zoneCountry")}
            value={z.country}
            options={countryOptions}
            disabled={p.locked}
            onChange={(v) =>
              set((x) => {
                x.country = v;
                x.areas = [];
                x.regions = [];
              })
            }
          />
        </s-grid>

        <s-text color="subdued">{t("areas.zoneMatchHelp")}</s-text>
        {matchError ? (
          <s-text tone="critical" id={fieldId(`${path}.match`)}>
            {matchError}
          </s-text>
        ) : null}

        {fields.postcodes ? (
          <PostcodeLines
            path={`${path}.postcodes`}
            label={t("areas.zonePostcodes")}
            details={t("areas.postcodesHelp")}
            value={z.postcodes}
            disabled={p.locked}
            errorFor={p.errorFor}
            onChange={(v) => set((x) => (x.postcodes = v))}
          />
        ) : null}

        {fields.areas ? (
          <MultiChoice
            id={fieldId(`${path}.areas`)}
            label={t("areas.zoneAreas")}
            values={z.areas}
            disabled={p.locked}
            options={(p.countryAreas?.areas ?? []).map((a) => ({ value: a.id, label: areaLabel(a, locale.split("-")[0]) || t("areas.unnamedArea") }))}
            onChange={(v) => set((x) => (x.areas = v))}
          />
        ) : null}

        {fields.regions ? (
          <RegionPicker
            key={z.country}
            id={fieldId(`${path}.regions`)}
            label={t("areas.zoneRegions")}
            regions={p.regions}
            loading={p.regionsLoading}
            value={z.regions}
            disabled={p.locked}
            onChange={(v) => set((x) => (x.regions = v))}
          />
        ) : null}

        <Switch
          label={t("areas.zoneOwnRules")}
          details={t("areas.zoneOwnRulesHelp")}
          checked={own}
          disabled={p.locked}
          onChange={(on) =>
            set((x) => {
              if (on) {
                x.schedule = { weekdays: [...ds.weekdays], lead: { ...ds.lead }, cutoff: JSON.parse(JSON.stringify(ds.cutoff)) };
              } else {
                x.schedule = {};
                x.capacity = null;
              }
            })
          }
        />

        {own ? (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="base">
              <WeekdayPicker
                id={fieldId(`${path}.schedule.weekdays`)}
                label={t("areas.zoneDays")}
                value={z.schedule.weekdays ?? ds.weekdays}
                error={p.errorFor(`${path}.schedule.weekdays`)}
                onChange={(v) => set((x) => (x.schedule.weekdays = v))}
              />
              <s-stack direction="inline" gap="base" alignItems="end">
                <NumberField
                  id={fieldId(`${path}.schedule.lead.amount`)}
                  label={t("schedule.leadAmount")}
                  details={t("schedule.leadHelp")}
                  min={0}
                  max={lead.unit === "hours" ? 720 : 365}
                  value={lead.amount}
                  disabled={p.locked}
                  error={p.errorFor(`${path}.schedule.lead`)}
                  onChange={(v) => set((x) => (x.schedule.lead = { ...lead, amount: v ?? 0 }))}
                />
                <Select
                  label={t("schedule.leadUnit")}
                  value={lead.unit}
                  disabled={p.locked}
                  options={[
                    { value: "days", label: t("schedule.days") },
                    { value: "hours", label: t("schedule.hours") },
                  ]}
                  onChange={(v) => set((x) => (x.schedule.lead = { ...lead, unit: v as "days" | "hours" }))}
                />
                <TimeSelect
                  label={t("schedule.cutoffTime")}
                  allowEmpty={t("schedule.noCutoff")}
                  locale={locale}
                  disabled={p.locked}
                  value={(z.schedule.cutoff ?? ds.cutoff).time}
                  onChange={(v) => set((x) => (x.schedule.cutoff = { time: v, perWeekday: null }))}
                />
              </s-stack>
              {(z.schedule.cutoff ?? ds.cutoff).perWeekday ? <s-text color="subdued">{t("areas.zoneCutoffPerWeekday")}</s-text> : null}

              <Checkbox
                label={t("areas.zoneOwnLimit")}
                details={t("areas.zoneOwnLimitHelp")}
                checked={z.capacity !== null}
                disabled={p.locked}
                onChange={(on) => set((x) => (x.capacity = on ? JSON.parse(JSON.stringify(p.delivery.capacity)) : null))}
              />
              {z.capacity ? (
                <CapacityEditor
                  modalPrefix={`zone-${z.id}`}
                  path={`${path}.capacity`}
                  value={z.capacity}
                  errorFor={p.errorFor}
                  slotsEnabled={p.slotsEnabled}
                  capacityAllowed={p.capacityAllowed}
                  onChange={(c) => set((x) => (x.capacity = c))}
                />
              ) : null}
            </s-stack>
          </s-box>
        ) : null}
      </s-stack>
    </s-box>
  );
}

/** Try an address against the unsaved draft, with the storefront's own rules. */
function TestBox(p: {
  draft: Pick<Settings, "areas" | "zones">;
  country: string;
  onCountry: (c: string) => void;
  countries: { value: string; label: string }[];
  regions: Region[] | undefined;
}) {
  const t = useT();
  const { locale } = useI18n();
  const [postcode, setPostcode] = useState("");
  const [areaId, setAreaId] = useState("");
  const [region, setRegion] = useState("");
  const ca = p.draft.areas.find((a) => a.country === p.country);
  const zonesHere = p.draft.zones.filter((z) => z.country === p.country);
  const showArea = (ca?.mode === "area" && ca.areas.length > 0) || zonesHere.some((z) => z.areas.length);
  const showRegion = ca?.mode === "region" || zonesHere.some((z) => z.regions.length);
  const showPostcode = !ca || ca.mode === "postcode" || ca.mode === "none" || zonesHere.some((z) => z.postcodes.length);
  const r = testAddress(p.draft, {
    country: p.country,
    postcode: showPostcode ? postcode : null,
    areaId: showArea ? areaId : null,
    region: showRegion ? region : null,
  });
  const lang = locale.split("-")[0];

  return (
    <Section heading={t("areas.testHeading")}>
      <s-stack gap="base">
        <s-text color="subdued">{t("areas.testHelp")}</s-text>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
          <Select label={t("areas.testCountry")} value={p.country} options={p.countries} onChange={p.onCountry} />
          {showPostcode ? <TextField label={t("areas.testPostcode")} value={postcode} onChange={setPostcode} maxLength={20} /> : null}
          {showArea ? (
            <Select
              label={t("areas.testArea")}
              value={areaId}
              options={[{ value: "", label: t("areas.testPick") }, ...(ca?.areas ?? []).map((a) => ({ value: a.id, label: areaLabel(a, lang) }))]}
              onChange={setAreaId}
            />
          ) : null}
          {showRegion ? (
            p.regions?.length ? (
              <Select
                label={t("areas.testRegion")}
                value={region}
                options={[{ value: "", label: t("areas.testPick") }, ...p.regions.map((x) => ({ value: x.code, label: x.name }))]}
                onChange={setRegion}
              />
            ) : (
              <TextField label={t("areas.testRegion")} details={t("areas.testRegionCode")} value={region} onChange={setRegion} maxLength={10} />
            )
          ) : null}
        </s-grid>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-text type="strong">{t("areas.testDelivered")}</s-text>
          {r.covered === false ? (
            <s-badge tone="critical">{t("areas.testNo")}</s-badge>
          ) : (
            <s-badge tone="success">{t("areas.testYes")}</s-badge>
          )}
          {r.covered === null ? <s-text color="subdued">{t("areas.testNoLimits")}</s-text> : null}
        </s-stack>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-text type="strong">{t("areas.testZone")}</s-text>
          {r.zone ? <s-badge tone="info">{r.zone.name}</s-badge> : <s-text color="subdued">{t("areas.testNoZone")}</s-text>}
        </s-stack>
      </s-stack>
    </Section>
  );
}
