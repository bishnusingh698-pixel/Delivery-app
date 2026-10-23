/**
 * Calendar links and .ics files (thank-you block, /ics/event, calendar feed).
 * No Intl: works in checkout extensions and on the server.
 */
import { addDays } from "./civil";

export interface CalendarEvent {
  title: string;
  date: string; // YYYY-MM-DD
  start: string | null; // HH:MM, local to timeZone
  end: string | null;
  timeZone: string | null;
  location?: string;
  description?: string;
}

const compact = (d: string) => d.replace(/-/g, "");
const hm = (t: string) => t.replace(":", "") + "00";

export function calendarLinks(e: CalendarEvent & { icsBase: string | null }): { google: string; ics: string | null } {
  const dates = e.start && e.end ? `${compact(e.date)}T${hm(e.start)}/${compact(e.date)}T${hm(e.end)}` : `${compact(e.date)}/${compact(addDays(e.date, 1))}`;
  const g = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates });
  if (e.timeZone && e.start) g.set("ctz", e.timeZone);
  if (e.location) g.set("location", e.location);
  if (e.description) g.set("details", e.description);
  let ics: string | null = null;
  if (e.icsBase) {
    const q = new URLSearchParams({ t: e.title, d: e.date });
    if (e.start && e.end) {
      q.set("s", e.start);
      q.set("e", e.end);
    }
    if (e.timeZone) q.set("z", e.timeZone);
    if (e.location) q.set("l", e.location);
    ics = `${e.icsBase}?${q.toString()}`;
  }
  return { google: `https://calendar.google.com/calendar/render?${g.toString()}`, ics };
}

/** Escape text for an iCalendar property value and fold long lines. */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** UTF-8 length of one code point (no TextEncoder in every runtime we run in). */
const utf8Len = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Fold at 75 octets (RFC 5545 3.1), never inside a UTF-8 character. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = utf8Len(ch.codePointAt(0)!);
    if (bytes + n > 75) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

export interface IcsEvent extends CalendarEvent {
  uid: string;
  stamp: string; // UTC, YYYYMMDDTHHMMSSZ
}

/** One VEVENT (local "floating" time with TZID when a zone is known). */
export function icsEvent(e: IcsEvent): string {
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${e.stamp}`];
  if (e.start && e.end) {
    const tz = e.timeZone ? `;TZID=${e.timeZone}` : "";
    lines.push(`DTSTART${tz}:${compact(e.date)}T${hm(e.start)}`, `DTEND${tz}:${compact(e.date)}T${hm(e.end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`);
  }
  lines.push(`SUMMARY:${icsText(e.title)}`);
  if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
  lines.push("END:VEVENT");
  return lines.map(fold).join("\r\n");
}

export function icsCalendar(name: string, events: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pickday//Delivery dates//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsText(name)}`, ...events, "END:VCALENDAR", ""].join("\r\n");
}
