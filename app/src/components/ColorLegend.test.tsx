import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ColorLegend } from "./ColorLegend";
import { useColorMode } from "../store/color";
import { sampleIndex } from "../test/fixtures";
import type { BlockFeature } from "../types/contract";

beforeEach(() => useColorMode.getState().setMode("none"));
afterEach(() => vi.restoreAllMocks());

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

test.each([true, false])(
  "the x turns coloring off and hands focus on (desktop: %s)",
  (isDesktop) => {
    useColorMode.getState().setMode("year");
    const returnFocusRef = createRef<HTMLButtonElement>();
    render(
      <>
        <button ref={returnFocusRef}>Color</button>
        <ColorLegend
          features={sampleIndex.features}
          isDesktop={isDesktop}
          returnFocusRef={returnFocusRef}
        />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Turn off coloring" }));
    expect(useColorMode.getState().mode).toBe("none");
    expect(screen.queryByRole("region", { name: /legend/ })).not.toBeInTheDocument();
    expect(returnFocusRef.current).toHaveFocus();
  },
);

function emptyFlags(legendName: string) {
  const legend = screen.getByRole("region", { name: legendName });
  return within(legend)
    .getAllByRole("listitem")
    .map((li) => [li.textContent, li.hasAttribute("data-empty")]);
}

test("desktop greys bands with no blocks and keeps them in place", () => {
  useColorMode.getState().setMode("year");
  render(<ColorLegend features={sampleIndex.features} isDesktop />);
  expect(emptyFlags("Year completed legend")).toEqual([
    ["2020 and later0", true],
    ["2010s1", false],
    ["2000s0", true],
    ["1990s0", true],
    ["1980s0", true],
    ["Before 19801", false],
  ]);
});

test("mobile greys bands with no blocks and keeps them in place", () => {
  useColorMode.getState().setMode("year");
  render(<ColorLegend features={sampleIndex.features} isDesktop={false} />);
  expect(emptyFlags("Year completed legend")).toEqual([
    ["<80", false],
    ["80s", true],
    ["90s", true],
    ["00s", true],
    ["10s", false],
    ["20s+", true],
  ]);
});

const NOTE = "Straight-line distance to the nearest MRT or LRT exit";

// The test setup's matchMedia reports no hover (a touch screen); this reports a mouse.
function withMouse() {
  const original = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) =>
    query === "(hover: hover)"
      ? ({ ...original(query), matches: true } as MediaQueryList)
      : original(query),
  );
}

test.each([true, false])(
  "only a scale with a note gets the info button (desktop: %s)",
  (isDesktop) => {
    useColorMode.getState().setMode("year");
    render(<ColorLegend features={sampleIndex.features} isDesktop={isDesktop} />);
    expect(screen.queryByRole("button", { name: /^About/ })).not.toBeInTheDocument();
    act(() => useColorMode.getState().setMode("mrt"));
    expect(screen.getByRole("button", { name: "About MRT distance" })).toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  },
);

test("desktop lists the MRT bands nearest first, so the darkest is on top", () => {
  useColorMode.getState().setMode("mrt");
  render(<ColorLegend features={sampleIndex.features} isDesktop />);
  expect(rows("MRT distance legend")).toEqual([
    "Under 200 m0",
    "200 to 400 m1",
    "400 to 600 m0",
    "600 to 800 m0",
    "800 m to 1 km1",
    "1 km and more0",
  ]);
});

test("mobile shows the MRT bands' short labels", () => {
  useColorMode.getState().setMode("mrt");
  render(<ColorLegend features={sampleIndex.features} isDesktop={false} />);
  expect(rows("MRT distance legend")).toEqual(["<200", "<400", "<600", "<800", "<1k", "1k+"]);
});

test("with a mouse, focus and hover show the note and a click leaves it open", () => {
  withMouse();
  useColorMode.getState().setMode("mrt");
  render(<ColorLegend features={sampleIndex.features} isDesktop />);
  const info = screen.getByRole("button", { name: "About MRT distance" });

  act(() => info.focus());
  expect(screen.getByText(NOTE)).toBeInTheDocument();
  expect(info).toHaveFocus();
  act(() => info.blur());
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();

  fireEvent.pointerEnter(info);
  expect(screen.getByText(NOTE)).toBeInTheDocument();
  fireEvent.click(info);
  expect(screen.getByText(NOTE)).toBeInTheDocument();
  fireEvent.pointerLeave(info);
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
});

test("on touch, a tap toggles the note and focus does not open it", () => {
  useColorMode.getState().setMode("mrt");
  render(<ColorLegend features={sampleIndex.features} isDesktop={false} />);
  const info = screen.getByRole("button", { name: "About MRT distance" });

  act(() => info.focus());
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  fireEvent.click(info);
  expect(screen.getByText(NOTE)).toBeInTheDocument();
  fireEvent.click(info);
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
});

test("Escape closes the note", () => {
  withMouse();
  useColorMode.getState().setMode("mrt");
  render(<ColorLegend features={sampleIndex.features} isDesktop />);
  const info = screen.getByRole("button", { name: "About MRT distance" });
  act(() => info.focus());
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
});
