import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

// vi.mock is hoisted above the file body, so the mock's collaborators must be
// created inside vi.hoisted() (which also hoists) to exist when the factory runs.
const { handlers, map, MapCtor, NavCtor } = vi.hoisted(() => {
  const handlers: Record<string, ((e?: unknown) => void)[]> = {};
  const map = {
    addControl: vi.fn(),
    removeControl: vi.fn(),
    touchZoomRotate: { disableRotation: vi.fn() },
    keyboard: { disableRotation: vi.fn() },
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getLayer: vi.fn().mockReturnValue({}),
    getSource: vi.fn().mockReturnValue({ setData: vi.fn() }),
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    setFilter: vi.fn(),
    setPadding: vi.fn(),
    setMinZoom: vi.fn(),
    cameraForBounds: vi.fn().mockReturnValue({ zoom: 10.2 }),
    resize: vi.fn(),
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    getPadding: vi.fn().mockReturnValue({ top: 0, right: 0, bottom: 0, left: 0 }),
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
  const NavCtor = vi.fn(function (_opts: Record<string, unknown>) {});
  return { handlers, map, MapCtor, NavCtor };
});

// maplibre-gl v6 exposes named exports only, so mock them as named (no default).
vi.mock("maplibre-gl", () => ({
  Map: MapCtor,
  // Constructed with `new`, so the impls must be function expressions.
  AttributionControl: vi.fn(function () {}),
  NavigationControl: NavCtor,
  Popup: vi.fn(function () {
    return { setLngLat: () => ({ setText: () => ({ addTo: vi.fn() }) }), remove: vi.fn() };
  }),
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

import { MapView } from "./MapView";
import { sampleIndex } from "../test/fixtures";

afterEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.clearAllMocks();
});

function fire(ev: string, e?: unknown) {
  (handlers[ev] ?? []).forEach((cb) => cb(e));
}

test("locks the camera to Singapore and adds both layers on load", () => {
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  const opts = MapCtor.mock.calls[0][0] as Record<string, unknown>;
  expect(opts.maxBounds).toBeDefined();

  fire("load");
  const layerIds = map.addLayer.mock.calls.map((c) => (c[0] as { id: string }).id);
  expect(layerIds).toContain("blocks-circles");
  expect(layerIds).toContain("blocks-highlight");
});

test("keeps the map north-up and flat", () => {
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  const opts = MapCtor.mock.calls[0][0] as Record<string, unknown>;
  expect(opts).toMatchObject({ dragRotate: false, pitchWithRotate: false, maxPitch: 0 });
  // A two-finger pinch would otherwise also rotate, with no compass to undo it.
  expect(map.touchZoomRotate.disableRotation).toHaveBeenCalled();
  expect(map.keyboard.disableRotation).toHaveBeenCalled();
});

test("adds compass-free zoom buttons only when asked", () => {
  const { rerender } = render(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />,
  );
  expect(NavCtor).not.toHaveBeenCalled();

  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} showZoomButtons />,
  );
  expect(NavCtor).toHaveBeenCalledWith({ showCompass: false });
  const nav = NavCtor.mock.instances[0];
  expect(map.addControl).toHaveBeenCalledWith(nav, "bottom-left");

  // Crossing to the mobile breakpoint drops them again.
  rerender(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  expect(map.removeControl).toHaveBeenCalledWith(nav);
});

test("fits the zoom floor to the island on load", () => {
  map.cameraForBounds.mockReturnValue({ zoom: 10.2 });
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  fire("load");
  expect(map.cameraForBounds).toHaveBeenCalled();
  expect(map.setMinZoom).toHaveBeenCalledWith(10.2);
});

test("re-fits the camera to the island on load but not on later resizes", () => {
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  fire("load");
  // The constructor fit ran before layout settled; the load re-fit corrects it.
  expect(map.fitBounds).toHaveBeenCalledTimes(1);
  // A later resize recomputes only the zoom floor, so a user who has already
  // zoomed or panned is not yanked back to the island overview.
  map.fitBounds.mockClear();
  fire("resize");
  expect(map.fitBounds).not.toHaveBeenCalled();
});

test("recomputes the zoom floor when the map resizes", () => {
  map.cameraForBounds.mockReturnValue({ zoom: 10.2 });
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  fire("load");
  map.setMinZoom.mockClear();
  // A narrower viewport (e.g. portrait phone, rotation) needs a lower zoom to fit.
  map.cameraForBounds.mockReturnValue({ zoom: 9.6 });
  fire("resize");
  expect(map.setMinZoom).toHaveBeenCalledWith(9.6);
});

test("creates the source with the latest data if index beats load", () => {
  const empty = {
    type: "FeatureCollection",
    features: [],
  } as typeof sampleIndex;
  const { rerender } = render(<MapView data={empty} selectedId={null} onSelectBlock={vi.fn()} />);
  // Index arrives before the style's "load" event fires.
  rerender(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
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

test("tapping the map away from any block reports a background click", () => {
  const onBackgroundClick = vi.fn();
  render(
    <MapView
      data={sampleIndex}
      selectedId={null}
      onSelectBlock={vi.fn()}
      onBackgroundClick={onBackgroundClick}
    />,
  );
  fire("load");
  map.queryRenderedFeatures.mockReturnValue([]);
  fire("click", { point: { x: 10, y: 10 } });
  expect(onBackgroundClick).toHaveBeenCalledTimes(1);
  // The hit test must include the highlight layer, else tapping the selected
  // marker's (larger) ring would read as background and dismiss the panel.
  expect(map.queryRenderedFeatures).toHaveBeenCalledWith(
    { x: 10, y: 10 },
    { layers: ["blocks-circles", "blocks-highlight"] },
  );
});

test("ignores clicks before the block layer has loaded", () => {
  const onBackgroundClick = vi.fn();
  // Simulate the pre-load window: the style's "load" hasn't added the layers.
  map.getLayer.mockReturnValue(undefined);
  render(
    <MapView
      data={sampleIndex}
      selectedId={null}
      onSelectBlock={vi.fn()}
      onBackgroundClick={onBackgroundClick}
    />,
  );
  fire("click", { point: { x: 5, y: 5 } });
  expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
  expect(onBackgroundClick).not.toHaveBeenCalled();
  map.getLayer.mockReturnValue({}); // restore for other tests
});

test("tapping a block does not report a background click", () => {
  const onBackgroundClick = vi.fn();
  const onSelectBlock = vi.fn();
  render(
    <MapView
      data={sampleIndex}
      selectedId={null}
      onSelectBlock={onSelectBlock}
      onBackgroundClick={onBackgroundClick}
    />,
  );
  fire("load");
  // A block sits under the tap, so the background handler must stay quiet.
  map.queryRenderedFeatures.mockReturnValue([{ properties: { id: "123-ang-mo-kio-ave-3" } }]);
  fire("click", {
    point: { x: 10, y: 10 },
    features: [{ properties: { id: "123-ang-mo-kio-ave-3", town: "ANG MO KIO" } }],
  });
  expect(onSelectBlock).toHaveBeenCalledWith("123-ang-mo-kio-ave-3", "ANG MO KIO");
  expect(onBackgroundClick).not.toHaveBeenCalled();
});

test("selection sets the highlight filter and flies", () => {
  const { rerender } = render(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />,
  );
  fire("load");
  rerender(
    <MapView data={sampleIndex} selectedId="123-ang-mo-kio-ave-3" onSelectBlock={vi.fn()} />,
  );
  expect(map.setFilter).toHaveBeenCalledWith("blocks-highlight", [
    "==",
    ["get", "id"],
    "123-ang-mo-kio-ave-3",
  ]);
  expect(map.flyTo).toHaveBeenCalled();
});

test("resets the camera padding when the selection is cleared", () => {
  const { rerender } = render(
    <MapView
      data={sampleIndex}
      selectedId="123-ang-mo-kio-ave-3"
      onSelectBlock={vi.fn()}
      flyPaddingBottom={400}
    />,
  );
  fire("load");
  // A prior fly-to left bottom padding on the camera; simulate that leftover state.
  map.getPadding.mockReturnValue({ top: 40, right: 0, bottom: 400, left: 0 });
  // Closing the sheet clears the selection; that padding must be eased back to zero
  // so the map center isn't offset afterwards (a glide, not an instant snap).
  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} flyPaddingBottom={400} />,
  );
  expect(map.easeTo).toHaveBeenCalledWith({ padding: { top: 0, right: 0, left: 0, bottom: 0 } });
});

test("skips the camera glide when clearing a selection that left no padding", () => {
  // On desktop the fly-to uses zero padding, so a deselect has nothing to shed and
  // must not fire a no-op easeTo (which would still emit camera move events).
  const { rerender } = render(
    <MapView
      data={sampleIndex}
      selectedId="123-ang-mo-kio-ave-3"
      onSelectBlock={vi.fn()}
      flyPaddingBottom={0}
    />,
  );
  fire("load");
  map.getPadding.mockReturnValue({ top: 0, right: 0, bottom: 0, left: 0 });
  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} flyPaddingBottom={0} />,
  );
  expect(map.easeTo).not.toHaveBeenCalled();
});
