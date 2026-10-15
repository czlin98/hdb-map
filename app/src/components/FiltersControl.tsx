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
  // Escape closes the details panel too, so the two desktop panels dismiss alike.
  onEscape?: () => void;
}

export function FiltersControl({
  open,
  onOpenChange,
  features,
  towns,
  shown,
  total,
  bottomInset,
  onEscape,
}: Props) {
  const count = useFilters((s) => activeCount(s.filters));
  // Radix refocuses the trigger on every close. When the Color menu closed the panel, that focus
  // move would dismiss the just-opened menu, so only the panel's own button refocuses, and Escape
  // when focus is inside the panel.
  const refocusOnClose = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

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
          {/* One slot for the chevron or the badge, so a filter turning on doesn't widen it. */}
          <span className="flex size-5 items-center justify-center">
            {count > 0 ? (
              <span className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full text-xs tabular-nums">
                {count}
              </span>
            ) : (
              <ChevronDownIcon className="size-4 opacity-50" />
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        aria-label="Filters"
        align="start"
        // Keeps it under its button; without this it would flip above when space is short.
        avoidCollisions={false}
        collisionPadding={{ bottom: bottomInset + 8 }}
        // Non-modal and deaf to outside clicks, so it stays open through pans, zooms, and block
        // clicks; App closes it on a click on empty map, as it does the details panel.
        onInteractOutside={(e) => e.preventDefault()}
        // Focus returns to Filters only from inside the panel: an Escape typed in the search box
        // must leave focus there.
        onEscapeKeyDown={() => {
          refocusOnClose.current = !!contentRef.current?.contains(document.activeElement);
          onEscape?.();
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
