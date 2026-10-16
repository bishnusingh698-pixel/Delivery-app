import { describe, expect, it } from "vitest";
import type { Surcharge } from "../core/types";
import {
  FeeProductError,
  assignVariants,
  distinctAmounts,
  normalizeAmount,
  planVariants,
  syncFeeProduct,
  type FeeVariant,
} from "../app/services/fee-product.server";
import type { AdminGraphql } from "../app/services/graphql.server";
import { settings } from "./helpers";

const fee = (over: Partial<Surcharge> = {}): Surcharge => ({
  id: "fee_" + Math.random().toString(36).slice(2, 7),
  label: "Weekend fee",
  kind: "weekday",
  weekdays: [6],
  dates: [],
  slotIds: [],
  methods: "all",
  amount: "5",
  variantId: null,
  ...over,
});

const variant = (id: string, amount: string, over: Partial<FeeVariant> = {}): FeeVariant => ({
  id,
  amount,
  price: amount,
  taxable: true,
  tracked: false,
  requiresShipping: false,
  ...over,
});

describe("pure helpers", () => {
  it("normalizes amounts", () => {
    expect(normalizeAmount("5")).toBe("5.00");
    expect(normalizeAmount("5.5")).toBe("5.50");
    expect(normalizeAmount("abc")).toBeNull();
    expect(normalizeAmount(null)).toBeNull();
  });

  it("collects distinct amounts", () => {
    expect(distinctAmounts([fee({ amount: "5" }), fee({ amount: "5.00" }), fee({ amount: "2.5" })])).toEqual(["5.00", "2.50"]);
  });

  it("plans creates and updates, never deletes", () => {
    const plan = planVariants(["5.00", "7.00"], [variant("1", "5.00"), variant("2", "9.00", { taxable: false })], true);
    expect(plan.create).toEqual(["7.00"]);
    expect(plan.update).toEqual([{ id: "2", amount: "9.00", fixInventory: false }]);
  });

  it("fixes price drift and inventory", () => {
    const plan = planVariants(["5.00"], [variant("1", "5.00", { price: "4.00", tracked: true })], true);
    expect(plan.update).toEqual([{ id: "1", amount: "5.00", fixInventory: true }]);
  });

  it("assigns variant ids by amount", () => {
    const s = settings((x) => (x.surcharges = [fee({ amount: "5" }), fee({ amount: "3" })]));
    const out = assignVariants(s, new Map([["5.00", "111"]]));
    expect(out.surcharges.map((f) => f.variantId)).toEqual(["111", null]);
  });
});

/* ------------------------------------------------------------ fake admin */

type Call = { op: string; variables?: Record<string, any> };

function fakeAdmin(opts: { product?: any; userErrors?: Record<string, string[]> } = {}) {
  const calls: Call[] = [];
  let product = opts.product ?? null;
  let next = 100;
  const ue = (op: string) => (opts.userErrors?.[op] ?? []).map((message) => ({ field: null, message }));
  const rawVariant = (amount: string) => ({
    id: `gid://shopify/ProductVariant/${next++}`,
    price: amount,
    taxable: true,
    selectedOptions: [{ name: "Amount", value: amount }],
    inventoryItem: { tracked: false, requiresShipping: false },
  });
  const admin: AdminGraphql = {
    graphql: async (query, o) => {
      const op = /(?:query|mutation)\s+(\w+)/.exec(query)![1];
      const v: Record<string, any> = o?.variables ?? {};
      calls.push({ op, variables: v });
      let data: any;
      switch (op) {
        case "PickdayFeeProduct":
          data = { productByIdentifier: product };
          break;
        case "PickdayFeeCreate":
          if (ue(op).length) data = { productCreate: { product: null, userErrors: ue(op) } };
          else {
            product = {
              id: "gid://shopify/Product/9",
              status: "ACTIVE",
              handle: v.product.handle,
              variants: { nodes: [{ ...rawVariant(v.product.productOptions[0].values[0].name), price: "0.00" }] },
            };
            data = { productCreate: { product, userErrors: [] } };
          }
          break;
        case "PickdayFeeVariantsCreate":
          data = { productVariantsBulkCreate: { productVariants: ue(op).length ? null : v.variants.map((x: any) => rawVariant(x.price)), userErrors: ue(op) } };
          break;
        case "PickdayFeeVariantsUpdate":
          data = { productVariantsBulkUpdate: { productVariants: [], userErrors: ue(op) } };
          break;
        case "PickdayPublications":
          data = { publications: { nodes: [{ id: "gid://shopify/Publication/1", name: "Online Store" }, { id: "gid://shopify/Publication/2", name: "Shop" }] } };
          break;
        case "PickdayFeePublish":
          data = { publishablePublish: { userErrors: ue(op) } };
          break;
        default:
          data = {};
      }
      return new Response(JSON.stringify({ data }));
    },
  };
  return { admin, calls };
}

describe("syncFeeProduct", () => {
  it("does nothing without surcharges and no product", async () => {
    const { admin, calls } = fakeAdmin();
    const out = await syncFeeProduct(admin, "x.myshopify.com", settings());
    expect(out.surcharges).toEqual([]);
    expect(calls.map((c) => c.op)).toEqual(["PickdayFeeProduct"]);
  });

  it("creates the product, fixes the first variant, adds the rest and publishes", async () => {
    const { admin, calls } = fakeAdmin();
    const s = settings((x) => (x.surcharges = [fee({ amount: "5" }), fee({ amount: "7.5" }), fee({ amount: "5.00" })]));
    const out = await syncFeeProduct(admin, "x.myshopify.com", s);
    const ops = calls.map((c) => c.op);
    expect(ops).toEqual(["PickdayFeeProduct", "PickdayFeeCreate", "PickdayFeeVariantsUpdate", "PickdayFeeVariantsCreate", "PickdayPublications", "PickdayFeePublish"]);
    const create = calls[1].variables!.product;
    expect(create).toMatchObject({ title: "Delivery fee", handle: "pickday-delivery-fee", status: "ACTIVE", vendor: "Pickday", tags: ["pickday-hidden"] });
    expect(calls[2].variables!.variants[0]).toMatchObject({ price: "5.00", taxable: true });
    expect(calls[3].variables!.variants.map((v: any) => v.price)).toEqual(["7.50"]);
    expect(calls[5].variables!.input).toEqual([{ publicationId: "gid://shopify/Publication/1" }]);
    const [a, b, c] = out.surcharges.map((f) => f.variantId);
    expect(a).toBe("100");
    expect(b).toBe("101");
    expect(c).toBe(a);
  });

  it("reuses existing variants and updates tax", async () => {
    const { admin, calls } = fakeAdmin({
      product: {
        id: "gid://shopify/Product/9",
        status: "ACTIVE",
        handle: "pickday-delivery-fee",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/55", price: "5.00", taxable: true, selectedOptions: [{ name: "Amount", value: "5.00" }], inventoryItem: { tracked: false, requiresShipping: false } }] },
      },
    });
    const s = settings((x) => {
      x.surcharges = [fee({ amount: "5" })];
      x.surchargeTaxable = false;
    });
    const out = await syncFeeProduct(admin, "x.myshopify.com", s);
    expect(out.surcharges[0].variantId).toBe("55");
    expect(calls.map((c) => c.op)).not.toContain("PickdayFeeVariantsCreate");
    expect(calls.find((c) => c.op === "PickdayFeeVariantsUpdate")!.variables!.variants[0]).toMatchObject({ taxable: false });
  });

  it("turns userErrors into a FeeProductError", async () => {
    const { admin } = fakeAdmin({ userErrors: { PickdayFeeCreate: ["Handle has already been taken"] } });
    const s = settings((x) => (x.surcharges = [fee()]));
    await expect(syncFeeProduct(admin, "x.myshopify.com", s)).rejects.toBeInstanceOf(FeeProductError);
  });

  it("does not fail the save when publishing fails", async () => {
    const { admin } = fakeAdmin({ userErrors: { PickdayFeePublish: ["Access denied"] } });
    const s = settings((x) => (x.surcharges = [fee()]));
    const err = console.error;
    console.error = () => {};
    const out = await syncFeeProduct(admin, "x.myshopify.com", s);
    console.error = err;
    expect(out.surcharges[0].variantId).toBe("100");
  });
});
