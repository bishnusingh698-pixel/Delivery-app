/**
 * The hidden "Delivery fee" product (DECISIONS D-19).
 *
 * Surcharges are real cart lines: one variant of a product owned by the
 * merchant's store per distinct fee amount. The storefront widget adds the
 * variant to the cart and the validation Function checks it. This module makes
 * sure that product exists, has a variant for every amount in use, is
 * published to the Online Store, and writes each surcharge's numeric variant
 * id into the settings before they are saved.
 */
import { normalizeAmount } from "../../core/fees";
import type { Settings, Surcharge } from "../../core/types";
import { gql, numericId, ShopifyGraphqlError, type AdminGraphql } from "./graphql.server";

export const FEE_HANDLE = "pickday-delivery-fee";
export const FEE_TAG = "pickday-hidden";
export const FEE_OPTION = "Amount";

/** Thrown when Shopify refuses a change; `message` is safe to show merchants. */
export class FeeProductError extends Error {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------ pure helpers */

/** "5" -> "5.00", "5.5" -> "5.50". Invalid input returns null. */
export { normalizeAmount };

/** Distinct normalized amounts used by the surcharges, in first-seen order. */
export function distinctAmounts(surcharges: Pick<Surcharge, "amount">[]): string[] {
  const out: string[] = [];
  for (const s of surcharges) {
    const a = normalizeAmount(s.amount);
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

export interface FeeVariant {
  /** Numeric variant id. */
  id: string;
  /** Normalized amount this variant stands for. */
  amount: string;
  price: string;
  taxable: boolean;
  tracked: boolean;
  requiresShipping: boolean;
}

/** Map normalized amount -> numeric variant id (first variant wins on duplicates). */
export function variantsByAmount(variants: FeeVariant[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of variants) if (!map.has(v.amount)) map.set(v.amount, v.id);
  return map;
}

/** What to change on the product so every amount has a correct variant. */
export function planVariants(amounts: string[], existing: FeeVariant[], taxable: boolean) {
  const have = variantsByAmount(existing);
  const create = amounts.filter((a) => !have.has(a));
  // Fix price/tax/shipping on every variant (also unreferenced ones, so an old
  // cart line still behaves). Variants are never deleted here: old carts and
  // open checkouts may still reference them.
  const update = existing
    .filter((v) => normalizeAmount(v.price) !== v.amount || v.taxable !== taxable || v.tracked || v.requiresShipping)
    .map((v) => ({ id: v.id, amount: v.amount, fixInventory: v.tracked || v.requiresShipping }));
  return { create, update };
}

/** Write each surcharge's variant id from the amount mapping. */
export function assignVariants(settings: Settings, map: Map<string, string>): Settings {
  return {
    ...settings,
    surcharges: settings.surcharges.map((s) => ({ ...s, variantId: map.get(normalizeAmount(s.amount) ?? "") ?? null })),
  };
}

/* --------------------------------------------------------------- GraphQL */

const VARIANT_FIELDS = `id price taxable selectedOptions { name value } inventoryItem { tracked requiresShipping }`;
const PRODUCT_FIELDS = `id status handle variants(first: 250) { nodes { ${VARIANT_FIELDS} } }`;

const FIND = `#graphql
  query PickdayFeeProduct($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) { ${PRODUCT_FIELDS} }
  }`;

const CREATE = `#graphql
  mutation PickdayFeeCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { ${PRODUCT_FIELDS} }
      userErrors { field message }
    }
  }`;

const ACTIVATE = `#graphql
  mutation PickdayFeeActivate($product: ProductUpdateInput!) {
    productUpdate(product: $product) { product { id status } userErrors { field message } }
  }`;

const VARIANTS_CREATE = `#graphql
  mutation PickdayFeeVariantsCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { ${VARIANT_FIELDS} }
      userErrors { field message }
    }
  }`;

const VARIANTS_UPDATE = `#graphql
  mutation PickdayFeeVariantsUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message }
    }
  }`;

const PUBLICATIONS = `#graphql
  query PickdayPublications {
    publications(first: 20) { nodes { id name } }
  }`;

const PUBLISH = `#graphql
  mutation PickdayFeePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { field message } }
  }`;

const PUBLISHED = `#graphql
  query PickdayFeePublished($handle: String!, $publicationId: ID!) {
    productByIdentifier(identifier: { handle: $handle }) { id status publishedOnPublication(publicationId: $publicationId) }
  }`;

type RawVariant = {
  id: string;
  price: string;
  taxable: boolean;
  selectedOptions: { name: string; value: string }[];
  inventoryItem: { tracked: boolean; requiresShipping: boolean } | null;
};
type RawProduct = { id: string; status: string; handle: string; variants: { nodes: RawVariant[] } };
type UserErrors = { userErrors: { field?: string[] | null; message: string }[] };

export function toFeeVariant(v: RawVariant): FeeVariant {
  const opt = v.selectedOptions.find((o) => o.name === FEE_OPTION)?.value;
  return {
    id: numericId(v.id),
    amount: normalizeAmount(opt) ?? normalizeAmount(v.price) ?? v.price,
    price: v.price,
    taxable: v.taxable,
    tracked: !!v.inventoryItem?.tracked,
    requiresShipping: !!v.inventoryItem?.requiresShipping,
  };
}

function check(payload: UserErrors | null | undefined, what: string) {
  const errs = payload?.userErrors ?? [];
  if (errs.length) throw new FeeProductError(`${what}: ${errs.map((e) => e.message).join("; ")}`, errs);
}

async function findProduct(admin: AdminGraphql): Promise<RawProduct | null> {
  const data = await gql<{ productByIdentifier: RawProduct | null }>(admin, FIND, { handle: FEE_HANDLE });
  return data.productByIdentifier;
}

async function onlineStorePublicationId(admin: AdminGraphql): Promise<string | null> {
  const data = await gql<{ publications: { nodes: { id: string; name: string }[] } }>(admin, PUBLICATIONS);
  return data.publications.nodes.find((p) => p.name === "Online Store")?.id ?? null;
}

/**
 * Make sure the fee product and its variants exist and return the settings
 * with every surcharge's `variantId` filled in. Throws FeeProductError with a
 * merchant-readable message when Shopify refuses a change.
 */
export async function syncFeeProduct(admin: AdminGraphql, shop: string, settings: Settings): Promise<Settings> {
  const amounts = distinctAmounts(settings.surcharges);
  const taxable = settings.surchargeTaxable;
  try {
    let product = await findProduct(admin);
    if (!amounts.length && !product) return assignVariants(settings, new Map());

    let created = false;
    if (!product) {
      const data = await gql<{ productCreate: UserErrors & { product: RawProduct | null } }>(admin, CREATE, {
        product: {
          title: "Delivery fee",
          handle: FEE_HANDLE,
          status: "ACTIVE",
          vendor: "Pickday",
          productType: "Pickday fee",
          tags: [FEE_TAG],
          descriptionHtml: "<p>Extra charge for the delivery or pickup date you chose. Added automatically by Pickday.</p>",
          productOptions: [{ name: FEE_OPTION, values: [{ name: amounts[0] }] }],
          // Hide from storefront search and search engines.
          metafields: [{ namespace: "seo", key: "hidden", type: "number_integer", value: "1" }],
        },
      });
      check(data.productCreate, "Couldn't create the delivery fee product");
      product = data.productCreate.product!;
      created = true;
    } else if (product.status !== "ACTIVE") {
      const data = await gql<{ productUpdate: UserErrors }>(admin, ACTIVATE, { product: { id: product.id, status: "ACTIVE" } });
      check(data.productUpdate, "Couldn't make the delivery fee product active");
    }

    const existing = product.variants.nodes.map(toFeeVariant);
    const plan = planVariants(amounts, existing, taxable);

    if (plan.update.length) {
      const data = await gql<{ productVariantsBulkUpdate: UserErrors }>(admin, VARIANTS_UPDATE, {
        productId: product.id,
        variants: plan.update.map((u) => ({
          id: `gid://shopify/ProductVariant/${u.id}`,
          price: u.amount,
          taxable,
          ...(u.fixInventory ? { inventoryItem: { tracked: false, requiresShipping: false } } : {}),
        })),
      });
      check(data.productVariantsBulkUpdate, "Couldn't update the delivery fee prices");
    }

    let all = existing;
    if (plan.create.length) {
      const data = await gql<{ productVariantsBulkCreate: UserErrors & { productVariants: RawVariant[] | null } }>(admin, VARIANTS_CREATE, {
        productId: product.id,
        variants: plan.create.map((a) => ({
          optionValues: [{ optionName: FEE_OPTION, name: a }],
          price: a,
          taxable,
          inventoryItem: { tracked: false, requiresShipping: false },
        })),
      });
      check(data.productVariantsBulkCreate, "Couldn't add a price to the delivery fee product");
      all = [...existing, ...(data.productVariantsBulkCreate.productVariants ?? []).map(toFeeVariant)];
    }

    // Publishing is soft: the page shows a warning if the product is not on
    // the Online Store, but the settings still save.
    if (created || amounts.length) {
      try {
        const pub = await onlineStorePublicationId(admin);
        if (pub) {
          const data = await gql<{ publishablePublish: UserErrors }>(admin, PUBLISH, { id: product.id, input: [{ publicationId: pub }] });
          check(data.publishablePublish, "Couldn't publish the delivery fee product");
        }
      } catch (e) {
        console.error(`[fee-product] publish ${shop}`, e);
      }
    }

    return assignVariants(settings, variantsByAmount(all));
  } catch (e) {
    if (e instanceof FeeProductError) throw e;
    if (e instanceof ShopifyGraphqlError) {
      console.error(`[fee-product] ${shop}`, e.details);
      throw new FeeProductError("Shopify didn't accept the delivery fee product change. Please try again in a minute.", e.details);
    }
    throw e;
  }
}

export interface FeeProductStatus {
  /** Numeric product id, or null when it does not exist yet. */
  id: string | null;
  active: boolean;
  /** On the Online Store? null when unknown. */
  published: boolean | null;
}

/** For the settings page. Never throws. */
export async function feeProductStatus(admin: AdminGraphql): Promise<FeeProductStatus> {
  try {
    const pub = await onlineStorePublicationId(admin).catch(() => null);
    if (pub) {
      const data = await gql<{ productByIdentifier: { id: string; status: string; publishedOnPublication: boolean } | null }>(admin, PUBLISHED, {
        handle: FEE_HANDLE,
        publicationId: pub,
      });
      const p = data.productByIdentifier;
      return p ? { id: numericId(p.id), active: p.status === "ACTIVE", published: p.publishedOnPublication } : { id: null, active: false, published: null };
    }
    const p = await findProduct(admin);
    return p ? { id: numericId(p.id), active: p.status === "ACTIVE", published: null } : { id: null, active: false, published: null };
  } catch (e) {
    console.error("[fee-product] status", e);
    return { id: null, active: false, published: null };
  }
}
