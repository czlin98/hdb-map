import { beforeEach, expect, test } from "vitest";
import { useColorMode } from "./color";

beforeEach(() => useColorMode.getState().setMode("none"));

test("starts with no coloring", () => {
  expect(useColorMode.getState().mode).toBe("none");
});

test("setMode switches the mode and back off", () => {
  useColorMode.getState().setMode("year");
  expect(useColorMode.getState().mode).toBe("year");
  useColorMode.getState().setMode("floors");
  expect(useColorMode.getState().mode).toBe("floors");
  useColorMode.getState().setMode("none");
  expect(useColorMode.getState().mode).toBe("none");
});
