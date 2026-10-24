/**
 * Shared by the menu button and the modal: calls the Pickday server with the customer
 * account session token, and translates with the storefront "change.*" texts.
 */
import { format } from "../../../core/i18n/format";
import { matchLocale } from "../../../core/i18n/locales";
import config from "./config.generated.json";
import messages from "./messages.generated.json";

export interface Status {
  canChange: boolean;
  block: string | null;
  current?: { method: string; date: string | null; slot: string | null };
  days?: { date: string; slots: { id: string; label: string }[] }[];
}

const api = () => (globalThis as any).shopify;

export async function call<T>(orderId: string, init: { days?: boolean; body?: unknown } = {}): Promise<T> {
  const token = await api().sessionToken.get();
  const url = `${config.appUrl}/api/customer/order/${encodeURIComponent(orderId.split("/").pop() ?? "")}${init.days ? "?days=1" : ""}`;
  const res = await fetch(url, {
    method: init.body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return json as T;
}

export function translator() {
  const lang: string = api().localization?.language?.value?.isoCode ?? "en";
  const table = (messages as Record<string, Record<string, string>>)[matchLocale(lang)] ?? (messages as any).en;
  const t = (key: string, values: Record<string, string> = {}) => format(table[key] ?? (messages as any).en[key] ?? key, values, { plural: () => "other" });
  /** "Saturday 25 October" in the customer's language. */
  const day = (iso: string) => {
    try {
      const [y, m, d] = iso.split("-").map(Number);
      return api().i18n.formatDate(new Date(Date.UTC(y, m - 1, d, 12)), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) as string;
    } catch {
      return iso;
    }
  };
  return { t, day };
}
