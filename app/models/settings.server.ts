/**
 * Settings document storage (one JSON row per shop) + activity log.
 */
import prisma from "../db.server";
import { defaultSettings } from "../../core/defaults";
import type { Settings } from "../../core/types";
import { readSettings } from "../services/settings-schema.server";

export async function loadSettings(shop: string): Promise<{ settings: Settings; version: number }> {
  const row = await prisma.settings.findUnique({ where: { shop } });
  if (!row) return { settings: defaultSettings(), version: 0 };
  return { settings: readSettings(row.data), version: row.version };
}

export async function storeSettings(shop: string, settings: Settings): Promise<number> {
  const row = await prisma.settings.upsert({
    where: { shop },
    create: { shop, data: settings as object, version: 1 },
    update: { data: settings as object, version: { increment: 1 } },
  });
  return row.version;
}

export async function logActivity(shop: string, kind: string, summary: string, actor?: string | null, detail?: unknown) {
  await prisma.activityLog.create({
    data: { shop, kind, summary: summary.slice(0, 500), actor: actor ?? null, detail: (detail ?? undefined) as object | undefined },
  });
}

export async function recentActivity(shop: string, take = 50) {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  return prisma.activityLog.findMany({ where: { shop, at: { gte: since } }, orderBy: { at: "desc" }, take });
}

/** Human summary of which top-level sections changed. */
export function diffSummary(before: Settings, after: Settings): string[] {
  const labels: Record<string, string> = {
    methods: "Methods & schedule",
    methodOrder: "Method order",
    defaultMethod: "Default method",
    dateMode: "Date mode",
    locations: "Pickup locations",
    closures: "Closures",
    specialDays: "Special open days",
    vacation: "Vacation mode",
    areas: "Delivery areas",
    zones: "Delivery zones",
    productRules: "Product rules",
    surcharges: "Surcharges",
    checkoutMatching: "Checkout matching",
    widget: "Widget appearance",
    texts: "Texts & translations",
    notifications: "Notifications",
    tagging: "Order tags",
  };
  const changed: string[] = [];
  for (const k of Object.keys(labels) as (keyof Settings)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(labels[k]);
  }
  return changed;
}
