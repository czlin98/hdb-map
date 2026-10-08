import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

// MapView has its own tests; a clickable stub makes the App wiring testable.
vi.mock("./components/MapView", () => ({
  MapView: ({
    data,
    onSelectBlock,
    onBackgroundClick,
    colorMode,
  }: {
    data: IndexFeatureCollection;
    onSelectBlock: (id: string, town: string) => void;
    onBackgroundClick?: () => void;
    colorMode?: string;
  }) => (
    <div data-testid="map" data-color-mode={colorMode}>
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

afterEach(() => {
  vi.restoreAllMocks();
  useSelection.getState().clear();
  useColorMode.getState().setMode("none");
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

test("the Color menu sits beside the search box", async () => {
  stubLoaded();
  render(<App />);
  await screen.findByText("marker-123-ang-mo-kio-ave-3");
  const search = screen.getByRole("combobox");
  const color = screen.getByRole("button", { name: "Color" });
  // Siblings in the top bar: the search box's wrapper and the button share a parent.
  expect(search.closest("[data-slot=command]")!.parentElement!.parentElement).toBe(
    color.parentElement,
  );
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

test("the error card hides the Color menu and the legend", async () => {
  stubFetch({ "towns.json": sampleTowns }); // index.geojson -> 404
  act(() => useColorMode.getState().setMode("year"));
  render(<App />);
  await screen.findByText(/couldn't load block data/i);
  expect(screen.queryByRole("button", { name: /^Color/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /legend/ })).not.toBeInTheDocument();
});
