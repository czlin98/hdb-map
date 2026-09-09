import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBox } from "./SearchBox";
import { buildSearchIndex } from "../lib/search";
import { sampleIndex } from "../test/fixtures";

const rows = buildSearchIndex(sampleIndex);
const AMK_LABEL = "123 ANG MO KIO AVENUE 3 560123";

test("typing filters and shows the full address; selecting reports the row", async () => {
  const onSelect = vi.fn();
  render(<SearchBox rows={rows} onSelect={onSelect} />);

  await userEvent.type(screen.getByPlaceholderText(/search/i), "avenue 3");
  const item = await screen.findByText(AMK_LABEL);
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

test("reflects a search-selected address in the input without opening the dropdown", async () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} selectedLabel={AMK_LABEL} />);
  const input = screen.getByPlaceholderText(/search/i);

  await userEvent.click(input); // focusing must not pop a redundant list of the selected block
  expect(input).toHaveValue(AMK_LABEL);
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

test("editing a reflected address switches back to live search results", async () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} selectedLabel={AMK_LABEL} />);
  const input = screen.getByPlaceholderText(/search/i);

  await userEvent.clear(input);
  await userEvent.type(input, "bedok");
  expect(await screen.findByText(/BEDOK NORTH STREET 1/)).toBeInTheDocument();
});

test("clearing the selection empties a reflected input", () => {
  const { rerender } = render(
    <SearchBox rows={rows} onSelect={vi.fn()} selectedLabel={AMK_LABEL} />,
  );
  const input = screen.getByPlaceholderText(/search/i);
  expect(input).toHaveValue(AMK_LABEL);

  rerender(<SearchBox rows={rows} onSelect={vi.fn()} selectedLabel={null} />);
  expect(input).toHaveValue("");
});

test("the clear button empties the input and calls onClear", async () => {
  const onClear = vi.fn();
  render(<SearchBox rows={rows} onSelect={vi.fn()} onClear={onClear} selectedLabel={AMK_LABEL} />);
  const input = screen.getByPlaceholderText(/search/i);

  await userEvent.click(screen.getByRole("button", { name: /clear/i }));
  expect(input).toHaveValue("");
  expect(onClear).toHaveBeenCalledTimes(1);
});

test("blurring hides the results but keeps the typed query", async () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} />);
  const input = screen.getByPlaceholderText(/search/i);

  await userEvent.type(input, "bedok");
  expect(await screen.findByText(/BEDOK NORTH STREET 1/)).toBeInTheDocument();

  await userEvent.tab(); // move focus off the input
  expect(screen.queryByText(/BEDOK NORTH STREET 1/)).not.toBeInTheDocument();
  expect(input).toHaveValue("bedok");
});
