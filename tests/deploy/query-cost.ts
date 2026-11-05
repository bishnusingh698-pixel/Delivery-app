/**
 * Shopify's cost of a Function input query, as Shopify documents it (limit 30, checked at deploy):
 * hasTags / hasAnyTag / inCollections / inAnyCollection / metafield = 3, any other field with a
 * selection set or with arguments = 1, plain scalars and __typename = 0.
 * Checked against Shopify in tests/function-query-cost.test.ts.
 */
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

