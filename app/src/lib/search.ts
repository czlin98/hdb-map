import type { IndexFeatureCollection } from "../types/contract";

export interface SearchRow {
  id: string;
  blk_no: string;
  street_full: string;
  postal: string;
  town: string;
  haystack: string;
}

// Apostrophes are dropped so GEORGE'S matches GEORGES; other punctuation (the "." in ST.)
// splits words. Queries and rows go through the same function so they always agree. Curly
// and backtick apostrophes count too: iOS smart punctuation types ’ for '.
function normalize(text: string): string {
  return text
    .toUpperCase()
    .replace(/['‘’`]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function buildSearchIndex(fc: IndexFeatureCollection): SearchRow[] {
  return fc.features.map((f) => {
    const p = f.properties;
    return {
      id: p.id,
      blk_no: p.blk_no,
      street_full: p.street_full,
      postal: p.postal,
      town: p.town,
      // Both street forms, so typed abbreviations (NTH, C'WEALTH) match too.
      haystack: normalize(`${p.blk_no} ${p.street_full} ${p.street} ${p.postal}`),
    };
  });
}

export function searchBlocks(rows: SearchRow[], query: string, limit = 50): SearchRow[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  // People often type the "Blk" they see on signage; no street contains it.
  if (tokens[0] === "BLK" || tokens[0] === "BLOCK") tokens.shift();
  if (tokens.length === 0) return [];
  const matches = rows.filter((r) => tokens.every((t) => r.haystack.includes(t)));
  // Prefix hits on the first token rank above mid-string substring hits.
  matches.sort(
    (a, b) => Number(b.haystack.startsWith(tokens[0])) - Number(a.haystack.startsWith(tokens[0])),
  );
  return matches.slice(0, limit);
}
