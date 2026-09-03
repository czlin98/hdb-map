import { useEffect, useMemo, useState } from "react";
import type { IndexFeatureCollection, Town } from "./types/contract";
import { buildTownSlugMap, createGetBlockDetail, loadIndex, loadTowns } from "./lib/data";
import { buildSearchIndex } from "./lib/search";
import { useSelection } from "./store/selection";
import { MapView } from "./components/MapView";
import { SearchBox } from "./components/SearchBox";
import { DetailsPanel } from "./components/DetailsPanel";

const EMPTY_INDEX: IndexFeatureCollection = { type: "FeatureCollection", features: [] };
// First point peeks just the details header; middle is a half sheet; the last point is fully open.
const SNAP_POINTS = ["88px", 0.5, 1] as const;

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
  const isDesktop = useIsDesktop();

  const { selectedId, selectedTown, select, clear } = useSelection();

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

  const searchRows = useMemo(() => buildSearchIndex(index), [index]);
  const getBlockDetail = useMemo(() => createGetBlockDetail(buildTownSlugMap(towns)), [towns]);

  // On mobile, keep the selected marker above the sheet by matching fly padding to the snap.
  const flyPaddingBottom = useMemo(() => {
    if (isDesktop) return 0;
    if (activeSnap === SNAP_POINTS[0] || activeSnap === SNAP_POINTS[2]) return 140;
    return Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.5);
  }, [isDesktop, activeSnap]);

  return (
    <main aria-label="HDB Map" className="relative h-full w-full">
      <MapView
        data={index}
        selectedId={selectedId}
        onSelectBlock={select}
        flyPaddingBottom={flyPaddingBottom}
      />

      {status !== "error" && (
        <div className="absolute z-30 w-[min(92vw,22rem)] top-2 left-1/2 -translate-x-1/2 md:left-2 md:translate-x-0">
          <SearchBox rows={searchRows} onSelect={(r) => select(r.id, r.town)} />
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/10">
          <div className="rounded-lg bg-white p-6 shadow-lg">Couldn't load block data.</div>
        </div>
      )}

      {status === "ready" && selectedId && selectedTown && (
        <DetailsPanel
          selectedId={selectedId}
          selectedTown={selectedTown}
          getBlockDetail={getBlockDetail}
          isDesktop={isDesktop}
          snapPoints={[...SNAP_POINTS]}
          activeSnap={activeSnap}
          onSnapChange={setActiveSnap}
          onClose={clear}
        />
      )}
    </main>
  );
}
