import type {
  BlockDetail,
  IndexFeatureCollection,
  NearestStation,
  StationFeatureCollection,
  Town,
} from "../types/contract";

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

export function loadStations(url = "/data/stations.geojson"): Promise<StationFeatureCollection> {
  return fetchJson<StationFeatureCollection>(url);
}

export function buildTownSlugMap(towns: Town[]): Map<string, string> {
  return new Map(towns.map((t) => [t.town, t.town_slug]));
}

export type GetBlockDetail = (id: string, town: string) => Promise<BlockDetail | undefined>;

export function createGetBlockDetail(
  slugMap: Map<string, string>,
  baseUrl = "/data/block-details",
): GetBlockDetail {
  // Caching the promise, not the shard, lets the panel and the nearest-exit highlight ask for
  // the same block at once with one request between them.
  const cache = new Map<string, Promise<Record<string, BlockDetail>>>();
  return async (id, town) => {
    const slug = slugMap.get(town);
    if (!slug) throw new Error(`Unknown town: ${town}`);
    let shard = cache.get(slug);
    if (!shard) {
      shard = fetchJson<Record<string, BlockDetail>>(`${baseUrl}/${slug}.json`);
      cache.set(slug, shard);
      // A failed fetch must not stay cached, or the town could never load again.
      shard.catch(() => cache.delete(slug));
    }
    return (await shard)[id];
  };
}

/**
 * The point of the block's nearest exit. An exit name can have several points (separate
 * entrances), so this picks the one nearest the block, as the pipeline did.
 */
export function nearestExitPoint(
  stations: StationFeatureCollection,
  nearest: NearestStation,
  [blockLon, blockLat]: [number, number],
): { lon: number; lat: number } | null {
  // Equirectangular distance is enough to rank points a few hundred metres apart.
  const lonScale = Math.cos((blockLat * Math.PI) / 180);
  let best: { lon: number; lat: number } | null = null;
  let bestDist = Infinity;
  for (const f of stations.features) {
    const p = f.properties;
    if (p.kind !== "exit" || p.station !== nearest.id || p.exit !== nearest.exit) continue;
    const [lon, lat] = f.geometry.coordinates;
    const dist = ((lon - blockLon) * lonScale) ** 2 + (lat - blockLat) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = { lon, lat };
    }
  }
  return best;
}
