/**
 * Public holiday sets → closures (pure). The server lists the holidays with the
 * open-source dataset; this turns them into closures for the engine. Used when
 * publishing and by the admin preview, so both agree.
 */
import type { Closure, HolidayItem, HolidaySet } from "./types";

export const HOLIDAY_ID_PREFIX = "hol:";

export function holidayClosures(set: HolidaySet, items: HolidayItem[]): Closure[] {
  const skip = new Set(set.skip);
  return items
    .filter((h) => !skip.has(h.key))
    .map((h) => ({
      id: `${HOLIDAY_ID_PREFIX}${set.id}:${h.date}`.slice(0, 40),
      label: h.name.slice(0, 100),
      start: h.date,
      end: h.end < h.date ? h.date : h.end,
      yearly: false,
      methods: set.methods,
      locations: set.locations,
      kind: "holiday" as const,
      mayShift: h.mayShift,
    }));
}

/** Closures for every set, given each set's holiday list (keyed by set id). */
export function allHolidayClosures(sets: HolidaySet[], lists: Record<string, HolidayItem[]>): Closure[] {
  return sets.flatMap((s) => holidayClosures(s, lists[s.id] ?? []));
}
