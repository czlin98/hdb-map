import { act, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

// Capture the snap props App feeds the details panel, and stub the map/panel so the
// test exercises App's snap orchestration without MapLibre or Vaul internals.
const captured: {
  activeSnap?: string | number | null;
  onSnapChange?: (snap: string | number | null) => void;
} = {};

vi.mock("./components/MapView", () => ({ MapView: () => <div /> }));
vi.mock("./components/DetailsPanel", () => ({
  DetailsPanel: (props: {
    activeSnap: string | number | null;
    onSnapChange: (snap: string | number | null) => void;
  }) => {
    captured.activeSnap = props.activeSnap;
    captured.onSnapChange = props.onSnapChange;
    return <div data-testid="panel" />;
  },
}));

import App from "./App";
import { sampleIndex, sampleTowns } from "./test/fixtures";
import { useSelection } from "./store/selection";

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url.includes("index.geojson")
        ? sampleIndex
        : url.includes("towns.json")
          ? sampleTowns
          : {};
      return { ok: true, status: 200, json: async () => body };
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  useSelection.getState().clear();
});

const PEEK = "95px";
const HALF = 0.5;

test("sheet opens at the half snap and ignores Vaul's stale peek reset in the reopen window", async () => {
  vi.useFakeTimers();
  stubFetch();
  render(<App />);
  await act(async () => {}); // flush the data-load promises

  act(() => useSelection.getState().select("123-ang-mo-kio-ave-3", "ANG MO KIO", "marker"));
  expect(captured.activeSnap).toBe(HALF);

  // Vaul's closeDrawer resets the snap to the first (peek) point 500ms after a
  // close; landing during the reopen window it must be ignored so the reopened
  // sheet stays at the half snap.
  act(() => captured.onSnapChange!(PEEK));
  expect(captured.activeSnap).toBe(HALF);

  // Once the window passes, a peek snap (e.g. a genuine drag) applies normally.
  act(() => vi.advanceTimersByTime(800));
  act(() => captured.onSnapChange!(PEEK));
  expect(captured.activeSnap).toBe(PEEK);
});

test("a selection made mid-close reopens the sheet at the half snap", async () => {
  vi.useFakeTimers();
  stubFetch();
  render(<App />);
  await act(async () => {});

  act(() => useSelection.getState().select("123-ang-mo-kio-ave-3", "ANG MO KIO", "marker"));
  act(() => vi.advanceTimersByTime(800));
  act(() => captured.onSnapChange!(PEEK)); // drag down to peek
  expect(captured.activeSnap).toBe(PEEK);

  act(() => useSelection.getState().beginClose()); // begin closing from peek
  act(() => useSelection.getState().select("1-bedok-nth-st-1", "BEDOK", "marker")); // reselect
  expect(captured.activeSnap).toBe(HALF);
});
