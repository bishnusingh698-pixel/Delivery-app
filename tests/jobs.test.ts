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
  it("survives bad JSON", () => expect(embedEnabledIn("{nope")).toBe(false));
});

describe("checkout leniency while the app embed is off", () => {
  it("treats an embed that isn't known to be on as off (new install, reinstall, failed check)", async () => {
    const { embedOffFor } = await import("../app/services/publish.server");
    expect(embedOffFor({})).toBe(true);
    expect(embedOffFor({ embedDetected: false })).toBe(true);
    expect(embedOffFor({ embedDetected: true })).toBe(false);
  });
});
