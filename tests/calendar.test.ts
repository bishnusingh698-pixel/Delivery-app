import { describe, expect, it } from "vitest";
import { calendarLinks, icsCalendar, icsEvent } from "../core/calendar";

describe("calendar links and files", () => {
  it("builds a timed Google link in the store's zone and an .ics link", () => {
    const l = calendarLinks({ title: "Pick up order #1001", date: "2026-10-18", start: "10:00", end: "12:00", timeZone: "Europe/Berlin", location: "Main St", icsBase: "https://app.test/ics/event" });
    const g = new URL(l.google);
    expect(g.searchParams.get("dates")).toBe("20261018T100000/20261018T120000");
    expect(g.searchParams.get("ctz")).toBe("Europe/Berlin");
    expect(new URL(l.ics!).searchParams.get("s")).toBe("10:00");
  });

  it("uses an all-day event without a slot", () => {
    const l = calendarLinks({ title: "x", date: "2026-12-31", start: null, end: null, timeZone: null, icsBase: null });
    expect(new URL(l.google).searchParams.get("dates")).toBe("20261231/20270101");
    expect(l.ics).toBeNull();
  });

  it("writes valid, escaped iCalendar text", () => {
    const ev = icsEvent({ uid: "u1", stamp: "20261016T000000Z", title: "Order #1, cake; candles", date: "2026-10-18", start: "10:00", end: "12:00", timeZone: "Europe/Berlin" });
    const cal = icsCalendar("Deliveries", [ev]);
    expect(cal).toContain("DTSTART;TZID=Europe/Berlin:20261018T100000");
    expect(cal).toContain("SUMMARY:Order #1\\, cake\\; candles");
    expect(cal.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect(cal.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
});
