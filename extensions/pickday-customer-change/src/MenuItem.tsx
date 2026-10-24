/**
 * "Change date" in the order's action menu. Shown only when Pickday says this customer can
 * change this order now (turned on by the merchant, before the deadline, not fulfilled).
 */
import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { call, translator, type Status } from "./shared";

export default async () => {
  render(<MenuItem />, document.body);
};

function MenuItem() {
  const api = (globalThis as any).shopify;
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    call<Status>(api.orderId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [api.orderId]);
  if (!status?.canChange) return null;
  const { t } = translator();
  // No href: the button opens the order action modal (ChangeDate.tsx).
  return <s-button>{t(status.current?.method === "pickup" ? "change.buttonPickup" : "change.button")}</s-button>;
}
