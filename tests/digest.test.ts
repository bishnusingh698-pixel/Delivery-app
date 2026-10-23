import { describe, expect, it, vi } from "vitest";

vi.mock("../app/db.server", () => ({ default: {} }));
vi.mock("../app/shopify.server", () => ({ unauthenticated: {} }));

const { flowSummaryPayload, truncateLines, ordersLink, FLOW_SUMMARY_MAX } = await import("../app/services/digest.server");
const { readSettings, validateSettings } = await import("../app/services/settings-schema.server");
const { defaultSettings } = await import("../core/defaults");

type Digest = Parameters<typeof flowSummaryPayload>[0];
const more = (n: number) => `…and ${n} more`;
const digest = (over: Partial<Digest> = {}): Digest => ({
  date: "2026-10-24",
  dateLabel: "Saturday, 24 October 2026",
  counts: { total: 5, delivery: 3, pickup: 2, shipping: 0 },
  lines: ["Local delivery: 3", "  09:00-12:00: 2", "  12:00-15:00: 1", "Pickup: 2"],
  link: "https://admin.shopify.com/store/demo/apps/pickday/app/orders?range=custom&from=2026-10-24&to=2026-10-24",
  more,
  ...over,
});

describe("daily summary Flow payload", () => {
  it("has every trigger field with the right values", () => {
    const p = flowSummaryPayload(digest());
    expect(Object.keys(p).sort()).toEqual(["Date", "Date label", "Deliveries", "Orders link", "Pickups", "Shipping", "Summary", "Total orders"].sort());
    expect(p.Date).toBe("2026-10-24");
    expect(p["Total orders"]).toBe(5);
    expect(p.Deliveries).toBe(3);
    expect(p.Pickups).toBe(2);
    expect(p.Shipping).toBe(0);
    expect(p.Summary).toBe("Local delivery: 3\n  09:00-12:00: 2\n  12:00-15:00: 1\nPickup: 2");
    expect(p["Orders link"]).toContain("from=2026-10-24");
  });

  it("truncates a long summary on whole lines with …and N more", () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `  ${i + 1} x Sourdough loaf with a long name`);
    const p = flowSummaryPayload(digest({ lines }));
    expect(p.Summary.length).toBeLessThanOrEqual(FLOW_SUMMARY_MAX);
    const out = p.Summary.split("\n");
    const kept = out.length - 1;
    expect(out.at(-1)).toBe(`…and ${1000 - kept} more`);
    expect(out.slice(0, -1)).toEqual(lines.slice(0, kept));
    expect(new TextEncoder().encode(JSON.stringify(p)).length).toBeLessThan(50_000);
  });

  it("leaves a short summary untouched and does not count blank lines as more", () => {
    expect(truncateLines(["a", "b"], 10, more)).toBe("a\nb");
    expect(truncateLines(["aaaa", "", "b".repeat(20), "cccc"], 20, more)).toBe("aaaa\n…and 2 more");
  });

  it("links to the Pickday orders page for that day", () => {
    vi.stubEnv("SHOPIFY_APP_HANDLE", "pickday-delivery-date-picker");
    expect(ordersLink("demo.myshopify.com", "2026-10-24")).toBe(
      "https://admin.shopify.com/store/demo/apps/pickday-delivery-date-picker/app/orders?range=custom&from=2026-10-24&to=2026-10-24",
    );
    vi.unstubAllEnvs();
  });
});

describe("digest settings", () => {
  it("defaults: off, 18:00, production list included; no email fields", () => {
    expect(readSettings(null).notifications.digest).toEqual({ enabled: false, time: "18:00", includeProduction: true });
  });
  it("old saved settings with email fields still load; the email fields are dropped", () => {
    const s = readSettings({ notifications: { digest: { enabled: true, time: "07:00", recipients: ["a@b.co"], includeProduction: false, flow: true, email: true } } });
    expect(s.notifications.digest).toEqual({ enabled: true, time: "07:00", includeProduction: false });
  });
  it("validates, even with leftover email fields", () => {
    const s = defaultSettings();
    const old = { ...s, notifications: { ...s.notifications, digest: { ...s.notifications.digest, enabled: true, recipients: ["not an email"], email: true } } };
    const r = validateSettings(old);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.notifications.digest).not.toHaveProperty("recipients");
  });
});
