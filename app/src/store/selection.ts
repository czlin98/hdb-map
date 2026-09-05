import { create } from "zustand";

interface SelectionState {
  selectedId: string | null;
  selectedTown: string | null;
  // True during the close animation; selections are ignored so a mid-close tap
  // isn't wiped by the pending clear.
  closing: boolean;
  select: (id: string, town: string) => void;
  beginClose: () => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selectedId: null,
  selectedTown: null,
  closing: false,
  select: (id, town) => set((s) => (s.closing ? {} : { selectedId: id, selectedTown: town })),
  beginClose: () => set({ closing: true }),
  clear: () => set({ selectedId: null, selectedTown: null, closing: false }),
}));
