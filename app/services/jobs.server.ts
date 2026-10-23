/**
 * Scheduled work, triggered by cron-job.org (POST with X-Pickday-Secret).
 * Hourly: roll each store's availability window forward / republish if stale, send digests.
 * Daily: prune old data, re-check the theme app embed.
 * Each store is handled on its own; one failure never stops the rest.
 */
import prisma from "../db.server";
import { addDays } from "../../core/civil";
import { requireShop, shopToday } from "../models/shop.server";
import { unauthenticated } from "../shopify.server";
import { sendDigestIfDue } from "./digest.server";
import { checkEmbed } from "./embed.server";
import { refreshShopInfo } from "./install.server";
import { publishShop, schedulePublish, timeShiftsChanged } from "./publish.server";
import { collectionIdsIn, resolveCollectionProducts, resolveTagProducts, tagsIn } from "./collections.server";
import { recountFuture } from "./counts.server";
import { loadSettings, storeSettings } from "../models/settings.server";

const running = new Map<string, Promise<unknown>>();

/** Run a job in the background so cron-job.org gets an instant answer; never two of the same job at once. */
export function runInBackground(name: string, fn: () => Promise<unknown>): boolean {
  if (running.has(name)) return false;
  const started = Date.now();
  const p = fn()
    .then((r) => console.log(`[jobs] ${name} done in ${Date.now() - started} ms`, r))
    .catch((e) => console.error(`[jobs] ${name} failed`, e))
    .finally(() => running.delete(name));
  running.set(name, p);
  return true;
}

export async function hourly() {
  const shops = await prisma.shop.findMany({ where: { active: true }, select: { shop: true, timeZone: true, publishedFor: true, countsDirty: true, publishedAt: true } });
  let published = 0;
  let digests = 0;
  let errors = 0;
  for (const s of shops) {
    try {
      const today = shopToday(s);
      const stale =
        s.publishedFor !== today ||
        s.countsDirty ||
        !s.publishedAt ||
        Date.now() - s.publishedAt.getTime() > 6 * 3600_000 ||
        // Pickup locations in other time zones: republish as soon as a DST change moves their offset.
        timeShiftsChanged({ tz: s.timeZone, locations: (await loadSettings(s.shop)).settings.locations }, s.publishedAt);
      if (stale) {
        await publishShop(s.shop, undefined, { functions: false });
        published++;
      }
      if (await sendDigestIfDue(s.shop)) digests++;
    } catch (e) {
      errors++;
      console.error("[jobs] hourly", s.shop, (e as Error).message);
    }
  }
  return { shops: shops.length, published, digests, errors };
}

export async function daily() {
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86400_000);
  const pruned = {
    webhooks: (await prisma.webhookLog.deleteMany({ where: { createdAt: { lt: days(7) } } })).count,
    activity: (await prisma.activityLog.deleteMany({ where: { at: { lt: days(180) } } })).count,
    digests: (await prisma.digestLog.deleteMany({ where: { sentAt: { lt: days(60) } } })).count,
    shareCodes: (await prisma.shareCode.deleteMany({ where: { expiresAt: { lt: new Date() } } })).count,
    counts: 0,
    orders: 0,
  };
  const shops = await prisma.shop.findMany({ where: { active: true }, select: { shop: true, timeZone: true } });
  for (const s of shops) {
    const cutoff = addDays(shopToday(s), -3);
    pruned.counts += (await prisma.capacityCount.deleteMany({ where: { shop: s.shop, date: { lt: cutoff } } })).count;
    pruned.counts += (await prisma.productCount.deleteMany({ where: { shop: s.shop, date: { lt: cutoff } } })).count;
    // Schedules are kept 13 months (reports, "same time last year"), then removed.
    const old = addDays(shopToday(s), -400);
    pruned.orders += (await prisma.scheduledItem.deleteMany({ where: { shop: s.shop, date: { lt: old } } })).count;
    pruned.orders += (await prisma.scheduledOrder.deleteMany({ where: { shop: s.shop, date: { lt: old } } })).count;
    try {
      const { admin } = await unauthenticated.admin(s.shop);
      await refreshShopInfo(s.shop, admin).catch((e) => console.error("[jobs] shop info", s.shop, (e as Error).message));
      await checkEmbed(s.shop, admin);
      await refreshCollections(s.shop, admin);
    } catch (e) {
      console.error("[jobs] embed/collections", s.shop, (e as Error).message);
    }
  }
  // Stores uninstalled more than 60 days ago without a shop/redact: remove what's left.
  const gone = await prisma.shop.findMany({ where: { active: false, uninstalledAt: { lt: days(60) } }, select: { shop: true } });
  for (const g of gone) {
    await prisma.$transaction([
      prisma.scheduledItem.deleteMany({ where: { shop: g.shop } }),
      prisma.scheduledOrder.deleteMany({ where: { shop: g.shop } }),
      prisma.capacityCount.deleteMany({ where: { shop: g.shop } }),
      prisma.productCount.deleteMany({ where: { shop: g.shop } }),
      prisma.activityLog.deleteMany({ where: { shop: g.shop } }),
      prisma.digestLog.deleteMany({ where: { shop: g.shop } }),
      prisma.shareCode.deleteMany({ where: { shop: g.shop } }),
      prisma.webhookLog.deleteMany({ where: { shop: g.shop } }),
      prisma.settings.deleteMany({ where: { shop: g.shop } }),
      prisma.session.deleteMany({ where: { shop: g.shop } }),
      prisma.shop.deleteMany({ where: { shop: g.shop } }),
    ]);
  }
  return { pruned, checked: shops.length, cleanedUninstalled: gone.length };
}

/**
 * Products added to or removed from a collection, or tagged/untagged, for product rules:
 * refresh the stored copy (D-35), and the counts that depend on it.
 */
export async function refreshCollections(shop: string, admin: Parameters<typeof resolveCollectionProducts>[0]) {
  const { settings } = await loadSettings(shop);
  const ids = collectionIdsIn(settings.productRules);
  const tags = tagsIn(settings.productRules);
  if (!ids.length && !tags.length) return;
  const collectionProducts = await resolveCollectionProducts(admin, ids);
  const tagProducts = await resolveTagProducts(admin, tags);
  const old = settings.productRules;
  if (JSON.stringify(collectionProducts) === JSON.stringify(old.collectionProducts) && JSON.stringify(tagProducts) === JSON.stringify(old.tagProducts)) return;
  const next = { ...settings, productRules: { ...old, collectionProducts, tagProducts } };
  await storeSettings(shop, next);
  if (next.productRules.limits.length) await recountFuture(shop, next, shopToday(await requireShop(shop)));
  schedulePublish(shop);
}

export function authorized(request: Request): boolean {
  const secret = process.env.JOBS_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = request.headers.get("x-pickday-secret") ?? "";
  if (got.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
