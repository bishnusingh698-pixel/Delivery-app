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
import { queryCost } from "./deploy/query-cost";

const LIMIT = 30;
const MARGIN = 2;

describe("Function input query cost", () => {
  it("the model matches Shopify's figure for the query it rejected", () => {
    const hours = Array.from({ length: 23 }, (_, i) => `h${String(i + 1).padStart(2, "0")}: timeAfter(time: "${String(i + 1).padStart(2, "0")}:00:00")`).join("\n");
    const old = readFileSync("extensions/pickday-validation/src/run.graphql", "utf8")
      .replace(/\s*cutoff[AB]: timeAfter\(time: \$cutoff[AB]\)/g, "")
      .replace(/localTime \{\s*date/, `localTime {\n date\n${hours}`);
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
