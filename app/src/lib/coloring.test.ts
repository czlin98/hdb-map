import { expect, test } from "vitest";
import {
  BLOCK_COLOR,
  COLOR_SCALES,
  bandIndex,
  circleColor,
  countBands,
  type ScaleMode,
} from "./coloring";
import { sampleIndex } from "../test/fixtures";

const MODES = Object.keys(COLOR_SCALES) as ScaleMode[];

// Mirrors MapLibre's `step`: the output after the last edge the value has reached.
function evalStep(expr: unknown[], value: number): string {
  const [, , base, ...stops] = expr as [string, unknown, string, ...(string | number)[]];
  let out = base;
  for (let i = 0; i < stops.length; i += 2) {
    if (value >= (stops[i] as number)) out = stops[i + 1] as string;
  }
  return out;
}

test("each scale has six bands, one more than its ascending edges", () => {
  for (const m of MODES) {
    const { edges, bands } = COLOR_SCALES[m];
    expect(bands).toHaveLength(6);
    expect(bands).toHaveLength(edges.length + 1);
    expect([...edges].sort((a, b) => a - b)).toEqual(edges);
  }
});

test("a value on an edge belongs to the higher band", () => {
  const { year, floors } = COLOR_SCALES;
  expect(bandIndex(year, 1979)).toBe(0);
  expect(bandIndex(year, 1980)).toBe(1);
  expect(bandIndex(year, 2019)).toBe(4);
  expect(bandIndex(year, 2020)).toBe(5);
  expect(bandIndex(year, 2031)).toBe(5);
  expect(bandIndex(floors, 9)).toBe(0);
  expect(bandIndex(floors, 10)).toBe(1);
  expect(bandIndex(floors, 39)).toBe(4);
  expect(bandIndex(floors, 40)).toBe(5);
});

test("no coloring uses the plain block color", () => {
  expect(circleColor("none")).toBe(BLOCK_COLOR);
});

test("a mode becomes a step expression over its index property", () => {
  const { bands } = COLOR_SCALES.year;
  expect(circleColor("year")).toEqual([
    "step",
    ["get", "year_completed"],
    bands[0].color,
    1980,
    bands[1].color,
    1990,
    bands[2].color,
    2000,
    bands[3].color,
    2010,
    bands[4].color,
    2020,
    bands[5].color,
  ]);
  expect((circleColor("floors") as unknown[])[1]).toEqual(["get", "max_floor_lvl"]);
});

test("the map's expression and the band lookup agree", () => {
  // The map colors through the expression; the legend and the details swatch use bandIndex.
  for (const m of MODES) {
    const scale = COLOR_SCALES[m];
    const expr = circleColor(m) as unknown[];
    const top = scale.edges[scale.edges.length - 1];
    const values = [...scale.edges.flatMap((e) => [e - 1, e]), top + 1000];
    for (const v of values) {
      expect(evalStep(expr, v)).toBe(scale.bands[bandIndex(scale, v)].color);
    }
  }
});

test("counts blocks per band over the given features", () => {
  const counts = countBands(sampleIndex.features, COLOR_SCALES.year);
  expect(counts).toEqual([1, 0, 0, 0, 1, 0]);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(sampleIndex.features.length);
  expect(countBands(sampleIndex.features, COLOR_SCALES.floors)).toEqual([0, 1, 0, 0, 1, 0]);
});
