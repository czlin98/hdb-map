import { beforeEach, expect, test } from "vitest";
import { useSelection } from "./selection";

beforeEach(() => useSelection.getState().clear());

test("starts empty and closed", () => {
  const s = useSelection.getState();
  expect(s.selectedId).toBeNull();
  expect(s.selectedTown).toBeNull();
  expect(s.open).toBe(false);
});

test("select sets id + town and opens; clear resets", () => {
  useSelection.getState().select("123-ang-mo-kio-ave-3", "ANG MO KIO");
  expect(useSelection.getState().selectedId).toBe("123-ang-mo-kio-ave-3");
  expect(useSelection.getState().selectedTown).toBe("ANG MO KIO");
  expect(useSelection.getState().open).toBe(true);
  useSelection.getState().clear();
  expect(useSelection.getState().selectedId).toBeNull();
  expect(useSelection.getState().open).toBe(false);
});

test("requestClose starts the slide-out but keeps the selection until clear", () => {
  const s = () => useSelection.getState();
  s().select("123-ang-mo-kio-ave-3", "ANG MO KIO");
  s().requestClose();
  expect(s().open).toBe(false);
  expect(s().selectedId).toBe("123-ang-mo-kio-ave-3"); // still mounted, animating out
  s().clear();
  expect(s().selectedId).toBeNull();
});

test("requestClose is a no-op when nothing is selected", () => {
  useSelection.getState().requestClose();
  expect(useSelection.getState().open).toBe(false);
  expect(useSelection.getState().selectedId).toBeNull();
});

test("select is ignored while closing, so a mid-close tap can't override the clear", () => {
  const s = () => useSelection.getState();
  s().select("123-ang-mo-kio-ave-3", "ANG MO KIO");
  s().requestClose(); // now selected but open === false: sliding out
  s().select("1-bedok-nth-st-1", "BEDOK"); // tapped during the close animation
  expect(s().selectedId).toBe("123-ang-mo-kio-ave-3"); // unchanged
  expect(s().open).toBe(false);
});

test("selecting another block while open swaps content and stays open", () => {
  const s = () => useSelection.getState();
  s().select("123-ang-mo-kio-ave-3", "ANG MO KIO");
  s().select("1-bedok-nth-st-1", "BEDOK");
  expect(s().selectedId).toBe("1-bedok-nth-st-1");
  expect(s().open).toBe(true);
});
