import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type { BlockFeature, BlockIndexProperties } from "../types/contract";

export type Range = [from: number, to: number];
export type RangeKey = "year" | "floors";

export interface Filters {
  towns: string[]; // empty = any town
  year: Range | null; // null = off
  floors: Range | null;
}

export const EMPTY_FILTERS: Filters = { towns: [], year: null, floors: null };

export const RANGE_PROPERTY = {
  year: "year_completed",
  floors: "max_floor_lvl",
} as const satisfies Record<RangeKey, keyof BlockIndexProperties>;

const RANGE_KEYS = Object.keys(RANGE_PROPERTY) as RangeKey[];

export function matches(p: BlockIndexProperties, f: Filters): boolean {
  if (f.towns.length && !f.towns.includes(p.town)) return false;
  return RANGE_KEYS.every((key) => {
    const range = f[key];
    const value = p[RANGE_PROPERTY[key]];
    return !range || (value >= range[0] && value <= range[1]);
  });
}

// null when nothing is on, so the caller can clear the layer filter.
export function filterExpression(f: Filters): FilterSpecification | null {
  const parts: ExpressionSpecification[] = [];
  if (f.towns.length) parts.push(["in", ["get", "town"], ["literal", f.towns]]);
  for (const key of RANGE_KEYS) {
    const range = f[key];
    if (!range) continue;
    const value: ExpressionSpecification = ["get", RANGE_PROPERTY[key]];
    parts.push([">=", value, range[0]], ["<=", value, range[1]]);
  }
  return parts.length ? ["all", ...parts] : null;
}

export function dataLimits(features: BlockFeature[]): Record<RangeKey, Range> {
  const limits = {} as Record<RangeKey, Range>;
  for (const key of RANGE_KEYS) {
    const values = features.map((f) => f.properties[RANGE_PROPERTY[key]]);
    limits[key] = values.length ? [Math.min(...values), Math.max(...values)] : [0, 0];
  }
  return limits;
}

// A range covering the whole data is stored as off, so "off" has one representation.
export function normalizeRange([from, to]: Range, [min, max]: Range): Range | null {
  const hi = Math.min(Math.max(to, min), max);
  const lo = Math.min(Math.max(from, min), hi);
  return lo === min && hi === max ? null : [lo, hi];
}

export function activeCount(f: Filters): number {
  return (f.towns.length ? 1 : 0) + RANGE_KEYS.filter((key) => f[key]).length;
}
