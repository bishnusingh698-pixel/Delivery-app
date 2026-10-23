/**
 * Default settings for a new install and smart defaults per business type.
 */
import type { Capacity, MethodId, MethodSettings, Schedule, Settings, Target } from "./types";

export const emptyTarget = (): Target => ({ products: [], variants: [], collections: [], tags: [] });

export const defaultSchedule = (): Schedule => ({
  weekdays: [1, 2, 3, 4, 5],
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

export const defaultMethod = (enabled: boolean, id: MethodId): MethodSettings => ({
  enabled,
  names: {},
  countries: "all",
  dateRequired: true,
  slotsEnabled: false,
  dateMeaning: id === "shipping" ? "dispatch" : "delivery",
  minOrder: null,
  schedule: defaultSchedule(),
  capacity: defaultCapacity(),
});

export function defaultSettings(country: string | null = null): Settings {
  return {
    schemaVersion: 1,
    businessType: null,
    country,
    dateMode: "order",
    methods: {
      delivery: defaultMethod(false, "delivery"),
      pickup: defaultMethod(false, "pickup"),
      shipping: defaultMethod(true, "shipping"),
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
      tagProducts: {},
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
    },
    texts: {},
    notifications: {
      digest: { enabled: false, time: "18:00", includeProduction: true },
      emailSnippetConfirmed: false,
      calendarFeed: { mode: "order", includeDetails: false },
      flowEnabled: true,
    },
    tagging: { enabled: true, prefix: "" },
    productionPrepOffsetDays: 0,
  };
}

export const BUSINESS_TYPES = ["bakery", "florist", "grocery", "restaurant", "gifts", "furniture", "other"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

/** Smart defaults per business type (applied on the welcome screen). */
export function applyBusinessPreset(s: Settings, type: BusinessType): Settings {
  const next: Settings = JSON.parse(JSON.stringify(s));
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
        m.schedule.weekdays = [1, 2, 3, 4, 5, 6];
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
        m.schedule.weekdays = [1, 2, 3, 4, 5, 6];
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
        m.schedule.windowDays = 60;
      });
      break;
    case "furniture":
      on("delivery", true);
      on("pickup", true);
      on("shipping", false);
      all((m) => {
        m.schedule.lead = { amount: 7, unit: "days", workingDays: true };
        m.schedule.windowDays = 90;
        m.capacity.maxPerDay = 5;
      });
      break;
    default:
      break;
  }
  return next;
}
