import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/db.server", () => ({ default: {} }));
vi.mock("../app/shopify.server", () => ({ unauthenticated: {} }));

const { authorized } = await import("../app/services/jobs.server");
const { embedEnabledIn } = await import("../app/services/embed.server");

const req = (secret?: string) => new Request("https://x/jobs/hourly", { method: "POST", headers: secret ? { "X-Pickday-Secret": secret } : {} });

describe("jobs secret", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("accepts only the exact secret", () => {
    vi.stubEnv("JOBS_SECRET", "a-long-secret-value-123");
    expect(authorized(req("a-long-secret-value-123"))).toBe(true);
    expect(authorized(req("a-long-secret-value-124"))).toBe(false);
    expect(authorized(req())).toBe(false);
  });
  it("refuses everything when the secret is missing or short", () => {
    vi.stubEnv("JOBS_SECRET", "short");
    expect(authorized(req("short"))).toBe(false);
  });
});

describe("theme app embed detection", () => {
  const data = (disabled: boolean) =>
    `/* auto-generated */\n${JSON.stringify({ current: { blocks: { "123": { type: "shopify://apps/pickday-delivery-date-picker/blocks/app-embed/abc-123", disabled, settings: {} } } } })}`;
  it("finds an enabled embed", () => expect(embedEnabledIn(data(false))).toBe(true));
  it("ignores a disabled embed", () => expect(embedEnabledIn(data(true))).toBe(false));
  it("reports unknown (not off) for unreadable settings", () => {
    expect(embedEnabledIn("{nope")).toBeNull();
    expect(embedEnabledIn(JSON.stringify({ current: "Missing preset", presets: {} }))).toBeNull();
  });
  it("reads a preset named by current", () => {
    const block = { type: "shopify://apps/pickday-delivery-date-picker/blocks/app-embed/abc-123", disabled: false };
    expect(embedEnabledIn(JSON.stringify({ current: "Default", presets: { Default: { blocks: { "1": block } } } }))).toBe(true);
  });
});

describe("hourly republish for pickup locations in other time zones", () => {
  it("notices when a DST change moves a location's offset", async () => {
    const { timeShiftsChanged } = await import("../app/services/publish.server");
    const cfg = { tz: "Europe/Berlin", locations: [{ id: "ny", timeZone: "America/New_York" }] } as never;
    // New York moves to summer time on 8 March 2026 at 07:00 UTC; Berlin only on 29 March.
    expect(timeShiftsChanged(cfg, new Date("2026-03-08T05:00:00Z"), new Date("2026-03-08T08:00:00Z"))).toBe(true);
    expect(timeShiftsChanged(cfg, new Date("2026-03-08T08:00:00Z"), new Date("2026-03-08T12:00:00Z"))).toBe(false);
  });
});

describe("thank-you block config", () => {
  it("names the time zone of pickup locations outside the store's zone", async () => {
    const { thankYouConfig } = await import("../app/services/publish.server");
    const cfg = { tz: "Europe/Berlin", methods: [], locations: [{ id: "ny", timeZone: "America/New_York", instructions: {} }, { id: "b", timeZone: null, instructions: {} }] } as never;
    expect(thankYouConfig(cfg).ltz).toEqual({ ny: "America/New_York" });
  });
});
