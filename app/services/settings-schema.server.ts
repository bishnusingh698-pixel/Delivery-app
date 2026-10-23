/**
 * Validation for the Settings document (admin saves and settings imports).
 * Mirrors core/types.ts. Unknown keys are stripped; missing keys get defaults
 * by merging with defaultSettings() before parsing.
 */
import { bracesBalanced } from "../../core/texts-ui";
import { postcodeProblems } from "../../core/areas-ui";
import { z } from "zod";
import { defaultSettings } from "../../core/defaults";
import type { Settings } from "../../core/types";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const dateOrMonthDay = z.string().regex(/^(\d{4}-)?\d{2}-\d{2}$/);
const weekdays = z.array(z.number().int().min(0).max(6)).max(7);
const method = z.enum(["delivery", "pickup", "shipping"]);
const methodsOrAll = z.union([z.literal("all"), z.array(method)]);
const idsOrAll = z.union([z.literal("all"), z.array(z.string().max(60))]);
const texts = z.record(z.string().max(20), z.string().max(600));
const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/, "Use a number like 5 or 5.50");
const countryList = z.union([z.literal("all"), z.array(z.string().regex(/^[A-Z]{2}$/)).max(250)]);
const nullableInt = z.number().int().min(0).max(100000).nullable();

const target = z.object({
  products: z.array(z.string().max(30)).max(500),
  variants: z.array(z.string().max(30)).max(500),
  collections: z.array(z.string().max(30)).max(100),
  tags: z.array(z.string().max(255)).max(100),
});

const slot = z
  .object({
    id: z.string().min(1).max(40),
    start: time,
    end: time,
    weekdays,
    max: nullableInt,
  })
  .refine((s) => s.end > s.start, { message: "End must be after start", path: ["end"] });

const schedule = z.object({
  weekdays,
  lead: z.object({ amount: z.number().int().min(0).max(365 * 24), unit: z.enum(["hours", "days"]), workingDays: z.boolean() }),
  cutoff: z.object({ time: time.nullable(), perWeekday: z.array(time.nullable()).length(7).nullable() }),
  sameDay: z.object({ allowed: z.boolean(), cutoff: time }),
  windowDays: z.number().int().min(1).max(730),
  notBefore: date.nullable(),
  todayTomorrowLabels: z.boolean(),
});

/** No two slots on the same weekday may overlap. */
function slotsDoNotOverlap(slots: z.infer<typeof slot>[]): boolean {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      const daysA = a.weekdays.length ? a.weekdays : [0, 1, 2, 3, 4, 5, 6];
      const daysB = b.weekdays.length ? b.weekdays : [0, 1, 2, 3, 4, 5, 6];
      if (daysA.some((d) => daysB.includes(d)) && a.start < b.end && b.start < a.end) return false;
    }
  }
  return true;
}

const capacity = z.object({
  unit: z.enum(["orders", "items"]),
  maxPerDay: nullableInt,
  maxPerWeekday: z.array(nullableInt).length(7).nullable(),
  slots: z.array(slot).max(96).refine(slotsDoNotOverlap, { message: "Two time slots overlap on the same weekday" }),
  hideSlotMinutesBefore: z.number().int().min(0).max(24 * 60),
  showSpotsLeftBelow: nullableInt,
  overrides: z.array(z.object({ date, maxPerDay: nullableInt, slots: z.array(slot).max(96).nullable() })).max(366),
});

const methodSettings = z.object({
  enabled: z.boolean(),
  names: texts,
  countries: countryList,
  dateRequired: z.boolean(),
  slotsEnabled: z.boolean(),
  dateMeaning: z.enum(["delivery", "dispatch"]),
  minOrder: money.nullable(),
  schedule,
  capacity,
});

const location = z.object({
  id: z.string().min(1).max(40),
  shopifyLocationId: z.string().max(60).nullable(),
  name: z.string().min(1, "Enter a name").max(100),
  address: z.string().max(300),
  mapUrl: z.union([z.literal(""), z.string().url().max(500).regex(/^https?:\/\//i, "Use a link that starts with https://")]),
  instructions: texts,
  timeZone: z.string().max(60).nullable(),
  enabled: z.boolean(),
  countries: countryList,
  custom: z.object({ schedule, capacity }).nullable(),
});

export const settingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    businessType: z.string().max(30).nullable(),
    country: z.string().max(2).nullable(),
    dateMode: z.enum(["order", "item"]),
    methods: z.object({ delivery: methodSettings, pickup: methodSettings, shipping: methodSettings }),
    methodOrder: z.array(method).length(3),
    defaultMethod: method.nullable(),
    locations: z.array(location).max(100),
    closures: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          label: z.string().max(100),
          start: dateOrMonthDay,
          end: dateOrMonthDay,
          yearly: z.boolean(),
          methods: methodsOrAll,
          locations: idsOrAll,
          kind: z.enum(["blackout", "holiday"]),
          mayShift: z.boolean().optional(),
        }),
      )
      .max(500),
    specialDays: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          date,
          label: z.string().max(100),
          methods: methodsOrAll,
          locations: idsOrAll,
          slots: z.array(slot).nullable(),
          maxPerDay: nullableInt,
        }),
      )
      .max(200),
    vacation: z.object({ enabled: z.boolean(), start: date.nullable(), end: date.nullable(), message: texts }),
    areas: z
      .array(
        z.object({
          country: z.string().regex(/^[A-Z]{2}$/),
          mode: z.enum(["postcode", "area", "region", "none"]),
          postcodes: z.array(z.string().max(60)).max(5000),
          areas: z.array(z.object({ id: z.string().min(1).max(40), names: texts })).max(500),
          regions: z.array(z.string().max(10)).max(100),
          askFirst: z.boolean(),
        }),
      )
      .max(50),
    zones: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          name: z.string().min(1).max(60),
          country: z.string().regex(/^[A-Z]{2}$/),
          postcodes: z.array(z.string().max(60)).max(5000),
          areas: z.array(z.string().max(40)).max(500),
          regions: z.array(z.string().max(10)).max(100),
          schedule: schedule.partial(),
          capacity: capacity.nullable(),
        }),
      )
      .max(50),
    productRules: z.object({
      exclude: target,
      mixedCart: z.enum(["any", "all"]),
      extraLead: z.array(z.object({ id: z.string(), target, days: z.number().int().min(0).max(365) })).max(50),
      restrictions: z
        .array(
          z.object({
            id: z.string(),
            name: z.string().max(100),
            target,
            weekdays: weekdays.nullable(),
            ranges: z.array(z.object({ start: dateOrMonthDay, end: dateOrMonthDay, yearly: z.boolean() })).max(20),
            dates: z.array(date).max(366),
          }),
        )
        .max(50),
      limits: z
        .array(z.object({ id: z.string(), name: z.string().max(100), target, max: z.number().int().min(0).max(100000), perLocation: z.boolean() }))
        .max(50),
      methodOnly: z.array(z.object({ id: z.string(), target, methods: z.array(method).min(1) })).max(50),
      collectionProducts: z.record(z.string(), z.array(z.string())),
    }),
    surcharges: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().max(60),
          kind: z.enum(["weekday", "date", "slot", "sameDay"]),
          weekdays,
          dates: z.array(date).max(100),
          slotIds: z.array(z.string()).max(100),
          methods: methodsOrAll,
          amount: money,
          variantId: z.string().nullable(),
        }),
      )
      .max(30),
    surchargeTaxable: z.boolean(),
    checkoutMatching: z.object({
      enabled: z.boolean(),
      renameWithDate: z.boolean(),
      renameShipping: z.boolean(),
      rateMap: z.array(z.object({ title: z.string().max(255), method: z.union([method, z.literal("ignore")]) })).max(100),
    }),
    widget: z.object({
      theme: z.enum(["match", "light", "dark"]),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      radius: z.number().int().min(0).max(24),
      input: z.enum(["calendar", "dropdown"]),
      compact: z.boolean(),
      icons: z.boolean(),
      showSpotsLeft: z.boolean(),
      preselectEarliest: z.boolean(),
      drawerSelector: z.string().max(200),
      customCss: z.string().max(5000),
      productPageMode: z.enum(["message", "picker"]),
    }),
    texts: z.record(z.string().max(20), z.record(z.string().max(80), z.string().max(600))),
    notifications: z.object({
      digest: z.object({
        enabled: z.boolean(),
        time,
        includeProduction: z.boolean(),
      }),
      emailSnippetConfirmed: z.boolean(),
      calendarFeed: z.object({ mode: z.enum(["order", "day"]), includeDetails: z.boolean() }),
      flowEnabled: z.boolean(),
    }),
    tagging: z.object({ enabled: z.boolean(), prefix: z.string().max(20) }),
    productionPrepOffsetDays: z.number().int().min(0).max(30),
  })
  .superRefine((s, ctx) => {
    if (!Object.values(s.methods).some((m) => m.enabled)) {
      ctx.addIssue({ code: "custom", path: ["methods"], message: "Turn on at least one method" });
    }
  });

/** Deep-merge `value` over `base` (objects only; arrays and primitives replace). */
export function deepMerge<T>(base: T, value: unknown): T {
  if (value === undefined) return base;
  if (Array.isArray(base) || Array.isArray(value) || typeof base !== "object" || base === null || typeof value !== "object" || value === null) {
    return value as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/**
 * `code` lets the admin show a plain, translated message (issue.<code> in app/i18n/admin);
 * `message` is the English fallback. `limit` fills {limit} in the translated message.
 */
export type SettingsIssue = { path: string; message: string; code?: IssueCode; limit?: number };

export type IssueCode =
  | "atLeastOneMethod" | "slotsOverlap" | "endAfterStart" | "unbalancedBraces" | "postcode"
  | "tooSmall" | "tooBig" | "tooLong" | "tooMany" | "required" | "invalidFormat" | "invalid";

const CUSTOM_CODES: Record<string, IssueCode> = {
  "Turn on at least one method": "atLeastOneMethod",
  "Two time slots overlap on the same weekday": "slotsOverlap",
  "End must be after start": "endAfterStart",
  "End is before start": "endAfterStart",
  "Unbalanced { } in text": "unbalancedBraces",
  "Postcode rule can't be read": "postcode",
};

type LooseIssue = { code: string; message: string; origin?: string; minimum?: unknown; maximum?: unknown };

/** Plain-language code for a zod issue (pure, exported for tests). */
export function issueCode(i: LooseIssue): { code: IssueCode; limit?: number } {
  if (i.code === "custom") return { code: CUSTOM_CODES[i.message] ?? "invalid" };
  if (i.code === "too_small") return i.origin === "number" ? { code: "tooSmall", limit: Number(i.minimum) } : { code: "required" };
  if (i.code === "too_big") {
    if (i.origin === "number") return { code: "tooBig", limit: Number(i.maximum) };
    if (i.origin === "string") return { code: "tooLong", limit: Number(i.maximum) };
    return { code: "tooMany", limit: Number(i.maximum) };
  }
  if (i.code === "invalid_type") return { code: /received (undefined|null)/.test(i.message) ? "required" : "invalid" };
  if (i.code === "invalid_format") return { code: "invalidFormat" };
  return { code: "invalid" };
}

export function validateSettings(input: unknown): { ok: true; data: Settings } | { ok: false; issues: SettingsIssue[] } {
  const merged = deepMerge(defaultSettings(), input ?? {});
  const res = settingsSchema.safeParse(merged);
  if (res.success) {
    // The pages check these too; repeated here so an imported file can't publish them.
    const issues = contentIssues(res.data as Settings);
    return issues.length ? { ok: false, issues } : { ok: true, data: res.data as Settings };
  }
  return {
    ok: false,
    issues: res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message, ...issueCode(i) })),
  };
}

function contentIssues(s: Settings): SettingsIssue[] {
  const out: SettingsIssue[] = [];
  for (const [locale, map] of Object.entries(s.texts)) {
    for (const [key, text] of Object.entries(map)) if (!bracesBalanced(text)) out.push({ path: `texts.${locale}.${key}`, message: "Unbalanced { } in text", code: "unbalancedBraces" });
  }
  s.areas.forEach((a, i) => {
    if (a.mode === "postcode" && postcodeProblems(a.postcodes).invalid.length) out.push({ path: `areas.${i}.postcodes`, message: "Postcode rule can't be read", code: "postcode" });
  });
  s.zones.forEach((z, i) => {
    if (postcodeProblems(z.postcodes).invalid.length) out.push({ path: `zones.${i}.postcodes`, message: "Postcode rule can't be read", code: "postcode" });
  });
  s.closures.forEach((c, i) => {
    if (!c.yearly && c.end < c.start) out.push({ path: `closures.${i}.end`, message: "End is before start", code: "endAfterStart" });
  });
  return out;
}

/** Lenient read of a stored document (old versions, partial data). */
export function readSettings(stored: unknown): Settings {
  const merged = deepMerge(defaultSettings(), stored ?? {});
  const res = settingsSchema.safeParse(merged);
  return (res.success ? res.data : merged) as Settings;
}
