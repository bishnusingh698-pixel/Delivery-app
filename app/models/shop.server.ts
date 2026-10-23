/**
 * Shop rows. Every function takes the shop domain first; nothing here can
 * read another store's data.
 */
import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import type { PlanId } from "../../core/types";
import { nowInZone } from "../../core/tz";

export type ShopFlags = {
  welcomeDone?: boolean;
  /** The merchant hid the setup guide on Home. */
  checklistDismissed?: boolean;
  embedDetected?: boolean;
  embedCheckedAt?: string;
  firstOrderAt?: string;
  firstOrderCelebrated?: boolean;
  /** Setup guide steps (core/home.ts setupGuide). */
  methodsSaved?: boolean;
  scheduleSaved?: boolean;
  previewed?: boolean;
  holidayYearOffered?: number;
  usageWarnedMonth?: string;
};

export type ShopWarning = { code: string; at: string; detail?: string };

export async function getShop(shop: string): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { shop } });
}

export async function requireShop(shop: string): Promise<Shop> {
  const row = await prisma.shop.findUnique({ where: { shop } });
  if (row) return row;
  // Can happen if the install hook failed; create a minimal row.
  return prisma.shop.create({ data: { shop } });
}

export function flagsOf(row: Pick<Shop, "flags">): ShopFlags {
  return (row.flags as ShopFlags) ?? {};
}

export function warningsOf(row: Pick<Shop, "warnings">): ShopWarning[] {
  return Array.isArray(row.warnings) ? (row.warnings as ShopWarning[]) : [];
}

export async function setFlags(shop: string, patch: ShopFlags) {
  const row = await requireShop(shop);
  return prisma.shop.update({ where: { shop }, data: { flags: { ...flagsOf(row), ...patch } } });
}

export async function addWarning(shop: string, code: string, detail?: string) {
  const row = await getShop(shop);
  if (!row) return;
  const list = warningsOf(row).filter((w) => w.code !== code);
  list.push({ code, at: new Date().toISOString(), detail });
  await prisma.shop.update({ where: { shop }, data: { warnings: list.slice(-10) } });
}

export async function clearWarning(shop: string, code: string) {
  const row = await getShop(shop);
  if (!row) return;
  const list = warningsOf(row);
  if (!list.some((w) => w.code === code)) return;
  await prisma.shop.update({ where: { shop }, data: { warnings: list.filter((w) => w.code !== code) } });
}

export function planOf(row: Pick<Shop, "plan" | "isDevStore">): PlanId {
  if (row.isDevStore) return "pro"; // development stores get everything for free
  return (["free", "starter", "pro"].includes(row.plan) ? row.plan : "free") as PlanId;
}

/** Today's civil date in the store's zone. */
export function shopToday(row: Pick<Shop, "timeZone">, at = new Date()): string {
  return nowInZone(row.timeZone || "UTC", at).date;
}
