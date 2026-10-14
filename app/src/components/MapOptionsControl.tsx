import type { Ref } from "react";
import { SlidersHorizontalIcon } from "lucide-react";
import { activeCount } from "../lib/filtering";
import { sheetBodyClass } from "../lib/sheet";
import { useColorMode } from "../store/color";
import { useFilters } from "../store/filters";
import type { BlockFeature, Town } from "../types/contract";
import { ColorModeRow } from "./ColorModeRow";
import { BlockCount, FilterFields } from "./FilterFields";
import { Button } from "./ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "./ui/drawer";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The details sheet's, so the two sheets rest and drag alike.
  snapPoints: (string | number)[];
  activeSnap: string | number | null;
  onSnapChange: (snap: string | number | null) => void;
  features: BlockFeature[]; // the whole index
  towns: Town[];
  shown: number;
  total: number;
  triggerRef?: Ref<HTMLButtonElement>;
}

export function MapOptionsControl({
  open,
  onOpenChange,
  snapPoints,
  activeSnap,
  onSnapChange,
  features,
  towns,
  shown,
  total,
  triggerRef,
}: Props) {
  const count = useFilters((s) => activeCount(s.filters));
  const colorOn = useColorMode((s) => s.mode !== "none");
  const full = snapPoints[snapPoints.length - 1];

  return (
    <>
      {/* A plain button rather than a DrawerTrigger, so App can apply its one-sheet rule first. */}
      <Button
        ref={triggerRef}
        variant="control"
        size="icon"
        className="justify-center"
        aria-label={
          count ? `Map options, ${count} ${count === 1 ? "filter" : "filters"} on` : "Map options"
        }
        onClick={() => onOpenChange(!open)}
      >
        <SlidersHorizontalIcon className="size-4 opacity-70" />
        {count > 0 ? (
          <span className="bg-primary text-primary-foreground ring-popover absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-xs tabular-nums ring-2">
            {count}
          </span>
        ) : (
          colorOn && (
            <span
              data-testid="options-color-on"
              className="ring-popover absolute top-1.5 right-1.5 size-2 rounded-full bg-blue-600 ring-2"
            />
          )
        )}
      </Button>
      <Drawer
        open={open}
        modal={false}
        snapPoints={snapPoints}
        activeSnapPoint={activeSnap}
        setActiveSnapPoint={onSnapChange}
        onOpenChange={onOpenChange}
        // Otherwise Vaul re-fits the sheet around a number box's keyboard, breaking its layout.
        repositionInputs={false}
      >
        {/* The snap points set the height, so lift the stock drawer's max-h/mt cap. */}
        <DrawerContent className="h-dvh data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-none">
          {/* Sized to fit the peek snap, so the count stays in view at every rest position. */}
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div>
              <DrawerTitle className="text-base">Map options</DrawerTitle>
              <BlockCount shown={shown} total={total} />
            </div>
            <DrawerClose asChild>
              <Button variant="link" className="h-auto p-0">
                Done
              </Button>
            </DrawerClose>
          </div>
          <div
            className={`min-h-0 flex-1 space-y-6 px-4 pb-4 ${sheetBodyClass(activeSnap === full)}`}
          >
            <ColorModeRow />
            <FilterFields
              features={features}
              towns={towns}
              // Raised to full, clear of the on-screen keyboard.
              onBoxFocus={() => onSnapChange(full)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
