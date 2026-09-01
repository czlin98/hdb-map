import { orderedUnits, SOLD_FLAT_TYPES, RENTAL_FLAT_TYPES } from "./flat-types";

test("sold order and labels match the reference table", () => {
  expect(SOLD_FLAT_TYPES.map((t) => t.key)).toEqual([
    "1room", "2room", "3room", "4room", "5room", "exec", "multigen", "studio_apartment",
  ]);
  expect(SOLD_FLAT_TYPES.find((t) => t.key === "exec")!.label).toBe("Executive");
});

test("rental has other_room labelled Other", () => {
  expect(RENTAL_FLAT_TYPES.map((t) => t.key)).toEqual(["1room", "2room", "3room", "other_room"]);
  expect(RENTAL_FLAT_TYPES.find((t) => t.key === "other_room")!.label).toBe("Other");
});

test("orderedUnits keeps only present keys, in display order", () => {
  const out = orderedUnits({ "5room": 20, "3room": 40 }, SOLD_FLAT_TYPES);
  expect(out).toEqual([
    { label: "3-Room", count: 40 },
    { label: "5-Room", count: 20 },
  ]);
});

test("orderedUnits on undefined returns empty", () => {
  expect(orderedUnits(undefined, RENTAL_FLAT_TYPES)).toEqual([]);
});
