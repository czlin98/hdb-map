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
    stations,
    nearestExit,
  }: {
    data: IndexFeatureCollection;
    onSelectBlock: (id: string, town: string) => void;
    onBackgroundClick?: () => void;
    colorMode?: string;
    filters?: unknown;
    stations?: { features: unknown[] } | null;
    nearestExit?: unknown;
  }) => (
    <div
      data-testid="map"
      data-color-mode={colorMode}
      data-filters={JSON.stringify(filters)}
      data-stations={stations ? stations.features.length : "none"}
      data-nearest-exit={JSON.stringify(nearestExit ?? null)}
    >
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
import { EMPTY_FILTERS } from "./lib/filtering";
import { sampleIndex, sampleShard, sampleStations, sampleTowns } from "./test/fixtures";
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

test("loads the stations beside the index and hands them to the map", async () => {
  stubFetch({
    "index.geojson": sampleIndex,
    "towns.json": sampleTowns,
    "stations.geojson": sampleStations,
  });
  render(<App />);
  // Requested on mount with the index, not after it.
  const urls = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]);
  expect(urls).toEqual(expect.arrayContaining(["/data/index.geojson", "/data/stations.geojson"]));
  await waitFor(() => expect(screen.getByTestId("map")).toHaveAttribute("data-stations", "9"));
});

test("a failed stations load leaves the app working, with no error card", async () => {
  stubFetch({ "index.geojson": sampleIndex, "towns.json": sampleTowns }); // stations -> 404
  render(<App />);
  expect(await screen.findByText("marker-123-ang-mo-kio-ave-3")).toBeInTheDocument();
  expect(screen.getByTestId("map")).toHaveAttribute("data-stations", "none");
  expect(screen.queryByText(/couldn't load block data/i)).not.toBeInTheDocument();
});

test.each(["index.geojson", "towns.json"])(
  "a failed %s still shows the error card when the stations load",
  async (missing) => {
    const files: Record<string, unknown> = {
      "index.geojson": sampleIndex,
      "towns.json": sampleTowns,
      "stations.geojson": sampleStations,
    };
    delete files[missing];
    stubFetch(files);
    render(<App />);
    expect(await screen.findByText(/couldn't load block data/i)).toBeInTheDocument();
  },
);

describe("the nearest-exit highlight", () => {
  const AMK = "marker-123-ang-mo-kio-ave-3";
  const amkExit = {
    lon: 103.8488,
    lat: 1.3693,
    station: "ang-mo-kio",
    exit: "Exit A",
    distance: 350,
  };
  const mayflowerExit = {
    lon: 103.8368,
    lat: 1.3716,
    station: "mayflower",
    exit: "Exit 2",
    distance: 720,
  };
  const bedokShard = {
    "1-bedok-nth-st-1": {
      ...sampleShard["123-ang-mo-kio-ave-3"],
      blk_no: "1",
      street: "BEDOK NTH ST 1",
      street_full: "BEDOK NORTH STREET 1",
      postal: "460001",
      town: "BEDOK",
      nearest_stations: [
        { id: "bedok", name: "Bedok", codes: ["EW5"], exit: "Exit B", distance: 820 },
      ],
    },
  };
  const bedokExit = {
    lon: 103.9302,
    lat: 1.3242,
    station: "bedok",
    exit: "Exit B",
    distance: 820,
  };
  // The details sheet is a Vaul drawer in jsdom; userEvent's pointerdown trips Vaul's
  // setPointerCapture, so rows are clicked with fireEvent.
  const clickRow = async (name: RegExp) =>
    fireEvent.click(await screen.findByRole("button", { name }));
  const shownExit = () => JSON.parse(screen.getByTestId("map").dataset.nearestExit!);

  test("selecting a block hands the map its nearest exit; clearing takes it away", async () => {
    stubFetch({
      "index.geojson": sampleIndex,
      "towns.json": sampleTowns,
      "stations.geojson": sampleStations,
      "ang-mo-kio.json": sampleShard,
    });
    render(<App />);
    expect(shownExit()).toBeNull();
    await userEvent.click(await screen.findByText(AMK));
    await waitFor(() => expect(shownExit()).toEqual(amkExit));

    act(() => useSelection.getState().clear());
    expect(shownExit()).toBeNull();
  });

  test.each([
    ["stations", { "ang-mo-kio.json": sampleShard }, /123 ANG MO KIO AVENUE 3 560123/],
    ["shard", { "stations.geojson": sampleStations }, /Details unavailable/],
  ])("a failed %s load leaves it empty and the panel unaffected", async (_, files, panel) => {
    stubFetch({ "index.geojson": sampleIndex, "towns.json": sampleTowns, ...files });
    render(<App />);
    await userEvent.click(await screen.findByText(AMK));
    // The panel shows what it would without the highlight.
    expect(await screen.findByText(panel)).toBeInTheDocument();
    expect(shownExit()).toBeNull();
  });

  test("the rows move the highlight, turn it off, and it stays off for the next block", async () => {
    stubFetch({
      "index.geojson": sampleIndex,
      "towns.json": sampleTowns,
      "stations.geojson": sampleStations,
      "ang-mo-kio.json": sampleShard,
      "bedok.json": bedokShard,
    });
    render(<App />);
    await userEvent.click(await screen.findByText(AMK));
    await waitFor(() => expect(shownExit()).toEqual(amkExit));

    await clickRow(/^Mayflower/);
    await waitFor(() => expect(shownExit()).toEqual(mayflowerExit));
    await clickRow(/^Mayflower/);
    expect(shownExit()).toBeNull();

    await userEvent.click(screen.getByText("marker-1-bedok-nth-st-1"));
    await screen.findByRole("button", { name: /^Bedok/ });
    expect(shownExit()).toBeNull();
    await clickRow(/^Bedok/);
    await waitFor(() => expect(shownExit()).toEqual(bedokExit));
  });

  test("while on, each new block starts at its nearest station", async () => {
    stubFetch({
      "index.geojson": sampleIndex,
      "towns.json": sampleTowns,
      "stations.geojson": sampleStations,
      "ang-mo-kio.json": sampleShard,
      "bedok.json": bedokShard,
    });
    render(<App />);
    await userEvent.click(await screen.findByText(AMK));
    await clickRow(/^Mayflower/);
    await waitFor(() => expect(shownExit()).toEqual(mayflowerExit));

    await userEvent.click(screen.getByText("marker-1-bedok-nth-st-1"));
    await waitFor(() => expect(shownExit()).toEqual(bedokExit));
    await userEvent.click(screen.getByText(AMK));
    await waitFor(() => expect(shownExit()).toEqual(amkExit));
  });

  test("a quick second selection never shows the first block's exit", async () => {
    let releaseAmk!: () => void;
    const amkShard = new Promise<void>((r) => (releaseAmk = r));
    const files: Record<string, unknown> = {
      "index.geojson": sampleIndex,
      "towns.json": sampleTowns,
      "stations.geojson": sampleStations,
      "ang-mo-kio.json": sampleShard,
      "bedok.json": bedokShard,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("ang-mo-kio.json")) await amkShard;
        const key = Object.keys(files).find((k) => url.includes(k))!;
        return { ok: true, status: 200, json: async () => files[key] };
      }),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("map")).toHaveAttribute("data-stations", "9"));
    await userEvent.click(await screen.findByText(AMK));
    await userEvent.click(screen.getByText("marker-1-bedok-nth-st-1"));
    await waitFor(() => expect(shownExit()).toEqual(bedokExit));

    await act(async () => releaseAmk());
    expect(shownExit()).toEqual(bedokExit);
  });
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
  expect(screen.getByTestId("map")).toHaveAttribute("data-filters", JSON.stringify(EMPTY_FILTERS));
  await tickTown(/BEDOK/);
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-filters",
    JSON.stringify({ ...EMPTY_FILTERS, towns: ["BEDOK"] }),
  );
  // The announced count waits for a pause in the changes.
  await waitFor(() =>
    expect(within(filtersPanel()!).getByRole("status")).toHaveTextContent("Showing 1 of 2 blocks"),
  );
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

const detailsHeading = () => screen.queryByRole("heading", { name: /123 ANG MO KIO AVENUE 3/ });

async function openPanelAndDetails() {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  await userEvent.click(screen.getByRole("button", { name: "Filters" }));
  await userEvent.click(screen.getByText("marker-123-ang-mo-kio-ave-3"));
  await screen.findByRole("heading", { name: /123 ANG MO KIO AVENUE 3 560123/ });
}

test("a block click keeps the filter panel open beside the details", async () => {
  await openPanelAndDetails();
  expect(filtersPanel()).toBeInTheDocument();
});

test("a click on empty map closes the filter panel and the details", async () => {
  await openPanelAndDetails();
  await userEvent.click(screen.getByText("map-background"));
  expect(filtersPanel()).not.toBeInTheDocument();
  await waitFor(() => expect(detailsHeading()).not.toBeInTheDocument());
});

test("Escape closes the filter panel and the details together", async () => {
  await openPanelAndDetails();
  await userEvent.keyboard("{Escape}");
  expect(filtersPanel()).not.toBeInTheDocument();
  await waitFor(() => expect(detailsHeading()).not.toBeInTheDocument());
});

test("Escape in the search box backs out of everything, leaving focus off Filters", async () => {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  await userEvent.click(screen.getByRole("button", { name: "Filters" }));
  const search = screen.getByRole("combobox");
  await userEvent.type(search, "avenue 3");
  await userEvent.keyboard("{Escape}");
  expect(filtersPanel()).not.toBeInTheDocument();
  // The search box releases focus on Escape by design; the panel's close mustn't grab it.
  expect(search).not.toHaveFocus();
  expect(screen.getByRole("button", { name: "Filters" })).not.toHaveFocus();
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

  // Regression: Vaul's close timer, still pending from the details closing, cleared the new pick.
  test.each([
    ["the options button", "Map options"],
    ["a map background tap", "map-background"],
  ])("a block tapped right after %s closes the details stays open", async (_, closer) => {
    await renderLoaded();
    await userEvent.click(screen.getByText("marker-123-ang-mo-kio-ave-3"));
    await screen.findByRole("heading", { name: /123 ANG MO KIO AVENUE 3/ });
    await nextFrame();
    const close =
      closer === "Map options"
        ? screen.getByRole("button", { name: closer, hidden: true })
        : screen.getByText(closer);
    await userEvent.click(close);
    await nextFrame();
    await userEvent.click(screen.getByText("marker-1-bedok-nth-st-1"));
    // Past Vaul's 500 ms close timer.
    await act(() => new Promise<void>((r) => setTimeout(r, 700)));
    expect(useSelection.getState().selectedId).toBe("1-bedok-nth-st-1");
    // The panel's sr-only title: no Bedok shard is stubbed, so there is no block heading to find.
    expect(screen.getByText("Block details")).toBeInTheDocument();
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
      JSON.stringify({ ...EMPTY_FILTERS, towns: ["BEDOK"] }),
    );
    expect(screen.getByRole("button", { name: "Map options, 1 filter on" })).toBeInTheDocument();
  });
});
