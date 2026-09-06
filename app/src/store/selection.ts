import { create } from "zustand";

interface SelectionState {
  selectedId: string | null;
  selectedTown: string | null;
  // Whether the panel should be shown. Kept in the store (not the panel) so any
  // source, the close button, Escape, or a background map tap, can trigger the
  // same animated close. `open` false while a block is still selected is the
  // slide-out window; `clear` runs when that animation ends.
  open: boolean;
  select: (id: string, town: string) => void;
  requestClose: () => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selectedId: null,
  selectedTown: null,
  open: false,
  // Ignore a selection made mid-close (block still set, sliding out) so a tap
  // during the animation isn't wiped by the pending clear.
  select: (id, town) =>
    set((s) =>
      s.selectedId !== null && !s.open ? {} : { selectedId: id, selectedTown: town, open: true },
    ),
  requestClose: () => set((s) => (s.selectedId !== null ? { open: false } : {})),
  clear: () => set({ selectedId: null, selectedTown: null, open: false }),
}));
