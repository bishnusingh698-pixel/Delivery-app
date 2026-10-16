/** Copy settings between stores: JSON file or a 24-hour share code. */
import { randomInt } from "node:crypto";
import prisma from "../db.server";
import type { Settings } from "../../core/types";
import { diffSummary } from "../models/settings.server";
import { validateSettings } from "./settings-schema.server";

export const EXPORT_KIND = "pickday-settings";

/** Remove what only makes sense in the source store. */
export function portable(s: Settings): Settings {
  const out: Settings = JSON.parse(JSON.stringify(s));
  out.locations = out.locations.map((l) => ({ ...l, shopifyLocationId: null }));
  out.surcharges = out.surcharges.map((f) => ({ ...f, variantId: null }));
  out.productRules.collectionProducts = {};
  return out;
}

export function exportDocument(shop: string, s: Settings) {
  return { kind: EXPORT_KIND, version: 1, from: shop, exportedAt: new Date().toISOString(), settings: portable(s) };
}

/** Validate an uploaded document and say what would change. */
export function prepareImport(current: Settings, doc: unknown): { ok: true; settings: Settings; changes: string[]; productIds: boolean; fees: boolean } | { ok: false; error: string } {
  const d = doc as { kind?: string; settings?: unknown } | null;
  if (!d || d.kind !== EXPORT_KIND || typeof d.settings !== "object") return { ok: false, error: "notPickday" };
  const v = validateSettings(d.settings);
  if (!v.ok) return { ok: false, error: "invalid" };
  const next = portable(v.data);
  const t = next.productRules;
  const productIds = [t.exclude, ...t.extraLead.map((r) => r.target), ...t.restrictions.map((r) => r.target), ...t.limits.map((r) => r.target), ...t.methodOnly.map((r) => r.target)].some(
    (x) => x.products.length || x.variants.length || x.collections.length,
  );
  return { ok: true, settings: next, changes: diffSummary(current, next), productIds, fees: next.surcharges.length > 0 };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export async function createShareCode(shop: string, s: Settings) {
  const code = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const expiresAt = new Date(Date.now() + 24 * 3600_000);
  await prisma.shareCode.create({ data: { code, shop, data: exportDocument(shop, s) as object, expiresAt } });
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function readShareCode(code: string): Promise<unknown | null> {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length !== 10) return null;
  const row = await prisma.shareCode.findUnique({ where: { code: clean } });
  if (!row || row.expiresAt < new Date()) return null;
  return row.data;
}
