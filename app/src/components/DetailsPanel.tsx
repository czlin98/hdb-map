import { useEffect, useState } from "react";
import type { BlockDetail } from "../types/contract";
import type { GetBlockDetail } from "../lib/data";
import { orderedUnits, RENTAL_FLAT_TYPES, SOLD_FLAT_TYPES } from "../lib/flat-types";
import { Drawer, DrawerContent, DrawerTitle } from "./ui/drawer";

export function DetailsContent({ detail }: { detail: BlockDetail }) {
  const sold = orderedUnits(detail.sold_units_by_type, SOLD_FLAT_TYPES);
  const rental = orderedUnits(detail.rental_units_by_type, RENTAL_FLAT_TYPES);
  return (
    <div className="space-y-4 p-4">
      <h2 className="border-b border-slate-200 pb-2 text-lg font-semibold">
        {detail.blk_no} {detail.street_full} {detail.postal}
      </h2>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-slate-500">Town</dt>
          <dd>{detail.town}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Year completed</dt>
          <dd>{detail.year_completed}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Floors</dt>
          <dd>{detail.max_floor_lvl}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Total units</dt>
          <dd>{detail.total_dwelling_units}</dd>
        </div>
      </dl>
      {sold.length > 0 && (
        <section>
          <h3 className="font-medium">Sold</h3>
          <ul className="text-sm">
            {sold.map((u) => (
              <li key={u.label}>
                {u.label}: {u.count}
              </li>
            ))}
          </ul>
        </section>
      )}
      {rental.length > 0 && (
        <section>
          <h3 className="font-medium">Rental</h3>
          <ul className="text-sm">
            {rental.map((u) => (
              <li key={u.label}>
                {u.label}: {u.count}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function useBlockDetail(
  id: string,
  town: string,
  getBlockDetail: GetBlockDetail,
): { status: "loading" | "ready" | "empty"; detail?: BlockDetail } {
  const [state, setState] = useState<{
    status: "loading" | "ready" | "empty";
    detail?: BlockDetail;
  }>({
    status: "loading",
  });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getBlockDetail(id, town)
      .then((detail) => {
        if (!alive) return;
        setState(detail ? { status: "ready", detail } : { status: "empty" });
      })
      .catch(() => alive && setState({ status: "empty" }));
    return () => {
      alive = false;
    };
  }, [id, town, getBlockDetail]);

  return state;
}

function Skeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading block details">
      <div className="h-6 w-3/4 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
      <div className="h-24 w-full animate-pulse rounded bg-slate-200" />
    </div>
  );
}

function Body({
  id,
  town,
  getBlockDetail,
}: {
  id: string;
  town: string;
  getBlockDetail: GetBlockDetail;
}) {
  const { status, detail } = useBlockDetail(id, town, getBlockDetail);
  if (status === "loading") return <Skeleton />;
  if (status === "empty" || !detail)
    return <div className="p-4 text-slate-500">Details unavailable.</div>;
  return <DetailsContent detail={detail} />;
}

interface PanelProps {
  selectedId: string;
  selectedTown: string;
  getBlockDetail: GetBlockDetail;
  isDesktop: boolean;
  snapPoints: (string | number)[];
  activeSnap: string | number | null;
  onSnapChange: (snap: string | number | null) => void;
  onClose: () => void;
}

export function DetailsPanel(props: PanelProps) {
  const body = (
    <Body id={props.selectedId} town={props.selectedTown} getBlockDetail={props.getBlockDetail} />
  );

  if (props.isDesktop) {
    return (
      <aside className="absolute right-0 top-0 z-40 h-full w-96 overflow-y-auto border-l bg-white shadow-lg">
        <button
          className="absolute right-2 top-2 text-slate-500"
          aria-label="Close"
          onClick={props.onClose}
        >
          ✕
        </button>
        {body}
      </aside>
    );
  }

  // Vaul scrolls the body only at the fully-open snap (1); below it a drag moves
  // the sheet. So scroll at the top snap; elsewhere give the drag to Vaul
  // (touch-none) so it drags from anywhere and the browser can't hijack it.
  const fullyOpen = props.activeSnap === props.snapPoints[props.snapPoints.length - 1];
  const bodyScroll = fullyOpen
    ? "overflow-y-auto overscroll-contain touch-pan-y"
    : "overflow-hidden touch-none";

  return (
    <Drawer
      open
      modal={false}
      snapPoints={props.snapPoints}
      activeSnapPoint={props.activeSnap}
      setActiveSnapPoint={props.onSnapChange}
      onClose={props.onClose}
    >
      <DrawerContent className="h-dvh">
        <DrawerTitle className="sr-only">Block details</DrawerTitle>
        <div className={`min-h-0 flex-1 ${bodyScroll}`}>{body}</div>
      </DrawerContent>
    </Drawer>
  );
}
