import type { Shop } from "@prisma/client";
import { loadMessages, makeT, resolveAdminLang } from "../i18n";

/** Server-side admin translator for the shop's admin language (print sheets, CSV headers, digest). */
export async function adminT(row: Pick<Shop, "adminLocale">) {
  const lang = resolveAdminLang(row.adminLocale);
  const t = makeT(await loadMessages(lang), lang);
  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  return { lang, t, dateLabel };
}
