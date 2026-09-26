import { useEffect, useRef, type RefObject } from "react";
// maplibre-gl v6 is ESM with named exports only (no default export).
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { IndexFeatureCollection } from "../types/contract";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// Singapore island view bounds; drive the initial fit and the zoom floor.
// Centered on the main island's landmass midpoint (103.8247, 1.3408; OSM
// relation 1769123) so fitBounds keeps it centered.
const MIN_BOUNDS: [[number, number], [number, number]] = [
  [103.5847, 1.1608],
  [104.0647, 1.5208],
];
// Map panning bounds. Looser than MIN_BOUNDS so a narrow screen can frame the
// full island width without being forced to a higher zoom.
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [103.35, 0.7],
  [104.32, 1.92],
];

interface Props {
  data: IndexFeatureCollection;
  selectedId: string | null;
  onSelectBlock: (id: string, town: string) => void;
  // Tap on the map away from any block; used to dismiss the details panel.
  onBackgroundClick?: () => void;
  // Bottom padding for the fly-to so the marker clears the sheet; null = skip the fly entirely.
  flyPaddingBottom?: number | null;
  // The search input; its bottom edge is padded past so the marker centers between
  // the search box and the sheet. Measured at fly time to stay current.
  topClearanceRef?: RefObject<HTMLInputElement | null>;
  // Zoom +/- buttons; desktop only, since touch users pinch and the sheet needs the room.
  showZoomButtons?: boolean;
}

// Zoom at which block numbers appear. Any lower and a dense estate reads as a wall of text.
const LABEL_MIN_ZOOM = 16;

function highlightFilter(id: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "id"], id ?? ""];
}

// The selected block is labelled by its own layer, so drop it here to avoid a double label.
function labelFilter(id: string | null): maplibregl.FilterSpecification {
  return ["!=", ["get", "id"], id ?? ""];
}

// Layers that count as touching a block: the number beside a dot belongs to it, and on touch
// it is the bigger, more readable target.
const DOT_LAYERS = ["blocks-highlight", "blocks-circles"];
const BLOCK_LAYERS = [...DOT_LAYERS, "blocks-highlight-label", "blocks-labels"];

// Labels render above dots, so they come first in a hit list; prefer a dot, since a label
// can overlap another block's dot and the dot is the more precise target.
function pickBlock(features: maplibregl.MapGeoJSONFeature[]) {
  return features.find((f) => DOT_LAYERS.includes(f.layer.id)) ?? features[0];
}

// Label text size (px) at LABEL_MIN_ZOOM and at max zoom (17).
const LABEL_SIZE: [number, number] = [10, 12];
// Space between a dot's edge and its label.
const LABEL_GAP_PX = 2;

// Shared by both label layers; `radius` is the layer's circle radius (px) at LABEL_MIN_ZOOM
// and at 17. The variable anchor lets MapLibre try each side of the dot and keep whichever
// doesn't collide. The radial offset is in ems, so it is derived per zoom stop from the
// radius: a fixed em value would drift against a dot that grows at a different rate.
function labelLayout(radius: [number, number]) {
  const offset = (i: 0 | 1) => (radius[i] + LABEL_GAP_PX) / LABEL_SIZE[i];
  return {
    "text-field": ["get", "blk_no"],
    "text-size": [
      "interpolate",
      ["linear"],
      ["zoom"],
      LABEL_MIN_ZOOM,
      LABEL_SIZE[0],
      17,
      LABEL_SIZE[1],
    ],
    "text-variable-anchor": ["left", "right", "top", "bottom"],
    "text-radial-offset": [
      "interpolate",
      ["linear"],
      ["zoom"],
      LABEL_MIN_ZOOM,
      offset(0),
      17,
      offset(1),
    ],
    "text-justify": "auto",
  } satisfies maplibregl.SymbolLayerSpecification["layout"];
}

export function MapView({
  data,
  selectedId,
  onSelectBlock,
  onBackgroundClick,
  flyPaddingBottom = 0,
  topClearanceRef,
  showZoomButtons = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelectBlock);
  onSelectRef.current = onSelectBlock;
  const onBackgroundClickRef = useRef(onBackgroundClick);
  onBackgroundClickRef.current = onBackgroundClick;
  // Latest data, read inside the one-shot load handler so the source is
  // created with populated features even when the index resolves before
  // the style loads.
  const dataRef = useRef(data);
  dataRef.current = data;
  // Latest selection, read inside the one-shot load handler so the highlight
  // layer is created already filtered to any selection made before load.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      bounds: MIN_BOUNDS,
      maxBounds: MAX_BOUNDS,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: false,
      // Keep the map north-up and flat: rotation and tilt add nothing to a map of flat
      // markers, and an accidental twist would otherwise need a compass to undo.
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    // Set the zoom floor to whatever fits the whole island in the viewport, so narrow
    // screens see all of it. Recomputed on resize/orientation change.
    const fitZoomFloor = () => {
      const cam = map.cameraForBounds(MIN_BOUNDS);
      if (cam?.zoom != null) map.setMinZoom(cam.zoom);
    };
    map.on("resize", fitZoomFloor);

    map.on("load", () => {
      map.addSource("blocks", {
        type: "geojson",
        data: dataRef.current,
        cluster: false,
        attribution: "© HDB, OneMap/SLA",
      });
      map.addLayer({
        id: "blocks-circles",
        type: "circle",
        source: "blocks",
        // filter slot (extension point): no filter in v1.
        paint: {
          // Grow toward max zoom so blocks are an easy tap target once zoomed into a
          // neighborhood; low/mid zoom stays small to avoid clutter.
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 14, 4, 16, 8, 17, 10],
          // colorBy slot (extension point): single fixed color in v1.
          "circle-color": "#2563eb",
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "blocks-highlight",
        type: "circle",
        source: "blocks",
        // Separate layer, exempt from any future filter, so search can reveal a block.
        filter: highlightFilter(selectedIdRef.current),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 14, 7, 16, 10, 17, 13],
          "circle-color": "#f59e0b",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      // Block numbers, so a zoomed-in estate is readable without hovering (touch has no
      // hover at all). Collision detection thins them in dense estates; the dots stay.
      map.addLayer({
        id: "blocks-labels",
        type: "symbol",
        source: "blocks",
        minzoom: LABEL_MIN_ZOOM,
        filter: labelFilter(selectedIdRef.current),
        // Radii match blocks-circles at zoom 16 and 17.
        layout: { ...labelLayout([8, 10]), "text-font": ["Noto Sans Regular"] },
        paint: {
          "text-color": "#1e3a8a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
      map.addLayer({
        id: "blocks-highlight-label",
        type: "symbol",
        source: "blocks",
        minzoom: LABEL_MIN_ZOOM,
        filter: highlightFilter(selectedIdRef.current),
        // Radii match blocks-highlight at zoom 16 and 17; its larger ring needs more room.
        layout: {
          ...labelLayout([10, 13]),
          "text-font": ["Noto Sans Bold"],
          // Always shown. As the topmost layer it is placed first, so neighbours yield to it.
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#92400e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
      // The map constructor runs the fit before layout is settled, so re-frame
      // has to be done at the final size. Otherwise the opening view stays too
      // zoomed in and sits above the zoom floor, most visibly on mobile.
      map.resize();
      fitZoomFloor();
      map.fitBounds(MIN_BOUNDS, { animate: false });
    });

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "block-tooltip",
    });
    map.on("mousemove", BLOCK_LAYERS, (e) => {
      if (!window.matchMedia("(hover: hover)").matches) return;
      const f = pickBlock(e.features ?? []);
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { blk_no: string; street: string };
      popup.setLngLat(e.lngLat).setText(`${p.blk_no} ${p.street}`).addTo(map);
    });
    map.on("mouseleave", BLOCK_LAYERS, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    // One handler for block taps and background taps, so a tap can't both select a block
    // and dismiss the panel. A tap on no dot, ring or label dismisses it.
    map.on("click", (e) => {
      if (!map.getLayer("blocks-circles")) return; // ignore taps before load
      const f = pickBlock(map.queryRenderedFeatures(e.point, { layers: BLOCK_LAYERS }));
      if (!f) {
        onBackgroundClickRef.current?.();
        return;
      }
      const p = f.properties as { id: string; town: string };
      onSelectRef.current(p.id, p.town);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Mount-once: all reactive values are read through refs, so deps stay empty.
  }, []);

  // Bottom-left stays clear of the search box (top-left) and the desktop details panel
  // (right edge), which would otherwise cover the buttons while it's open.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showZoomButtons) return;
    const nav = new maplibregl.NavigationControl({ showCompass: false });
    map.addControl(nav, "bottom-left");
    return () => {
      // On unmount the map is already removed, taking its controls with it.
      if (mapRef.current) map.removeControl(nav);
    };
  }, [showZoomButtons]);

  // Keep the source data fresh (markers appear once the index has loaded).
  useEffect(() => {
    const src = mapRef.current?.getSource("blocks") as maplibregl.GeoJSONSource | undefined;
    src?.setData(data as unknown as FeatureCollection);
  }, [data]);

  // Highlight + fly on selection change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("blocks-highlight")) return;
    map.setFilter("blocks-highlight", highlightFilter(selectedId));
    map.setFilter("blocks-highlight-label", highlightFilter(selectedId));
    map.setFilter("blocks-labels", labelFilter(selectedId));
    if (!selectedId) {
      // Ease the fly-to padding back to zero when the sheet closes, so the camera
      // glides up with it. Skip when there's no padding to clear, to avoid a
      // redundant camera animation.
      const p = map.getPadding();
      if (p.top || p.right || p.bottom || p.left) {
        map.easeTo({ padding: { top: 0, right: 0, left: 0, bottom: 0 } });
      }
      return;
    }
    if (flyPaddingBottom !== null) {
      const f = data.features.find((ft) => ft.properties.id === selectedId);
      if (f) {
        const top = topClearanceRef?.current?.getBoundingClientRect().bottom ?? 0;
        map.flyTo({
          center: f.geometry.coordinates,
          // Land at least where labels show, so the block and its neighbours are readable.
          zoom: Math.max(map.getZoom(), LABEL_MIN_ZOOM),
          padding: { top, right: 0, left: 0, bottom: flyPaddingBottom },
        });
      }
    }
  }, [selectedId, data, flyPaddingBottom, topClearanceRef]);

  // Inline position/size so the container fills its parent independent of when
  // Tailwind's utilities are applied; MapLibre measures this at creation time.
  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
