import { create } from "zustand";
import {
  EMPTY_FILTERS,
  FLAT_TYPE_FIELDS,
  type FlatTypeGroup,
  type Filters,
  type Range,
  type RangeKey,
} from "../lib/filtering";

interface FiltersState {
  // One object replaced on every change, so `(s) => s.filters` is a stable selector.
  filters: Filters;
  toggleTown: (town: string) => void;
  toggleFlatType: (group: FlatTypeGroup, type: string) => void;
  setRange: (key: RangeKey, range: Range | null) => void;
  reset: (key: "towns" | RangeKey | "flatTypes") => void;
  clearAll: () => void;
}

function toggled(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

function sameRange(a: Range | null, b: Range | null): boolean {
  return a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1]);
}

// Not persisted, like the coloring mode: every visit starts unfiltered.
export const useFilters = create<FiltersState>((set, get) => ({
  filters: EMPTY_FILTERS,
  toggleTown: (town) =>
    set(({ filters }) => ({
      filters: { ...filters, towns: toggled(filters.towns, town) },
    })),
  toggleFlatType: (group, type) =>
    set(({ filters }) => {
      const key = FLAT_TYPE_FIELDS[group].filter;
      return { filters: { ...filters, [key]: toggled(filters[key], type) } };
    }),
  setRange: (key, range) =>
    set(({ filters }) =>
      sameRange(filters[key], range) ? {} : { filters: { ...filters, [key]: range } },
    ),
  reset: (key) => {
    if (key === "towns") {
      set(({ filters }) => (filters.towns.length ? { filters: { ...filters, towns: [] } } : {}));
    } else if (key === "flatTypes") {
      set(({ filters }) =>
        filters.soldTypes.length || filters.rentalTypes.length
          ? { filters: { ...filters, soldTypes: [], rentalTypes: [] } }
          : {},
      );
    } else {
      get().setRange(key, null);
    }
  },
  clearAll: () => set({ filters: EMPTY_FILTERS }),
}));
