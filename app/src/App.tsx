import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { IndexFeatureCollection, Town } from "./types/contract";
import { buildTownSlugMap, createGetBlockDetail, loadIndex, loadTowns } from "./lib/data";
import { buildSearchIndex } from "./lib/search";
import { activeCount, matches } from "./lib/filtering";
import { useSelection } from "./store/selection";
import { useColorMode } from "./store/color";
import { useFilters } from "./store/filters";
import { MapView } from "./components/MapView";
import { SearchBox } from "./components/SearchBox";
import { ColorControl } from "./components/ColorControl";
import { ColorLegend } from "./components/ColorLegend";
import { FiltersControl } from "./components/FiltersControl";
import { DetailsPanel, type DetailsPanelHandle } from "./components/DetailsPanel";

const EMPTY_INDEX: IndexFeatureCollection = { type: "FeatureCollection", features: [] };
// Peek at the details header, a half sheet, then fully open.
const SNAP_POINTS = ["95px", 0.5, 1] as const;

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export default function App() {
  const [index, setIndex] = useState<IndexFeatureCollection>(EMPTY_INDEX);
  const [towns, setTowns] = useState<Town[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeSnap, setActiveSnap] = useState<string | number | null>(SNAP_POINTS[1]);
  // Lifted here so a background map tap can start the close animation; the panel calls
  // onClose (clearing the selection) only once that animation ends.
  const [panelOpen, setPanelOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [legendClearance, setLegendClearance] = useState(0);
  const isDesktop = useIsDesktop();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<DetailsPanelHandle>(null);
  const legendRef = useRef<HTMLElement>(null);

  const { selectedId, selectedTown, select, clear } = useSelection();
  const colorMode = useColorMode((s) => s.mode);
  const filters = useFilters((s) => s.filters);

  // Opening in the same handler as the selection (not an effect) means the panel's first
  // render already sees open=true and never flashes a close.
  const openBlock = (id: string, town: string) => {
    select(id, town);
    setPanelOpen(true);
  };

  useEffect(() => {
    let alive = true;
    Promise.all([loadIndex(), loadTowns()])
      .then(([idx, tw]) => {
        if (alive) {
          setIndex(idx);
          setTowns(tw);
          setStatus("ready");
        }
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (selectedId) setActiveSnap(SNAP_POINTS[1]);
  }, [selectedId]);

  const searchRows = useMemo(() => buildSearchIndex(index), [index]);
  // The search box and the filter controls keep the whole index; the legend and count follow this.
  const visible = useMemo(
    () =>
      activeCount(filters)
        ? index.features.filter((f) => matches(f.properties, filters))
        : index.features,
    [index, filters],
  );

  // The filter panel stops above the legend: the distance from the window's bottom to its top.
  useLayoutEffect(() => {
    const top = legendRef.current?.getBoundingClientRect().top;
    setLegendClearance(top === undefined ? 0 : window.innerHeight - top);
  }, [colorMode, status, isDesktop]);

  const getBlockDetail = useMemo(() => createGetBlockDetail(buildTownSlugMap(towns)), [towns]);

  // On mobile, pad the fly-to by the sheet's height so the selected marker lands above it.
  const flyPaddingBottom = useMemo<number | null>(() => {
    if (isDesktop) return 0;
    if (activeSnap === SNAP_POINTS[2]) return null; // fully open: the map is hidden
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    return typeof activeSnap === "number"
      ? Math.round(activeSnap * vh)
      : parseInt(activeSnap ?? "0", 10);
  }, [isDesktop, activeSnap]);

  return (
    <main aria-label="HDB Map" className="relative h-full w-full">
      <MapView
        data={index}
        selectedId={selectedId}
        onSelectBlock={openBlock}
        onBackgroundClick={() => panelRef.current?.close()}
        flyPaddingBottom={flyPaddingBottom}
        topClearanceRef={isDesktop ? undefined : searchInputRef}
        showZoomButtons={isDesktop}
        colorMode={colorMode}
        collapseCreditsOnColor={!isDesktop}
        filters={filters}
      />

      {status !== "error" && (
        // Mobile: one row, search then Color. Desktop: a column, search above a row of buttons.
        <div className="absolute top-2 left-1/2 z-30 flex w-[min(92vw,22rem)] -translate-x-1/2 items-start gap-2 md:left-2 md:w-auto md:translate-x-0 md:flex-col">
          {/* min-w-0 lets the search shrink below its content width, so the button fits. A fixed
              height, since the search card is out of flow. */}
          <div className="relative h-9 min-w-0 flex-1 md:w-[22rem] md:flex-none">
            <SearchBox
              rows={searchRows}
              onSelect={(r) => openBlock(r.id, r.town)}
              onDismiss={() => panelRef.current?.close()}
              inputRef={searchInputRef}
            />
          </div>
          <div className="flex gap-2">
            {isDesktop && (
              <FiltersControl
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
                features={index.features}
                towns={towns}
                shown={visible.length}
                total={index.features.length}
                bottomInset={legendClearance}
              />
            )}
            <ColorControl
              compact={!isDesktop}
              triggerRef={colorButtonRef}
              // The menu closes on an outside press by itself; the panel doesn't, by design.
              onOpenChange={(open) => open && setFiltersOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Stays mounted under the mobile sheet: even the peek snap is taller than the legend. */}
      {status === "ready" && (
        <ColorLegend
          ref={legendRef}
          features={visible}
          isDesktop={isDesktop}
          returnFocusRef={colorButtonRef}
        />
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/10">
          <div className="rounded-lg bg-card p-6 text-card-foreground shadow-lg">
            Couldn't load block data.
          </div>
        </div>
      )}

      {status === "ready" && selectedId && selectedTown && (
        <DetailsPanel
          ref={panelRef}
          selectedId={selectedId}
          selectedTown={selectedTown}
          getBlockDetail={getBlockDetail}
          isDesktop={isDesktop}
          snapPoints={[...SNAP_POINTS]}
          activeSnap={activeSnap}
          onSnapChange={setActiveSnap}
          open={panelOpen}
          onOpenChange={setPanelOpen}
          onClose={clear}
        />
      )}
    </main>
  );
}
