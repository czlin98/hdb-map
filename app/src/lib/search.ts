import type { IndexFeatureCollection } from "../types/contract";

export interface SearchRow {
  id: string;
  blk_no: string;
  street_full: string;
  postal: string;
  town: string;
  haystack: string;
  words: string[]; // haystack split once up front; words[0] is the block number
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
    // Both street forms, so typed abbreviations (NTH, C'WEALTH) match too.
    const haystack = normalize(`${p.blk_no} ${p.street_full} ${p.street} ${p.postal}`);
    return {
      id: p.id,
      blk_no: p.blk_no,
      street_full: p.street_full,
      postal: p.postal,
      town: p.town,
      haystack,
      words: haystack.split(" "),
    };
  });
}

export function searchBlocks(rows: SearchRow[], query: string, limit = 50): SearchRow[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  // People often type the "Blk" they see on signage; no street contains it.
  if (tokens[0] === "BLK" || tokens[0] === "BLOCK") tokens.shift();
  if (tokens.length === 0) return [];
  const phrase = ` ${tokens.join(" ")} `;
  const scored: { row: SearchRow; score: number; phrase: boolean }[] = [];
  for (const row of rows) {
    if (!tokens.every((t) => row.haystack.includes(t))) continue;
    const score = tokens.reduce((sum, t, i) => sum + tokenScore(row, t, i === 0), 0);
    scored.push({ row, score, phrase: ` ${row.haystack} `.includes(phrase) });
  }
  // The block number is also a word in the haystack, so "ave 3" scores block 3 of some
  // avenue the same as Avenue 3; the whole-phrase hit settles that. Sort is stable, so
  // remaining ties keep the index's id order.
  scored.sort((a, b) => b.score - a.score || Number(b.phrase) - Number(a.phrase));
  return scored.slice(0, limit).map((s) => s.row);
}

// Scores one query token against a row whose haystack is known to contain it: an exact
// block beats a whole word, which beats a word prefix, which beats a mid-word hit.
function tokenScore(row: SearchRow, token: string, first: boolean): number {
  // Only the first token counts as a block number: people type it first, and a later
  // "3" in "ave 3" means the street.
  if (first && isBlock(row.words[0], token)) return 4;
  if (row.words.includes(token)) return 3;
  if (row.words.some((w) => w.startsWith(token))) return 2;
  return 1;
}

// "104" also means 104A and 104B: lettered blocks are the same address to most people.
function isBlock(blk: string, token: string): boolean {
  return (
    blk === token ||
    (blk.length === token.length + 1 && blk.startsWith(token) && /[A-Z]$/.test(blk))
  );
}
