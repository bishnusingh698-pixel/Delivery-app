import { describe, expect, it, vi } from "vitest";
vi.mock("../app/db.server", () => ({ default: {} }));
const { exportDocument, prepareImport } = await import("../app/services/transfer.server");
const { defaultSettings } = await import("../core/defaults");

describe("settings transfer", () => {
  it("round-trips and strips store-specific links", () => {
    const s = defaultSettings("US");
    s.surcharges = [{ id: "f", label: "Saturday", kind: "weekday", weekdays: [6], dates: [], slotIds: [], methods: "all", amount: "5.00", variantId: "123" }];
    const doc = JSON.parse(JSON.stringify(exportDocument("a.myshopify.com", s)));
    expect(doc.settings.surcharges[0].variantId).toBeNull();
    const r = prepareImport(defaultSettings("US"), doc);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.changes).toContain("Surcharges");
      expect(r.fees).toBe(true);
    }
  });
  it("rejects other files", () => {
    expect(prepareImport(defaultSettings(), { hello: 1 })).toEqual({ ok: false, error: "notPickday" });
    expect(prepareImport(defaultSettings(), { kind: "pickday-settings", settings: { methods: "nope" } })).toEqual({ ok: false, error: "invalid" });
  });
});
