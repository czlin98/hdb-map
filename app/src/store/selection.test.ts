import { beforeEach, expect, test } from "vitest";
import { useSelection } from "./selection";

beforeEach(() => useSelection.getState().clear());

test("starts empty", () => {
  const s = useSelection.getState();
  expect(s.selectedId).toBeNull();
  expect(s.selectedTown).toBeNull();
  expect(s.selectedOrigin).toBeNull();
});

test("select sets id, town, and origin; clear resets", () => {
  useSelection.getState().select("123-ang-mo-kio-ave-3", "ANG MO KIO", "marker");
  expect(useSelection.getState().selectedId).toBe("123-ang-mo-kio-ave-3");
  expect(useSelection.getState().selectedTown).toBe("ANG MO KIO");
  expect(useSelection.getState().selectedOrigin).toBe("marker");
  useSelection.getState().clear();
  expect(useSelection.getState().selectedId).toBeNull();
  expect(useSelection.getState().selectedOrigin).toBeNull();
});

test("select during a close cancels it and reopens on the new block", () => {
  const s = () => useSelection.getState();
  s().select("123-ang-mo-kio-ave-3", "ANG MO KIO", "marker");
  s().beginClose();
  expect(s().closing).toBe(true);
  s().select("1-bedok-nth-st-1", "BEDOK", "marker"); // tapped mid-close
  expect(s().selectedId).toBe("1-bedok-nth-st-1"); // new block wins
  expect(s().closing).toBe(false); // close cancelled -> panel reopens
});

test("beginClose is a no-op when nothing is selected, so `closing` can't get stranded", () => {
  const s = () => useSelection.getState();
  s().beginClose();
  expect(s().closing).toBe(false);
  // A later selection is therefore not blocked.
  s().select("123-ang-mo-kio-ave-3", "ANG MO KIO", "search");
  expect(s().selectedId).toBe("123-ang-mo-kio-ave-3");
});
