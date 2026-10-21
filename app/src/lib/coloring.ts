import type { ExpressionSpecification } from "maplibre-gl";
import type { BlockFeature } from "../types/contract";

export type ColorMode = "none" | "year" | "floors" | "mrt";
export type ScaleMode = Exclude<ColorMode, "none">;

export interface Band {
  label: string;
  short: string;
  color: string;
}

export interface ColorScale {
  property: "year_completed" | "max_floor_lvl" | "station_distance";
  name: string;
  title: string;
  // Lower bound of every band after the first. A value on an edge belongs to the higher band,
  // matching MapLibre's `step`.
  edges: number[];
  bands: Band[];
  // The value as the hover tooltip shows it, after the address.
  describe: (value: number) => string;
  // Shown from an info button beside the legend title.
  note?: string;
}

export const BLOCK_COLOR = "#2563eb";

// Key order is the menu order.
export const COLOR_SCALES: Record<ScaleMode, ColorScale> = {
  year: {
    property: "year_completed",
    name: "Year",
    title: "Year completed",
    edges: [1980, 1990, 2000, 2010, 2020],
    // ColorBrewer YlGnBu, the 7-class ramp minus its lightest step.
    bands: [
      { label: "Before 1980", short: "<80", color: "#c7e9b4" },
      { label: "1980s", short: "80s", color: "#7fcdbb" },
      { label: "1990s", short: "90s", color: "#41b6c4" },
      { label: "2000s", short: "00s", color: "#1d91c0" },
      { label: "2010s", short: "10s", color: "#225ea8" },
      { label: "2020 and later", short: "20s+", color: "#0c2c84" },
    ],
    describe: (year) => `${year}`,
  },
  floors: {
    property: "max_floor_lvl",
    name: "Floors",
    title: "Floors",
    edges: [10, 13, 17, 26, 40],
    // ColorBrewer BuPu, the 7-class ramp minus its lightest step.
    bands: [
      { label: "Up to 9", short: "≤9", color: "#bfd3e6" },
      { label: "10 to 12", short: "10–12", color: "#9ebcda" },
      { label: "13 to 16", short: "13–16", color: "#8c96c6" },
      { label: "17 to 25", short: "17–25", color: "#8c6bb1" },
      { label: "26 to 39", short: "26–39", color: "#88419d" },
      { label: "40 and up", short: "40+", color: "#6e016b" },
    ],
    // The unit keeps a bare count from reading as part of the block number.
    describe: (floors) => `${floors} floors`,
  },
  mrt: {
    property: "station_distance",
    name: "MRT",
    title: "MRT distance",
    edges: [200, 400, 600, 800, 1000],
    // ColorBrewer YlGn, the 7-class ramp minus its lightest step, reversed so near reads as more.
    bands: [
      { label: "Under 200 m", short: "<200", color: "#005a32" },
      { label: "200 to 400 m", short: "200–400", color: "#238443" },
      { label: "400 to 600 m", short: "400–600", color: "#41ab5d" },
      { label: "600 to 800 m", short: "600–800", color: "#78c679" },
      { label: "800 m to 1 km", short: "800–1k", color: "#addd8e" },
      { label: "1 km and more", short: "1k+", color: "#d9f0a3" },
    ],
    describe: (metres) => `${metres} m`,
    note: "Straight-line distance to the nearest MRT or LRT exit",
  },
};

export function bandIndex(scale: ColorScale, value: number): number {
  return scale.edges.filter((e) => value >= e).length;
}

export function circleColor(mode: ColorMode): string | ExpressionSpecification {
  if (mode === "none") return BLOCK_COLOR;
  const { property, edges, bands } = COLOR_SCALES[mode];
  return [
    "step",
    ["get", property],
    bands[0].color,
    ...edges.flatMap((e, i) => [e, bands[i + 1].color]),
  ] as ExpressionSpecification;
}

export function countBands(features: BlockFeature[], scale: ColorScale): number[] {
  const counts = scale.bands.map(() => 0);
  for (const f of features) counts[bandIndex(scale, f.properties[scale.property])]++;
  return counts;
}
