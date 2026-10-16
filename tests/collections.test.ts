import { describe, expect, it } from "vitest";
import { emptyTarget } from "../core/defaults";
import { COLLECTION_PRODUCT_CAP, collectionIdsIn, resolveCollectionProducts, resolveTargetTitles } from "../app/services/collections.server";
import { applyProductPick, productSelection } from "../app/components/target-picker";
import type { AdminGraphql } from "../app/services/graphql.server";

const json = (data: unknown) => new Response(JSON.stringify({ data }));

function fakeAdmin(handler: (q: string, v: any) => unknown): AdminGraphql & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    graphql: async (q, o) => {
      calls.push(o?.variables);
      return json(handler(q, o?.variables));
    },
  };
}

const rules = (collections: string[][]) => ({
  exclude: { ...emptyTarget(), collections: collections[0] ?? [] },
  extraLead: [{ id: "a", target: { ...emptyTarget(), collections: collections[1] ?? [] }, days: 1 }],
  restrictions: [],
  limits: [],
  methodOnly: [{ id: "b", target: { ...emptyTarget(), collections: collections[2] ?? [] }, methods: ["pickup" as const] }],
});

describe("collectionIdsIn", () => {
  it("collects unique ids from every rule list", () => {
    expect(collectionIdsIn(rules([["1"], ["2", "1"], ["3"]])).sort()).toEqual(["1", "2", "3"]);
  });
});

describe("resolveCollectionProducts", () => {
  it("pages through products and stores numeric ids", async () => {
    const admin = fakeAdmin((_q, v) => {
      const page = v.after ? 2 : 1;
      return {
        collection: {
          products: {
            nodes: page === 1 ? [{ id: "gid://shopify/Product/10" }] : [{ id: "gid://shopify/Product/11" }],
            pageInfo: { hasNextPage: page === 1, endCursor: page === 1 ? "c1" : null },
          },
        },
      };
    });
    expect(await resolveCollectionProducts(admin, ["5", "5"])).toEqual({ "5": ["10", "11"] });
    expect(admin.calls[0].id).toBe("gid://shopify/Collection/5");
    expect(admin.calls[1].after).toBe("c1");
  });

  it("maps a missing collection to an empty list", async () => {
    const admin = fakeAdmin(() => ({ collection: null }));
    expect(await resolveCollectionProducts(admin, ["9"])).toEqual({ "9": [] });
  });

  it("caps products per collection", async () => {
    let n = 0;
    const admin = fakeAdmin((_q, v) => ({
      collection: {
        products: {
          nodes: Array.from({ length: v.first }, () => ({ id: `gid://shopify/Product/${++n}` })),
          pageInfo: { hasNextPage: true, endCursor: "x" },
        },
      },
    }));
    const out = await resolveCollectionProducts(admin, ["1"]);
    expect(out["1"].length).toBe(COLLECTION_PRODUCT_CAP);
    expect(admin.calls.length).toBe(COLLECTION_PRODUCT_CAP / 250);
  });
});

describe("resolveTargetTitles", () => {
  it("returns titles keyed by gid", async () => {
    const admin = fakeAdmin(() => ({
      nodes: [
        { __typename: "Product", id: "gid://shopify/Product/1", title: "Cake" },
        { __typename: "ProductVariant", id: "gid://shopify/ProductVariant/2", displayName: "Cake - Large", product: { id: "gid://shopify/Product/1" } },
        null,
      ],
    }));
    const out = await resolveTargetTitles(admin, [{ products: ["1"], variants: ["2"], collections: ["3"], tags: [] }]);
    expect(out["gid://shopify/Product/1"].title).toBe("Cake");
    expect(out["gid://shopify/ProductVariant/2"]).toEqual({ title: "Cake - Large", productId: "1" });
  });
});

describe("product picker selection", () => {
  const titles = { "gid://shopify/ProductVariant/21": { title: "Bread - Small", productId: "2" } };

  it("preselects products and variants grouped by product", () => {
    const t = { ...emptyTarget(), products: ["1"], variants: ["21", "99"] };
    expect(productSelection(t, titles)).toEqual([
      { id: "gid://shopify/Product/1" },
      { id: "gid://shopify/Product/2", variants: [{ id: "gid://shopify/ProductVariant/21" }] },
    ]);
  });

  it("stores whole products or chosen variants, keeping unknown variants", () => {
    const t = { ...emptyTarget(), products: ["1"], variants: ["21", "99"], tags: ["x"] };
    const out = applyProductPick(t, titles, [
      { id: "gid://shopify/Product/3", title: "Pie", hasOnlyDefaultVariant: true, totalVariants: 1, variants: [{ id: "gid://shopify/ProductVariant/31" }] },
      {
        id: "gid://shopify/Product/2",
        title: "Bread",
        hasOnlyDefaultVariant: false,
        totalVariants: 3,
        variants: [{ id: "gid://shopify/ProductVariant/22", title: "Large" }],
      },
    ]);
    expect(out.target).toEqual({ products: ["3"], variants: ["99", "22"], collections: [], tags: ["x"] });
    expect(out.titles["gid://shopify/ProductVariant/22"]).toEqual({ title: "Bread - Large", productId: "2" });
    expect(out.titles["gid://shopify/Product/3"]).toEqual({ title: "Pie" });
  });
});
