import type { IndexFeatureCollection } from "../types/contract";

export interface SearchRow {
  id: string;
  blk_no: string;
  street_full: string;
  postal: string;
  town: string;
  haystack: string;
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
      haystack: `${p.blk_no} ${p.street_full} ${p.postal}`.toUpperCase(),
    };
  });
}

export function searchBlocks(rows: SearchRow[], query: string, limit = 20): SearchRow[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const matches = rows.filter((r) => tokens.every((t) => r.haystack.includes(t)));
  // Prefix hits on the first token rank above mid-string substring hits.
  matches.sort(
    (a, b) => Number(b.haystack.startsWith(tokens[0])) - Number(a.haystack.startsWith(tokens[0])),
  );
  return matches.slice(0, limit);
}
