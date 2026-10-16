/** Copy settings between stores: JSON file or a 24-hour share code. */
import { randomInt } from "node:crypto";
import prisma from "../db.server";
import type { Settings, Target } from "../../core/types";
import { gid, gql, type AdminGraphql } from "./graphql.server";
import { ruleTargets } from "./collections.server";
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

/** Handles for products, variants and collections used in rules, so another store can find its own. */
export type Refs = { products: Record<string, string>; variants: Record<string, string>; collections: Record<string, string> };

export async function refsFor(admin: AdminGraphql, s: Settings): Promise<Refs> {
  const refs: Refs = { products: {}, variants: {}, collections: {} };
  const targets = ruleTargets(s.productRules);
  const ids = [
    ...new Set([
      ...targets.flatMap((t) => t.products.map((x) => gid("Product", x))),
      ...targets.flatMap((t) => t.variants.map((x) => gid("ProductVariant", x))),
      ...targets.flatMap((t) => t.collections.map((x) => gid("Collection", x))),
    ]),
  ];
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const d = await gql(admin, `query($ids: [ID!]!) { nodes(ids: $ids) { id ... on Product { handle } ... on Collection { handle } ... on ProductVariant { sku title product { handle } } } }`, { ids: ids.slice(i, i + 100) });
      for (const n of d.nodes ?? []) {
        if (!n?.id) continue;
        const [type, num] = String(n.id).split("/").slice(-2);
        if (type === "Product") refs.products[num] = n.handle;
        if (type === "Collection") refs.collections[num] = n.handle;
        if (type === "ProductVariant") refs.variants[num] = `${n.product?.handle ?? ""}|${n.title ?? ""}`;
      }
    } catch (e) {
      console.error("[transfer] refs", (e as Error).message);
    }
  }
  return refs;
}

export function exportDocument(shop: string, s: Settings, refs?: Refs) {
  return { kind: EXPORT_KIND, version: 1, from: shop, exportedAt: new Date().toISOString(), refs, settings: portable(s) };
}

/** Map another store's product/variant/collection ids to this store's by handle. Unknown ones are dropped. */
export async function remapTargets(admin: AdminGraphql, s: Settings, refs: Refs | undefined, sameStore: boolean): Promise<{ settings: Settings; missing: string[] }> {
  if (sameStore) return { settings: s, missing: [] };
  const out: Settings = JSON.parse(JSON.stringify(s));
  const missing: string[] = [];
  const cache = new Map<string, string | null>();
  const lookup = async (kind: "product" | "collection", handle: string | undefined) => {
    if (!handle) return null;
    const key = `${kind}:${handle}`;
    if (!cache.has(key)) {
      try {
        const d = await gql(
          admin,
          kind === "product"
            ? `query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id variants(first: 100) { nodes { id title } } } }`
            : `query($h: String!) { collectionByIdentifier(identifier: { handle: $h }) { id } }`,
          { h: handle },
        );
        const node = kind === "product" ? d.productByIdentifier : d.collectionByIdentifier;
        cache.set(key, node ? JSON.stringify(node) : null);
      } catch {
        cache.set(key, null);
      }
    }
    const v = cache.get(key);
    return v ? (JSON.parse(v) as { id: string; variants?: { nodes: { id: string; title: string }[] } }) : null;
  };
  const tail = (g: string) => g.split("/").pop()!;
  const fix = async (t: Target) => {
    const products: string[] = [];
    for (const id of t.products) {
      const p = await lookup("product", refs?.products[id]);
      p ? products.push(tail(p.id)) : missing.push(refs?.products[id] ?? `product ${id}`);
    }
    const variants: string[] = [];
    for (const id of t.variants) {
      const [handle, title] = (refs?.variants[id] ?? "|").split("|");
      const p = await lookup("product", handle || undefined);
      const v = p?.variants?.nodes.find((x) => x.title === title);
      v ? variants.push(tail(v.id)) : missing.push(handle ? `${handle} (${title})` : `variant ${id}`);
    }
    const collections: string[] = [];
    for (const id of t.collections) {
      const c = await lookup("collection", refs?.collections[id]);
      c ? collections.push(tail(c.id)) : missing.push(refs?.collections[id] ?? `collection ${id}`);
    }
    t.products = products;
    t.variants = variants;
    t.collections = collections;
  };
  for (const t of ruleTargets(out.productRules)) await fix(t);
  return { settings: out, missing: [...new Set(missing)] };
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

export async function createShareCode(shop: string, s: Settings, refs?: Refs) {
  const code = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const expiresAt = new Date(Date.now() + 24 * 3600_000);
  await prisma.shareCode.create({ data: { code, shop, data: exportDocument(shop, s, refs) as object, expiresAt } });
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function readShareCode(code: string): Promise<unknown | null> {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length !== 10) return null;
  const row = await prisma.shareCode.findUnique({ where: { code: clean } });
  if (!row || row.expiresAt < new Date() || row.usedAt) return null;
  return row.data;
}

/** A share code works once. Returns false if someone else used it first. */
export async function useShareCode(code: string): Promise<boolean> {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const r = await prisma.shareCode.updateMany({ where: { code: clean, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  return r.count === 1;
}
