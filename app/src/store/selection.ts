import { create } from "zustand";

// How the current selection was made. The search box reflects the block's
// address only for "search" selections, leaving the input untouched when a
// marker is tapped (mirrors Google Maps).
export type SelectionOrigin = "search" | "marker";

interface SelectionState {
  selectedId: string | null;
  selectedTown: string | null;
  selectedOrigin: SelectionOrigin | null;
  // True while the panel is animating shut. The panel derives its open state as
  // `!closing`, so any caller can start (or reverse) a close by toggling it.
  closing: boolean;
  select: (id: string, town: string, origin: SelectionOrigin) => void;
  beginClose: () => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selectedId: null,
  selectedTown: null,
  selectedOrigin: null,
  closing: false,
  // Always resets `closing`, so a selection made mid-close cancels the close and
  // reopens the panel on the new block.
  select: (id, town, origin) =>
    set({ selectedId: id, selectedTown: town, selectedOrigin: origin, closing: false }),
  // No-op when nothing is selected: an errant close (e.g. an empty-map tap or the
  // search clear button with no selection) must not strand `closing` true and
  // block later selections.
  beginClose: () => set((s) => (s.selectedId ? { closing: true } : {})),
  clear: () => set({ selectedId: null, selectedTown: null, selectedOrigin: null, closing: false }),
}));
