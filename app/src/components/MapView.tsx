import { useEffect, useRef, type RefObject } from "react";
// maplibre-gl v6 is ESM with named exports only (no default export).
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import type { IndexFeatureCollection } from "../types/contract";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// Singapore island view bounds. Drives the initial fit and the zoom floor.
const MIN_BOUNDS: [[number, number], [number, number]] = [
  [103.55, 1.13],
  [104.12, 1.5],
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
  // Bottom padding for the fly-to so the marker clears the sheet; null = skip the fly entirely.
  flyPaddingBottom?: number | null;
  // The search input; its bottom edge is padded past so the marker centers between
  // the search box and the sheet. Measured at fly time to stay current.
  topClearanceRef?: RefObject<HTMLInputElement | null>;
}

function highlightFilter(id: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "id"], id ?? ""];
}

export function MapView({
  data,
  selectedId,
  onSelectBlock,
  flyPaddingBottom = 0,
  topClearanceRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelectBlock);
  onSelectRef.current = onSelectBlock;
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
    });
    mapRef.current = map;
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
        attribution:
          "Block data © HDB/data.gov.sg (Singapore Open Data Licence); Geocoding © OneMap/SLA",
      });
      map.addLayer({
        id: "blocks-circles",
        type: "circle",
        source: "blocks",
        // filter slot (extension point): no filter in v1.
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 6],
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
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 16, 10],
          "circle-color": "#f59e0b",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      // Ensure the canvas matches the (now laid-out) container height.
      map.resize();
      fitZoomFloor();
    });

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
    map.on("mousemove", "blocks-circles", (e) => {
      if (!window.matchMedia("(hover: hover)").matches) return;
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { blk_no: string; street: string };
      popup.setLngLat(e.lngLat).setText(`${p.blk_no} ${p.street}`).addTo(map);
    });
    map.on("mouseleave", "blocks-circles", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("click", "blocks-circles", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { id: string; town: string };
      onSelectRef.current(p.id, p.town);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Mount-once: all reactive values are read through refs, so deps stay empty.
  }, []);

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
    if (!selectedId) {
      // flyTo padding persists on the camera, so clear it when the sheet closes,
      // else the map stays centered in the top half and looks shifted down.
      map.setPadding({ top: 0, right: 0, left: 0, bottom: 0 });
      return;
    }
    if (flyPaddingBottom !== null) {
      const f = data.features.find((ft) => ft.properties.id === selectedId);
      if (f) {
        const top = topClearanceRef?.current?.getBoundingClientRect().bottom ?? 0;
        map.flyTo({
          center: f.geometry.coordinates,
          zoom: Math.max(map.getZoom(), 15),
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
