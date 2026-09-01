import type { BlockDetail, IndexFeatureCollection, Town } from "../types/contract";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

export function loadIndex(url = "/data/index.geojson"): Promise<IndexFeatureCollection> {
  return fetchJson<IndexFeatureCollection>(url);
}

export function loadTowns(url = "/data/towns.json"): Promise<Town[]> {
  return fetchJson<Town[]>(url);
}

export function buildTownSlugMap(towns: Town[]): Map<string, string> {
  return new Map(towns.map((t) => [t.town, t.town_slug]));
}

export type GetBlockDetail = (id: string, town: string) => Promise<BlockDetail | undefined>;

export function createGetBlockDetail(
  slugMap: Map<string, string>,
  baseUrl = "/data/block-details",
): GetBlockDetail {
  const cache = new Map<string, Record<string, BlockDetail>>();
  return async (id, town) => {
    const slug = slugMap.get(town);
    if (!slug) throw new Error(`Unknown town: ${town}`);
    let shard = cache.get(slug);
    if (!shard) {
      shard = await fetchJson<Record<string, BlockDetail>>(`${baseUrl}/${slug}.json`);
      cache.set(slug, shard);
    }
    return shard[id];
  };
}
