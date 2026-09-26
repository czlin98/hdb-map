import { buildSearchIndex, searchBlocks } from "./search";
import { sampleIndex } from "../test/fixtures";
import type { BlockFeature } from "../types/contract";

const rows = buildSearchIndex(sampleIndex);

function feature(
  blk_no: string,
  street: string,
  street_full: string,
  postal: string,
): BlockFeature {
  const id = `${blk_no} ${street}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [103.8, 1.35] },
    properties: { id, blk_no, street, street_full, postal, town: "TEST" },
  };
}

function index(...features: BlockFeature[]) {
  return buildSearchIndex({ type: "FeatureCollection", features });
}

test("empty query returns nothing", () => {
  expect(searchBlocks(rows, "  ")).toEqual([]);
});

test("matches full street words, case-insensitive", () => {
  const out = searchBlocks(rows, "ang mo kio avenue 3");
  expect(out.map((r) => r.id)).toEqual(["123-ang-mo-kio-ave-3"]);
});

test("matches on block number + street tokens (AND across tokens)", () => {
  expect(searchBlocks(rows, "123 avenue").map((r) => r.id)).toEqual(["123-ang-mo-kio-ave-3"]);
  expect(searchBlocks(rows, "123 bedok")).toEqual([]);
});

test("matches on postal", () => {
  expect(searchBlocks(rows, "460001").map((r) => r.id)).toEqual(["1-bedok-nth-st-1"]);
});

test("respects the limit", () => {
  expect(searchBlocks(rows, "street", 1)).toHaveLength(1);
});

test("caps results at 50 by default", () => {
  const many = index(
    ...Array.from({ length: 60 }, (_, i) =>
      feature(`${i + 1}`, "TEST ST", "TEST STREET", "000000"),
    ),
  );
  expect(searchBlocks(many, "test")).toHaveLength(50);
});
