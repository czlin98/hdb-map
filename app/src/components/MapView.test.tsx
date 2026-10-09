import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

// vi.mock is hoisted above the file body, so its collaborators must be hoisted too.
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
    setPaintProperty: vi.fn(),
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
  // A function expression, not an arrow, so it can be called with `new`.
  const MapCtor = vi.fn(function (_opts: Record<string, unknown>) {
    return map;
  });
  const NavCtor = vi.fn(function (_opts: Record<string, unknown>) {});
  return { handlers, map, MapCtor, NavCtor };
});

// Named exports only, like maplibre-gl v6 (no default).
vi.mock("maplibre-gl", () => ({
  Map: MapCtor,
  AttributionControl: vi.fn(function () {}),
  NavigationControl: NavCtor,
  Popup: vi.fn(function () {
    return { setLngLat: () => ({ setText: () => ({ addTo: vi.fn() }) }), remove: vi.fn() };
  }),
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

import { MapView } from "./MapView";
import { sampleIndex } from "../test/fixtures";
import { BLOCK_COLOR, circleColor } from "../lib/coloring";

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
  expect(map.addControl).toHaveBeenCalledWith(nav, "bottom-right");

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
  expect(map.fitBounds).toHaveBeenCalledTimes(1);
  // A later resize must only move the zoom floor, not yank a user who has panned or zoomed
  // back to the island overview.
  map.fitBounds.mockClear();
  fire("resize");
  expect(map.fitBounds).not.toHaveBeenCalled();
});

test("recomputes the zoom floor when the map resizes", () => {
  map.cameraForBounds.mockReturnValue({ zoom: 10.2 });
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  fire("load");
  map.setMinZoom.mockClear();
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
  // The index arrives before the style's load event.
  rerender(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  fire("load");
  const call = map.addSource.mock.calls.find((c) => c[0] === "blocks");
  const sourceArg = call?.[1] as { data: typeof sampleIndex };
  expect(sourceArg.data.features).toHaveLength(2);
});

function hit(layer: string, id: string, town = "ANG MO KIO") {
  return { layer: { id: layer }, properties: { id, town } };
}

function renderWithHandlers() {
  const onSelectBlock = vi.fn();
  const onBackgroundClick = vi.fn();
  render(
    <MapView
      data={sampleIndex}
      selectedId={null}
      onSelectBlock={onSelectBlock}
      onBackgroundClick={onBackgroundClick}
    />,
  );
  fire("load");
  return { onSelectBlock, onBackgroundClick };
}

test("tapping a dot reports id + town, not a background click", () => {
  const { onSelectBlock, onBackgroundClick } = renderWithHandlers();
  map.queryRenderedFeatures.mockReturnValue([hit("blocks-circles", "123-ang-mo-kio-ave-3")]);
  fire("click", { point: { x: 10, y: 10 } });
  expect(onSelectBlock).toHaveBeenCalledWith("123-ang-mo-kio-ave-3", "ANG MO KIO");
  expect(onBackgroundClick).not.toHaveBeenCalled();
});

test("tapping a block's label selects it instead of dismissing the panel", () => {
  const { onSelectBlock, onBackgroundClick } = renderWithHandlers();
  map.queryRenderedFeatures.mockReturnValue([hit("blocks-labels", "1-bedok-nth-st-1", "BEDOK")]);
  fire("click", { point: { x: 10, y: 10 } });
  expect(onSelectBlock).toHaveBeenCalledWith("1-bedok-nth-st-1", "BEDOK");
  expect(onBackgroundClick).not.toHaveBeenCalled();
});

test("a dot wins over another block's label drawn on top of it", () => {
  const { onSelectBlock } = renderWithHandlers();
  // Labels render above dots, so they come first in the hit list.
  map.queryRenderedFeatures.mockReturnValue([
    hit("blocks-labels", "1-bedok-nth-st-1", "BEDOK"),
    hit("blocks-circles", "123-ang-mo-kio-ave-3"),
  ]);
  fire("click", { point: { x: 10, y: 10 } });
  expect(onSelectBlock).toHaveBeenCalledTimes(1);
  expect(onSelectBlock).toHaveBeenCalledWith("123-ang-mo-kio-ave-3", "ANG MO KIO");
});

test("tapping the map away from any block reports a background click", () => {
  const { onSelectBlock, onBackgroundClick } = renderWithHandlers();
  map.queryRenderedFeatures.mockReturnValue([]);
  fire("click", { point: { x: 10, y: 10 } });
  expect(onBackgroundClick).toHaveBeenCalledTimes(1);
  expect(onSelectBlock).not.toHaveBeenCalled();
  // The hit test must cover the highlight ring and labels too, or tapping them would
  // read as background and dismiss the panel.
  const layers = (map.queryRenderedFeatures.mock.calls[0][1] as { layers: string[] }).layers;
  expect(layers).toEqual(
    expect.arrayContaining([
      "blocks-circles",
      "blocks-highlight",
      "blocks-labels",
      "blocks-highlight-label",
    ]),
  );
});

test("ignores clicks before the block layer has loaded", () => {
  const onBackgroundClick = vi.fn();
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

test("hovering a label shows the pointer, like hovering its dot", () => {
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  const hoverLayers = map.on.mock.calls.find((c) => c[0] === "mousemove")?.[1];
  expect(hoverLayers).toEqual(expect.arrayContaining(["blocks-circles", "blocks-labels"]));
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
  expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 16 }));
});

test("labels blocks with their block number once zoomed in", () => {
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  fire("load");
  const layers = map.addLayer.mock.calls.map(
    (c) => c[0] as { id: string; type: string; minzoom?: number; layout?: Record<string, unknown> },
  );
  const labels = layers.find((l) => l.id === "blocks-labels");
  expect(labels?.type).toBe("symbol");
  expect(labels?.minzoom).toBeGreaterThan(11);
  expect(labels?.layout?.["text-field"]).toEqual(["get", "blk_no"]);
  const highlight = layers.find((l) => l.id === "blocks-highlight-label");
  expect(highlight?.layout?.["text-allow-overlap"]).toBe(true);
  const ids = layers.map((l) => l.id);
  expect(ids.indexOf("blocks-labels")).toBeGreaterThan(ids.indexOf("blocks-highlight"));
});

test("selection moves the block's label to the highlight label layer", () => {
  const { rerender } = render(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />,
  );
  fire("load");
  rerender(
    <MapView data={sampleIndex} selectedId="123-ang-mo-kio-ave-3" onSelectBlock={vi.fn()} />,
  );
  expect(map.setFilter).toHaveBeenCalledWith("blocks-highlight-label", [
    "==",
    ["get", "id"],
    "123-ang-mo-kio-ave-3",
  ]);
  expect(map.setFilter).toHaveBeenCalledWith("blocks-labels", [
    "!=",
    ["get", "id"],
    "123-ang-mo-kio-ave-3",
  ]);
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
  // Leftover padding from the earlier fly-to.
  map.getPadding.mockReturnValue({ top: 40, right: 0, bottom: 400, left: 0 });
  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} flyPaddingBottom={400} />,
  );
  expect(map.easeTo).toHaveBeenCalledWith({ padding: { top: 0, right: 0, left: 0, bottom: 0 } });
});

test("skips the camera glide when clearing a selection that left no padding", () => {
  // Desktop flies with zero padding; an easeTo that changes nothing still emits move events.
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

function addedLayer(id: string) {
  const call = map.addLayer.mock.calls.find((c) => (c[0] as { id: string }).id === id);
  return call?.[0] as { paint: Record<string, unknown> };
}

test("colors markers by the mode that is set when the map loads", () => {
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} colorMode="year" />);
  fire("load");
  expect(addedLayer("blocks-circles").paint["circle-color"]).toEqual(circleColor("year"));
});

test("recolors markers when the mode changes", () => {
  const { rerender } = render(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />,
  );
  fire("load");
  expect(addedLayer("blocks-circles").paint["circle-color"]).toBe(BLOCK_COLOR);

  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} colorMode="floors" />,
  );
  expect(map.setPaintProperty).toHaveBeenLastCalledWith(
    "blocks-circles",
    "circle-color",
    circleColor("floors"),
  );

  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} colorMode="none" />,
  );
  expect(map.setPaintProperty).toHaveBeenLastCalledWith(
    "blocks-circles",
    "circle-color",
    BLOCK_COLOR,
  );
});

test("leaves the paint alone until the block layer exists", () => {
  map.getLayer.mockReturnValue(undefined);
  const { rerender } = render(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />,
  );
  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} colorMode="year" />,
  );
  expect(map.setPaintProperty).not.toHaveBeenCalled();
  map.getLayer.mockReturnValue({}); // restore for other tests
});

test("the selected block stays amber in every mode", () => {
  const { rerender } = render(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} colorMode="year" />,
  );
  fire("load");
  expect(addedLayer("blocks-highlight").paint["circle-color"]).toBe("#f59e0b");
  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} colorMode="floors" />,
  );
  const targets = map.setPaintProperty.mock.calls.map((c) => c[0]);
  expect(targets).not.toContain("blocks-highlight");
});

// The attribution control is mocked, so stand in for the open credits MapLibre renders.
function openCredits(container: HTMLElement) {
  const credits = document.createElement("details");
  credits.className = "maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show";
  const button = document.createElement("summary");
  button.className = "maplibregl-ctrl-attrib-button";
  const press = vi.fn(() => credits.classList.remove("maplibregl-compact-show"));
  button.addEventListener("click", press);
  credits.append(button);
  container.firstElementChild!.append(credits);
  return press;
}

test("collapses open credits when a mode turns on, if asked", () => {
  const props = { data: sampleIndex, selectedId: null, onSelectBlock: vi.fn() };
  const { container, rerender } = render(<MapView {...props} collapseCreditsOnColor />);
  const press = openCredits(container);

  rerender(<MapView {...props} collapseCreditsOnColor colorMode="none" />);
  expect(press).not.toHaveBeenCalled();
  rerender(<MapView {...props} colorMode="year" />);
  expect(press).not.toHaveBeenCalled();
  rerender(<MapView {...props} collapseCreditsOnColor colorMode="year" />);
  expect(press).toHaveBeenCalledTimes(1);
});

test("collapses open credits when a block is selected", () => {
  const props = { data: sampleIndex, onSelectBlock: vi.fn() };
  const { container, rerender } = render(<MapView {...props} selectedId={null} />);
  const press = openCredits(container);

  rerender(<MapView {...props} selectedId={sampleIndex.features[0].properties.id} />);
  expect(press).toHaveBeenCalledTimes(1);
});
