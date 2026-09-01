import { create } from "zustand";

interface SelectionState {
  selectedId: string | null;
  selectedTown: string | null;
  select: (id: string, town: string) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selectedId: null,
  selectedTown: null,
  select: (id, town) => set({ selectedId: id, selectedTown: town }),
  clear: () => set({ selectedId: null, selectedTown: null }),
}));
