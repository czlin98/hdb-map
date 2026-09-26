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

describe("normalization", () => {
  const rows = index(
    feature("123", "ANG MO KIO AVE 6", "ANG MO KIO AVENUE 6", "560123"),
    feature("1", "ST. GEORGE'S RD", "SAINT GEORGE'S ROAD", "320001"),
    feature("2", "C'WEALTH CL", "COMMONWEALTH CLOSE", "140002"),
    feature("3", "BEDOK NTH ST 1", "BEDOK NORTH STREET 1", "460003"),
  );
  const ids = (q: string) => searchBlocks(rows, q).map((r) => r.id);

  test("ignores a leading BLK or BLOCK", () => {
    expect(ids("blk 123 ang mo kio")).toEqual(["123-ang-mo-kio-ave-6"]);
    expect(ids("Block 123")).toEqual(["123-ang-mo-kio-ave-6"]);
  });

  test("BLK on its own is an empty query", () => {
    expect(ids("blk")).toEqual([]);
    expect(ids(" BLK  ")).toEqual([]);
  });

  test("ignores punctuation in the query and the street", () => {
    expect(ids("st. george's")).toEqual(["1-st-george-s-rd"]);
    expect(ids("georges road")).toEqual(["1-st-george-s-rd"]);
    expect(ids("c'wealth")).toEqual(["2-c-wealth-cl"]);
  });

  test("treats curly apostrophes (iOS smart punctuation) like straight ones", () => {
    // Split at the apostrophe, "queen’s" would become QUEEN + S and rank QUEEN ST first.
    const rows = index(
      feature("5", "QUEEN ST", "QUEEN STREET", "180005"),
      feature("6", "QUEEN'S RD", "QUEEN'S ROAD", "260006"),
    );
    expect(searchBlocks(rows, "queen’s").map((r) => r.id)).toEqual(["6-queen-s-rd"]);
  });

  test("matches the abbreviated street as well as the full one", () => {
    expect(ids("bedok nth st")).toEqual(["3-bedok-nth-st-1"]);
    expect(ids("commonwealth close")).toEqual(["2-c-wealth-cl"]);
  });
});

describe("ranking", () => {
  const ids = (rows: ReturnType<typeof index>, q: string) => searchBlocks(rows, q).map((r) => r.id);

  test("an exact block number beats a longer one it prefixes", () => {
    const rows = index(
      feature("100", "BEDOK NTH AVE 4", "BEDOK NORTH AVENUE 4", "460100"),
      feature("10", "BEDOK STH AVE 1", "BEDOK SOUTH AVENUE 1", "460010"),
    );
    expect(ids(rows, "10 bedok")).toEqual(["10-bedok-sth-ave-1", "100-bedok-nth-ave-4"]);
  });

  test("a lettered block counts as exact, then prefix, then substring", () => {
    const rows = index(
      feature("20", "TEST ST", "TEST STREET", "561040"),
      feature("1045", "TEST ST", "TEST STREET", "561045"),
      feature("104A", "TEST ST", "TEST STREET", "561104"),
    );
    expect(ids(rows, "104")).toEqual(["104a-test-st", "1045-test-st", "20-test-st"]);
  });

  test("only the first word can be an exact block, and a phrase beats scattered words", () => {
    const rows = index(
      feature("1", "HOUGANG AVE 1", "HOUGANG AVENUE 1", "530103"),
      feature("3", "DELTA AVE", "DELTA AVENUE", "160003"),
      feature("101", "ANG MO KIO AVE 3", "ANG MO KIO AVENUE 3", "560101"),
    );
    expect(ids(rows, "ave 3")).toEqual(["101-ang-mo-kio-ave-3", "3-delta-ave", "1-hougang-ave-1"]);
  });

  test("ties keep index order", () => {
    const rows = index(
      feature("2", "TEST ST", "TEST STREET", "000002"),
      feature("1", "TEST ST", "TEST STREET", "000001"),
    );
    expect(ids(rows, "test")).toEqual(["2-test-st", "1-test-st"]);
  });
});
