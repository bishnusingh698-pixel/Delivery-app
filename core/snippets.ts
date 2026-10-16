/**
 * Liquid snippets merchants paste into Shopify notification and print templates.
 * They read the readable cart attributes Pickday writes (fixed English keys, D-15).
 * The date is re-formatted from the ISO date in brackets, so Shopify renders it in
 * the template's language where it supports that.
 */
import { READABLE_KEYS } from "./selection";

export const SNIPPET_IDS = ["orderConfirmation", "shippingConfirmation", "packingSlip", "staffNotification", "orderPrinter"] as const;
export type SnippetId = (typeof SNIPPET_IDS)[number];

export interface SnippetLabels {
  heading: string;
  method: string;
  date: string;
  slot: string;
  location: string;
}

const K = READABLE_KEYS;

function block(attrs: string, l: SnippetLabels, style: "email" | "print") {
  const date = `{{ ${attrs}['${K.date}'] | split: '(' | last | remove: ')' | strip | date: format: 'date' }}`;
  const row = (label: string, value: string) =>
    style === "email" ? `  <p style="margin:0 0 4px"><strong>${label}:</strong> ${value}</p>` : `  <p><strong>${label}:</strong> ${value}</p>`;
  return [
    `{% if ${attrs}['${K.date}'] or ${attrs}['${K.method}'] %}`,
    style === "email" ? `<div style="margin:16px 0;padding:12px;border:1px solid #e3e3e3;border-radius:8px">` : `<div class="pickday-schedule">`,
    `  <h3 style="margin:0 0 8px">${l.heading}</h3>`,
    `  {% if ${attrs}['${K.method}'] %}`,
    row(l.method, `{{ ${attrs}['${K.method}'] }}`),
    `  {% endif %}`,
    `  {% if ${attrs}['${K.date}'] %}`,
    row(l.date, date),
    `  {% endif %}`,
    `  {% if ${attrs}['${K.slot}'] %}`,
    row(l.slot, `{{ ${attrs}['${K.slot}'] }}`),
    `  {% endif %}`,
    `  {% if ${attrs}['${K.location}'] %}`,
    row(l.location, `{{ ${attrs}['${K.location}'] }}`),
    `  {% endif %}`,
    `</div>`,
    `{% endif %}`,
  ].join("\n");
}

export function snippetFor(id: SnippetId, l: SnippetLabels): string {
  switch (id) {
    case "orderConfirmation":
    case "shippingConfirmation":
    case "staffNotification":
      return block("attributes", l, "email");
    case "packingSlip":
    case "orderPrinter":
      return block("order.attributes", l, "print");
  }
}
