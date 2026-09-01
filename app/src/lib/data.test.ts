import { afterEach, expect, test, vi } from "vitest";
import { buildTownSlugMap, createGetBlockDetail, loadIndex, loadTowns } from "./data";
import { sampleIndex, sampleShard, sampleTowns } from "../test/fixtures";

afterEach(() => vi.restoreAllMocks());

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => body });
}

test("loadIndex / loadTowns parse JSON", async () => {
  vi.stubGlobal("fetch", mockFetchOnce(sampleIndex));
  expect((await loadIndex()).features).toHaveLength(2);
  vi.stubGlobal("fetch", mockFetchOnce(sampleTowns));
  expect(await loadTowns()).toHaveLength(2);
});

test("loadIndex throws on non-ok", async () => {
  vi.stubGlobal("fetch", mockFetchOnce({}, false, 500));
  await expect(loadIndex()).rejects.toThrow();
});

test("getBlockDetail resolves slug, fetches shard once, caches", async () => {
  const fetchMock = mockFetchOnce(sampleShard);
  vi.stubGlobal("fetch", fetchMock);
  const get = createGetBlockDetail(buildTownSlugMap(sampleTowns));

  const first = await get("123-ang-mo-kio-ave-3", "ANG MO KIO");
  expect(first?.year_completed).toBe(1978);
  expect(fetchMock).toHaveBeenCalledWith("/data/block-details/ang-mo-kio.json");

  // second call for the same town hits the cache, no new fetch
  await get("123-ang-mo-kio-ave-3", "ANG MO KIO");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("getBlockDetail returns undefined for a missing id", async () => {
  vi.stubGlobal("fetch", mockFetchOnce(sampleShard));
  const get = createGetBlockDetail(buildTownSlugMap(sampleTowns));
  expect(await get("nope", "ANG MO KIO")).toBeUndefined();
});

test("getBlockDetail throws on an unknown town", async () => {
  vi.stubGlobal("fetch", mockFetchOnce({}));
  const get = createGetBlockDetail(buildTownSlugMap(sampleTowns));
  await expect(get("x", "ATLANTIS")).rejects.toThrow(/unknown town/i);
});
