import { useEffect, useRef, type RefObject } from "react";
// maplibre-gl v6 has named exports only (no default export).
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { IndexFeatureCollection, StationFeatureCollection } from "../types/contract";
import { circleColor, COLOR_SCALES, type ColorMode, type ColorScale } from "../lib/coloring";
import { EMPTY_FILTERS, filterExpression, type Filters } from "../lib/filtering";
import { drawStationChips } from "../lib/station-chips";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// Island view: drives the initial fit and the zoom floor. Centered on the main island's
// landmass midpoint (103.8247, 1.3408; OSM relation 1769123) so fitBounds keeps it centered.
const MIN_BOUNDS: [[number, number], [number, number]] = [
  [103.5847, 1.1608],
  [104.0647, 1.5208],
];
// Panning limits, looser than MIN_BOUNDS so a narrow screen can frame the full island width
// without being forced to a higher zoom.
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [103.35, 0.7],
  [104.32, 1.92],
];

interface Props {
  data: IndexFeatureCollection;
  selectedId: string | null;
  onSelectBlock: (id: string, town: string) => void;
  onBackgroundClick?: () => void;
  // The mobile sheet's height: the fly-to lands the marker above it. null skips the fly.
  sheetHeight?: number | null;
  // The marker is centered below this input's bottom edge, measured at fly time to stay current.
  topClearanceRef?: RefObject<HTMLInputElement | null>;
  // Desktop only: touch users pinch, and the mobile sheet needs the room.
  showZoomButtons?: boolean;
  colorMode?: ColorMode;
  // Mobile only: the open credits span the screen, so they make way for the legend.
  collapseCreditsOnColor?: boolean;
  filters?: Filters;
  // Optional: the map works without it, so a failed load only loses the stations.
  stations?: StationFeatureCollection | null;
  // The selected block's nearest exit, marked and joined to the block by a dashed line.
  nearestExit?: NearestExit | null;
}

export interface NearestExit {
  lon: number;
  lat: number;
  station: string; // station id
  exit: string;
}

// Any lower and a dense estate reads as a wall of text.
const LABEL_MIN_ZOOM = 16;

function highlightFilter(id: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "id"], id ?? ""];
}

// The selected block has its own label layer, so drop it here to avoid a double label.
function labelFilter(
  id: string | null,
  blockFilter: maplibregl.ExpressionSpecification | null,
): maplibregl.FilterSpecification {
  const condition: maplibregl.ExpressionSpecification = ["!=", ["get", "id"], id ?? ""];
  return blockFilter ? ["all", condition, blockFilter] : condition;
}

// A label counts as touching its block: on touch it is the bigger, more readable target.
const DOT_LAYERS = ["blocks-highlight", "blocks-circles"];
const BLOCK_LAYERS = [...DOT_LAYERS, "blocks-highlight-label", "blocks-labels"];

// Labels render above dots, so they come first in a hit list. Prefer a dot anyway: a label
// can overlap another block's dot, and the dot is the more precise target.
function pickBlock(features: maplibregl.MapGeoJSONFeature[]) {
  return features.find((f) => DOT_LAYERS.includes(f.layer.id)) ?? features[0];
}

// Text size (px) at LABEL_MIN_ZOOM and at max zoom (17).
const LABEL_SIZE: [number, number] = [10, 12];
const LABEL_GAP_PX = 2;

// `radius` is the dot's radius (px) at LABEL_MIN_ZOOM and at 17. The offset is in ems, so it
// is derived per zoom stop: a fixed value would drift against a dot that grows differently.
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

type TooltipProps = Pick<
  IndexFeatureCollection["features"][number]["properties"],
  "blk_no" | "street" | ColorScale["property"]
>;

// The address, followed by the colored value while a mode is on. Built from DOM nodes rather
// than setHTML, so block data is never parsed as markup.
function tooltipContent(p: TooltipProps, mode: ColorMode) {
  const el = document.createElement("div");
  el.append(`${p.blk_no} ${p.street}`);
  if (mode !== "none") {
    const scale = COLOR_SCALES[mode];
    const value = document.createElement("span");
    value.className = "text-muted-foreground";
    value.textContent = ` · ${scale.describe(p[scale.property])}`;
    el.append(value);
  }
  return el;
}

const CHIP_IMAGE_PREFIX = "chips-";

const IS_EXIT: maplibregl.ExpressionSpecification = ["==", ["get", "kind"], "exit"];

// The highlighted exit has its own bold label, so drop its plain one. Matching on the name
// also drops the label of any other entrance that shares it.
function exitLabelFilter(nearest: NearestExit | null): maplibregl.FilterSpecification {
  if (!nearest) return IS_EXIT;
  return [
    "all",
    IS_EXIT,
    [
      "!",
      ["all", ["==", ["get", "station"], nearest.station], ["==", ["get", "exit"], nearest.exit]],
    ],
  ];
}

function nearestExitData(
  nearest: NearestExit | null,
  block: [number, number] | undefined,
): FeatureCollection {
  if (!nearest) return { type: "FeatureCollection", features: [] };
  const point = [nearest.lon, nearest.lat];
  return {
    type: "FeatureCollection",
    features: [
      ...(block
        ? [
            {
              type: "Feature" as const,
              geometry: { type: "LineString" as const, coordinates: [block, point] },
              properties: {},
            },
          ]
        : []),
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: point },
        properties: { exit: nearest.exit },
      },
    ],
  };
}

// Under the selected block, above every other marker. The label is always shown, like the
// selected block's.
function addNearestExitLayers(map: maplibregl.Map, data: FeatureCollection) {
  map.addSource("nearest-exit", { type: "geojson", data });
  map.addLayer(
    {
      id: "nearest-exit-line",
      type: "line",
      source: "nearest-exit",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#92400e", "line-width": 1.5, "line-dasharray": [2, 2] },
    },
    "blocks-highlight",
  );
  map.addLayer(
    {
      id: "nearest-exit-circle",
      type: "circle",
      source: "nearest-exit",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffffff",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#d97706",
      },
    },
    "blocks-highlight",
  );
  map.addLayer(
    {
      id: "nearest-exit-label",
      type: "symbol",
      source: "nearest-exit",
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "exit"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 11,
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 0.9,
        "text-justify": "auto",
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#92400e", "text-halo-color": "#ffffff", "text-halo-width": 2 },
    },
    "blocks-highlight-label",
  );
}

// Stations sit above the block dots but below the nearest-exit highlight and the selected
// block; exits, plainer, sit under every block. Symbol layers higher in the stack are placed
// first, so station names win over block numbers, and block numbers over exit names.
function addStationLayers(
  map: maplibregl.Map,
  stations: StationFeatureCollection,
  nearest: NearestExit | null,
) {
  for (const f of stations.features) {
    const p = f.properties;
    if (p.kind !== "station") continue;
    const chips = drawStationChips(p.codes, window.devicePixelRatio);
    if (chips)
      map.addImage(CHIP_IMAGE_PREFIX + p.id, chips, { pixelRatio: window.devicePixelRatio });
  }
  map.addSource("stations", { type: "geojson", data: stations as unknown as FeatureCollection });
  const isStation: maplibregl.FilterSpecification = ["==", ["get", "kind"], "station"];
  map.addLayer(
    {
      id: "exits",
      type: "circle",
      source: "stations",
      filter: IS_EXIT,
      minzoom: LABEL_MIN_ZOOM,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.5, 17, 4],
        "circle-color": "#6b7280",
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
      },
    },
    "blocks-circles",
  );
  map.addLayer(
    {
      id: "exits-labels",
      type: "symbol",
      source: "stations",
      filter: exitLabelFilter(nearest),
      minzoom: LABEL_MIN_ZOOM,
      layout: {
        "text-field": ["get", "exit"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 0.6,
        "text-justify": "auto",
      },
      paint: { "text-color": "#4b5563", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    },
    "blocks-labels",
  );
  // From zoom 12: hidden only at the island view, where 185 rings would bury the blocks.
  map.addLayer(
    {
      id: "stations-circles",
      type: "circle",
      source: "stations",
      filter: isStation,
      minzoom: 12,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 14, 5, 17, 8],
        "circle-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#374151",
      },
    },
    "nearest-exit-line",
  );
  map.addLayer(
    {
      id: "stations-labels",
      type: "symbol",
      source: "stations",
      filter: isStation,
      minzoom: 13,
      layout: {
        "text-field": [
          "format",
          ["get", "name"],
          {},
          "\n",
          {},
          ["image", ["concat", CHIP_IMAGE_PREFIX, ["get", "id"]]],
          {},
        ],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 11, 17, 14],
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": 0.8,
        "text-padding": 2,
        "text-justify": "auto",
      },
      paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 2 },
    },
    "nearest-exit-label",
  );
}

// MapLibre has no public way to collapse the compact credits, so press its own ⓘ button.
function collapseOpenCredits(container: HTMLElement | null) {
  const open = container?.querySelector(".maplibregl-compact-show");
  open?.querySelector<HTMLElement>(".maplibregl-ctrl-attrib-button")?.click();
}

export function MapView({
  data,
  selectedId,
  onSelectBlock,
  onBackgroundClick,
  sheetHeight = 0,
  topClearanceRef,
  showZoomButtons = false,
  colorMode = "none",
  collapseCreditsOnColor = false,
  filters = EMPTY_FILTERS,
  stations = null,
  nearestExit = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelectBlock);
  onSelectRef.current = onSelectBlock;
  const onBackgroundClickRef = useRef(onBackgroundClick);
  onBackgroundClickRef.current = onBackgroundClick;
  // Read by the one-shot load handler, so the source, colors, and highlight start from the
  // latest data, mode, filters, and selection even when any arrives before the style loads.
  const dataRef = useRef(data);
  dataRef.current = data;
  const colorModeRef = useRef(colorMode);
  colorModeRef.current = colorMode;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const nearestExitRef = useRef(nearestExit);
  nearestExitRef.current = nearestExit;

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
      // North-up and flat: rotation and tilt add nothing to flat markers, and an accidental
      // twist would need a compass to undo.
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    // Floor the zoom at whatever fits the whole island, so narrow screens can see all of it.
    const fitZoomFloor = () => {
      const cam = map.cameraForBounds(MIN_BOUNDS);
      if (cam?.zoom != null) map.setMinZoom(cam.zoom);
    };
    map.on("resize", fitZoomFloor);

    map.on("load", () => {
      const blockFilter = filterExpression(filtersRef.current);
      map.addSource("blocks", {
        type: "geojson",
        data: dataRef.current,
        cluster: false,
        attribution: "© HDB, LTA, OneMap/SLA",
      });
      map.addLayer({
        id: "blocks-circles",
        type: "circle",
        source: "blocks",
        ...(blockFilter && { filter: blockFilter }),
        paint: {
          // Small at low zoom to avoid clutter; an easy tap target once zoomed into an estate.
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 14, 4, 16, 8, 17, 10],
          "circle-color": circleColor(colorModeRef.current),
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      // A separate layer, so the block filter on blocks-circles can't hide a searched block.
      map.addLayer({
        id: "blocks-highlight",
        type: "circle",
        source: "blocks",
        filter: highlightFilter(selectedIdRef.current),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 14, 7, 16, 10, 17, 13],
          "circle-color": "#f59e0b",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      // Touch has no hover, so numbers make a zoomed-in estate readable. Collision detection
      // thins them in dense estates; the dots stay.
      map.addLayer({
        id: "blocks-labels",
        type: "symbol",
        source: "blocks",
        minzoom: LABEL_MIN_ZOOM,
        filter: labelFilter(selectedIdRef.current, blockFilter),
        // Must match the blocks-circles radius at zoom 16 and 17.
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
        // Must match the blocks-highlight radius at zoom 16 and 17.
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
      const selected = dataRef.current.features.find(
        (f) => f.properties.id === selectedIdRef.current,
      );
      addNearestExitLayers(
        map,
        nearestExitData(nearestExitRef.current, selected?.geometry.coordinates),
      );
      if (stationsRef.current) addStationLayers(map, stationsRef.current, nearestExitRef.current);
      // The constructor's fit ran before layout settled, leaving the opening view too zoomed
      // in (most visibly on mobile), so re-frame at the final size.
      map.resize();
      fitZoomFloor();
      map.fitBounds(MIN_BOUNDS, { animate: false });
    });

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "block-tooltip",
      // MapLibre wraps popups at 240px by default; a long address plus its value runs past that.
      maxWidth: "none",
    });
    map.on("mousemove", BLOCK_LAYERS, (e) => {
      if (!window.matchMedia("(hover: hover)").matches) return;
      const f = pickBlock(e.features ?? []);
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const content = tooltipContent(f.properties as TooltipProps, colorModeRef.current);
      popup.setLngLat(e.lngLat).setDOMContent(content).addTo(map);
    });
    map.on("mouseleave", BLOCK_LAYERS, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    // One handler for block and background taps, so a single tap can't both select a block
    // and dismiss the panel.
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
    // Mount-once: every reactive value is read through a ref.
  }, []);

  // Bottom-left is the coloring legend's. MapLibre stacks a later-added bottom control on top,
  // so this sits above the attribution ⓘ added at mount.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showZoomButtons) return;
    const nav = new maplibregl.NavigationControl({ showCompass: false });
    map.addControl(nav, "bottom-right");
    return () => {
      // On unmount the map is already removed, taking its controls with it.
      if (mapRef.current) map.removeControl(nav);
    };
  }, [showZoomButtons]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("blocks-circles")) return;
    map.setPaintProperty("blocks-circles", "circle-color", circleColor(colorMode));
  }, [colorMode]);

  useEffect(() => {
    if (collapseCreditsOnColor && colorMode !== "none") collapseOpenCredits(containerRef.current);
  }, [colorMode, collapseCreditsOnColor]);

  // The details sheet or panel covers the credits' corner, so don't leave them open behind it.
  useEffect(() => {
    if (selectedId) collapseOpenCredits(containerRef.current);
  }, [selectedId]);

  // Stations that arrive after load. Loaded once per visit, so they are never replaced.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !stations || !map.getLayer("blocks-circles") || map.getSource("stations")) return;
    addStationLayers(map, stations, nearestExitRef.current);
  }, [stations]);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("nearest-exit") as maplibregl.GeoJSONSource | undefined;
    if (!map || !src) return;
    const selected = data.features.find((f) => f.properties.id === selectedId);
    src.setData(nearestExitData(nearestExit, selected?.geometry.coordinates));
    if (map.getLayer("exits-labels")) map.setFilter("exits-labels", exitLabelFilter(nearestExit));
  }, [nearestExit, selectedId, data]);

  useEffect(() => {
    const src = mapRef.current?.getSource("blocks") as maplibregl.GeoJSONSource | undefined;
    src?.setData(data as unknown as FeatureCollection);
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("blocks-circles")) return;
    const blockFilter = filterExpression(filters);
    map.setFilter("blocks-circles", blockFilter);
    map.setFilter("blocks-labels", labelFilter(selectedIdRef.current, blockFilter));
  }, [filters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("blocks-highlight")) return;
    map.setFilter("blocks-highlight", highlightFilter(selectedId));
    map.setFilter("blocks-highlight-label", highlightFilter(selectedId));
    // Filters are read through the ref: as a dependency, every slider step would re-fly.
    map.setFilter("blocks-labels", labelFilter(selectedId, filterExpression(filtersRef.current)));
    if (!selectedId) return;
    if (sheetHeight !== null) {
      const f = data.features.find((ft) => ft.properties.id === selectedId);
      if (f) {
        const top = topClearanceRef?.current?.getBoundingClientRect().bottom ?? 0;
        map.flyTo({
          center: f.geometry.coordinates,
          // Land at least where labels show, so the block and its neighbours are readable.
          zoom: Math.max(map.getZoom(), LABEL_MIN_ZOOM),
          // An offset, not padding: padding outlives the fly, and clearing it when the sheet
          // closes slides the whole map down.
          offset: [0, (top - sheetHeight) / 2],
        });
      }
    }
  }, [selectedId, data, sheetHeight, topClearanceRef]);

  // Inline position too: MapLibre measures the container at creation, possibly before
  // Tailwind's utilities apply.
  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
