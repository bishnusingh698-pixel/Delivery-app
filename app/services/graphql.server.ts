/**
 * Thin wrapper around the Admin GraphQL client with error handling.
 */
export interface AdminGraphql {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export class ShopifyGraphqlError extends Error {
  constructor(
    message: string,
    public details: unknown,
  ) {
    super(message);
  }
}

export async function gql<T = any>(admin: AdminGraphql, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new ShopifyGraphqlError("GraphQL error", json.errors);
  return json.data as T;
}

/** Shopify's rate limit ("THROTTLED"): worth waiting and trying again. */
export function isThrottled(e: unknown): boolean {
  return e instanceof ShopifyGraphqlError && JSON.stringify(e.details ?? null).includes("THROTTLED");
}

/** Run `fn`, waiting and retrying while Shopify answers THROTTLED (used for bulk work). */
export async function retryThrottled<T>(fn: () => Promise<T>, delaysMs: number[] = [1000, 2000, 4000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= delaysMs.length || !isThrottled(e)) throw e;
      await new Promise((r) => setTimeout(r, delaysMs[i]));
    }
  }
}

/** Throw if a mutation payload has userErrors. */
export function assertNoUserErrors(payload: { userErrors?: { field?: string[] | null; message: string }[] } | null | undefined, what: string) {
  const errs = payload?.userErrors ?? [];
  if (errs.length) throw new ShopifyGraphqlError(`${what}: ${errs.map((e) => e.message).join("; ")}`, errs);
}

export const gid = (type: string, id: string | number) => `gid://shopify/${type}/${id}`;
export const numericId = (g: string | null | undefined) => (g ? String(g).split("/").pop()!.split("?")[0] : "");
