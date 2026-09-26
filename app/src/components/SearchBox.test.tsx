import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBox } from "./SearchBox";
import { buildSearchIndex } from "../lib/search";
import { sampleIndex } from "../test/fixtures";

const rows = buildSearchIndex(sampleIndex);

test("typing filters and shows the full address; selecting reports the row", async () => {
  const onSelect = vi.fn();
  render(<SearchBox rows={rows} onSelect={onSelect} />);

  await userEvent.type(screen.getByPlaceholderText(/search/i), "avenue 3");
  const item = await screen.findByText("123 ANG MO KIO AVENUE 3 560123");
  await userEvent.click(item);

  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ id: "123-ang-mo-kio-ave-3", town: "ANG MO KIO" }),
  );
});

test("shows empty state when nothing matches", async () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} />);
  await userEvent.type(screen.getByPlaceholderText(/search/i), "zzzz");
  expect(await screen.findByText(/no matches/i)).toBeInTheDocument();
});

const AMK = "123 ANG MO KIO AVENUE 3 560123";
const BEDOK = "1 BEDOK NORTH STREET 1 460001";

test("selecting a result keeps the query but collapses the list", async () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} />);

  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "avenue 3");
  await userEvent.click(await screen.findByText(AMK));

  expect(input).toHaveValue("avenue 3");
  expect(screen.queryByText(AMK)).not.toBeInTheDocument();
});

test("reopening the input shows the same results", async () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} />);

  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "1");
  await userEvent.click(await screen.findByText(BEDOK));
  expect(screen.queryByText(AMK)).not.toBeInTheDocument();

  await userEvent.click(input);

  expect(screen.getByText(AMK)).toBeInTheDocument();
  expect(screen.getByText(BEDOK)).toBeInTheDocument();
});

test("reopening highlights the first result, not the previous pick", async () => {
  // Three rows, picking the middle: cmdk only clears a picked row's highlight when it
  // is the last row to unmount, so this is the case that used to leave it behind.
  const three = ["10", "11", "12"].map((blk) => ({
    id: blk,
    blk_no: blk,
    street_full: "TEST STREET",
    postal: `0000${blk}`,
    town: "TEST",
    haystack: `${blk} TEST STREET 0000${blk}`,
    words: [blk, "TEST", "STREET", `0000${blk}`],
  }));
  render(<SearchBox rows={three} onSelect={vi.fn()} />);

  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "test");
  await userEvent.click(await screen.findByText("11 TEST STREET 000011"));
  await userEvent.click(input);

  const row = (text: string) => screen.getByText(text).closest("[cmdk-item]");
  expect(row("10 TEST STREET 000010")).toHaveAttribute("aria-selected", "true");
  expect(row("11 TEST STREET 000011")).toHaveAttribute("aria-selected", "false");
});

test("an Enter pick keeps focus; typing or arrowing reopens the list", async () => {
  const onSelect = vi.fn();
  render(<SearchBox rows={rows} onSelect={onSelect} />);

  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "avenue 3");
  await screen.findByText(AMK);
  await userEvent.keyboard("{Enter}");

  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "123-ang-mo-kio-ave-3" }));
  expect(input).toHaveFocus();
  expect(screen.queryByText(AMK)).not.toBeInTheDocument();

  await userEvent.keyboard("{ArrowDown}");
  expect(screen.getByText(AMK)).toBeInTheDocument();
});

test("refocusing the input without a click does not reopen the list", async () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} />);

  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "avenue 3");
  await screen.findByText(AMK);
  await userEvent.keyboard("{Enter}");
  expect(screen.queryByText(AMK)).not.toBeInTheDocument();

  // Switching to another tab and back blurs and refocuses the input, with no click.
  act(() => {
    input.blur();
    input.focus();
  });
  expect(screen.queryByText(AMK)).not.toBeInTheDocument();
});

test("Escape closes the list, drops focus, and dismisses, keeping the query", async () => {
  const onDismiss = vi.fn();
  render(<SearchBox rows={rows} onSelect={vi.fn()} onDismiss={onDismiss} />);

  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "avenue 3");
  await screen.findByText(AMK);
  await userEvent.keyboard("{Escape}");

  expect(screen.queryByText(AMK)).not.toBeInTheDocument();
  expect(input).not.toHaveFocus();
  expect(input).toHaveValue("avenue 3");
  expect(onDismiss).toHaveBeenCalledTimes(1);

  await userEvent.click(input);
  expect(screen.getByText(AMK)).toBeInTheDocument();
});

test("Escape dismisses even when the list is already closed", async () => {
  const onDismiss = vi.fn();
  render(<SearchBox rows={rows} onSelect={vi.fn()} onDismiss={onDismiss} />);

  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "avenue 3");
  await userEvent.keyboard("{Enter}");
  expect(input).toHaveFocus();

  await userEvent.keyboard("{Escape}");
  expect(input).not.toHaveFocus();
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("a tap outside closes the list", async () => {
  render(
    <>
      <SearchBox rows={rows} onSelect={vi.fn()} />
      <div data-testid="map" />
    </>,
  );

  await userEvent.type(screen.getByPlaceholderText(/search/i), "avenue 3");
  await screen.findByText(AMK);
  await userEvent.click(screen.getByTestId("map"));
  expect(screen.queryByText(AMK)).not.toBeInTheDocument();
});

test("tabbing out through the clear button closes the list", async () => {
  render(
    <>
      <SearchBox rows={rows} onSelect={vi.fn()} />
      <button>next</button>
    </>,
  );

  await userEvent.type(screen.getByPlaceholderText(/search/i), "avenue 3");
  await screen.findByText(AMK);

  // Input to clear button stays inside the box, so the list stays.
  await userEvent.tab();
  expect(screen.getByRole("button", { name: /clear search/i })).toHaveFocus();
  expect(screen.getByText(AMK)).toBeInTheDocument();

  await userEvent.tab();
  expect(screen.getByRole("button", { name: "next" })).toHaveFocus();
  expect(screen.queryByText(AMK)).not.toBeInTheDocument();
});

test("clear button empties the query and hides results", async () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} />);

  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "avenue 3");
  await screen.findByText("123 ANG MO KIO AVENUE 3 560123");

  await userEvent.click(screen.getByRole("button", { name: /clear search/i }));

  expect(input).toHaveValue("");
  expect(screen.queryByText("123 ANG MO KIO AVENUE 3 560123")).not.toBeInTheDocument();
});

test("clear button is absent when the query is empty", () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();
});

test("editing the query scrolls to the new first result, not the old highlight", async () => {
  // 101 X AVE 3 leads for "x ave 3" and still matches "x ave 1" (via 101), but lower
  // down: the list used to scroll to it there before the highlight caught up.
  const two = buildSearchIndex({
    type: "FeatureCollection",
    features: [
      ["101", "X AVE 3", "X AVENUE 3", "000101"],
      ["5", "X AVE 1", "X AVENUE 1", "000005"],
    ].map(([blk_no, street, street_full, postal]) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [103.8, 1.35] as [number, number] },
      properties: { id: blk_no, blk_no, street, street_full, postal, town: "TEST" },
    })),
  });
  const scrolledTo: string[] = [];
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolledTo.push(this.textContent ?? "");
  };
  try {
    render(<SearchBox rows={two} onSelect={vi.fn()} />);
    const input = screen.getByPlaceholderText(/search/i);
    await userEvent.type(input, "x ave 3");
    scrolledTo.length = 0;
    await userEvent.type(input, "{backspace}1");

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "5 X AVENUE 1 000005",
      "101 X AVENUE 3 000101",
    ]);
    expect(scrolledTo).not.toContain("101 X AVENUE 3 000101");
  } finally {
    Element.prototype.scrollIntoView = original;
  }
});

test("editing the query scrolls the list back to the top", async () => {
  const { container } = render(<SearchBox rows={rows} onSelect={vi.fn()} />);
  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "1");

  // jsdom has no layout, so record assignments instead of reading a real offset.
  const list = container.querySelector("[cmdk-list]")!;
  let scrollTop = 120;
  Object.defineProperty(list, "scrollTop", {
    get: () => scrollTop,
    set: (v: number) => (scrollTop = v),
    configurable: true,
  });
  await userEvent.type(input, "2");

  expect(scrollTop).toBe(0);
});

test("caps the query at 50 characters", async () => {
  // The longest real query ("blk 114A BUKIT BATOK WEST AVENUE 6 651114") is 41; the cap
  // stops a long paste from making every keystroke score thousands of words.
  render(<SearchBox rows={rows} onSelect={vi.fn()} />);
  const input = screen.getByPlaceholderText(/search/i);
  await userEvent.type(input, "1 ".repeat(40));
  expect(input).toHaveValue("1 ".repeat(25));
});
