/**
 * Shared types for Pickday.
 *
 * The same `Settings` document is stored in the database (source of truth),
 * edited in the admin, and published (minus server-only fields) to Shopify
 * metafields for the storefront widget and the Functions.
 *
 * Conventions:
 *  - Dates are civil dates "YYYY-MM-DD" in the store (or location) time zone.
 *  - Times are "HH:MM" 24h civil times in the same zone.
 *  - Weekdays are 0 = Sunday … 6 = Saturday (JavaScript convention).
 *  - Money amounts are decimal strings in the store's base currency.
 */

export type MethodId = "delivery" | "pickup" | "shipping";
export const METHOD_IDS: MethodId[] = ["delivery", "pickup", "shipping"];

export type LocaleTexts = Record<string, string>; // locale -> text

/** Which products a rule applies to. Any match counts. */
export interface Target {
  products: string[]; // numeric product ids
  variants: string[]; // numeric variant ids
  collections: string[]; // numeric collection ids
  tags: string[]; // product tags (case-insensitive)
}

export interface LeadTime {
  amount: number;
  unit: "hours" | "days";
  /** Count only working days (available weekdays that are not closed). */
  workingDays: boolean;
}

export interface Schedule {
  weekdays: number[];
  lead: LeadTime;
  cutoff: {
    /** Cutoff used for every weekday unless perWeekday has a value. null = no cutoff. */
    time: string | null;
    perWeekday: (string | null)[] | null; // length 7, index = weekday
  };
  sameDay: { allowed: boolean; cutoff: string };
  windowDays: number;
  notBefore: string | null;
  todayTomorrowLabels: boolean;
}

export interface Slot {
  id: string;
  start: string;
  end: string;
  weekdays: number[];
  max: number | null;
}

export interface DateOverride {
  date: string;
  maxPerDay: number | null;
  /** Replace the slots for that date (null = keep normal slots). */
  slots: Slot[] | null;
}

export interface Capacity {
  unit: "orders" | "items";
  maxPerDay: number | null;
  /** Optional per-weekday max (index = weekday). null entries fall back to maxPerDay. */
  maxPerWeekday: (number | null)[] | null;
  slots: Slot[];
  hideSlotMinutesBefore: number;
  showSpotsLeftBelow: number | null;
  overrides: DateOverride[];
}

export interface MethodSettings {
  enabled: boolean;
  names: LocaleTexts;
  /** "all" or ISO country codes. */
  countries: "all" | string[];
  dateRequired: boolean;
  slotsEnabled: boolean;
  /** Shipping only: does the date mean arrival or dispatch? */
  dateMeaning: "delivery" | "dispatch";
  /** Minimum order value in base currency (decimal string) or null. */
  minOrder: string | null;
  schedule: Schedule;
  capacity: Capacity;
}

export interface Closure {
  id: string;
  label: string;
  start: string;
  end: string;
  yearly: boolean;
  methods: "all" | MethodId[];
  locations: "all" | string[];
  kind: "blackout" | "holiday";
  /** Lunar / moon-sighting based holiday: date may shift. */
  mayShift?: boolean;
}

export interface SpecialDay {
  id: string;
  date: string;
  label: string;
  methods: "all" | MethodId[];
  locations: "all" | string[];
  slots: Slot[] | null;
  maxPerDay: number | null;
}

export interface Vacation {
  enabled: boolean;
  start: string | null;
  end: string | null;
  message: LocaleTexts;
}

export interface Location {
  id: string;
  shopifyLocationId: string | null;
  name: string;
  address: string;
  mapUrl: string;
  instructions: LocaleTexts;
  timeZone: string | null;
  enabled: boolean;
  countries: "all" | string[];
  /** Own schedule + capacity, or null to use the Store pickup method settings. */
  custom: { schedule: Schedule; capacity: Capacity } | null;
}

export type AreaMode = "postcode" | "area" | "region" | "none";

export interface Area {
  id: string;
  names: LocaleTexts; // shopper-facing names per language; "en" or first is default
}

export interface CountryAreas {
  country: string;
  mode: AreaMode;
  postcodes: string[]; // raw rule lines
  areas: Area[];
  regions: string[]; // province codes
  /** Display names for the region codes (filled in when publishing). */
  regionNames?: Record<string, string>;
  askFirst: boolean;
}

export interface Zone {
  id: string;
  name: string;
  country: string;
  postcodes: string[];
  areas: string[]; // area ids
  regions: string[];
  schedule: Partial<Omit<Schedule, "lead" | "cutoff">> & {
    lead?: LeadTime;
    cutoff?: Schedule["cutoff"];
  };
  capacity: Capacity | null;
}

export interface DateRestriction {
  id: string;
  name: string;
  target: Target;
  weekdays: number[] | null;
  /** Ranges [start, end] as "YYYY-MM-DD" or yearly "MM-DD". */
  ranges: { start: string; end: string; yearly: boolean }[];
  dates: string[];
}

export interface DailyLimit {
  id: string;
  name: string;
  target: Target;
  max: number;
  perLocation: boolean;
}

export interface ProductRules {
  exclude: Target;
  mixedCart: "any" | "all";
  extraLead: { id: string; target: Target; days: number }[];
  restrictions: DateRestriction[];
  limits: DailyLimit[];
  methodOnly: { id: string; target: Target; methods: MethodId[] }[];
  /** Server-resolved collection membership: collection id -> product ids. */
  collectionProducts: Record<string, string[]>;
}

export interface Surcharge {
  id: string;
  label: string;
  kind: "weekday" | "date" | "slot" | "sameDay";
  weekdays: number[];
  dates: string[];
  slotIds: string[];
  methods: "all" | MethodId[];
  amount: string;
  /** Variant of the managed surcharge product for this amount. */
  variantId: string | null;
}

export interface CheckoutMatching {
  enabled: boolean;
  renameWithDate: boolean;
  /** Merchant overrides: delivery option title (lower-case) -> method. */
  rateMap: { title: string; method: MethodId | "ignore" }[];
}

export interface WidgetSettings {
  theme: "match" | "light" | "dark";
  accent: string;
  radius: number;
  input: "calendar" | "dropdown";
  compact: boolean;
  icons: boolean;
  showSpotsLeft: boolean;
  preselectEarliest: boolean;
  drawerSelector: string;
  customCss: string;
  productPageMode: "message" | "picker";
}

export interface NotificationSettings {
  digest: { enabled: boolean; time: string; recipients: string[]; includeProduction: boolean };
  emailSnippetConfirmed: boolean;
  calendarFeed: { mode: "order" | "day"; includeDetails: boolean };
  flowEnabled: boolean;
}

export interface TaggingSettings {
  enabled: boolean;
  prefix: string;
}

export interface Settings {
  schemaVersion: 1;
  businessType: string | null;
  country: string | null;
  dateMode: "order" | "item";
  methods: Record<MethodId, MethodSettings>;
  methodOrder: MethodId[];
  defaultMethod: MethodId | null;
  locations: Location[];
  closures: Closure[];
  specialDays: SpecialDay[];
  vacation: Vacation;
  areas: CountryAreas[];
  zones: Zone[];
  productRules: ProductRules;
  surcharges: Surcharge[];
  surchargeTaxable: boolean;
  checkoutMatching: CheckoutMatching;
  widget: WidgetSettings;
  /** Merchant text overrides: locale -> key -> text. */
  texts: Record<string, Record<string, string>>;
  notifications: NotificationSettings;
  tagging: TaggingSettings;
  productionPrepOffsetDays: number;
}

export type PlanId = "free" | "starter" | "pro";

/** What the storefront widget receives (published to the app-installation metafield). */
export interface StorefrontConfig {
  v: number; // settings version
  tz: string;
  primaryLocale: string;
  plan: PlanId;
  /** true when the monthly order limit is reached (widget still works). */
  overLimit: boolean;
  dateMode: Settings["dateMode"];
  methods: (MethodSettings & { id: MethodId })[];
  defaultMethod: MethodId | null;
  locations: Location[];
  closures: Closure[];
  specialDays: SpecialDay[];
  vacation: Vacation;
  areas: CountryAreas[];
  zones: Zone[];
  productRules: ProductRules;
  surcharges: Surcharge[];
  checkoutMatching: Pick<CheckoutMatching, "enabled" | "renameWithDate">;
  widget: WidgetSettings;
  texts: Settings["texts"];
  debugUntil: string | null;
  currency: string;
}

/** [orders, items, slots: { slotId: [orders, items] }] */
export type DayCount = [number, number, Record<string, [number, number]>?];

export interface Availability {
  v: 1;
  at: string;
  /** capacity key -> date -> counts */
  c: Record<string, Record<string, DayCount>>;
  /** product limit key (ruleId or ruleId@locationId) -> date -> quantity */
  p: Record<string, Record<string, number>>;
}

/** A cart line as the engine sees it. */
export interface CartLine {
  key: string;
  productId: string;
  variantId: string;
  quantity: number;
  title: string;
  tags?: string[];
  collections?: string[];
  giftCard?: boolean;
  requiresShipping?: boolean;
  /** Per-item mode: the line's own selection. */
  date?: string | null;
  slotId?: string | null;
}

/** Shopper's choice stored in the hidden cart attribute `_pickday`. */
export interface Selection {
  v: 1;
  m: MethodId;
  d: string | null;
  s: string | null; // slot id
  t: string | null; // "HH:MM-HH:MM"
  l: string | null; // location id
  z: string | null; // zone id
  a: string | null; // area id or normalised postcode
  c: string | null; // country
  lbl: string | null; // pre-formatted label in shopper language (display only)
  lc: string | null; // shopper locale
  f: string[] | null; // surcharge ids applied
}

/** "Now" in a given time zone, as a civil date + minutes since midnight. */
export interface LocalNow {
  date: string;
  minutes: number;
}

export type DayReason =
  | "past"
  | "tooSoon"
  | "closed"
  | "holiday"
  | "vacation"
  | "full"
  | "productUnavailable"
  | "soldOut"
  | "beyondWindow"
  | "notYetOpen";

export interface SlotStatus {
  slot: Slot;
  available: boolean;
  reason: "full" | "past" | null;
  left: number | null;
  fee: Surcharge | null;
}

export interface DayStatus {
  date: string;
  available: boolean;
  reason: DayReason | null;
  /** Holiday or closure label, or product name for product reasons. */
  detail: string | null;
  mayShift: boolean;
  left: number | null;
  slots: SlotStatus[];
  fee: Surcharge | null;
  isToday: boolean;
}
