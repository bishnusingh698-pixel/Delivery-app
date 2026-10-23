import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/db.server", () => ({ default: {} }));
vi.mock("../app/shopify.server", () => ({ unauthenticated: {} }));

const { digestChannels, deliverDigest, flowSummaryPayload, truncateLines, ordersLink, FLOW_SUMMARY_MAX } = await import("../app/services/digest.server");
const { readSettings, validateSettings } = await import("../app/services/settings-schema.server");
const { defaultSettings } = await import("../core/defaults");

type Digest = Parameters<typeof deliverDigest>[0];
const more = (n: number) => `…and ${n} more`;
const digest = (over: Partial<Digest> = {}): Digest => ({
  date: "2026-10-24",
  dateLabel: "Saturday, 24 October 2026",
  counts: { total: 5, delivery: 3, pickup: 2, shipping: 0 },
  lines: ["Local delivery: 3", "  09:00-12:00: 2", "  12:00-15:00: 1", "Pickup: 2"],
  link: "https://admin.shopify.com/store/demo/apps/pickday/app/orders?range=custom&from=2026-10-24&to=2026-10-24",
  subject: "Pickday: 5 orders",
  html: "<p>x</p>",
  text: "x",
  recipients: ["a@b.co"],
  more,
  ...over,
});
const digestSettings = (over: Partial<ReturnType<typeof defaultSettings>["notifications"]["digest"]> = {}) => ({ ...defaultSettings().notifications.digest, enabled: true, ...over });

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

describe("daily summary channels", () => {
  it("Flow only (default): no recipients needed", () => {
    expect(digestChannels(digestSettings({ recipients: [] }), false)).toEqual({ flow: true, email: false });
  });
  it("email only, server configured", () => {
    expect(digestChannels(digestSettings({ flow: false, email: true, recipients: ["a@b.co"] }), true)).toEqual({ flow: false, email: true });
  });
  it("both", () => {
    expect(digestChannels(digestSettings({ flow: true, email: true, recipients: ["a@b.co"] }), true)).toEqual({ flow: true, email: true });
  });
  it("email turned on but not configured on the server, or no recipients: no email", () => {
    expect(digestChannels(digestSettings({ flow: false, email: true, recipients: ["a@b.co"] }), false)).toEqual({ flow: false, email: false });
    expect(digestChannels(digestSettings({ flow: false, email: true, recipients: [] }), true)).toEqual({ flow: false, email: false });
  });
});

describe("deliverDigest", () => {
  afterEach(() => vi.restoreAllMocks());
  const senders = () => ({ flow: vi.fn(async () => true), email: vi.fn(async () => true) });

  it("sends only to the chosen channels", async () => {
    const s = senders();
    expect(await deliverDigest(digest(), { flow: true, email: false }, s)).toEqual({ flow: true, email: false });
    expect(s.flow).toHaveBeenCalledTimes(1);
    expect(s.email).not.toHaveBeenCalled();
    expect((s.flow.mock.calls[0] as unknown[])[0]).toMatchObject({ "Total orders": 5 });

    const e = senders();
    expect(await deliverDigest(digest(), { flow: false, email: true }, e)).toEqual({ flow: false, email: true });
    expect(e.flow).not.toHaveBeenCalled();
    expect(e.email).toHaveBeenCalledWith(["a@b.co"], "Pickday: 5 orders", "<p>x</p>", "x");
  });

  it("a failing Flow call does not stop the email", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = { flow: vi.fn(async () => Promise.reject(new Error("boom"))), email: vi.fn(async () => true) };
    expect(await deliverDigest(digest(), { flow: true, email: true }, s)).toEqual({ flow: false, email: true });
  });
});

describe("digest settings migration", () => {
  it("old settings without channel switches load: Flow on, email kept for stores with recipients", () => {
    const withRecipients = readSettings({ notifications: { digest: { enabled: true, time: "18:00", recipients: ["a@b.co"], includeProduction: true } } });
    expect(withRecipients.notifications.digest).toMatchObject({ enabled: true, flow: true, email: true, recipients: ["a@b.co"] });
    const without = readSettings({ notifications: { digest: { enabled: true, time: "18:00", recipients: [], includeProduction: true } } });
    expect(without.notifications.digest).toMatchObject({ flow: true, email: false });
    expect(readSettings(null).notifications.digest).toMatchObject({ enabled: false, flow: true, email: false });
  });
  it("saved choices are kept", () => {
    const s = readSettings({ notifications: { digest: { enabled: true, time: "18:00", recipients: ["a@b.co"], includeProduction: true, flow: false, email: false } } });
    expect(s.notifications.digest).toMatchObject({ flow: false, email: false });
  });
  it("validates", () => {
    const s = defaultSettings();
    s.notifications.digest = { ...s.notifications.digest, flow: false, email: true, recipients: ["a@b.co"] };
    expect(validateSettings(s).ok).toBe(true);
  });
});
