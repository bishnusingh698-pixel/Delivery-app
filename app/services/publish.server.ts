/**
 * Publishing: writes everything the storefront and the Functions need into
 * app-owned metafields so they keep working while this server sleeps.
 */
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { addDays } from "../../core/civil";
import { toFunctionConfig, toStorefrontConfig } from "../../core/publish";
import { targetIsEmpty } from "../../core/rules";
import type { Settings, StorefrontConfig } from "../../core/types";
import { loadSettings } from "../models/settings.server";
import { addWarning, clearWarning, planOf, requireShop, shopToday } from "../models/shop.server";
import { buildAvailability, maxWindow } from "./counts.server";
import { assertNoUserErrors, gql, type AdminGraphql } from "./graphql.server";
import { monthlyUsage } from "./usage.server";

export const MF_NAMESPACE = "pickday";
export const FN_NAMESPACE = "$app:pickday";

/** Soft limit we keep each JSON metafield under (Shopify allows more; Functions need less). */
export const CONFIG_WARN_BYTES = 60_000;

let installationIdCache = new Map<string, string>();

async function appInstallationId(shop: string, admin: AdminGraphql): Promise<string> {
  const hit = installationIdCache.get(shop);
  if (hit) return hit;
  const data = await gql<{ currentAppInstallation: { id: string } }>(admin, `#graphql
    query PickdayInstallation { currentAppInstallation { id } }`);
  installationIdCache.set(shop, data.currentAppInstallation.id);
  if (installationIdCache.size > 500) installationIdCache = new Map([[shop, data.currentAppInstallation.id]]);
  return data.currentAppInstallation.id;
}

/** Create (or find) the validation and delivery customization for this shop. */
export async function ensureFunctions(shop: string, admin: AdminGraphql, settings: Settings) {
  const row = await requireShop(shop);
  let { validationId, deliveryCustomizationId } = row;
  const fns = await gql<{ shopifyFunctions: { nodes: { id: string; apiType: string }[] } }>(admin, `#graphql
    query PickdayFunctions { shopifyFunctions(first: 25) { nodes { id apiType } } }`);
  const fnId = (type: string) => fns.shopifyFunctions.nodes.find((n) => n.apiType === type)?.id;

  if (!validationId) {
    const existing = await gql<{ validations: { nodes: { id: string; shopifyFunction: { id: string } }[] } }>(admin, `#graphql
      query PickdayValidations { validations(first: 25) { nodes { id shopifyFunction { id } } } }`);
    const id = fnId("cart_checkout_validation");
    validationId = existing.validations.nodes.find((v) => v.shopifyFunction.id === id)?.id ?? null;
    if (!validationId && id) {
      const res = await gql(admin, `#graphql
        mutation PickdayValidationCreate($validation: ValidationCreateInput!) {
          validationCreate(validation: $validation) { validation { id } userErrors { field message } }
        }`, { validation: { functionId: id, enable: true, blockOnFailure: false, title: "Pickday delivery date" } });
      assertNoUserErrors(res.validationCreate, "validationCreate");
      validationId = res.validationCreate.validation.id;
    }
  }
  if (!deliveryCustomizationId) {
    const existing = await gql<{ deliveryCustomizations: { nodes: { id: string; functionId: string }[] } }>(admin, `#graphql
      query PickdayDeliveryCustomizations { deliveryCustomizations(first: 25) { nodes { id functionId } } }`);
    const id = fnId("delivery_customization");
    deliveryCustomizationId = existing.deliveryCustomizations.nodes.find((d) => d.functionId === id)?.id ?? null;
    if (!deliveryCustomizationId && id) {
      const res = await gql(admin, `#graphql
        mutation PickdayDeliveryCustomizationCreate($deliveryCustomization: DeliveryCustomizationInput!) {
          deliveryCustomizationCreate(deliveryCustomization: $deliveryCustomization) { deliveryCustomization { id } userErrors { field message } }
        }`, { deliveryCustomization: { functionId: id, title: "Pickday checkout matching", enabled: settings.checkoutMatching.enabled } });
      assertNoUserErrors(res.deliveryCustomizationCreate, "deliveryCustomizationCreate");
      deliveryCustomizationId = res.deliveryCustomizationCreate.deliveryCustomization.id;
    }
  } else {
    const res = await gql(admin, `#graphql
      mutation PickdayDeliveryCustomizationUpdate($id: ID!, $deliveryCustomization: DeliveryCustomizationInput!) {
        deliveryCustomizationUpdate(id: $id, deliveryCustomization: $deliveryCustomization) { deliveryCustomization { id } userErrors { field message } }
      }`, { id: deliveryCustomizationId, deliveryCustomization: { enabled: settings.checkoutMatching.enabled } });
    if (res.deliveryCustomizationUpdate.userErrors?.length) deliveryCustomizationId = null; // deleted by merchant; recreate next time
  }
  if (validationId !== row.validationId || deliveryCustomizationId !== row.deliveryCustomizationId) {
    await prisma.shop.update({ where: { shop }, data: { validationId, deliveryCustomizationId } });
  }
  return { validationId, deliveryCustomizationId };
}

/** Collect every tag and collection id used by rules (Function input variables). */
export function ruleVariables(cfg: StorefrontConfig) {
  const tags = new Set<string>();
  const cols = new Set<string>();
  const pr = cfg.productRules;
  const targets = [pr.exclude, ...pr.extraLead.map((r) => r.target), ...pr.restrictions.map((r) => r.target), ...pr.limits.map((r) => r.target), ...pr.methodOnly.map((r) => r.target)];
  for (const t of targets) {
    if (targetIsEmpty(t)) continue;
    t.tags.forEach((g) => tags.add(g));
    t.collections.forEach((c) => cols.add(`gid://shopify/Collection/${c}`));
  }
  return { ruleTags: [...tags].slice(0, 100), ruleCollections: [...cols].slice(0, 100) };
}

export interface PublishResult {
  config: StorefrontConfig;
  bytes: { config: number; availability: number; fn: number };
}

/** Build and write all metafields for one shop. */
export async function publishShop(shop: string, admin?: AdminGraphql, opts: { functions?: boolean } = {}): Promise<PublishResult> {
  const client = admin ?? (await unauthenticated.admin(shop)).admin;
  const row = await requireShop(shop);
  const { settings, version } = await loadSettings(shop);
  const today = shopToday(row);
  const plan = planOf(row);
  const usage = await monthlyUsage(shop, row);
  const config = toStorefrontConfig(settings, {
    version,
    timeZone: row.timeZone,
    primaryLocale: row.primaryLocale,
    plan,
    overLimit: usage.over,
    currency: row.currency,
    debugUntil: row.debugUntil && row.debugUntil > new Date() ? row.debugUntil.toISOString() : null,
    today,
  });
  const availability = await buildAvailability(shop, addDays(today, -1), addDays(today, maxWindow(config) + 1));
  const fnConfig = toFunctionConfig(config);
  const vars = ruleVariables(config);

  const ownerId = await appInstallationId(shop, client);
  let ids = { validationId: row.validationId, deliveryCustomizationId: row.deliveryCustomizationId };
  if (opts.functions !== false) {
    try {
      ids = await ensureFunctions(shop, client, settings);
      await clearWarning(shop, "functionsMissing");
    } catch (e) {
      console.error(`[publish] ${shop} functions`, e);
      await addWarning(shop, "functionsMissing");
    }
  }

  const json = (v: unknown) => JSON.stringify(v);
  const metafields: Record<string, unknown>[] = [
    { ownerId, namespace: MF_NAMESPACE, key: "config", type: "json", value: json(config) },
    { ownerId, namespace: MF_NAMESPACE, key: "availability", type: "json", value: json(availability) },
  ];
  if (ids.validationId) {
    metafields.push({ ownerId: ids.validationId, namespace: FN_NAMESPACE, key: "config", type: "json", value: json(fnConfig) });
    metafields.push({ ownerId: ids.validationId, namespace: FN_NAMESPACE, key: "vars", type: "json", value: json(vars) });
  }
  if (ids.deliveryCustomizationId) {
    metafields.push({ ownerId: ids.deliveryCustomizationId, namespace: FN_NAMESPACE, key: "config", type: "json", value: json(deliveryConfig(config, settings)) });
  }
  const res = await gql(client, `#graphql
    mutation PickdayPublish($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { metafields { key } userErrors { field message code } }
    }`, { metafields });
  assertNoUserErrors(res.metafieldsSet, "metafieldsSet");

  const bytes = { config: json(config).length, availability: json(availability).length, fn: json(fnConfig).length };
  if (bytes.config > CONFIG_WARN_BYTES || fnConfig.trimmed) await addWarning(shop, "configLarge", String(bytes.config));
  else await clearWarning(shop, "configLarge");
  await prisma.shop.update({ where: { shop }, data: { publishedAt: new Date(), publishedFor: today, countsDirty: false } });
  return { config, bytes };
}

/** Delivery customization Function config: only what it needs. */
export function deliveryConfig(config: StorefrontConfig, settings: Settings) {
  return {
    enabled: config.checkoutMatching.enabled,
    rename: config.checkoutMatching.renameWithDate,
    rateMap: settings.checkoutMatching.rateMap.map((r) => ({ title: r.title.trim().toLowerCase(), method: r.method })),
    locations: config.locations.map((l) => ({ id: l.id, name: l.name })),
    names: Object.fromEntries(config.methods.map((m) => [m.id, m.names])),
    texts: Object.fromEntries(
      Object.entries(config.texts).map(([loc, map]) => [
        loc,
        Object.fromEntries(Object.entries(map).filter(([k]) => k.startsWith("checkout."))),
      ]),
    ),
  };
}

/* ------------------------------------------------- debounced re-publish */

const pending = new Map<string, NodeJS.Timeout>();

/**
 * Publish soon (coalesces bursts of webhooks into one write).
 * Safe to call often; errors are logged and the hourly job retries.
 */
export function schedulePublish(shop: string, delayMs = 3000) {
  const t = pending.get(shop);
  if (t) clearTimeout(t);
  pending.set(
    shop,
    setTimeout(() => {
      pending.delete(shop);
      publishShop(shop, undefined, { functions: false }).catch(async (e) => {
        console.error(`[publish] ${shop}`, e);
        await prisma.shop.update({ where: { shop }, data: { countsDirty: true } }).catch(() => {});
      });
    }, delayMs),
  );
}
