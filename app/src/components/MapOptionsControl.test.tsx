import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { MapOptionsControl } from "./MapOptionsControl";
import { useColorMode } from "../store/color";
import { useFilters } from "../store/filters";
import { sampleIndex, sampleTowns } from "../test/fixtures";

const SNAP_POINTS = ["95px", 0.5, 1];

beforeEach(() => {
  useColorMode.getState().setMode("none");
  useFilters.getState().clearAll();
});

function renderControl(open: boolean) {
  const onOpenChange = vi.fn();
  render(
    <MapOptionsControl
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={SNAP_POINTS}
      activeSnap={0.5}
      onSnapChange={() => {}}
      features={sampleIndex.features}
      towns={sampleTowns}
      shown={2}
      total={2}
    />,
  );
  return { onOpenChange };
}

test("the closed button is named Map options and toggles the sheet", async () => {
  const { onOpenChange } = renderControl(false);
  const button = screen.getByRole("button", { name: "Map options" });
  expect(screen.queryByTestId("options-color-on")).not.toBeInTheDocument();
  await userEvent.click(button);
  expect(onOpenChange).toHaveBeenCalledWith(true);
});

test("it shows a dot while only a coloring mode is on", () => {
  renderControl(false);
  act(() => useColorMode.getState().setMode("year"));
  expect(screen.getByRole("button", { name: "Map options, colored by Year" })).toBeInTheDocument();
  expect(screen.getByTestId("options-color-on")).toBeInTheDocument();
});

test("with filters on it shows their count instead of the dot", () => {
  renderControl(false);
  act(() => {
    useColorMode.getState().setMode("year");
    useFilters.getState().toggleTown("BEDOK");
    useFilters.getState().setRange("floors", [12, 20]);
  });
  const button = screen.getByRole("button", { name: "Map options, colored by Year, 2 filters on" });
  expect(button).toHaveTextContent("2");
  expect(screen.queryByTestId("options-color-on")).not.toBeInTheDocument();
});

test("the open sheet has its title, the count, Color before Filters, and Done", async () => {
  const { onOpenChange } = renderControl(true);
  const sheet = await screen.findByRole("dialog", { name: "Map options" });
  expect(sheet).toHaveTextContent("Showing 2 of 2 blocks");
  const color = screen.getByRole("radiogroup", { name: "Color by" });
  const filters = screen.getByRole("heading", { name: "Filters" });
  expect(color.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  // A bare click: userEvent's pointerdown reaches Vaul's drag handler, which calls
  // setPointerCapture, missing from jsdom.
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
