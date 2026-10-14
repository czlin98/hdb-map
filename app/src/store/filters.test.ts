import { beforeEach, expect, test } from "vitest";
import { useFilters } from "./filters";
import { EMPTY_FILTERS } from "../lib/filtering";

const filters = () => useFilters.getState().filters;

beforeEach(() => useFilters.getState().clearAll());

test("starts with no filters", () => {
  expect(filters()).toEqual(EMPTY_FILTERS);
});

test("toggleTown adds a town and then removes it", () => {
  useFilters.getState().toggleTown("BEDOK");
  expect(filters().towns).toEqual(["BEDOK"]);
  useFilters.getState().toggleTown("ANG MO KIO");
  expect(filters().towns).toEqual(["BEDOK", "ANG MO KIO"]);
  useFilters.getState().toggleTown("BEDOK");
  expect(filters().towns).toEqual(["ANG MO KIO"]);
});

test("setRange sets a range and turns it off", () => {
  useFilters.getState().setRange("year", [1980, 1999]);
  expect(filters().year).toEqual([1980, 1999]);
  useFilters.getState().setRange("year", null);
  expect(filters().year).toBeNull();
});

test("reset turns off only its own filter", () => {
  useFilters.getState().toggleTown("BEDOK");
  useFilters.getState().setRange("floors", [10, 20]);
  useFilters.getState().reset("towns");
  expect(filters()).toEqual({ towns: [], year: null, floors: [10, 20] });
});

test("clearAll turns everything off", () => {
  useFilters.getState().toggleTown("BEDOK");
  useFilters.getState().setRange("year", [1980, 1999]);
  useFilters.getState().setRange("floors", [10, 20]);
  useFilters.getState().clearAll();
  expect(filters()).toEqual(EMPTY_FILTERS);
});

// MapView keys its layer-filter effect on this reference.
test("an action that changes nothing keeps the filters reference", () => {
  useFilters.getState().setRange("year", [1980, 1999]);
  const before = filters();
  useFilters.getState().reset("towns");
  useFilters.getState().reset("floors");
  useFilters.getState().setRange("floors", null);
  expect(filters()).toBe(before);
});
