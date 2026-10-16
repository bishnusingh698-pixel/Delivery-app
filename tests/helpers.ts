import { defaultSettings } from "../core/defaults";
import { toStorefrontConfig } from "../core/publish";
import type { CartLine, PlanId, Settings, StorefrontConfig } from "../core/types";
import type { EngineInput } from "../core/engine";

export function settings(mut?: (s: Settings) => void): Settings {
  const s = defaultSettings("DE");
  mut?.(s);
  return s;
}

export function config(mut?: (s: Settings) => void, plan: PlanId = "pro", tz = "Europe/Berlin"): StorefrontConfig {
  return toStorefrontConfig(settings(mut), {
    version: 1,
    timeZone: tz,
    primaryLocale: "en",
    plan,
    overLimit: false,
    currency: "EUR",
    debugUntil: null,
    today: "2026-01-01",
  });
}

export const line = (over: Partial<CartLine> = {}): CartLine => ({
  key: over.key ?? "k1",
  productId: "1",
  variantId: "11",
  quantity: 1,
  title: "Sourdough",
  requiresShipping: true,
  ...over,
});

export function input(cfg: StorefrontConfig, over: Partial<EngineInput>): EngineInput {
  return {
    config: cfg,
    availability: null,
    method: "shipping",
    now: { date: "2026-10-14", minutes: 9 * 60 },
    lines: [line()],
    ...over,
  };
}
