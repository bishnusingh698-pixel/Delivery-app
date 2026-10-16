/**
 * Admin i18n. The merchant's admin language comes from the `locale` query
 * parameter Shopify adds to the embedded app URL (stored on the shop row so
 * later requests without it keep the language).
 *
 * Add a language: create app/i18n/admin/<lang>.json with the same keys as
 * en.json and add it to ADMIN_LANGS below. Missing keys fall back to English.
 */
import en from "./admin/en.json";
import { format, type Values } from "../../core/i18n/format";

export const ADMIN_LANGS = ["en", "es", "fr", "de", "pt", "it", "nl", "ja"] as const;
export type AdminLang = (typeof ADMIN_LANGS)[number];
export type Messages = Record<string, string>;

const loaders: Record<AdminLang, () => Promise<{ default: Messages }>> = {
  en: async () => ({ default: en as Messages }),
  es: () => import("./admin/es.json"),
  fr: () => import("./admin/fr.json"),
  de: () => import("./admin/de.json"),
  pt: () => import("./admin/pt.json"),
  it: () => import("./admin/it.json"),
  nl: () => import("./admin/nl.json"),
  ja: () => import("./admin/ja.json"),
};

export function resolveAdminLang(raw: string | null | undefined): AdminLang {
  const lang = (raw ?? "en").toLowerCase().split(/[-_]/)[0];
  return (ADMIN_LANGS as readonly string[]).includes(lang) ? (lang as AdminLang) : "en";
}

/** English merged with the requested language (server side). */
export async function loadMessages(lang: AdminLang): Promise<Messages> {
  if (lang === "en") return en as Messages;
  try {
    const mod = await loaders[lang]();
    return { ...(en as Messages), ...mod.default };
  } catch {
    return en as Messages;
  }
}

export function makeT(messages: Messages, locale: string) {
  return (key: string, values?: Values) => {
    const msg = messages[key] ?? (en as Messages)[key] ?? key;
    return values ? format(msg, values, { locale }) : msg.includes("{") ? format(msg, {}, { locale }) : msg;
  };
}

export type T = ReturnType<typeof makeT>;
