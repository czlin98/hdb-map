import { useEffect, useState } from "react";
import type { BlockDetail } from "../types/contract";
import type { GetBlockDetail } from "../lib/data";
import { orderedUnits, RENTAL_FLAT_TYPES, SOLD_FLAT_TYPES } from "../lib/flat-types";
import { XIcon } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "./ui/drawer";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";

export function DetailsContent({ detail }: { detail: BlockDetail }) {
  const sold = orderedUnits(detail.sold_units_by_type, SOLD_FLAT_TYPES);
  const rental = orderedUnits(detail.rental_units_by_type, RENTAL_FLAT_TYPES);
  return (
    <div className="space-y-4 p-4">
      <h2 className="border-b border-border pb-2 text-lg font-semibold">
        {detail.blk_no} {detail.street_full} {detail.postal}
      </h2>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Town</dt>
          <dd>{detail.town}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Year completed</dt>
          <dd>{detail.year_completed}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Floors</dt>
          <dd>{detail.max_floor_lvl}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total units</dt>
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
      <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-24 w-full animate-pulse rounded bg-muted" />
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
    return <div className="p-4 text-muted-foreground">Details unavailable.</div>;
  return <DetailsContent detail={detail} />;
}

interface PanelProps {
  selectedId: string;
  selectedTown: string;
  getBlockDetail: GetBlockDetail;
  isDesktop: boolean;
  // Controlled open state (defaults open). Flipping to false animates the close;
  // the parent clears the selection once the animation ends. Driving it here lets
  // any dismissal (the panel's own close, an empty-map tap, the search clear
  // button) run the same slide-out.
  open?: boolean;
  snapPoints: (string | number)[];
  activeSnap: string | number | null;
  onSnapChange: (snap: string | number | null) => void;
  onBeginClose: () => void;
  onClose: () => void;
}

// Matches Vaul's TRANSITIONS.DURATION (0.5s): how long the drawer takes to slide
// out, after which the selection can be cleared and the panel unmounted.
const DRAWER_ANIM_MS = 500;

export function DetailsPanel(props: PanelProps) {
  const open = props.open ?? true;

  // Vaul fires its onAnimationEnd only for its own gesture dismissals, not when we
  // close by flipping the controlled `open` prop (an empty-map tap or the search
  // clear button). So run the post-close cleanup ourselves: once closed, clear
  // after the slide-out; a reopen (cancel-and-reopen) cancels it. The desktop
  // Sheet uses a real DOM animationend handler instead, so skip it there.
  const { isDesktop, onClose } = props;
  useEffect(() => {
    if (isDesktop || open) return;
    const t = setTimeout(onClose, DRAWER_ANIM_MS);
    return () => clearTimeout(t);
  }, [isDesktop, open, onClose]);

  const body = (
    <Body id={props.selectedId} town={props.selectedTown} getBlockDetail={props.getBlockDetail} />
  );

  if (props.isDesktop) {
    return (
      <Sheet
        open={open}
        // Non-modal so the map stays interactive; no focus trap, scroll lock, or
        // overlay.
        modal={false}
        onOpenChange={(o) => {
          if (!o) props.onBeginClose(); // ignore taps until the slide-out ends
        }}
      >
        <SheetContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && !open) props.onClose();
          }}
        >
          <SheetTitle className="sr-only">Block details</SheetTitle>
          {/* Scroll long content within the fixed-height sheet. */}
          <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
        </SheetContent>
      </Sheet>
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
      open={open}
      modal={false}
      snapPoints={props.snapPoints}
      activeSnapPoint={props.activeSnap}
      setActiveSnapPoint={props.onSnapChange}
      onOpenChange={(o) => {
        if (!o) props.onBeginClose(); // ignore taps until the close animation ends
      }}
    >
      {/* Full-height snap points drive the height, so drop the canonical bottom
          drawer's max-h/mt cap. */}
      <DrawerContent className="h-dvh data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-none">
        <DrawerTitle className="sr-only">Block details</DrawerTitle>
        <DrawerClose
          aria-label="Close"
          className="text-muted-foreground absolute right-2 top-2 z-10 p-2 leading-none"
        >
          <XIcon className="size-4" />
        </DrawerClose>
        <div className={`min-h-0 flex-1 ${bodyScroll}`}>{body}</div>
      </DrawerContent>
    </Drawer>
  );
}
