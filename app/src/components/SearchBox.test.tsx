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
