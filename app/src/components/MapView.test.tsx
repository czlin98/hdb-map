import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

// vi.mock is hoisted above the file body, so the mock's collaborators must be
// created inside vi.hoisted() (which also hoists) to exist when the factory runs.
const { handlers, map, MapCtor } = vi.hoisted(() => {
  const handlers: Record<string, ((e?: unknown) => void)[]> = {};
  const map = {
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getLayer: vi.fn().mockReturnValue({}),
    getSource: vi.fn().mockReturnValue({ setData: vi.fn() }),
    setFilter: vi.fn(),
    resize: vi.fn(),
    flyTo: vi.fn(),
    getZoom: vi.fn().mockReturnValue(11),
    getCanvas: vi.fn().mockReturnValue({ style: {} }),
    on: vi.fn((ev: string, a: unknown, b?: unknown) => {
      const cb = (typeof a === "function" ? a : b) as (e?: unknown) => void;
      (handlers[ev] ??= []).push(cb);
    }),
    remove: vi.fn(),
  };
  // A function expression (not an arrow) so `new maplibregl.Map(...)` works.
  const MapCtor = vi.fn(function (_opts: Record<string, unknown>) {
    return map;
  });
  return { handlers, map, MapCtor };
});

// maplibre-gl v6 exposes named exports only, so mock them as named (no default).
vi.mock("maplibre-gl", () => ({
  Map: MapCtor,
  // Constructed with `new`, so the impls must be function expressions.
  AttributionControl: vi.fn(function () {}),
  Popup: vi.fn(function () {
    return { setLngLat: () => ({ setText: () => ({ addTo: vi.fn() }) }), remove: vi.fn() };
  }),
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

import { MapView } from "./MapView";
import { sampleIndex } from "../test/fixtures";

afterEach(() => { for (const k of Object.keys(handlers)) delete handlers[k]; vi.clearAllMocks(); });

function fire(ev: string, e?: unknown) { (handlers[ev] ?? []).forEach((cb) => cb(e)); }

test("locks the camera to Singapore and adds both layers on load", () => {
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  const opts = MapCtor.mock.calls[0][0] as Record<string, unknown>;
  expect(opts.maxBounds).toBeDefined();
  expect(opts.minZoom).toBeGreaterThan(9);

  fire("load");
  const layerIds = map.addLayer.mock.calls.map((c) => (c[0] as { id: string }).id);
  expect(layerIds).toContain("blocks-circles");
  expect(layerIds).toContain("blocks-highlight");
});

test("creates the source with the latest data if index beats load", () => {
  const empty = {
    type: "FeatureCollection",
    features: [],
  } as typeof sampleIndex;
  const { rerender } = render(
    <MapView data={empty} selectedId={null} onSelectBlock={vi.fn()} />,
  );
  // Index arrives before the style's "load" event fires.
  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />,
  );
  fire("load");
  const call = map.addSource.mock.calls.find((c) => c[0] === "blocks");
  const sourceArg = call?.[1] as { data: typeof sampleIndex };
  expect(sourceArg.data.features).toHaveLength(2);
});

test("clicking a feature reports id + town", () => {
  const onSelectBlock = vi.fn();
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={onSelectBlock} />);
  fire("load");
  fire("click", { features: [{ properties: { id: "123-ang-mo-kio-ave-3", town: "ANG MO KIO" } }] });
  expect(onSelectBlock).toHaveBeenCalledWith("123-ang-mo-kio-ave-3", "ANG MO KIO");
});

test("selection sets the highlight filter and flies", () => {
  const { rerender } = render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  fire("load");
  rerender(<MapView data={sampleIndex} selectedId="123-ang-mo-kio-ave-3" onSelectBlock={vi.fn()} />);
  expect(map.setFilter).toHaveBeenCalledWith("blocks-highlight", ["==", ["get", "id"], "123-ang-mo-kio-ave-3"]);
  expect(map.flyTo).toHaveBeenCalled();
});
