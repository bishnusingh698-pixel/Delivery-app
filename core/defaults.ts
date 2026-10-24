/**
 * Default settings for a new install and smart defaults per business type.
 */
import { regionDefaults } from "./regions";
import type { Capacity, HolidaySet, MethodId, MethodSettings, Schedule, Settings, Target } from "./types";

export const emptyTarget = (): Target => ({ products: [], variants: [], collections: [], tags: [] });

export const defaultSchedule = (weekdays: number[] = [1, 2, 3, 4, 5]): Schedule => ({
  weekdays: [...weekdays],
  lead: { amount: 1, unit: "days", workingDays: true },
  cutoff: { time: "14:00", perWeekday: null },
  sameDay: { allowed: false, cutoff: "10:00" },
  windowDays: 30,
  notBefore: null,
  todayTomorrowLabels: true,
});

export const defaultCapacity = (): Capacity => ({
  unit: "orders",
  maxPerDay: null,
  maxPerWeekday: null,
  slots: [],
  hideSlotMinutesBefore: 60,
  showSpotsLeftBelow: 3,
  overrides: [],
});

export const defaultMethod = (enabled: boolean, id: MethodId, weekdays?: number[]): MethodSettings => ({
  enabled,
  names: {},
  countries: "all",
  dateRequired: true,
  slotsEnabled: false,
  dateMeaning: id === "shipping" ? "dispatch" : "delivery",
  minOrder: null,
  schedule: defaultSchedule(weekdays),
  capacity: defaultCapacity(),
});

/** The country's public holidays, all methods and locations. */
export const countryHolidaySet = (country: string, region: string | null = null): HolidaySet => ({
  id: `hs_${country.toLowerCase()}${region ? `_${region.toLowerCase()}` : ""}`.slice(0, 30),
  country,
  region,
  methods: "all",
  locations: "all",
  skip: [],
});

export function defaultSettings(country: string | null = null): Settings {
  const region = regionDefaults(country);
  return {
    schemaVersion: 1,
    businessType: null,
    country,
    dateFormat: "auto",
    weekStart: country ? region.weekStart : null,
    holidays: country ? [countryHolidaySet(country)] : [],
    notes: { enabled: false, methods: "all", maxLength: 250 },
    dateMode: "order",
    methods: {
      delivery: defaultMethod(false, "delivery", region.workdays),
      pickup: defaultMethod(false, "pickup", region.workdays),
      shipping: defaultMethod(true, "shipping", region.workdays),
    },
    methodOrder: ["delivery", "pickup", "shipping"],
    defaultMethod: null,
    locations: [],
    closures: [],
    specialDays: [],
    vacation: { enabled: false, start: null, end: null, message: {} },
    areas: [],
    zones: [],
    productRules: {
      exclude: emptyTarget(),
      mixedCart: "any",
      extraLead: [],
      restrictions: [],
      limits: [],
      methodOnly: [],
      collectionProducts: {},
    },
    surcharges: [],
    surchargeTaxable: true,
    checkoutMatching: { enabled: false, renameWithDate: true, renameShipping: false, rateMap: [] },
    widget: {
      theme: "match",
      accent: "#2c6ecb",
      radius: 8,
      input: "calendar",
      compact: false,
      icons: true,
      showSpotsLeft: true,
      preselectEarliest: false,
      drawerSelector: "",
      customCss: "",
      productPageMode: "message",
      position: "before",
      drawer: true,
    },
    texts: {},
    notifications: {
      emailSnippetConfirmed: false,
      calendarFeed: { mode: "order", includeDetails: false },
      flowEnabled: true,
      dailySummary: { enabled: false, hour: 7, day: "tomorrow" },
    },
    tagging: { enabled: true, prefix: "" },
    productionPrepOffsetDays: 0,
    customerChanges: { enabled: false, hoursBefore: 24, maxChanges: 2 },
  };
}

export const BUSINESS_TYPES = ["bakery", "florist", "grocery", "restaurant", "gifts", "furniture", "other"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

/** Smart defaults per business type (applied on the welcome screen). */
/** The working days plus the first day off after them (Mon–Fri → Mon–Sat, Sun–Thu → Sun–Fri). */
export function sixDays(workdays: number[]): number[] {
  if (workdays.length >= 6) return [...workdays].sort();
  const extra = [0, 1, 2, 3, 4, 5, 6].find((d) => !workdays.includes(d) && workdays.includes((d + 6) % 7));
  return [...new Set([...workdays, ...(extra === undefined ? [] : [extra])])].sort();
}

export function applyBusinessPreset(s: Settings, type: BusinessType): Settings {
  const next: Settings = JSON.parse(JSON.stringify(s));
  const work = regionDefaults(next.country).workdays;
  const six = sixDays(work);
  next.businessType = type;
  const on = (id: MethodId, v: boolean) => (next.methods[id].enabled = v);
  const all = (fn: (m: MethodSettings) => void) => (Object.values(next.methods) as MethodSettings[]).forEach(fn);
  switch (type) {
    case "bakery":
      on("pickup", true);
      on("delivery", true);
      on("shipping", false);
      all((m) => {
        m.schedule.lead = { amount: 1, unit: "days", workingDays: false };
        m.schedule.cutoff.time = "14:00";
        m.schedule.weekdays = six;
        m.capacity.unit = "items";
      });
      next.methodOrder = ["pickup", "delivery", "shipping"];
      break;
    case "florist":
      on("delivery", true);
      on("pickup", true);
      on("shipping", false);
      all((m) => {
        m.schedule.lead = { amount: 0, unit: "days", workingDays: false };
        m.schedule.sameDay = { allowed: true, cutoff: "12:00" };
        m.schedule.weekdays = six;
        m.slotsEnabled = true;
      });
      next.dateMode = "order";
      break;
    case "grocery":
      on("delivery", true);
      on("pickup", true);
      on("shipping", false);
      all((m) => {
        m.schedule.lead = { amount: 4, unit: "hours", workingDays: false };
        m.schedule.cutoff.time = null;
        m.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
        m.schedule.windowDays = 14;
        m.slotsEnabled = true;
      });
      break;
    case "restaurant":
      on("pickup", true);
      on("delivery", true);
      on("shipping", false);
      all((m) => {
        m.schedule.lead = { amount: 2, unit: "days", workingDays: false };
        m.schedule.weekdays = [0, 1, 2, 3, 4, 5, 6];
        m.schedule.windowDays = 21;
        m.slotsEnabled = true;
      });
      break;
    case "gifts":
      on("shipping", true);
      on("pickup", true);
      on("delivery", false);
      all((m) => {
        m.schedule.lead = { amount: 1, unit: "days", workingDays: true };
        m.schedule.weekdays = [...work];
        m.schedule.windowDays = 60;
      });
      break;
    case "furniture":
      on("delivery", true);
      on("pickup", true);
      on("shipping", false);
      all((m) => {
        m.schedule.lead = { amount: 7, unit: "days", workingDays: true };
        m.schedule.weekdays = [...work];
        m.schedule.windowDays = 90;
        m.capacity.maxPerDay = 5;
      });
      break;
    default:
      break;
  }
  return next;
}

/**
 * Switch the store's country and load its usual week start, date format and public holidays.
 * Working days of every method (and pickup locations with their own hours) change only when asked.
 */
export function applyCountry(s: Settings, country: string, opts: { workdays: boolean; dateFormat: boolean }): Settings {
  const next: Settings = JSON.parse(JSON.stringify(s));
  const r = regionDefaults(country);
  next.country = country;
  next.weekStart = r.weekStart;
  if (opts.dateFormat) next.dateFormat = r.dateFormat;
  // Replace the previous country's public holidays (kept: sets for other countries the merchant added).
  const old = s.country;
  const kept = next.holidays.find((h) => h.country === country && !h.region);
  next.holidays = next.holidays.filter((h) => h.country !== old && h.country !== country);
  next.holidays.unshift(kept ?? countryHolidaySet(country));
  if (opts.workdays) {
    for (const m of Object.values(next.methods)) m.schedule.weekdays = [...r.workdays];
    for (const l of next.locations) if (l.custom) l.custom.schedule.weekdays = [...r.workdays];
  }
  return next;
}

/** What the 3-step setup wizard asks. */
export interface WizardChoices {
  country: string | null;
  businessType: BusinessType | null;
  methods: MethodId[];
  workdays: number[];
  lead: { amount: number; unit: "days" | "hours" };
  cutoff: string | null;
  holidays: boolean;
  /** Pickup address when pickup is on and the store has no pickup location yet. */
  pickup: { name: string; address: string } | null;
}

/** Suggested answers for step 2, from the country and business type picked in step 1. */
export function wizardSuggestion(s: Settings, country: string | null, type: BusinessType | null): Pick<WizardChoices, "methods" | "workdays" | "lead" | "cutoff"> {
  let next = country ? applyCountry(s, country, { workdays: true, dateFormat: false }) : (JSON.parse(JSON.stringify(s)) as Settings);
  if (type && type !== "other") next = applyBusinessPreset(next, type);
  const enabled = next.methodOrder.filter((id) => next.methods[id].enabled);
  const first = next.methods[enabled[0] ?? "shipping"];
  return {
    methods: enabled.length ? enabled : ["shipping"],
    workdays: [...first.schedule.weekdays],
    lead: { amount: first.schedule.lead.amount, unit: first.schedule.lead.unit },
    cutoff: first.schedule.cutoff.time,
  };
}

/** Turn the wizard's answers into settings (country defaults → business preset → the merchant's answers). */
export function applyWizard(s: Settings, c: WizardChoices): Settings {
  let next = c.country ? applyCountry(s, c.country, { workdays: true, dateFormat: false }) : (JSON.parse(JSON.stringify(s)) as Settings);
  if (c.businessType && c.businessType !== "other") next = applyBusinessPreset(next, c.businessType);
  const methods = c.methods.length ? c.methods : (["shipping"] as MethodId[]);
  for (const id of Object.keys(next.methods) as MethodId[]) {
    const m = next.methods[id];
    m.enabled = methods.includes(id);
    m.schedule.weekdays = [...new Set(c.workdays)].filter((d) => d >= 0 && d <= 6).sort();
    m.schedule.lead = { ...m.schedule.lead, amount: Math.max(0, Math.min(c.lead.unit === "hours" ? 720 : 365, Math.round(c.lead.amount))), unit: c.lead.unit };
    m.schedule.cutoff = { time: c.cutoff, perWeekday: null };
  }
  next.methodOrder = [...next.methodOrder.filter((id) => methods.includes(id)), ...next.methodOrder.filter((id) => !methods.includes(id))];
  next.defaultMethod = null;
  if (!c.holidays) next.holidays = [];
  if (methods.includes("pickup") && c.pickup?.name.trim() && !next.locations.length) {
    next.locations.push({
      id: "loc_main",
      shopifyLocationId: null,
      name: c.pickup.name.trim().slice(0, 100),
      address: c.pickup.address.trim().slice(0, 300),
      mapUrl: "",
      instructions: {},
      timeZone: null,
      enabled: true,
      countries: "all",
      custom: null,
    });
  }
  return next;
}
