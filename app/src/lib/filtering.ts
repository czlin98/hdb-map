import type { ExpressionSpecification } from "maplibre-gl";
import type { BlockFeature, BlockIndexProperties } from "../types/contract";

export type Range = [from: number, to: number];
export type RangeKey = "year" | "floors" | "mrt";
export type FlatTypeGroup = "sold" | "rental";

export interface Filters {
  towns: string[]; // empty = any town
  year: Range | null; // null = off
  floors: Range | null;
  mrt: Range | null; // metres to the nearest station exit
  // Keys from lib/flat-types.ts. One filter: a block passes with any chosen type of either group.
  soldTypes: string[];
  rentalTypes: string[];
}

export const EMPTY_FILTERS: Filters = {
  towns: [],
  year: null,
  floors: null,
  mrt: null,
  soldTypes: [],
  rentalTypes: [],
};

export const FLAT_TYPE_FIELDS = {
  sold: { filter: "soldTypes", property: "sold_types" },
  rental: { filter: "rentalTypes", property: "rental_types" },
} as const satisfies Record<
  FlatTypeGroup,
  { filter: "soldTypes" | "rentalTypes"; property: "sold_types" | "rental_types" }
>;

const FLAT_TYPE_GROUPS = Object.keys(FLAT_TYPE_FIELDS) as FlatTypeGroup[];

export function flatTypesOn(f: Pick<Filters, "soldTypes" | "rentalTypes">): boolean {
  return f.soldTypes.length > 0 || f.rentalTypes.length > 0;
}

export const RANGE_PROPERTY = {
  year: "year_completed",
  floors: "max_floor_lvl",
  mrt: "station_distance",
} as const satisfies Record<RangeKey, keyof BlockIndexProperties>;

const RANGE_KEYS = Object.keys(RANGE_PROPERTY) as RangeKey[];

// Whole metres would land the thumbs on values like 487 and make the arrow keys crawl. 50 m is
// still finer than a straight-line distance is accurate, and splits the 200 m color bands.
export const RANGE_STEP: Record<RangeKey, number> = { year: 1, floors: 1, mrt: 50 };

export function matches(p: BlockIndexProperties, f: Filters): boolean {
  if (f.towns.length && !f.towns.includes(p.town)) return false;
  const inRanges = RANGE_KEYS.every((key) => {
    const range = f[key];
    const value = p[RANGE_PROPERTY[key]];
    return !range || (value >= range[0] && value <= range[1]);
  });
  if (!inRanges) return false;
  if (!flatTypesOn(f)) return true;
  return FLAT_TYPE_GROUPS.some((group) => {
    const { filter, property } = FLAT_TYPE_FIELDS[group];
    return f[filter].some((type) => p[property].includes(type));
  });
}

// null when nothing is on, so the caller can clear the layer filter.
export function filterExpression(f: Filters): ExpressionSpecification | null {
  const parts: ExpressionSpecification[] = [];
  if (f.towns.length) parts.push(["in", ["get", "town"], ["literal", f.towns]]);
  for (const key of RANGE_KEYS) {
    const range = f[key];
    if (!range) continue;
    const value: ExpressionSpecification = ["get", RANGE_PROPERTY[key]];
    parts.push([">=", value, range[0]], ["<=", value, range[1]]);
  }
  if (flatTypesOn(f)) {
    const anyType = FLAT_TYPE_GROUPS.flatMap((group) => {
      const { filter, property } = FLAT_TYPE_FIELDS[group];
      return f[filter].map((type): ExpressionSpecification => ["in", type, ["get", property]]);
    });
    parts.push(["any", ...anyType]);
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
  const lists = (f.towns.length ? 1 : 0) + (flatTypesOn(f) ? 1 : 0);
  return lists + RANGE_KEYS.filter((key) => f[key]).length;
}
