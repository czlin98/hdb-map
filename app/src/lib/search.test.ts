import { buildSearchIndex, searchBlocks } from "./search";
import { sampleIndex } from "../test/fixtures";

const rows = buildSearchIndex(sampleIndex);

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
