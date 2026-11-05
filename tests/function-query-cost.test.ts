/**
 * Shopify rejects a Function whose input query costs more than 30 points, and only at deploy time
 * ("Query has complexity of 50, which exceeds max complexity of 30"). This estimates the cost the
 * way Shopify documents it, so a query change can't silently break `npm run deploy`:
 * hasTags / hasAnyTag / inCollections / inAnyCollection / metafield = 3, any other field with
 * a selection set or with arguments = 1, plain scalars and __typename = 0.
 * Checked against Shopify: the old validation query (with 23 hourly timeAfter checks) scores 49
 * here and 50 at Shopify, so the limit below keeps a margin.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SPECIAL = new Set(["hasTags", "hasAnyTag", "inCollections", "inAnyCollection", "metafield"]);

export function queryCost(query: string): number {
  const text = query.replace(/#.*$/gm, "");
  const body = text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"));
  const raw = body.match(/\.\.\.\s*on\s+\w+|\w+\s*:\s*\w+(?=\s*[({\s])|\w+|\(|\)|\{|\}|"[^"]*"/g) ?? [];
  const toks: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "(") {
      toks.push(raw[i]);
      continue;
    }
    let depth = 1;
    while (depth && ++i < raw.length) depth += raw[i] === "(" ? 1 : raw[i] === ")" ? -1 : 0;
    toks.push("ARGS");
  }
  let total = 0;
  toks.forEach((t, j) => {
    if (t === "{" || t === "}" || t === "ARGS" || t.startsWith("...")) return;
    const name = t.split(":").pop()!.trim();
    if (name === "__typename") return;
    const args = toks[j + 1] === "ARGS";
    const object = toks[j + 1] === "{" || (args && toks[j + 2] === "{");
    if (SPECIAL.has(name)) total += 3;
    else if (object || args) total += 1;
  });
  return total;
}

const LIMIT = 30;
const MARGIN = 2;

describe("Function input query cost", () => {
  it("the model matches Shopify's figure for the query it rejected", () => {
    const hours = Array.from({ length: 23 }, (_, i) => `h${String(i + 1).padStart(2, "0")}: timeAfter(time: "${String(i + 1).padStart(2, "0")}:00:00")`).join("\n");
    const old = readFileSync("extensions/pickday-validation/src/run.graphql", "utf8").replace(/localTime \{\s*date/, `localTime {\n date\n${hours}`);
    expect(queryCost(old)).toBe(49); // Shopify said 50
  });

  for (const fn of ["pickday-validation", "pickday-delivery"]) {
    it(`${fn} stays under Shopify's limit of ${LIMIT}`, () => {
      const cost = queryCost(readFileSync(`extensions/${fn}/src/run.graphql`, "utf8"));
      expect(cost).toBeLessThanOrEqual(LIMIT - MARGIN);
    });
  }

  it("the input queries stay under Shopify's 3000-byte limit (comments excluded)", () => {
    for (const fn of ["pickday-validation", "pickday-delivery"]) {
      const bytes = Buffer.byteLength(readFileSync(`extensions/${fn}/src/run.graphql`, "utf8").replace(/#.*$/gm, ""));
      expect(bytes).toBeLessThan(3000);
    }
  });
});
