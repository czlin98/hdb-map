import { expect, test } from "vitest";
import { isLrtOnly, lineChipColors } from "./lines";

test("a code takes its line's color with white text", () => {
  expect(lineChipColors("NS16")).toEqual({ background: "#d42e12", color: "#ffffff" });
  expect(lineChipColors("CG1")).toEqual(lineChipColors("EW4"));
});

test("the Circle Line's light orange gets dark text", () => {
  expect(lineChipColors("CC1").color).not.toBe("#ffffff");
});

test("LRT codes share the grey, matched on the whole prefix", () => {
  const grey = lineChipColors("BP6").background;
  expect(lineChipColors("STC").background).toBe(grey);
  expect(lineChipColors("SE3").background).toBe(grey);
  expect(lineChipColors("PTC").background).toBe(grey);
});

test("an unknown prefix falls back to the LRT grey", () => {
  expect(lineChipColors("XY9")).toEqual(lineChipColors("BP6"));
});

test("a station is LRT-only when every code is an LRT code", () => {
  expect(isLrtOnly(["SE5"])).toBe(true);
  expect(isLrtOnly(["BP6", "STC"])).toBe(true);
  expect(isLrtOnly(["NE16", "STC"])).toBe(false);
  expect(isLrtOnly(["EW5"])).toBe(false);
});
