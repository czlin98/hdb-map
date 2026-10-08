import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { ColorLegend } from "./ColorLegend";
import { useColorMode } from "../store/color";
import { sampleIndex } from "../test/fixtures";
import type { BlockFeature } from "../types/contract";

beforeEach(() => useColorMode.getState().setMode("none"));

function rows(legendName: string) {
  const legend = screen.getByRole("region", { name: legendName });
  return within(legend)
    .getAllByRole("listitem")
    .map((li) => li.textContent);
}

test("renders nothing while coloring is off", () => {
  const { container } = render(<ColorLegend features={sampleIndex.features} isDesktop />);
  expect(container).toBeEmptyDOMElement();
});

test("desktop lists bands highest first, each with its block count", () => {
  useColorMode.getState().setMode("year");
  render(<ColorLegend features={sampleIndex.features} isDesktop />);
  const legend = screen.getByRole("region", { name: "Year completed legend" });
  expect(within(legend).getByText("Year completed")).toBeInTheDocument();
  expect(rows("Year completed legend")).toEqual([
    "2020 and later0",
    "2010s1",
    "2000s0",
    "1990s0",
    "1980s0",
    "Before 19801",
  ]);
});

test("desktop counts use thousands separators", () => {
  useColorMode.getState().setMode("year");
  const one = sampleIndex.features[0];
  const many: BlockFeature[] = Array.from({ length: 1234 }, () => one);
  render(<ColorLegend features={many} isDesktop />);
  expect(rows("Year completed legend")[5]).toBe("Before 1980" + (1234).toLocaleString());
});

test("mobile shows a titled strip, light to dark, with short labels and no counts", () => {
  useColorMode.getState().setMode("year");
  render(<ColorLegend features={sampleIndex.features} isDesktop={false} />);
  const legend = screen.getByRole("region", { name: "Year completed legend" });
  expect(within(legend).getByText("Year completed")).toBeInTheDocument();
  expect(rows("Year completed legend")).toEqual(["<80", "80s", "90s", "00s", "10s", "20s+"]);
});

test("switching mode re-titles the legend and recounts", () => {
  useColorMode.getState().setMode("year");
  render(<ColorLegend features={sampleIndex.features} isDesktop />);
  act(() => useColorMode.getState().setMode("floors"));
  expect(screen.queryByRole("region", { name: "Year completed legend" })).not.toBeInTheDocument();
  expect(rows("Floors legend")).toEqual([
    "40 and up0",
    "26 to 391",
    "17 to 250",
    "13 to 160",
    "10 to 121",
    "Up to 90",
  ]);
});
