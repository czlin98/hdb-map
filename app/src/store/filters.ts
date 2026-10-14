import { create } from "zustand";
import { EMPTY_FILTERS, type Filters, type Range, type RangeKey } from "../lib/filtering";

interface FiltersState {
  // One object replaced on every change, so `(s) => s.filters` is a stable selector.
  filters: Filters;
  toggleTown: (town: string) => void;
  setRange: (key: RangeKey, range: Range | null) => void;
  reset: (key: "towns" | RangeKey) => void;
  clearAll: () => void;
}

function sameRange(a: Range | null, b: Range | null): boolean {
  return a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1]);
}

// Not persisted, like the coloring mode: every visit starts unfiltered.
export const useFilters = create<FiltersState>((set, get) => ({
  filters: EMPTY_FILTERS,
  toggleTown: (town) =>
    set(({ filters }) => ({
      filters: {
        ...filters,
        towns: filters.towns.includes(town)
          ? filters.towns.filter((t) => t !== town)
          : [...filters.towns, town],
      },
    })),
  setRange: (key, range) =>
    set(({ filters }) =>
      sameRange(filters[key], range) ? {} : { filters: { ...filters, [key]: range } },
    ),
  reset: (key) => {
    if (key !== "towns") return get().setRange(key, null);
    set(({ filters }) => (filters.towns.length ? { filters: { ...filters, towns: [] } } : {}));
  },
  clearAll: () => set({ filters: EMPTY_FILTERS }),
}));
