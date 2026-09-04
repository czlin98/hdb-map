import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

// MapView is exercised in its own test; stub it here to a clickable list so App wiring is testable.
vi.mock("./components/MapView", () => ({
  MapView: ({
    data,
    onSelectBlock,
  }: {
    data: IndexFeatureCollection;
    onSelectBlock: (id: string, town: string) => void;
  }) => (
    <div>
      {data.features.map((f: BlockFeature) => (
        <button
          key={f.properties.id}
          onClick={() => onSelectBlock(f.properties.id, f.properties.town)}
        >
          marker-{f.properties.id}
        </button>
      ))}
    </div>
  ),
}));

import App from "./App";
import type { BlockFeature, IndexFeatureCollection } from "./types/contract";
import { sampleIndex, sampleShard, sampleTowns } from "./test/fixtures";
import { useSelection } from "./store/selection";

afterEach(() => {
  vi.restoreAllMocks();
  useSelection.getState().clear();
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

test("shows a fatal error card when index fails to load", async () => {
  stubFetch({ "towns.json": sampleTowns }); // index.geojson -> 404
  render(<App />);
  expect(await screen.findByText(/couldn't load block data/i)).toBeInTheDocument();
});
