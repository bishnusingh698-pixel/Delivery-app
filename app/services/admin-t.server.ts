import type { Shop } from "@prisma/client";
import { chosenAdminLang, effectiveAdminLang, loadMessages, makeT } from "../i18n";

/**
 * Server-side admin translator (print sheets, CSV headers, calendar feed, Flow texts). The language
 * chosen in Pickday wins (D-82); on Automatic, `requested` is the language of the staff member asking
 * (print and export links carry it, B87), else the store's last-used admin language.
 */
export async function adminT(row: Pick<Shop, "adminLocale"> & { flags?: Shop["flags"] | null }, requested?: string | null) {
  const chosen = chosenAdminLang((row.flags as { adminLang?: unknown } | null | undefined)?.adminLang);
  const lang = effectiveAdminLang(chosen, requested, row.adminLocale);
  const t = makeT(await loadMessages(lang), lang);
  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return { lang, t, dateLabel };
}
