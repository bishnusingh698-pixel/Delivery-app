/**
 * Install / re-install: create the shop row and default settings, then
 * publish so the storefront works immediately. Idempotent.
 */
import { randomBytes } from "node:crypto";
import type { Session } from "@shopify/shopify-api";
import prisma from "../db.server";
import { defaultSettings } from "../../core/defaults";
import { storeSettings } from "../models/settings.server";
import { gql, type AdminGraphql } from "./graphql.server";
import { forgetInstallation, publishShop } from "./publish.server";

export interface ShopInfo {
  name: string;
  email: string;
  ianaTimezone: string;
  currencyCode: string;
  billingAddress: { countryCodeV2: string | null } | null;
  plan: { partnerDevelopment: boolean; shopifyPlus: boolean };
}

export async function fetchShopInfo(admin: AdminGraphql) {
  return gql<{ shop: ShopInfo; shopLocales: { locale: string; primary: boolean; published: boolean }[] }>(admin, `#graphql
    query PickdayShopInfo {
      shop { name email ianaTimezone currencyCode billingAddress { countryCodeV2 } plan { partnerDevelopment shopifyPlus } }
      shopLocales { locale primary published }
    }`);
}

export async function syncShopInfo(shop: string, admin: AdminGraphql) {
  const data = await fetchShopInfo(admin);
  const s = data.shop;
  const primary = data.shopLocales.find((l) => l.primary)?.locale ?? "en";
  const locales = data.shopLocales.filter((l) => l.published).map((l) => l.locale);
  const fields = {
    active: true,
    uninstalledAt: null,
    name: s.name,
    email: s.email,
    timeZone: s.ianaTimezone || "UTC",
    currency: s.currencyCode,
    country: s.billingAddress?.countryCodeV2 ?? null,
    primaryLocale: primary,
    locales,
    isDevStore: !!s.plan?.partnerDevelopment,
  };
  return prisma.shop.upsert({
    where: { shop },
    create: { shop, ...fields, feedToken: randomBytes(24).toString("hex") },
    update: fields,
  });
}

export async function onInstall(session: Session, admin: AdminGraphql) {
  const shop = session.shop;
  try {
    const row = await syncShopInfo(shop, admin);
    const existing = await prisma.settings.findUnique({ where: { shop } });
    if (!existing) await storeSettings(shop, defaultSettings(row.country));
    if (!row.feedToken) {
      await prisma.shop.update({ where: { shop }, data: { feedToken: randomBytes(24).toString("hex") } });
    }
    forgetInstallation(shop);
    await publishShop(shop, admin);
  } catch (e) {
    // Never block the merchant from opening the app; Home shows a warning and the hourly job retries.
    console.error(`[install] ${shop}`, e);
    await prisma.shop
      .upsert({ where: { shop }, create: { shop, countsDirty: true }, update: { countsDirty: true } })
      .catch(() => {});
  }
}
