import { useRef } from "react";
import { ChevronDownIcon, ListFilterIcon } from "lucide-react";
import { activeCount } from "../lib/filtering";
import { useFilters } from "../store/filters";
import type { BlockFeature, Town } from "../types/contract";
import { BlockCount, FilterFields } from "./FilterFields";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  features: BlockFeature[]; // the whole index
  towns: Town[];
  shown: number;
  total: number;
  // Height kept clear at the bottom of the screen (the legend), so the panel stops above it.
  bottomInset: number;
}

export function FiltersControl({
  open,
  onOpenChange,
  features,
  towns,
  shown,
  total,
  bottomInset,
}: Props) {
  const count = useFilters((s) => activeCount(s.filters));
  // Radix refocuses the trigger on every close. When the Color menu closed the panel, that focus
  // move would dismiss the just-opened menu, so only the panel's own button and Escape refocus.
  const refocusOnClose = useRef(false);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="control"
          disabled={features.length === 0}
          aria-label={count ? `Filters, ${count} on` : "Filters"}
          onClick={() => {
            if (open) refocusOnClose.current = true;
          }}
        >
          <ListFilterIcon className="size-4 opacity-70" />
          <span>Filters</span>
          {count > 0 && (
            <span className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full text-xs tabular-nums">
              {count}
            </span>
          )}
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="Filters"
        align="start"
        // Keeps it under its button; without this it would flip above when space is short.
        avoidCollisions={false}
        collisionPadding={{ bottom: bottomInset + 8 }}
        // Non-modal and deaf to outside clicks: it stays open while the map is used.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={() => {
          refocusOnClose.current = true;
        }}
        onCloseAutoFocus={(e) => {
          if (!refocusOnClose.current) e.preventDefault();
          refocusOnClose.current = false;
        }}
        // z-[25]: under the top bar (z-30 in App.tsx), so search results cover the panel, and
        // over the legend (z-20). The width matches the search box (22rem in App.tsx).
        className="z-[25] flex max-h-(--radix-popover-content-available-height) w-[22rem] flex-col p-0"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <FilterFields features={features} towns={towns} />
        </div>
        <div className="border-t px-3 py-2">
          <BlockCount shown={shown} total={total} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
