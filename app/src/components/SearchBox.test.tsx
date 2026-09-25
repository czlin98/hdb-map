import { render, screen } from "@testing-library/react";
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
