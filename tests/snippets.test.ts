import { describe, expect, it } from "vitest";
import { SNIPPET_IDS, snippetFor } from "../core/snippets";

const L = { heading: "Delivery details", method: "Method", date: "Date", slot: "Time", location: "Pickup at" };

describe("snippets", () => {
  it("uses the right Liquid object per template", () => {
    expect(snippetFor("orderConfirmation", L)).toContain("attributes['Delivery date']");
    expect(snippetFor("orderConfirmation", L)).not.toContain("order.attributes");
    expect(snippetFor("packingSlip", L)).toContain("order.attributes['Delivery date']");
  });
  it("balances Liquid tags", () => {
    for (const id of SNIPPET_IDS) {
      const s = snippetFor(id, L);
      expect((s.match(/{% if/g) ?? []).length).toBe((s.match(/{% endif %}/g) ?? []).length);
      expect(s).toContain("date: format: 'date'");
    }
  });
});
