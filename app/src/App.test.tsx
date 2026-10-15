import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// MapView has its own tests; a clickable stub makes the App wiring testable.
vi.mock("./components/MapView", () => ({
  MapView: ({
    data,
    onSelectBlock,
    onBackgroundClick,
    colorMode,
    filters,
  }: {
    data: IndexFeatureCollection;
    onSelectBlock: (id: string, town: string) => void;
    onBackgroundClick?: () => void;
    colorMode?: string;
    filters?: unknown;
  }) => (
    <div data-testid="map" data-color-mode={colorMode} data-filters={JSON.stringify(filters)}>
      {data.features.map((f: BlockFeature) => (
        <button
          key={f.properties.id}
          onClick={() => onSelectBlock(f.properties.id, f.properties.town)}
        >
          marker-{f.properties.id}
        </button>
      ))}
      <button onClick={() => onBackgroundClick?.()}>map-background</button>
    </div>
  ),
}));

import App from "./App";
import type { BlockFeature, IndexFeatureCollection } from "./types/contract";
import { sampleIndex, sampleShard, sampleTowns } from "./test/fixtures";
import { useSelection } from "./store/selection";
import { useColorMode } from "./store/color";
import { useFilters } from "./store/filters";

afterEach(() => {
  vi.restoreAllMocks();
  useSelection.getState().clear();
  useColorMode.getState().setMode("none");
  useFilters.getState().clearAll();
});

function stubFetch(map: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = Object.keys(map).find((k) => url.includes(k));
      if (!key) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => map[key] };
    }),
  );
}

test("loads data, then opens details when a marker is selected", async () => {
  stubFetch({
    "index.geojson": sampleIndex,
    "towns.json": sampleTowns,
    "ang-mo-kio.json": sampleShard,
  });
  render(<App />);

  await userEvent.click(await screen.findByText("marker-123-ang-mo-kio-ave-3"));
  expect(
    await screen.findByRole("heading", { name: /123 ANG MO KIO AVENUE 3 560123/ }),
  ).toBeInTheDocument();
});

test("tapping the map background dismisses an open details panel", async () => {
  stubFetch({
    "index.geojson": sampleIndex,
    "towns.json": sampleTowns,
    "ang-mo-kio.json": sampleShard,
  });
  render(<App />);

  await userEvent.click(await screen.findByText("marker-123-ang-mo-kio-ave-3"));
  await screen.findByRole("heading", { name: /123 ANG MO KIO AVENUE 3 560123/ });

  await userEvent.click(screen.getByText("map-background"));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: /123 ANG MO KIO AVENUE 3/ }),
    ).not.toBeInTheDocument(),
  );
});

test("shows a fatal error card when index fails to load", async () => {
  stubFetch({ "towns.json": sampleTowns }); // index.geojson -> 404
  render(<App />);
  expect(await screen.findByText(/couldn't load block data/i)).toBeInTheDocument();
});

function stubLoaded() {
  stubFetch({
    "index.geojson": sampleIndex,
    "towns.json": sampleTowns,
    "ang-mo-kio.json": sampleShard,
  });
}

async function pickColorMode(current: string, item: string) {
  await userEvent.click(screen.getByRole("button", { name: current }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: item }));
}

const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;

test("Filters and Color sit in a row under the search box, Filters first", async () => {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  const search = screen.getByRole("combobox");
  const filters = screen.getByRole("button", { name: "Filters" });
  const color = screen.getByRole("button", { name: "Color" });
  const row = filters.parentElement!;
  expect(color.parentElement).toBe(row);
  expect(filters.compareDocumentPosition(color) & FOLLOWING).toBeTruthy();
  expect(row.contains(search)).toBe(false);
  expect(search.compareDocumentPosition(row) & FOLLOWING).toBeTruthy();
});

const filtersPanel = () => screen.queryByRole("dialog", { name: "Filters" });

async function tickTown(name: RegExp) {
  if (!filtersPanel()) await userEvent.click(screen.getByRole("button", { name: /^Filters/ }));
  const panel = filtersPanel()!;
  const town = within(panel).getByRole("button", { name: /^Town/ });
  if (town.getAttribute("aria-expanded") === "false") await userEvent.click(town);
  await userEvent.click(within(panel).getByRole("checkbox", { name }));
}

test("the map follows the filter panel", async () => {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-filters",
    JSON.stringify({ towns: [], year: null, floors: null }),
  );
  await tickTown(/BEDOK/);
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-filters",
    JSON.stringify({ towns: ["BEDOK"], year: null, floors: null }),
  );
  expect(within(filtersPanel()!).getByRole("status")).toHaveTextContent("Showing 1 of 2 blocks");
});

test("the legend counts only the visible blocks and greys an emptied band", async () => {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  await pickColorMode("Color", "Year completed");
  const before1980 = () =>
    within(screen.getByRole("region", { name: "Year completed legend" }))
      .getAllByRole("listitem")
      .find((li) => li.textContent!.startsWith("Before 1980"))!;
  expect(before1980()).toHaveTextContent("Before 19801");
  expect(before1980()).not.toHaveAttribute("data-empty");

  await tickTown(/BEDOK/);
  expect(before1980()).toHaveTextContent("Before 19800");
  expect(before1980()).toHaveAttribute("data-empty");
});

test("the filter panel stays open while the map is used", async () => {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  await userEvent.click(screen.getByRole("button", { name: "Filters" }));
  await userEvent.click(screen.getByText("marker-123-ang-mo-kio-ave-3"));
  await screen.findByRole("heading", { name: /123 ANG MO KIO AVENUE 3 560123/ });
  expect(filtersPanel()).toBeInTheDocument();
  await userEvent.click(screen.getByText("map-background"));
  expect(filtersPanel()).toBeInTheDocument();
});

test("only one of the Color menu and the filter panel is open at a time", async () => {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  await userEvent.click(screen.getByRole("button", { name: "Filters" }));
  await userEvent.click(screen.getByRole("button", { name: "Color" }));
  expect(filtersPanel()).not.toBeInTheDocument();
  // The panel's close must not pull focus back to Filters, which would dismiss the menu.
  expect(screen.getByRole("menu")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Filters" }));
  expect(filtersPanel()).toBeInTheDocument();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("a search result the filters hide still opens its details", async () => {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  await tickTown(/BEDOK/);
  await userEvent.type(screen.getByRole("combobox"), "avenue 3");
  await userEvent.click(await screen.findByText("123 ANG MO KIO AVENUE 3 560123"));
  expect(
    await screen.findByRole("heading", { name: /123 ANG MO KIO AVENUE 3 560123/ }),
  ).toBeInTheDocument();
});

test("picking a mode recolors the map and shows the legend", async () => {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  expect(screen.getByTestId("map")).toHaveAttribute("data-color-mode", "none");
  expect(screen.queryByRole("region", { name: /legend/ })).not.toBeInTheDocument();

  await pickColorMode("Color", "Year completed");
  expect(screen.getByTestId("map")).toHaveAttribute("data-color-mode", "year");
  expect(screen.getByRole("region", { name: "Year completed legend" })).toBeInTheDocument();

  await pickColorMode("Color: Year", "No coloring");
  expect(screen.getByTestId("map")).toHaveAttribute("data-color-mode", "none");
  expect(screen.queryByRole("region", { name: /legend/ })).not.toBeInTheDocument();
});

test("no legend while the index is still loading", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  render(<App />);
  act(() => useColorMode.getState().setMode("year"));
  expect(screen.queryByRole("region", { name: /legend/ })).not.toBeInTheDocument();
});

test("the error card hides the Filters and Color buttons and the legend", async () => {
  stubFetch({ "towns.json": sampleTowns }); // index.geojson -> 404
  act(() => useColorMode.getState().setMode("year"));
  render(<App />);
  await screen.findByText(/couldn't load block data/i);
  expect(screen.queryByRole("button", { name: /^Filters/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Color/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /legend/ })).not.toBeInTheDocument();
});

describe("on a phone", () => {
  // setup.ts reports the desktop breakpoint; these tests take the mobile path instead.
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
  });

  const optionsSheet = () => screen.queryByRole("dialog", { name: "Map options" });
  // An opening sheet locks the body's pointer events until the next animation frame (see
  // MapOptionsControl), before a person could tap; userEvent would click before that.
  const nextFrame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
  const detailsHeading = () => screen.queryByRole("heading", { name: /123 ANG MO KIO AVENUE 3/ });

  async function renderLoaded() {
    stubLoaded();
    render(<App />);
    await screen.findByText("marker-123-ang-mo-kio-ave-3");
  }

  test("the options button opens the sheet, with Color above Filters", async () => {
    await renderLoaded();
    expect(screen.queryByRole("button", { name: /^Color/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Map options" }));
    expect(optionsSheet()).toBeInTheDocument();
    const color = screen.getByRole("radiogroup", { name: "Color by" });
    const filters = screen.getByRole("heading", { name: "Filters" });
    expect(color.compareDocumentPosition(filters) & FOLLOWING).toBeTruthy();
  });

  test("selecting a marker closes the options sheet and opens its details", async () => {
    await renderLoaded();
    await userEvent.click(screen.getByRole("button", { name: "Map options" }));
    await nextFrame();
    await userEvent.click(screen.getByText("marker-123-ang-mo-kio-ave-3"));
    expect(await screen.findByRole("heading", { name: /123 ANG MO KIO AVENUE 3/ })).toBeVisible();
    await waitFor(() => expect(optionsSheet()).not.toBeInTheDocument());
  });

  test("the options button closes open details, clearing the selection", async () => {
    await renderLoaded();
    await userEvent.click(screen.getByText("marker-123-ang-mo-kio-ave-3"));
    await screen.findByRole("heading", { name: /123 ANG MO KIO AVENUE 3/ });
    await nextFrame();
    // hidden: Vaul leaves Radix's dialog modal, so the app outside an open sheet is aria-hidden.
    await userEvent.click(screen.getByRole("button", { name: "Map options", hidden: true }));
    expect(optionsSheet()).toBeInTheDocument();
    await waitFor(() => expect(detailsHeading()).not.toBeInTheDocument());
    await waitFor(() => expect(useSelection.getState().selectedId).toBeNull());
  });

  test("a map background tap closes the options sheet", async () => {
    await renderLoaded();
    await userEvent.click(screen.getByRole("button", { name: "Map options" }));
    await nextFrame();
    await userEvent.click(screen.getByText("map-background"));
    await waitFor(() => expect(optionsSheet()).not.toBeInTheDocument());
  });

  test("filters set in the sheet survive it closing", async () => {
    await renderLoaded();
    await userEvent.click(screen.getByRole("button", { name: "Map options" }));
    // Bare clicks inside the sheet: userEvent's pointerdown reaches Vaul's drag handler, which
    // calls setPointerCapture, missing from jsdom.
    fireEvent.click(screen.getByRole("button", { name: /^Town/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /BEDOK/ }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(optionsSheet()).not.toBeInTheDocument());
    expect(screen.getByTestId("map")).toHaveAttribute(
      "data-filters",
      JSON.stringify({ towns: ["BEDOK"], year: null, floors: null }),
    );
    expect(screen.getByRole("button", { name: "Map options, 1 filter on" })).toBeInTheDocument();
  });
});
