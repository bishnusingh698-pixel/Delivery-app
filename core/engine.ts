/**
 * The Pickday date engine.
 *
 * One pure module that decides which days and slots a shopper can pick.
 * It is used by the storefront widget, the admin live preview, the order
 * change modal, the jobs, and (bundled) by the validation Function, so all of
 * them always agree. It never reads the clock: callers pass `now` as a civil
 * date + minutes in the store's (or pickup location's) time zone.
 */
import { addDays, diffDays, inRange, toMinutes, weekday, yearlyMatches } from "./civil";
import { blockingRestriction, datedLines, extraLeadDays, lineMatches } from "./rules";
import type {
  Availability,
  CartLine,
  Capacity,
  Closure,
  DayReason,
  DayStatus,
  LocalNow,
  MethodId,
  MethodSettings,
  Schedule,
  Slot,
  SlotStatus,
  SpecialDay,
  StorefrontConfig,
  Surcharge,
} from "./types";

/** The parts of the published config the engine needs. */
export type EngineConfig = Pick<
  StorefrontConfig,
  "methods" | "locations" | "closures" | "specialDays" | "vacation" | "zones" | "productRules" | "surcharges" | "tz"
>;

export interface EngineInput {
  config: EngineConfig;
  availability?: Availability | null;
  method: MethodId;
  locationId?: string | null;
  zoneId?: string | null;
  now: LocalNow;
  /** All cart lines; the engine filters to lines that need a date. */
  lines: CartLine[];
  /** Admin override: ignore capacity and product limits. */
  ignoreCapacity?: boolean;
  /** Admin reschedule: counts already used by the order being moved. */
  release?: { date: string; slotId: string | null; orders: number; items: number } | null;
}

export interface ResolvedRules {
  method: MethodSettings & { id: MethodId };
  schedule: Schedule;
  capacity: Capacity;
  capacityKey: string;
  timeZone: string;
  /**
   * Weekdays used to count working days for lead time. For delivery zones this
   * stays the method's own weekdays: a zone delivered only Tue/Thu still
   * prepares orders on the other working days.
   */
  workWeekdays: number[];
}

const MAX_SCAN = 400;

/* ------------------------------------------------------------- resolving */

export function findMethod(config: EngineConfig, id: MethodId) {
  return config.methods.find((m) => m.id === id) ?? null;
}

/** Effective schedule/capacity for a method, pickup location or delivery zone. */
export function resolveRules(
  config: EngineConfig,
  methodId: MethodId,
  locationId?: string | null,
  zoneId?: string | null,
): ResolvedRules | null {
  const method = findMethod(config, methodId);
  if (!method) return null;
  let schedule = method.schedule;
  let capacity = method.capacity;
  let capacityKey: string = methodId;
  let timeZone = config.tz;
  let workWeekdays = method.schedule.weekdays;
  if (methodId === "pickup") {
    const loc = locationId ? config.locations.find((l) => l.id === locationId) : null;
    if (loc) {
      capacityKey = `pickup:${loc.id}`;
      if (loc.timeZone) timeZone = loc.timeZone;
      if (loc.custom) {
        schedule = loc.custom.schedule;
        capacity = loc.custom.capacity;
        workWeekdays = schedule.weekdays;
      }
    }
  }
  if (methodId === "delivery" && zoneId) {
    const zone = config.zones.find((z) => z.id === zoneId);
    if (zone) {
      schedule = { ...schedule, ...stripUndefined(zone.schedule) } as Schedule;
      if (zone.capacity) {
        capacity = zone.capacity;
        capacityKey = `delivery:z:${zone.id}`;
      }
    }
  }
  return { method, schedule, capacity, capacityKey, timeZone, workWeekdays };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Time zone the shopper's "now" must be computed in. */
export function engineTimeZone(config: EngineConfig, methodId: MethodId, locationId?: string | null): string {
  if (methodId === "pickup" && locationId) {
    const loc = config.locations.find((l) => l.id === locationId);
    if (loc?.timeZone) return loc.timeZone;
  }
  return config.tz;
}

/* --------------------------------------------------------- closed / open */

const appliesTo = (
  item: { methods: "all" | MethodId[]; locations: "all" | string[] },
  method: MethodId,
  locationId?: string | null,
) =>
  (item.methods === "all" || item.methods.includes(method)) &&
  (item.locations === "all" || (method === "pickup" && !!locationId && item.locations.includes(locationId)));

export function closureMatches(c: Closure, date: string): boolean {
  if (c.yearly && c.start === c.end) return yearlyMatches(date, c.start.slice(-5));
  return inRange(date, c.start, c.end, c.yearly);
}

export function specialDayFor(config: EngineConfig, date: string, method: MethodId, locationId?: string | null): SpecialDay | null {
  return config.specialDays.find((s) => s.date === date && appliesTo(s, method, locationId)) ?? null;
}

export interface ClosedInfo {
  reason: DayReason;
  detail: string | null;
  mayShift: boolean;
}

/** Why a day is closed (ignoring lead time and capacity), or null when open. */
export function closedInfo(
  config: EngineConfig,
  rules: ResolvedRules,
  date: string,
  locationId?: string | null,
  weekdays: number[] = rules.schedule.weekdays,
): ClosedInfo | null {
  if (specialDayFor(config, date, rules.method.id, locationId)) return null;
  const v = config.vacation;
  if (v.enabled && v.start && date >= v.start && (!v.end || date <= v.end)) {
    return { reason: "vacation", detail: null, mayShift: false };
  }
  for (const c of config.closures) {
    if (appliesTo(c, rules.method.id, locationId) && closureMatches(c, date)) {
      return { reason: c.kind === "holiday" ? "holiday" : "closed", detail: c.label || null, mayShift: !!c.mayShift };
    }
  }
  if (!weekdays.includes(weekday(date))) return { reason: "closed", detail: null, mayShift: false };
  return null;
}

function isWorkingDay(config: EngineConfig, rules: ResolvedRules, date: string, locationId?: string | null) {
  return closedInfo(config, rules, date, locationId, rules.workWeekdays) === null;
}

/** First working day strictly after `date` (or null if none within a year). */
function nextWorkingDay(config: EngineConfig, rules: ResolvedRules, date: string, locationId?: string | null) {
  for (let i = 1; i <= MAX_SCAN; i++) {
    const d = addDays(date, i);
    if (isWorkingDay(config, rules, d, locationId)) return d;
  }
  return null;
}

function addWorkingDays(config: EngineConfig, rules: ResolvedRules, from: string, n: number, locationId?: string | null) {
  let d: string | null = from;
  if (!isWorkingDay(config, rules, from, locationId)) d = nextWorkingDay(config, rules, from, locationId);
  for (let i = 0; i < n && d; i++) d = nextWorkingDay(config, rules, d, locationId);
  return d;
}

/* ------------------------------------------------------------ lead time */

export function cutoffFor(schedule: Schedule, date: string): string | null {
  if (schedule.cutoff.perWeekday && schedule.cutoff.perWeekday.length === 7) {
    return schedule.cutoff.perWeekday[weekday(date)] ?? null;
  }
  return schedule.cutoff.time;
}

export interface Earliest {
  /** Earliest civil date (null = nothing within a year). */
  date: string | null;
  /** On `date`, slots must start at or after this minute. */
  minMinutes: number;
  sameDay: boolean;
  cutoffPassed: boolean;
  /** With same-day: the normal earliest date (and minute) for every day after today. */
  regular?: { date: string | null; minMinutes: number };
}

export function computeEarliest(input: EngineInput, rules: ResolvedRules): Earliest {
  const { config, now, locationId } = input;
  const s = rules.schedule;
  const today = now.date;
  const cut = cutoffFor(s, today);
  const cutoffPassed = cut !== null && now.minutes >= toMinutes(cut);
  const extra = extraLeadDays(datedLines(input.lines, config.productRules), config.productRules);
  const work = s.lead.workingDays;
  const amount = Math.max(0, Math.floor(s.lead.amount || 0));

  let date: string | null;
  let minMinutes = 0;

  if (s.lead.unit === "hours") {
    let startDate: string | null = today;
    let startMin = now.minutes;
    if (cutoffPassed) {
      startDate = nextWorkingDay(config, rules, today, locationId);
      startMin = 0;
    }
    if (!startDate) return { date: null, minMinutes: 0, sameDay: false, cutoffPassed };
    const total = startMin + amount * 60;
    date = addDays(startDate, Math.floor(total / 1440));
    minMinutes = total % 1440;
  } else {
    let start: string | null = today;
    if (cutoffPassed || (work && !isWorkingDay(config, rules, today, locationId))) {
      start = nextWorkingDay(config, rules, today, locationId);
    }
    if (!start) return { date: null, minMinutes: 0, sameDay: false, cutoffPassed };
    date = work ? addWorkingDays(config, rules, start, amount, locationId) : addDays(start, amount);
    if (date === today) minMinutes = now.minutes;
  }

  if (date && extra > 0) {
    date = work ? addWorkingDays(config, rules, date, extra, locationId) : addDays(date, extra);
    minMinutes = 0;
  }

  let sameDay = false;
  let regular: Earliest["regular"];
  // Same-day skips the day-based lead time only; an hour-based lead still applies to slot start times.
  const sameDayMin = now.minutes + (s.lead.unit === "hours" ? amount * 60 : 0);
  if (
    s.sameDay.allowed &&
    extra === 0 &&
    now.minutes < toMinutes(s.sameDay.cutoff || "00:00") &&
    sameDayMin < 1440 &&
    (!date || date > today)
  ) {
    regular = { date, minMinutes };
    date = today;
    minMinutes = sameDayMin;
    sameDay = true;
  }

  if (date && s.notBefore && s.notBefore > date) {
    date = s.notBefore;
    minMinutes = 0;
  }
  return { date, minMinutes, sameDay, cutoffPassed, ...(regular ? { regular } : {}) };
}

/* ------------------------------------------------------------- capacity */

function countsFor(input: EngineInput, key: string, date: string): { orders: number; items: number; slots: Record<string, [number, number]> } {
  const c = input.availability?.c?.[key]?.[date];
  let orders = c?.[0] ?? 0;
  let items = c?.[1] ?? 0;
  const slots: Record<string, [number, number]> = { ...(c?.[2] ?? {}) };
  const rel = input.release;
  if (rel && rel.date === date) {
    orders = Math.max(0, orders - rel.orders);
    items = Math.max(0, items - rel.items);
    if (rel.slotId && slots[rel.slotId]) {
      const [o, i] = slots[rel.slotId];
      slots[rel.slotId] = [Math.max(0, o - rel.orders), Math.max(0, i - rel.items)];
    }
  }
  return { orders, items, slots };
}

export function dayMax(capacity: Capacity, date: string, special: SpecialDay | null): number | null {
  const ovr = capacity.overrides.find((o) => o.date === date);
  if (ovr && ovr.maxPerDay !== null) return ovr.maxPerDay;
  if (special && special.maxPerDay !== null) return special.maxPerDay;
  const wd = capacity.maxPerWeekday?.[weekday(date)];
  if (wd !== undefined && wd !== null) return wd;
  return capacity.maxPerDay;
}

export function slotsForDate(capacity: Capacity, date: string, special: SpecialDay | null): Slot[] {
  const ovr = capacity.overrides.find((o) => o.date === date);
  if (ovr?.slots) return ovr.slots;
  if (special?.slots) return special.slots;
  const wd = weekday(date);
  return capacity.slots.filter((s) => !s.weekdays.length || s.weekdays.includes(wd)).sort((a, b) => (a.start < b.start ? -1 : 1));
}

/* ------------------------------------------------------------ surcharges */

export function feesFor(
  config: EngineConfig,
  method: MethodId,
  date: string,
  slotId: string | null,
  sameDay: boolean,
): Surcharge[] {
  const out: Surcharge[] = [];
  for (const f of config.surcharges) {
    if (f.methods !== "all" && !f.methods.includes(method)) continue;
    if (f.kind === "weekday" && f.weekdays.includes(weekday(date))) out.push(f);
    else if (f.kind === "date" && f.dates.includes(date)) out.push(f);
    else if (f.kind === "sameDay" && sameDay) out.push(f);
    else if (f.kind === "slot" && slotId && f.slotIds.includes(slotId)) out.push(f);
  }
  return out;
}

/** The day's fee as shown in the calendar: every matching fee added up, as at checkout. */
function dayFee(config: EngineConfig, method: MethodId, date: string, sameDay: boolean): Surcharge | null {
  const fees = feesFor(config, method, date, null, sameDay);
  if (fees.length < 2) return fees[0] ?? null;
  const cents = fees.reduce((n, f) => n + Math.round(Number(f.amount) * 100), 0);
  return { ...fees[0], amount: (cents / 100).toFixed(2) };
}

/* --------------------------------------------------------------- the day */

export interface Calendar {
  rules: ResolvedRules | null;
  earliest: Earliest | null;
  lastDate: string | null;
  days: DayStatus[];
  /** First available date in the range, if any. */
  firstAvailable: string | null;
}

function needed(rules: ResolvedRules, lines: CartLine[]): number {
  if (rules.capacity.unit === "orders") return 1;
  return Math.max(1, lines.reduce((n, l) => n + (l.quantity || 0), 0));
}

export function dayStatus(input: EngineInput, rules: ResolvedRules, earliest: Earliest, date: string): DayStatus {
  const { config, now, locationId } = input;
  const lines = datedLines(input.lines, config.productRules);
  const s = rules.schedule;
  const lastDate = addDays(now.date, Math.max(0, s.windowDays));
  const base: DayStatus = {
    date,
    available: false,
    reason: null,
    detail: null,
    mayShift: false,
    left: null,
    slots: [],
    fee: null,
    isToday: date === now.date,
  };
  const fail = (reason: DayReason, detail: string | null = null, mayShift = false): DayStatus => ({
    ...base,
    reason,
    detail,
    mayShift,
  });

  if (date < now.date) return fail("past");
  if (date > lastDate) return fail("beyondWindow");
  if (s.notBefore && date < s.notBefore) return fail("notYetOpen");
  const closed = closedInfo(config, rules, date, locationId);
  if (closed) return fail(closed.reason, closed.detail, closed.mayShift);
  if (!earliest.date || date < earliest.date) return fail("tooSoon");
  // Same-day opens today only, not the days between today and the normal lead time.
  const reg = earliest.regular;
  if (reg && date !== now.date && (!reg.date || date < reg.date)) return fail("tooSoon");

  const block = blockingRestriction(lines, config.productRules, date);
  if (block) return fail("productUnavailable", block.line.title || block.rule.name);

  if (!input.ignoreCapacity) {
    for (const lim of config.productRules.limits) {
      const qty = lines.filter((l) => lineMatches(l, lim.target, config.productRules)).reduce((n, l) => n + l.quantity, 0);
      if (!qty) continue;
      const key = lim.perLocation && locationId ? `${lim.id}@${locationId}` : lim.id;
      const used = input.availability?.p?.[key]?.[date] ?? 0;
      const rel = input.release && input.release.date === date ? qty : 0;
      if (used - rel + qty > lim.max) {
        const line = lines.find((l) => lineMatches(l, lim.target, config.productRules));
        return fail("soldOut", lim.name || line?.title || null);
      }
    }
  }

  const special = specialDayFor(config, date, rules.method.id, locationId);
  const need = needed(rules, lines);
  const counts = countsFor(input, rules.capacityKey, date);
  const unitUsed = rules.capacity.unit === "orders" ? counts.orders : counts.items;
  const max = dayMax(rules.capacity, date, special);
  let left: number | null = null;
  if (max !== null && !input.ignoreCapacity) {
    left = max - unitUsed;
    if (unitUsed + need > max) return { ...fail("full"), left: Math.max(0, left) };
  }

  const isSameDay = date === now.date;
  const result: DayStatus = { ...base, available: true, left, fee: dayFee(config, rules.method.id, date, isSameDay && earliest.sameDay) };

  if (rules.method.slotsEnabled) {
    const slots = slotsForDate(rules.capacity, date, special);
    if (slots.length) {
      const hideBefore = rules.capacity.hideSlotMinutesBefore || 0;
      result.slots = slots.map((slot): SlotStatus => {
        const start = toMinutes(slot.start);
        const fee = feesFor(config, rules.method.id, date, slot.id, false).find((f) => f.kind === "slot") ?? null;
        if (date === earliest.date && start < earliest.minMinutes) return { slot, available: false, reason: "past", left: null, fee };
        if (reg && date === reg.date && start < reg.minMinutes) return { slot, available: false, reason: "past", left: null, fee };
        if (isSameDay && start - hideBefore <= now.minutes) return { slot, available: false, reason: "past", left: null, fee };
        if (slot.max !== null && slot.max !== undefined && !input.ignoreCapacity) {
          const [o, i] = counts.slots[slot.id] ?? [0, 0];
          const used = rules.capacity.unit === "orders" ? o : i;
          const sl = slot.max - used;
          if (used + need > slot.max) return { slot, available: false, reason: "full", left: Math.max(0, sl), fee };
          return { slot, available: true, reason: null, left: sl, fee };
        }
        return { slot, available: true, reason: null, left: null, fee };
      });
      // Slots already past are simply not offered; if none is bookable the day is full (or too soon).
      const open = result.slots.filter((x) => x.available);
      if (!open.length) {
        const allPast = result.slots.every((x) => x.reason === "past");
        return { ...fail(allPast ? "tooSoon" : "full"), slots: result.slots };
      }
    }
  }
  return result;
}

/** Calendar for [from, to] (inclusive). */
export function buildCalendar(input: EngineInput, from: string, to: string): Calendar {
  const rules = resolveRules(input.config, input.method, input.locationId, input.zoneId);
  if (!rules) return { rules: null, earliest: null, lastDate: null, days: [], firstAvailable: null };
  const earliest = computeEarliest(input, rules);
  const lastDate = addDays(input.now.date, Math.max(0, rules.schedule.windowDays));
  const days: DayStatus[] = [];
  let firstAvailable: string | null = null;
  const n = Math.min(diffDays(to, from), MAX_SCAN);
  for (let i = 0; i <= n; i++) {
    const d = addDays(from, i);
    const st = dayStatus(input, rules, earliest, d);
    if (st.available && !firstAvailable) firstAvailable = d;
    days.push(st);
  }
  return { rules, earliest, lastDate, days, firstAvailable };
}

/** Earliest bookable date within the booking window (or null). */
export function firstAvailableDate(input: EngineInput): string | null {
  const rules = resolveRules(input.config, input.method, input.locationId, input.zoneId);
  if (!rules) return null;
  const earliest = computeEarliest(input, rules);
  if (!earliest.date) return null;
  const last = addDays(input.now.date, Math.max(0, rules.schedule.windowDays));
  for (let d = earliest.date; d <= last; d = addDays(d, 1)) {
    if (dayStatus(input, rules, earliest, d).available) return d;
  }
  return null;
}

export type SelectionProblem =
  | { ok: true; day: DayStatus; slot: SlotStatus | null; fees: Surcharge[] }
  | { ok: false; reason: DayReason | "slotRequired" | "slotUnavailable" | "noDate" | "methodUnavailable"; detail: string | null };

/** Check one chosen date (+ slot). Used by the widget on load, admin changes and the validation Function. */
export function checkSelection(input: EngineInput, date: string | null, slotId: string | null): SelectionProblem {
  const rules = resolveRules(input.config, input.method, input.locationId, input.zoneId);
  if (!rules || !rules.method.enabled) return { ok: false, reason: "methodUnavailable", detail: null };
  if (!date) return { ok: false, reason: "noDate", detail: null };
  const earliest = computeEarliest(input, rules);
  const day = dayStatus(input, rules, earliest, date);
  if (!day.available) return { ok: false, reason: day.reason ?? "closed", detail: day.detail };
  let slot: SlotStatus | null = null;
  if (day.slots.length) {
    if (!slotId) return { ok: false, reason: "slotRequired", detail: null };
    slot = day.slots.find((x) => x.slot.id === slotId) ?? null;
    if (!slot || !slot.available) return { ok: false, reason: "slotUnavailable", detail: null };
  }
  const fees = feesFor(input.config, input.method, date, slot?.slot.id ?? null, earliest.sameDay && date === input.now.date);
  return { ok: true, day, slot, fees };
}
