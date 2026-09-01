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
