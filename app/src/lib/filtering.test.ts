import { expect, test } from "vitest";
import {
  EMPTY_FILTERS,
  activeCount,
  dataLimits,
  filterExpression,
  matches,
  normalizeRange,
  type Filters,
} from "./filtering";
import { sampleIndex } from "../test/fixtures";

const [amk, bedok] = sampleIndex.features.map((f) => f.properties);

// Mirrors MapLibre for the operators filterExpression emits, so the map and the counts can't drift.
function evaluate(expr: unknown, p: Record<string, unknown>): unknown {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr as [string, ...unknown[]];
  switch (op) {
    case "all":
      return args.every((a) => evaluate(a, p) === true);
    case "any":
      return args.some((a) => evaluate(a, p) === true);
    case "get":
      return p[args[0] as string];
    case "literal":
      return args[0];
    case "in":
      return (evaluate(args[1], p) as unknown[]).includes(evaluate(args[0], p));
    case ">=":
      return (evaluate(args[0], p) as number) >= (evaluate(args[1], p) as number);
    case "<=":
      return (evaluate(args[0], p) as number) <= (evaluate(args[1], p) as number);
    default:
      throw new Error(`unexpected operator ${op}`);
  }
}

test("with no filters every block matches", () => {
  expect(matches(amk, EMPTY_FILTERS)).toBe(true);
  expect(matches(bedok, EMPTY_FILTERS)).toBe(true);
});

test("a town list passes only its towns", () => {
  const f: Filters = { ...EMPTY_FILTERS, towns: ["BEDOK"] };
  expect(matches(amk, f)).toBe(false);
  expect(matches(bedok, f)).toBe(true);
});

test("a year range is inclusive at both ends", () => {
  expect(matches(amk, { ...EMPTY_FILTERS, year: [1978, 2000] })).toBe(true);
  expect(matches(bedok, { ...EMPTY_FILTERS, year: [2000, 2015] })).toBe(true);
  expect(matches(amk, { ...EMPTY_FILTERS, year: [1979, 2000] })).toBe(false);
  expect(matches(bedok, { ...EMPTY_FILTERS, year: [2000, 2014] })).toBe(false);
});

test("filters combine with AND", () => {
  const f: Filters = { ...EMPTY_FILTERS, towns: ["ANG MO KIO"], year: [2000, 2020] };
  expect(matches(amk, f)).toBe(false);
});

// amk has sold 3room and 4room and rental 1room; bedok has sold 4room and 5room, no rental.
test("a flat type passes the blocks that have it", () => {
  expect(matches(amk, { ...EMPTY_FILTERS, soldTypes: ["3room"] })).toBe(true);
  expect(matches(bedok, { ...EMPTY_FILTERS, soldTypes: ["3room"] })).toBe(false);
  expect(matches(amk, { ...EMPTY_FILTERS, rentalTypes: ["1room"] })).toBe(true);
  expect(matches(bedok, { ...EMPTY_FILTERS, rentalTypes: ["1room"] })).toBe(false);
});

test("sold and rental keep their keys apart", () => {
  // amk sells 3-Room but rents only 1-Room.
  expect(matches(amk, { ...EMPTY_FILTERS, rentalTypes: ["3room"] })).toBe(false);
  expect(matches(amk, { ...EMPTY_FILTERS, soldTypes: ["1room"] })).toBe(false);
});

test("flat types combine with OR, across both groups", () => {
  expect(matches(bedok, { ...EMPTY_FILTERS, soldTypes: ["3room", "5room"] })).toBe(true);
  const f: Filters = { ...EMPTY_FILTERS, soldTypes: ["5room"], rentalTypes: ["1room"] };
  expect(matches(amk, f)).toBe(true);
  expect(matches(bedok, f)).toBe(true);
});

test("filterExpression is null when nothing is on", () => {
  expect(filterExpression(EMPTY_FILTERS)).toBeNull();
});

test("filterExpression joins town, year, floors and flat types in that order", () => {
  const f: Filters = {
    towns: ["BEDOK"],
    year: [1990, 2000],
    floors: [10, 20],
    soldTypes: ["4room"],
    rentalTypes: ["1room"],
  };
  expect(filterExpression(f)).toEqual([
    "all",
    ["in", ["get", "town"], ["literal", ["BEDOK"]]],
    [">=", ["get", "year_completed"], 1990],
    ["<=", ["get", "year_completed"], 2000],
    [">=", ["get", "max_floor_lvl"], 10],
    ["<=", ["get", "max_floor_lvl"], 20],
    ["any", ["in", "4room", ["get", "sold_types"]], ["in", "1room", ["get", "rental_types"]]],
  ]);
});

test("the expression and matches agree on every block", () => {
  const cases: Filters[] = [
    EMPTY_FILTERS,
    { ...EMPTY_FILTERS, towns: ["ANG MO KIO"] },
    { ...EMPTY_FILTERS, towns: ["ANG MO KIO", "BEDOK"] },
    { ...EMPTY_FILTERS, year: [1978, 1978] },
    { ...EMPTY_FILTERS, year: [1977, 2014] },
    { ...EMPTY_FILTERS, year: [1979, 2016] },
    { ...EMPTY_FILTERS, floors: [12, 30] },
    { ...EMPTY_FILTERS, floors: [11, 29] },
    { ...EMPTY_FILTERS, floors: [13, 31] },
    { ...EMPTY_FILTERS, soldTypes: ["3room"] },
    { ...EMPTY_FILTERS, soldTypes: ["1room", "5room"] },
    { ...EMPTY_FILTERS, rentalTypes: ["1room"] },
    { ...EMPTY_FILTERS, rentalTypes: ["3room"] },
    { ...EMPTY_FILTERS, soldTypes: ["2room"], rentalTypes: ["1room"] },
    { ...EMPTY_FILTERS, towns: ["BEDOK"], year: [2015, 2015], floors: [30, 30] },
    { ...EMPTY_FILTERS, towns: ["BEDOK"], year: [1978, 2015], floors: [12, 29] },
    { towns: ["BEDOK"], year: null, floors: null, soldTypes: ["4room"], rentalTypes: ["1room"] },
  ];
  for (const f of cases) {
    const expr = filterExpression(f);
    for (const { properties: p } of sampleIndex.features) {
      const shown = expr === null ? true : evaluate(expr, { ...p });
      expect(shown, JSON.stringify({ f, id: p.id })).toBe(matches(p, f));
    }
  }
});

test("dataLimits spans the year and floor values", () => {
  expect(dataLimits(sampleIndex.features)).toEqual({ year: [1978, 2015], floors: [12, 30] });
});

test("dataLimits of no blocks is zero, so callers need no special case", () => {
  expect(dataLimits([])).toEqual({ year: [0, 0], floors: [0, 0] });
});

test("normalizeRange turns a range equal to the limits off", () => {
  expect(normalizeRange([1978, 2015], [1978, 2015])).toBeNull();
  expect(normalizeRange([1900, 2100], [1978, 2015])).toBeNull();
});

test("normalizeRange clamps to the limits", () => {
  expect(normalizeRange([1900, 2000], [1978, 2015])).toEqual([1978, 2000]);
  expect(normalizeRange([1990, 2100], [1978, 2015])).toEqual([1990, 2015]);
});

test("normalizeRange pulls a from above to down to to", () => {
  expect(normalizeRange([2005, 1990], [1978, 2015])).toEqual([1990, 1990]);
});

test("activeCount counts each filter once", () => {
  expect(activeCount(EMPTY_FILTERS)).toBe(0);
  expect(activeCount({ ...EMPTY_FILTERS, towns: ["BEDOK", "ANG MO KIO"] })).toBe(1);
  const all: Filters = {
    towns: ["BEDOK"],
    year: [1990, 2000],
    floors: [10, 20],
    soldTypes: ["4room", "5room"],
    rentalTypes: ["1room"],
  };
  expect(activeCount(all)).toBe(4);
  expect(activeCount({ ...EMPTY_FILTERS, rentalTypes: ["1room"] })).toBe(1);
});
