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

/** Throw if a mutation payload has userErrors. */
export function assertNoUserErrors(payload: { userErrors?: { field?: string[] | null; message: string }[] } | null | undefined, what: string) {
  const errs = payload?.userErrors ?? [];
  if (errs.length) throw new ShopifyGraphqlError(`${what}: ${errs.map((e) => e.message).join("; ")}`, errs);
}

export const gid = (type: string, id: string | number) => `gid://shopify/${type}/${id}`;
export const numericId = (g: string | null | undefined) => (g ? String(g).split("/").pop()!.split("?")[0] : "");
