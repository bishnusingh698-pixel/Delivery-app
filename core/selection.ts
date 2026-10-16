/**
 * The hidden `_pickday` cart attribute / line property.
 * Decoding is defensive: anything malformed becomes null and is treated as
 * "no selection" (the widget asks again; the Function blocks if required).
 */
import { isValidDate, isValidTime } from "./civil";
import { METHOD_IDS, type MethodId, type Selection } from "./types";

export const ATTR_KEY = "_pickday";

/** Readable attribute keys shown in the order's "Additional details". Fixed, English (see DECISIONS D-15). */
export const READABLE_KEYS = {
  method: "Delivery method",
  date: "Delivery date",
  slot: "Time slot",
  location: "Pickup location",
  area: "Delivery area",
} as const;

const str = (v: unknown, max = 120): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

export function decodeSelection(raw: string | null | undefined): Selection | null {
  if (!raw) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const m = o.m as MethodId;
  if (!METHOD_IDS.includes(m)) return null;
  const d = isValidDate(o.d) ? (o.d as string) : null;
  const t = typeof o.t === "string" && /^\d\d:\d\d-\d\d:\d\d$/.test(o.t) && isValidTime(o.t.slice(0, 5)) ? o.t : null;
  return {
    v: 1,
    m,
    d,
    s: str(o.s, 40),
    t,
    l: str(o.l, 40),
    z: str(o.z, 40),
    a: str(o.a, 80),
    c: typeof o.c === "string" && /^[A-Z]{2}$/.test(o.c) ? o.c : null,
    lbl: str(o.lbl, 120),
    lc: str(o.lc, 10),
    f: Array.isArray(o.f) ? (o.f.filter((x) => typeof x === "string").slice(0, 5) as string[]) : null,
  };
}

export function encodeSelection(sel: Selection): string {
  const o: Record<string, unknown> = { v: 1, m: sel.m };
  for (const k of ["d", "s", "t", "l", "z", "a", "c", "lbl", "lc", "f"] as const) {
    const v = sel[k];
    if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) o[k] = v;
  }
  return JSON.stringify(o);
}

/** Per-item line property `_pickday`: { d, s, t, lbl }. */
export interface ItemSelection {
  d: string | null;
  s: string | null;
  t: string | null;
  lbl: string | null;
}

export function decodeItemSelection(raw: string | null | undefined): ItemSelection | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    return {
      d: isValidDate(o.d) ? o.d : null,
      s: str(o.s, 40),
      t: typeof o.t === "string" && /^\d\d:\d\d-\d\d:\d\d$/.test(o.t) ? o.t : null,
      lbl: str(o.lbl, 120),
    };
  } catch {
    return null;
  }
}
