/**
 * Built-in storefront locales and locale matching.
 */

export const STOREFRONT_LOCALES = [
  "en", "es", "fr", "de", "it", "pt-BR", "pt-PT", "nl", "sv", "da", "nb", "fi", "pl", "cs",
  "tr", "el", "ro", "ja", "ko", "zh-CN", "zh-TW", "th", "vi", "id", "ms", "hi", "ar", "he",
] as const;

export type StorefrontLocale = (typeof STOREFRONT_LOCALES)[number];

/** Right-to-left languages (built-in ones plus merchant-supplied Persian and Urdu). */
export const RTL_LANGS = ["ar", "he", "fa", "ur", "ps", "yi", "ckb", "dv"];

export function isRtl(locale: string): boolean {
  return RTL_LANGS.includes(locale.toLowerCase().split(/[-_]/)[0]);
}

/**
 * Map any Shopify locale (e.g. "pt", "pt-br", "zh-hk", "no", "en-GB")
 * to one of the built-in locales. Returns "en" if nothing fits.
 */
export function matchLocale(input: string | null | undefined): StorefrontLocale {
  if (!input) return "en";
  const norm = input.replace("_", "-");
  const lower = norm.toLowerCase();
  const exact = STOREFRONT_LOCALES.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;
  const [lang, region = ""] = lower.split("-");
  if (lang === "pt") return region === "pt" ? "pt-PT" : "pt-BR";
  if (lang === "zh") {
    if (["tw", "hk", "mo", "hant"].includes(region)) return "zh-TW";
    return "zh-CN";
  }
  if (lang === "no" || lang === "nn") return "nb";
  if (lang === "iw") return "he";
  if (lang === "in") return "id";
  const byLang = STOREFRONT_LOCALES.find((l) => l.toLowerCase() === lang);
  return byLang ?? "en";
}

/** Shopify Function LanguageCode enum ("PT_BR", "ZH_CN", "DE") -> locale. */
export function fromShopifyLanguageCode(code: string | null | undefined): StorefrontLocale {
  if (!code) return "en";
  return matchLocale(code.replace("_", "-"));
}

/** Locales whose built-in text is allowed to equal English for a key (checked in tests). */
export const SAME_AS_ENGLISH_OK = new Set(["brand"]);
