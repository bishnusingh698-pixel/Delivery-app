/**
 * Round 9: bugs found walking through the app as shoppers and merchants (AUDIT.md, B81 onwards).
 * Each test failed before its fix.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/shopify.server", () => ({ unauthenticated: {}, authenticate: {} }));
import { calendarLinks, eventZone, icsCalendar, icsEvent } from "../core/calendar";
import { formatStamp } from "../core/dateformat";
import { thankYouConfig } from "../app/services/publish.server";
import { config } from "./helpers";

describe("B81: calendar events for a pickup location in another time zone", () => {
  const cfg = config((s) => {
    s.locations = [
      { id: "ny", shopifyLocationId: null, name: "Manhattan", address: "", mapUrl: "", instructions: {}, timeZone: "America/New_York", enabled: true, countries: "all", custom: null },
      { id: "be", shopifyLocationId: null, name: "Berlin", address: "", mapUrl: "", instructions: {}, timeZone: null, enabled: true, countries: "all", custom: null },
    ];
  }, "pro", "Europe/Berlin");

  it("the thank-you page knows each location's own zone", () => {
    const ty = thankYouConfig(cfg);
    expect(eventZone(ty, { m: "pickup", l: "ny" })).toBe("America/New_York");
    expect(eventZone(ty, { m: "pickup", l: "be" })).toBe("Europe/Berlin");
    expect(eventZone(ty, { m: "delivery", l: null })).toBe("Europe/Berlin");
  });

  it("a 10:00 pickup in New York is 10:00 New York time in the calendar, not 10:00 Berlin time", () => {
    const zone = eventZone(thankYouConfig(cfg), { m: "pickup", l: "ny" });
    const g = new URL(calendarLinks({ title: "Pickup", date: "2026-11-20", start: "10:00", end: "11:00", timeZone: zone, icsBase: null }).google);
    expect(g.searchParams.get("ctz")).toBe("America/New_York");
  });
});

describe("B82: .ics lines are folded at 75 bytes, not 75 characters (RFC 5545)", () => {
  it("keeps every line of a Japanese or Arabic title within 75 bytes and never splits a character", () => {
    const title = "ご注文の受け取り：東京駅前店でお待ちしております。営業時間内にお越しください。ありがとうございます";
    const ev = icsEvent({ uid: "u1", stamp: "20261016T000000Z", title, date: "2026-10-18", start: null, end: null, timeZone: null, description: "مرحبا بكم في متجرنا، يرجى إحضار رقم الطلب عند الاستلام من فضلكم" });
    const lines = icsCalendar("Pickday", [ev]).split("\r\n");
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    // Unfolding gives the original text back.
    const unfolded = lines.join("\r\n").replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${title}`);
    expect(unfolded).not.toContain("�");
  });
});

describe("B83: staff-facing times are shown in the store's time zone", () => {
  it("a change made at 03:30 UTC reads 09:00 in a Kolkata store, whatever the server or browser zone", () => {
    const s = formatStamp("2026-11-06T03:30:00.000Z", "en", "Asia/Kolkata");
    expect(s).toMatch(/9:00/);
    expect(s).toMatch(/Nov/);
    expect(s).toMatch(/GMT\+5:30|IST/);
  });

  it("falls back to UTC for an unknown zone and keeps the date for a Chatham store crossing midnight", () => {
    expect(formatStamp("2026-11-06T11:00:00.000Z", "en", "Pacific/Chatham")).toMatch(/Nov 7/);
    expect(formatStamp("2026-11-06T11:00:00.000Z", "en", "Not/AZone")).toMatch(/11:00/);
  });
});

describe("B84: a store's new day is published right after its own midnight, not at the next hourly job", async () => {
  const { dueAtMidnight } = await import("../app/services/jobs.server");
  const shops = [
    { shop: "kathmandu", timeZone: "Asia/Kathmandu", publishedFor: "2026-11-06" },
    { shop: "kolkata", timeZone: "Asia/Kolkata", publishedFor: "2026-11-06" },
    { shop: "chatham", timeZone: "Pacific/Chatham", publishedFor: "2026-11-07" },
  ];
  it("Kolkata (+5:30) is due at 18:30 UTC, Kathmandu (+5:45) at 18:15 UTC, not before", () => {
    expect(dueAtMidnight(shops, new Date("2026-11-06T18:14:00Z"))).toEqual([]);
    expect(dueAtMidnight(shops, new Date("2026-11-06T18:15:00Z"))).toEqual(["kathmandu"]);
    expect(dueAtMidnight(shops, new Date("2026-11-06T18:31:00Z"))).toEqual(["kathmandu", "kolkata"]);
  });
  it("Chatham (+13:45 in November) rolls over at 10:15 UTC", () => {
    expect(dueAtMidnight(shops, new Date("2026-11-07T10:14:00Z"))).not.toContain("chatham");
    expect(dueAtMidnight(shops, new Date("2026-11-07T10:16:00Z"))).toContain("chatham");
  });
});

describe("B85: public holidays are published a week past the booking window", async () => {
  const { publishRange } = await import("../core/publish");
  it("so a missed hourly job (server asleep, cron down) can't open a holiday at the end of the window", () => {
    // Booking window 30 days: the widget offers up to today + 30, and that end moves forward every day.
    const r = publishRange("2026-12-01", 30);
    expect(r.from).toBe("2026-11-30");
    expect(r.to >= "2027-01-07").toBe(true); // still covers the window after 7 days without a publish
  });
});

describe("B84: the checkout Function between a store's midnight and its next publish", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { cutoffTimeChecks, validate } = await import("../core/checkout");
  const { toFunctionConfig } = await import("../core/publish");
  const messages = JSON.parse(readFileSync(join(__dirname, "../extensions/pickday-validation/src/messages.generated.json"), "utf8"));
  // Kolkata bakery: same-day orders allowed (no notice), cut-off 14:00 on Mondays, 10:00 on Tuesdays.
  // 2026-11-09 is a Monday, 2026-11-10 a Tuesday.
  const cfg = config((s) => {
    s.methods.shipping.dateRequired = true;
    s.methods.shipping.schedule.weekdays = [1, 2, 3, 4, 5];
    s.methods.shipping.schedule.lead = { amount: 0, unit: "days", workingDays: true };
    s.methods.shipping.schedule.cutoff = { time: null, perWeekday: [null, "14:00", "10:00", "14:00", "14:00", "14:00", null] };
  }, "pro", "Asia/Kolkata");
  const order = (d: string, checks: number[], answers: boolean[]) =>
    validate(
      {
        buyerJourney: { step: "CHECKOUT_COMPLETION" },
        cart: {
          attribute: { value: JSON.stringify({ v: 1, m: "shipping", d, lbl: d }) },
          deliveryGroups: [{ deliveryAddress: { countryCode: "DE" } }],
          lines: [{ id: "l1", quantity: 1, merchandise: { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/11", requiresShipping: true, product: { id: "gid://shopify/Product/1", isGiftCard: false } } }],
        },
        localization: { language: { isoCode: "EN" }, country: { isoCode: "DE" } },
        shop: { localTime: { date: "2026-11-10", cutoffA: answers[0], cutoffB: answers[1] } },
        validation: { metafield: { jsonValue: { ...toFunctionConfig(cfg), timeChecks: checks } } },
      },
      messages,
    );
  const monday = cutoffTimeChecks(cfg, "2026-11-09");
  const tuesday = cutoffTimeChecks(cfg, "2026-11-10");

  it("Monday's published checks (14:00) never block a valid Tuesday order at 00:10", () => {
    expect(monday[0]).toBe(14 * 60);
    expect(order("2026-11-10", monday, [false, false])).toEqual([]);
  });

  it("after the midnight publish, Tuesday's 10:00 cut-off closes today at 11:00", () => {
    expect(tuesday[0]).toBe(10 * 60);
    expect(order("2026-11-10", tuesday, [true, false])).toHaveLength(1);
    expect(order("2026-11-11", tuesday, [true, false])).toEqual([]);
  });
});
