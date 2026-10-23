/**
 * Collection membership and title lookups for product rules.
 *
 * Order webhooks and Functions only see product ids, so collections and tags used
 * in rule targets are resolved to product ids when the merchant saves (and daily).
 */
import type { ProductRules, Target } from "../../core/types";
import { gid, gql, numericId, type AdminGraphql } from "./graphql.server";

/** Max products stored per collection. */
export const COLLECTION_PRODUCT_CAP = 2000;
const PAGE = 250;

/** Every target used in product rules. */
export function ruleTargets(rules: Pick<ProductRules, "exclude" | "extraLead" | "restrictions" | "limits" | "methodOnly">): Target[] {
  return [
    rules.exclude,
    ...rules.extraLead.map((r) => r.target),
    ...rules.restrictions.map((r) => r.target),
    ...rules.limits.map((r) => r.target),
    ...rules.methodOnly.map((r) => r.target),
  ].filter(Boolean);
}

/** Unique numeric collection ids used in product rules. */
export function collectionIdsIn(rules: Parameters<typeof ruleTargets>[0]): string[] {
  return [...new Set(ruleTargets(rules).flatMap((t) => t.collections ?? []))].filter(Boolean);
}

/** Unique tags (lower case, as Shopify compares them) used in product rules. */
export function tagsIn(rules: Parameters<typeof ruleTargets>[0]): string[] {
  return [...new Set(ruleTargets(rules).flatMap((t) => (t.tags ?? []).map((g) => g.trim().toLowerCase())))].filter(Boolean);
}

const COLLECTION_PRODUCTS = `#graphql
  query CollectionProducts($id: ID!, $first: Int!, $after: String) {
    collection(id: $id) {
      products(first: $first, after: $after) {
        nodes { id }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;

/**
 * Collection id -> numeric product ids (capped at 2000 per collection).
 * A collection that no longer exists maps to an empty list.
 */
export async function resolveCollectionProducts(admin: AdminGraphql, ids: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const id of [...new Set(ids)]) {
    const products: string[] = [];
    let after: string | null = null;
    while (products.length < COLLECTION_PRODUCT_CAP) {
      const data: any = await gql(admin, COLLECTION_PRODUCTS, { id: gid("Collection", id), first: PAGE, after });
      const conn = data?.collection?.products;
      if (!conn) break;
      for (const n of conn.nodes ?? []) products.push(numericId(n.id));
      if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    out[id] = products.slice(0, COLLECTION_PRODUCT_CAP);
  }
  return out;
}

const TAGGED_PRODUCTS = `#graphql
  query TaggedProducts($query: String!, $first: Int!, $after: String) {
    products(first: $first, after: $after, query: $query) {
      nodes { id }
      pageInfo { hasNextPage endCursor }
    }
  }`;

/** Lower-case tag -> numeric ids of products with that tag (capped like collections). */
export async function resolveTagProducts(admin: AdminGraphql, tags: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const tag of [...new Set(tags.map((g) => g.trim().toLowerCase()))].filter(Boolean)) {
    const products: string[] = [];
    let after: string | null = null;
    while (products.length < COLLECTION_PRODUCT_CAP) {
      const data: any = await gql(admin, TAGGED_PRODUCTS, { query: `tag:${JSON.stringify(tag)}`, first: PAGE, after });
      const conn = data?.products;
      if (!conn) break;
      for (const n of conn.nodes ?? []) products.push(numericId(n.id));
      if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    out[tag] = products.slice(0, COLLECTION_PRODUCT_CAP);
  }
  return out;
}

/**
 * Fresh collection and tag membership for the rules. If Shopify can't be reached,
 * keep what was resolved before for ids and tags still in use.
 */
export async function resolveRuleProducts(admin: AdminGraphql, rules: Parameters<typeof ruleTargets>[0], old: Pick<ProductRules, "collectionProducts" | "tagProducts">) {
  const ids = collectionIdsIn(rules);
  const tags = tagsIn(rules);
  const keep = (list: string[], prev: Record<string, string[]>) => Object.fromEntries(list.map((k) => [k, prev[k] ?? []]));
  const collectionProducts = await resolveCollectionProducts(admin, ids).catch((e) => {
    console.error("[rules] collections", (e as Error).message);
    return keep(ids, old.collectionProducts);
  });
  const tagProducts = await resolveTagProducts(admin, tags).catch((e) => {
    console.error("[rules] tags", (e as Error).message);
    return keep(tags, old.tagProducts ?? {});
  });
  return { collectionProducts, tagProducts };
}

export interface TargetTitle {
  title: string;
  /** For variants: numeric id of the parent product. */
  productId?: string;
}

const NODES = `#graphql
  query RuleTargetTitles($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      id
      ... on Product { title }
      ... on ProductVariant { displayName product { id } }
      ... on Collection { title }
    }
  }`;

/** Titles for every product, variant and collection used in the rules, keyed by GraphQL gid. */
export async function resolveTargetTitles(admin: AdminGraphql, targets: Target[]): Promise<Record<string, TargetTitle>> {
  const ids = new Set<string>();
  for (const t of targets) {
    t.products.forEach((id) => ids.add(gid("Product", id)));
    t.variants.forEach((id) => ids.add(gid("ProductVariant", id)));
    t.collections.forEach((id) => ids.add(gid("Collection", id)));
  }
  const all = [...ids];
  const out: Record<string, TargetTitle> = {};
  for (let i = 0; i < all.length; i += PAGE) {
    const data = await gql<{ nodes: (null | { __typename: string; id: string; title?: string; displayName?: string; product?: { id: string } })[] }>(
      admin,
      NODES,
      { ids: all.slice(i, i + PAGE) },
    );
    for (const n of data?.nodes ?? []) {
      if (!n) continue;
      if (n.__typename === "ProductVariant") out[n.id] = { title: n.displayName ?? "", productId: n.product ? numericId(n.product.id) : undefined };
      else out[n.id] = { title: n.title ?? "" };
    }
  }
  return out;
}
