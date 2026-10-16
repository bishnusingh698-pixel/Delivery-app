/**
 * Shared loader/action helpers for admin settings pages.
 */
import type { Shop } from "@prisma/client";
import { authenticate } from "../shopify.server";
import type { PlanId, Settings } from "../../core/types";
import { diffSummary, loadSettings, logActivity, storeSettings } from "../models/settings.server";
import { planOf, requireShop, shopToday } from "../models/shop.server";
import { recountFuture } from "./counts.server";
import { publishShop } from "./publish.server";
import { validateSettings, type SettingsIssue } from "./settings-schema.server";
import type { AdminGraphql } from "./graphql.server";

export interface AdminContext {
  shop: string;
  admin: AdminGraphql;
  row: Shop;
  settings: Settings;
  version: number;
  plan: PlanId;
  today: string;
  actor: string | null;
}

export async function adminContext(request: Request): Promise<AdminContext> {
  const { session, admin } = await authenticate.admin(request);
  const row = await requireShop(session.shop);
  const { settings, version } = await loadSettings(session.shop);
  const actor = session.onlineAccessInfo?.associated_user
    ? [session.onlineAccessInfo.associated_user.first_name, session.onlineAccessInfo.associated_user.last_name].filter(Boolean).join(" ")
    : "Staff";
  return { shop: session.shop, admin, row, settings, version, plan: planOf(row), today: shopToday(row), actor };
}

/** What every settings page needs on the client. */
export function shopMeta(ctx: AdminContext) {
  return {
    shop: ctx.shop,
    plan: ctx.plan,
    timeZone: ctx.row.timeZone,
    currency: ctx.row.currency,
    country: ctx.row.country,
    primaryLocale: ctx.row.primaryLocale,
    locales: ctx.row.locales.length ? ctx.row.locales : [ctx.row.primaryLocale],
    today: ctx.today,
  };
}
export type ShopMeta = ReturnType<typeof shopMeta>;

export type SaveResult = { ok: true; version: number; settings: Settings; warnings?: string[] } | { ok: false; issues: SettingsIssue[] };

/** Keys whose change can alter capacity keys or counts. */
const COUNT_KEYS: (keyof Settings)[] = ["zones", "locations", "productRules", "methods"];

export async function saveSettings(ctx: AdminContext, next: Settings, summary?: string): Promise<SaveResult> {
  const v = validateSettings(next);
  if (!v.ok) return { ok: false, issues: v.issues };
  const changed = diffSummary(ctx.settings, v.data);
  const version = await storeSettings(ctx.shop, v.data);
  await logActivity(ctx.shop, "settings", summary ?? `Changed: ${changed.join(", ") || "no visible change"}`, ctx.actor);
  if (COUNT_KEYS.some((k) => JSON.stringify(ctx.settings[k]) !== JSON.stringify(v.data[k]))) {
    await recountFuture(ctx.shop, v.data, ctx.today);
  }
  const warnings: string[] = [];
  try {
    await publishShop(ctx.shop, ctx.admin);
  } catch (e) {
    console.error(`[settings] publish ${ctx.shop}`, e);
    warnings.push("publishFailed");
  }
  return { ok: true, version, settings: v.data, warnings };
}

/**
 * Standard settings action: the page posts JSON `{ patch: Partial<Settings> }`
 * containing the top-level sections it edits.
 */
export async function patchSettingsAction(request: Request): Promise<SaveResult> {
  const ctx = await adminContext(request);
  const body = (await request.json()) as { patch?: Partial<Settings> };
  const patch = body.patch ?? {};
  // Never accept server-managed fields from the client.
  const { productRules, ...rest } = patch;
  const next: Settings = { ...ctx.settings, ...rest } as Settings;
  if (productRules) next.productRules = { ...productRules, collectionProducts: ctx.settings.productRules.collectionProducts };
  // Set by its own button ("I've added it"); a stale form must not undo it.
  if (rest.notifications) next.notifications = { ...rest.notifications, emailSnippetConfirmed: ctx.settings.notifications.emailSnippetConfirmed };
  return saveSettings(ctx, next);
}
