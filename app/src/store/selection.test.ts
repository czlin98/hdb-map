import { beforeEach, expect, test } from "vitest";
import { useSelection } from "./selection";

beforeEach(() => useSelection.getState().clear());

test("starts empty", () => {
  const s = useSelection.getState();
  expect(s.selectedId).toBeNull();
  expect(s.selectedTown).toBeNull();
});

test("select sets id + town; clear resets", () => {
  useSelection.getState().select("123-ang-mo-kio-ave-3", "ANG MO KIO");
  expect(useSelection.getState().selectedId).toBe("123-ang-mo-kio-ave-3");
  expect(useSelection.getState().selectedTown).toBe("ANG MO KIO");
  useSelection.getState().clear();
  expect(useSelection.getState().selectedId).toBeNull();
});

test("select is ignored while closing, so a mid-close tap can't override the clear", () => {
  const s = () => useSelection.getState();
  s().select("123-ang-mo-kio-ave-3", "ANG MO KIO");
  s().beginClose();
  s().select("1-bedok-nth-st-1", "BEDOK"); // tapped during the close animation
  expect(s().selectedId).toBe("123-ang-mo-kio-ave-3"); // unchanged
  s().clear();
  expect(s().closing).toBe(false);
});
