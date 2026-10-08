import { create } from "zustand";
import type { ColorMode } from "../lib/coloring";

interface ColorState {
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
}

// Not persisted: every visit starts uncolored.
export const useColorMode = create<ColorState>((set) => ({
  mode: "none",
  setMode: (mode) => set({ mode }),
}));
