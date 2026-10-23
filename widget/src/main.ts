/**
 * Entry point. Loaded by the app embed (theme app extension) on every page.
 * Reads the JSON config Liquid printed from app-owned metafields, so it never
 * talks to the Pickday server.
 */
import { addDays } from "../../core/civil";
import { buildCalendar, engineTimeZone, type EngineInput } from "../../core/engine";
import { matchLocale } from "../../core/i18n/locales";
import { lineNeedsDate, locationsFor, methodsFor } from "../../core/rules";
import { ATTR_KEY, READABLE_KEYS } from "../../core/selection";
import { nowInZone } from "../../core/tz";
import { attributeDate } from "../../core/dateformat";
import { onAccent } from "../../core/color";
import type { CartLine } from "../../core/types";
import { onCartChange } from "./cart";
import { h, nextId } from "./dom";
import { Pickday, type BootData } from "./widget";

declare global {
  interface Window {
    Pickday?: Pickday;
  }
}

const DRAWER_GUESSES = [
  "cart-drawer .drawer__footer",
  "#CartDrawer .drawer__footer",
  "#CartDrawer .cart-drawer__footer",
  ".cart-drawer__footer",
  "#cart-drawer .cart__footer",
  "[data-cart-drawer] .cart-drawer__summary",
  ".drawer--cart .drawer__footer",
  "#sidebar-cart .Drawer__Footer",
  ".mini-cart__actions",
  "cart-drawer-component .cart-drawer__summary",
  ".cart-drawer__summary",
  "#cart-drawer .drawer__footer",
];

/** Containers that look like a cart drawer or mini cart, for themes none of the guesses above know. */
const DRAWER_LIKE = "cart-drawer, cart-drawer-component, cart-notification, [id*='drawer' i], [class*='drawer' i], [id*='mini-cart' i], [class*='mini-cart' i], aside, dialog, [role='dialog']";

const CHECKOUT_SELECTOR = 'button[name="checkout"], input[name="checkout"], a[href$="/checkout"], a[href*="/checkout?"], [data-pickday-checkout]';
const EXPRESS = "shopify-payment-button, .shopify-payment-button, .additional-checkout-buttons, [data-shopify='payment-button'], shopify-accelerated-checkout, shopify-accelerated-checkout-cart";

function readBoot(): BootData | null {
  const el = document.getElementById("pickday-data");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as BootData;
  } catch {
    return null;
  }
}

function loadLocale(base: string, locale: string): Promise<void> {
  if (window.PickdayI18n?.[locale]) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = `${base}pickday-i18n-${locale}.js`;
    s.onload = s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

async function main() {
  const boot = readBoot();
  if (!boot?.config) return;
  // Presentment currency conversion rate (Shopify sets this on window).
  boot.rate = Number((window as any).Shopify?.currency?.rate) || 1;
  if ((window as any).Shopify?.currency?.active) boot.currency = (window as any).Shopify.currency.active;
  const textLocale = matchLocale(boot.locale);
  // English is the fallback for keys a merchant override or locale lacks.
  await Promise.all([loadLocale(boot.assetBase, "en"), textLocale !== "en" ? loadLocale(boot.assetBase, textLocale) : null]);
  const pd = new Pickday(boot);
  window.Pickday = pd;

  const onCart = boot.template.startsWith("cart") || /\/cart\/?$/.test(location.pathname);
  const mountAll = () => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-pickday-mount]")) if (!pd.mounts.has(el)) pd.mount(el);
    if (pd.cfg.widget.drawer !== false) autoMountDrawer(pd);
    if (onCart && !document.querySelector("[data-pickday-mount]")) autoMountCart(pd);
  };
  mountAll();
  try {
    await pd.start();
  } catch (e) {
    // The cart couldn't be read (blocked request, offline): fail open, never block checkout.
    console.warn("[Pickday] cart not available", e);
  }
  // After the cart is read, so a date already chosen shows in the product page picker.
  setupProduct(pd);
  mountAll();

  onCartChange(() => void pd.refresh().then(mountAll));
  // Themes re-render drawers by replacing HTML; put the widget back when that happens.
  let pending = 0;
  new MutationObserver(() => {
    window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      const before = pd.mounts.size;
      for (const m of [...pd.mounts]) if (!m.isConnected) pd.mounts.delete(m);
      mountAll();
      if (pd.mounts.size !== before) pd.render();
    }, 150);
  }).observe(document.body, { childList: true, subtree: true });

  // Required-date gate on checkout buttons (never on express/accelerated buttons).
  const gate = (e: Event) => {
    const target = e.target as Element | null;
    if (!target || target.closest(EXPRESS)) return;
    const btn = e.type === "submit" ? (e as SubmitEvent).submitter : target.closest(CHECKOUT_SELECTOR);
    if (e.type === "submit") {
      const form = target as HTMLFormElement;
      const toCheckout = (btn as HTMLButtonElement | null)?.name === "checkout" || /\/checkout/.test(form.getAttribute("action") ?? "");
      if (!toCheckout) return;
    } else if (!btn) return;
    const blocked = pd.blockingMessage();
    if (blocked) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // No picker on screen (a drawer this theme builds in an unknown way, or the drawer picker is off):
      // never trap the shopper, send them to the cart page where the picker always is.
      if (!pd.visibleMount() && !onCart) {
        location.href = cartUrl();
        return;
      }
      pd.canCheckout();
      return;
    }
    // The choice is still being saved to the cart: wait for it, then continue to checkout.
    if (pd.hasPendingSave()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      void pd.flush().finally(() => {
        if (e.type === "submit") (target as HTMLFormElement).requestSubmit((btn as HTMLElement | null) ?? undefined);
        else (btn as HTMLElement).click();
      });
    }
  };
  document.addEventListener("click", gate, true);
  document.addEventListener("submit", gate, true);
}

const cartUrl = () => `${(window as any).Shopify?.routes?.root ?? "/"}cart`;

/** Put the picker next to a checkout button: above it, or below it (Appearance → Position). */
function placeNear(pd: Pickday, checkout: Element, el: HTMLElement) {
  const parent = checkout.parentElement!;
  parent.insertBefore(el, pd.cfg.widget.position === "after" ? checkout.nextSibling : checkout);
}

function autoMountDrawer(pd: Pickday) {
  const custom = pd.cfg.widget.drawerSelector?.trim();
  let host: Element | null = null;
  try {
    host = custom ? document.querySelector(custom) : document.querySelector(DRAWER_GUESSES.join(","));
  } catch {
    host = null; // invalid custom selector
  }
  if (!host && !custom) host = genericDrawer();
  if (!host || host.querySelector("[data-pickday-mount]")) return;
  const el = h("div", { "data-pickday-mount": "drawer", class: "pickday pd-drawer" });
  const checkout = host.querySelector(CHECKOUT_SELECTOR);
  if (checkout && checkout.parentElement && host.contains(checkout.parentElement)) placeNear(pd, checkout, el);
  else host.prepend(el);
  pd.mount(el);
}

/** A checkout button inside something drawer-like (outside the page's main content). */
function genericDrawer(): Element | null {
  for (const btn of document.querySelectorAll<HTMLElement>('button[name="checkout"], input[name="checkout"], [data-pickday-checkout]')) {
    if (btn.closest("main, [data-pickday-mount]")) continue;
    const box = btn.closest(DRAWER_LIKE);
    if (box && btn.parentElement) return btn.parentElement;
  }
  return null;
}

function autoMountCart(pd: Pickday) {
  const checkout = document.querySelector<HTMLElement>(`main ${CHECKOUT_SELECTOR}, form[action$="/cart"] ${CHECKOUT_SELECTOR}`);
  if (!checkout?.parentElement || checkout.closest("[data-pickday-mount]")) return;
  const el = h("div", { "data-pickday-mount": "cart", class: "pickday" });
  placeNear(pd, checkout, el);
  pd.mount(el);
}

/* ------------------------------------------------------------ product */

interface ProductData {
  id: string;
  title: string;
  tags: string[];
  collections: string[];
  giftCard: boolean;
  requiresShipping: boolean;
  variants: { id: string; requiresShipping: boolean }[];
}

function setupProduct(pd: Pickday) {
  for (const el of document.querySelectorAll<HTMLElement>("[data-pickday-product]")) {
    let data: ProductData;
    try {
      data = JSON.parse(el.dataset.pickdayProduct ?? "");
    } catch {
      continue;
    }
    el.classList.add("pickday", "pd-product");
    el.setAttribute("dir", pd.tx.rtl ? "rtl" : "ltr");
    el.style.setProperty("--pd-accent", pd.cfg.widget.accent);
    el.style.setProperty("--pd-on-accent", onAccent(pd.cfg.widget.accent));
    el.style.setProperty("--pd-radius", `${pd.cfg.widget.radius}px`);
    const line: CartLine = {
      key: `product-${data.id}`,
      productId: data.id,
      variantId: data.variants[0]?.id ?? "",
      quantity: 1,
      title: data.title,
      giftCard: data.giftCard,
      requiresShipping: data.requiresShipping,
      tags: data.tags,
      collections: data.collections,
    };
    if (!lineNeedsDate(line, pd.cfg.productRules) || !methodsFor(pd.cfg, pd.country, [line]).length) {
      el.hidden = true;
      continue;
    }
    // "Buy it now" skips the cart, so the shopper could never pick a date: hide it for this product.
    if (el.dataset.hideBuyNow === "1" && methodsFor(pd.cfg, pd.country, [line]).some((id) => pd.cfg.methods.find((m) => m.id === id)?.dateRequired)) {
      hideBuyNow(el.dataset.form ?? "");
    }
    const render = () => {
      const msg = pd.productMessage(line);
      const parts: Node[] = [];
      if (msg) parts.push(h("p", { class: "pd-earliest" }, msg));
      if (pd.cfg.widget.productPageMode === "picker") parts.push(productPicker(pd, el, line));
      el.replaceChildren(...parts);
      el.hidden = !parts.length;
    };
    render();
    // The countdown ticks once a minute.
    window.setInterval(() => {
      if (!el.contains(document.activeElement)) render();
    }, 60_000);
  }
}

function hideBuyNow(formId: string) {
  const form = formId ? document.getElementById(formId) : null;
  const scope = form ? `#${CSS.escape(formId)} ` : "";
  const style = document.createElement("style");
  style.textContent = `${scope}.shopify-payment-button{display:none!important}`;
  document.head.append(style);
}

function productPicker(pd: Pickday, el: HTMLElement, line: CartLine): Node {
  const methods = methodsFor(pd.cfg, pd.country, [line]);
  const method = pd.cfg.defaultMethod && methods.includes(pd.cfg.defaultMethod) ? pd.cfg.defaultMethod : methods[0];
  const locationId = method === "pickup" ? locationsFor(pd.cfg, pd.country)[0]?.id ?? null : null;
  const input: EngineInput = {
    config: pd.cfg,
    availability: pd.avail,
    method,
    locationId,
    zoneId: null,
    now: nowInZone(engineTimeZone(pd.cfg, method, locationId)),
    lines: [line],
  };
  const cal = buildCalendar(input, input.now.date, addDays(input.now.date, 120));
  const form =
    (el.dataset.form && (document.getElementById(el.dataset.form) as HTMLFormElement | null)) ||
    el.closest("form") ||
    el.closest("section, .product, main")?.querySelector<HTMLFormElement>('form[action*="/cart/add"]') ||
    document.querySelector<HTMLFormElement>('form[action*="/cart/add"]');
  const id = nextId("pdate");
  const err = h("p", { class: "pd-error", role: "alert", hidden: true });
  const perItem = pd.cfg.dateMode === "item";
  const current = perItem ? form?.querySelector<HTMLInputElement>(`input[name="properties[${ATTR_KEY}]"]`)?.value : pd.st.method === method ? pd.st.date : null;
  const select = h(
    "select",
    {
      id,
      class: "pd-select",
      onchange: async () => {
        err.hidden = true;
        if (perItem) await setHidden(pd, form, select.value);
        else pd.chooseFromProduct(method, locationId, select.value || null);
      },
    },
    h("option", { value: "" }, pd.tx.t("date.choose")),
    cal.days.filter((d) => d.available).map((d) => h("option", { value: d.date, selected: !!current && current.includes(d.date) }, pd.label(d.date, null))),
  );
  // Date per item: the product page date is required before adding to cart.
  if (form && pd.cfg.dateMode === "item" && pd.cfg.methods.find((m) => m.id === method)?.dateRequired && !form.dataset.pickdayGuard) {
    form.dataset.pickdayGuard = "1";
    form.addEventListener(
      "submit",
      (e) => {
        if (select.isConnected && !select.value) {
          e.preventDefault();
          e.stopImmediatePropagation();
          err.textContent = pd.tx.t("product.dateRequired");
          err.hidden = false;
          select.focus();
        }
      },
      true,
    );
  }
  return h("div", { class: "pd-field" }, h("label", { for: id, class: "pd-label" }, pd.tx.t("product.pickDate")), select, err);
}

async function setHidden(pd: Pickday, form: HTMLFormElement | null, date: string) {
  if (!form) return;
  const ptx = await pd.primaryTexts();
  const set = (name: string, value: string) => {
    let input = form.querySelector<HTMLInputElement>(`input[name="properties[${name}]"]`);
    if (!value) {
      input?.remove();
      return;
    }
    if (!input) {
      input = h("input", { type: "hidden", name: `properties[${name}]` });
      form.appendChild(input);
    }
    input.value = value;
  };
  set(ATTR_KEY, date ? JSON.stringify({ d: date, s: null, t: null, lbl: pd.label(date, null, pd.tx, false) }) : "");
  set(READABLE_KEYS.date, date ? attributeDate(date, pd.dateFormat, ptx.locale) : "");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void main());
else void main();
