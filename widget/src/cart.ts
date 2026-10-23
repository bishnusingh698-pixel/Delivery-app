/**
 * Shopify AJAX Cart API helpers and cart-change detection.
 *
 * Cart changes made by the theme are detected three ways (any one is enough):
 *  1. fetch / XMLHttpRequest interception of /cart/add|change|update|clear
 *  2. common theme events (cart:updated, cart:refresh, theme:cart:change …)
 *  3. a MutationObserver on drawer containers (re-mounts the widget when the
 *     theme re-renders the drawer HTML)
 */

export interface CartItem {
  key: string;
  id: number; // variant id
  product_id: number;
  variant_id: number;
  quantity: number;
  title: string;
  product_title: string;
  handle: string;
  gift_card: boolean;
  requires_shipping: boolean;
  properties: Record<string, string> | null;
  final_line_price?: number;
  url?: string;
}

export interface Cart {
  token: string;
  item_count: number;
  items: CartItem[];
  attributes: Record<string, string>;
  total_price: number;
  currency: string;
}

const root = () => (window as any).Shopify?.routes?.root ?? "/";

const CART_PATHS = /\/cart\/(add|change|update|clear)(\.js|\.json)?(\?|$)/;

let ownRequest = 0;

async function call<T>(path: string, body?: unknown): Promise<T> {
  ownRequest++;
  try {
    const res = await fetch(root() + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`cart ${path} ${res.status}`);
    return (await res.json()) as T;
  } finally {
    ownRequest--;
  }
}

export const getCart = () => call<Cart>("cart.js");
export const updateAttributes = (attributes: Record<string, string>) => call<Cart>("cart/update.js", { attributes });
export const changeLine = (key: string, change: { quantity?: number; properties?: Record<string, string> }) =>
  call<Cart>("cart/change.js", { id: key, ...change });
export const addVariant = (id: string, quantity = 1, properties?: Record<string, string>) =>
  call<unknown>("cart/add.js", { items: [{ id: Number(id), quantity, properties }] });

/** Fetch a product's tags (cached for the session). */
export async function productTags(handle: string): Promise<string[]> {
  const key = `pickday:tags:${handle}`;
  try {
    const hit = sessionStorage.getItem(key);
    if (hit) return JSON.parse(hit);
  } catch {
    /* storage blocked */
  }
  try {
    const res = await fetch(`${root()}products/${encodeURIComponent(handle)}.js`, { credentials: "same-origin" });
    if (!res.ok) return [];
    const p = await res.json();
    const tags: string[] = Array.isArray(p.tags) ? p.tags : String(p.tags ?? "").split(",").map((x: string) => x.trim()).filter(Boolean);
    try {
      sessionStorage.setItem(key, JSON.stringify(tags));
    } catch {
      /* ignore */
    }
    return tags;
  } catch {
    return [];
  }
}

/** Everything the widget does with the cart. The admin's live preview passes an in-memory cart. */
export interface CartApi {
  getCart: () => Promise<Cart>;
  updateAttributes: (attributes: Record<string, string>) => Promise<Cart>;
  changeLine: (key: string, change: { quantity?: number; properties?: Record<string, string> }) => Promise<Cart>;
  addVariant: (id: string, quantity?: number, properties?: Record<string, string>) => Promise<unknown>;
  productTags: (handle: string) => Promise<string[]>;
  notifyTheme: () => void;
}

export const shopifyCart: CartApi = {
  getCart,
  updateAttributes,
  changeLine,
  addVariant,
  productTags: (handle) => productTags(handle),
  notifyTheme: () => notifyTheme(),
};

/** Call `cb` (debounced) whenever the theme changes the cart. */
export function onCartChange(cb: () => void) {
  let t: number | undefined;
  const fire = () => {
    window.clearTimeout(t);
    t = window.setTimeout(cb, 250);
  };
  const origFetch = window.fetch;
  window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const p = origFetch.call(this, input as RequestInfo, init);
    if (CART_PATHS.test(url) && ownRequest === 0) p.then(fire, () => {});
    return p;
  } as typeof window.fetch;
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
    if (CART_PATHS.test(String(url))) this.addEventListener("load", () => ownRequest === 0 && fire());
    return (origOpen as any).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  for (const ev of ["cart:updated", "cart:refresh", "cart:change", "theme:cart:change", "cart-drawer:open", "ajaxCart.afterCartLoad", "on:cart:add"]) {
    document.addEventListener(ev, fire);
  }
  // Back/forward cache: the page is restored without reloading.
  window.addEventListener("pageshow", (e) => (e as PageTransitionEvent).persisted && fire());
  // Another tab changed the cart.
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && fire());
}

/** Ask the theme to refresh its cart UI after we changed lines (surcharges). */
export function notifyTheme() {
  for (const ev of ["cart:refresh", "cart:updated", "theme:cart:refresh"]) {
    document.dispatchEvent(new CustomEvent(ev, { bubbles: true, detail: { source: "pickday" } }));
  }
}
