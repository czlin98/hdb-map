import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { BlockCount, FilterFields } from "./FilterFields";
import { EMPTY_FILTERS } from "../lib/filtering";
import { useFilters } from "../store/filters";
import { sampleIndex, sampleTowns } from "../test/fixtures";

beforeEach(() => useFilters.getState().clearAll());

const renderFields = () =>
  render(<FilterFields features={sampleIndex.features} towns={sampleTowns} />);
const box = (name: string) => screen.getByRole("spinbutton", { name }) as HTMLInputElement;
const clearAll = () => screen.getByRole("button", { name: "Clear all" });

test("renders the Filters heading, then town, the ranges and flat types", () => {
  renderFields();
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
    "Filters",
    "Town",
    "Year completed",
    "Floors",
    "MRT distance (m)",
    "Flat types",
    "Sold",
    "Rental",
  ]);
});

test("the range limits come from the features", () => {
  renderFields();
  expect(box("Year completed, from").value).toBe("1978");
  expect(box("Year completed, to").value).toBe("2015");
  expect(box("Floors, from").value).toBe("12");
  expect(box("Floors, to").value).toBe("30");
  expect(box("MRT distance in metres, from").value).toBe("350");
  expect(box("MRT distance in metres, to").value).toBe("820");
});

test("changing a control writes the store", () => {
  renderFields();
  fireEvent.click(screen.getByRole("button", { name: /^Town/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /BEDOK/ }));
  fireEvent.change(box("Year completed, to"), { target: { value: "1990" } });
  fireEvent.keyDown(box("Year completed, to"), { key: "Enter" });
  fireEvent.change(box("MRT distance in metres, to"), { target: { value: "500" } });
  fireEvent.keyDown(box("MRT distance in metres, to"), { key: "Enter" });
  const rental = screen.getByRole("group", { name: "Rental" });
  fireEvent.click(within(rental).getByRole("button", { name: "Rental 1-Room" }));
  expect(useFilters.getState().filters).toEqual({
    ...EMPTY_FILTERS,
    towns: ["BEDOK"],
    year: [1978, 1990],
    mrt: [350, 500],
    rentalTypes: ["1room"],
  });
});

test("the flat-type reset clears both groups in the store", () => {
  renderFields();
  fireEvent.click(screen.getByRole("button", { name: "Sold 4-Room" }));
  fireEvent.click(screen.getByRole("button", { name: "Rental 1-Room" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset Flat types" }));
  expect(useFilters.getState().filters).toEqual(EMPTY_FILTERS);
});

test("Clear all is enabled only while a filter is on, and empties the store", () => {
  renderFields();
  expect(clearAll()).toBeDisabled();
  fireEvent.change(box("Floors, from"), { target: { value: "20" } });
  fireEvent.keyDown(box("Floors, from"), { key: "Enter" });
  expect(clearAll()).toBeEnabled();
  fireEvent.click(clearAll());
  expect(useFilters.getState().filters).toEqual(EMPTY_FILTERS);
  expect(clearAll()).toBeDisabled();
  // It disables itself, so focus moves on to the first filter rather than dropping to the page.
  expect(screen.getByRole("button", { name: /^Town/ })).toHaveFocus();
});

// A slider whose minimum equals its maximum has no track to draw.
test("renders nothing until the index has loaded", () => {
  const { container } = render(<FilterFields features={[]} towns={sampleTowns} />);
  expect(container).toBeEmptyDOMElement();
});

test("BlockCount reports the shown and total blocks in a status region", () => {
  render(<BlockCount shown={1234} total={10796} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    `Showing ${(1234).toLocaleString()} of ${(10796).toLocaleString()} blocks`,
  );
});

test("BlockCount renders nothing before the index has loaded", () => {
  const { container } = render(<BlockCount shown={0} total={0} />);
  expect(container).toBeEmptyDOMElement();
});

test("BlockCount shows each change at once but announces only after a pause", () => {
  vi.useFakeTimers();
  try {
    const { container, rerender } = render(<BlockCount shown={10} total={100} />);
    rerender(<BlockCount shown={9} total={100} />);
    rerender(<BlockCount shown={8} total={100} />);
    expect(container).toHaveTextContent("Showing 8 of 100 blocks");
    expect(screen.getByRole("status")).toHaveTextContent("Showing 10 of 100 blocks");
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("status")).toHaveTextContent("Showing 8 of 100 blocks");
  } finally {
    vi.useRealTimers();
  }
});
