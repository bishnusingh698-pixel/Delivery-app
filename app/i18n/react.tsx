import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type Messages, type T } from "./index";

interface Ctx {
  t: T;
  lang: string;
  /** BCP-47 locale used for Intl formatting in the admin. */
  locale: string;
}

const I18nContext = createContext<Ctx>({ t: (k) => k, lang: "en", locale: "en" });

export function I18nProvider({ messages, lang, children }: { messages: Messages; lang: string; children: ReactNode }) {
  const value = useMemo(() => ({ t: makeT(messages, lang), lang, locale: lang }), [messages, lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;
