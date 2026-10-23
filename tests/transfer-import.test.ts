/** Import (Settings > Copy settings) when Shopify refuses the imported fees. */
import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../core/defaults";

const saveSettings = vi.fn(async () => ({ ok: true }));
const consumeShareCode = vi.fn(async () => ({ from: "a.myshopify.com" }));
vi.mock("../app/db.server", () => ({ default: {} }));
vi.mock("../app/services/settings.server", () => ({
  adminContext: async () => ({ shop: "b.myshopify.com", plan: "pro", settings: defaultSettings("US"), admin: {}, actor: "me" }),
  saveSettings: (...a: unknown[]) => saveSettings(...(a as [])),
}));
vi.mock("../app/models/settings.server", async (orig) => ({ ...(await orig<object>()), logActivity: vi.fn(async () => {}), recentActivity: vi.fn(async () => []) }));
vi.mock("../app/services/fee-product.server", () => ({
  syncFeeProduct: vi.fn(async () => {
    throw new Error("Fee product: Shopify said no");
  }),
}));
vi.mock("../app/services/transfer.server", async (orig) => ({
  ...(await orig<object>()),
  readShareCode: async () => doc,
  consumeShareCode: (...a: unknown[]) => consumeShareCode(...(a as [])),
}));

const { exportDocument } = await import("../app/services/transfer.server");
const withFee = defaultSettings("US");
withFee.surcharges = [{ id: "f", label: "Saturday", kind: "weekday", weekdays: [6], dates: [], slotIds: [], methods: "all", amount: "5.00", variantId: null }];
const doc = JSON.parse(JSON.stringify(exportDocument("a.myshopify.com", withFee)));
const { action } = await import("../app/routes/app.settings.transfer");

const post = (body: unknown) => action({ request: new Request("https://x/app/settings/transfer", { method: "POST", body: JSON.stringify(body) }), params: {}, context: {} } as never);

describe("importing settings with fees", () => {
  it("reports a fee product failure, saves nothing and keeps the share code", async () => {
    expect(await post({ intent: "apply", doc })).toEqual({ intent: "apply", ok: false, error: "feeProduct" });
    expect(await post({ intent: "apply", code: "ABCDEFGHJK" })).toEqual({ intent: "apply", ok: false, error: "feeProduct" });
    expect(saveSettings).not.toHaveBeenCalled();
    expect(consumeShareCode).not.toHaveBeenCalled();
  });
});
