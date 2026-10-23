import { afterEach, expect, test, vi } from "vitest";
import {
  buildTownSlugMap,
  createGetBlockDetail,
  loadIndex,
  loadStations,
  loadTowns,
  nearestExitPoint,
} from "./data";
import { sampleIndex, sampleShard, sampleStations, sampleTowns } from "../test/fixtures";

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

test("loadStations parses JSON from the default URL", async () => {
  const fetchMock = mockFetchOnce(sampleStations);
  vi.stubGlobal("fetch", fetchMock);
  expect((await loadStations()).features).toHaveLength(9);
  expect(fetchMock).toHaveBeenCalledWith("/data/stations.geojson");
});

test("loadStations throws on non-ok", async () => {
  vi.stubGlobal("fetch", mockFetchOnce({}, false, 404));
  await expect(loadStations()).rejects.toThrow();
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

test("getBlockDetail makes one request for two calls before the shard arrives", async () => {
  const fetchMock = mockFetchOnce(sampleShard);
  vi.stubGlobal("fetch", fetchMock);
  const get = createGetBlockDetail(buildTownSlugMap(sampleTowns));

  const [a, b] = await Promise.all([
    get("123-ang-mo-kio-ave-3", "ANG MO KIO"),
    get("123-ang-mo-kio-ave-3", "ANG MO KIO"),
  ]);
  expect(a?.nearest_stations[0].exit).toBe("Exit A");
  expect(b).toBe(a);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("getBlockDetail fetches again after a failed fetch", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => sampleShard });
  vi.stubGlobal("fetch", fetchMock);
  const get = createGetBlockDetail(buildTownSlugMap(sampleTowns));

  await expect(get("123-ang-mo-kio-ave-3", "ANG MO KIO")).rejects.toThrow();
  expect((await get("123-ang-mo-kio-ave-3", "ANG MO KIO"))?.year_completed).toBe(1978);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

const amkNearest = sampleShard["123-ang-mo-kio-ave-3"].nearest_stations[0];

test("nearestExitPoint picks the nearer of two points with the exit's name", () => {
  // West of the station: the western Exit A point wins.
  expect(nearestExitPoint(sampleStations, amkNearest, [103.845, 1.362])).toEqual({
    lon: 103.8488,
    lat: 1.3693,
  });
  // North-east of it: the other one does.
  expect(nearestExitPoint(sampleStations, amkNearest, [103.853, 1.372])).toEqual({
    lon: 103.8506,
    lat: 1.3702,
  });
});

test("nearestExitPoint matches the station as well as the exit name", () => {
  const bedokExitA = { ...amkNearest, id: "bedok", name: "Bedok", codes: ["EW5"] };
  expect(nearestExitPoint(sampleStations, bedokExitA, [103.845, 1.362])).toEqual({
    lon: 103.9296,
    lat: 1.3238,
  });
});

test("nearestExitPoint returns null when no exit matches", () => {
  const missing = { ...amkNearest, exit: "Exit Z" };
  expect(nearestExitPoint(sampleStations, missing, [103.845, 1.362])).toBeNull();
  const unknown = { ...amkNearest, id: "atlantis" };
  expect(nearestExitPoint(sampleStations, unknown, [103.845, 1.362])).toBeNull();
});
