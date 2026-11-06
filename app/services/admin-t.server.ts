import type { Shop } from "@prisma/client";
import { loadMessages, makeT, resolveAdminLang } from "../i18n";

/**
 * Server-side admin translator (print sheets, CSV headers, calendar feed, Flow texts). `requested`
 * is the language of the staff member asking (print and export links carry it, B87); otherwise the
 * store's last-used admin language.
 */
export async function adminT(row: Pick<Shop, "adminLocale">, requested?: string | null) {
  const asked = requested ? resolveAdminLang(requested) : null;
  const lang = asked && asked !== "en" ? asked : requested?.toLowerCase().startsWith("en") ? "en" : resolveAdminLang(row.adminLocale);
  const t = makeT(await loadMessages(lang), lang);
  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return { lang, t, dateLabel };
}
