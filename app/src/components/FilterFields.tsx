import { useMemo, useRef } from "react";
import { activeCount, dataLimits } from "../lib/filtering";
import { useFilters } from "../store/filters";
import type { BlockFeature, Town } from "../types/contract";
import { RangeFilter } from "./RangeFilter";
import { TownFilter } from "./TownFilter";
import { Button } from "./ui/button";

interface Props {
  // The whole index, never the visible blocks: the limits and town counts must not shrink as the
  // filters narrow.
  features: BlockFeature[];
  towns: Town[];
}

export function FilterFields({ features, towns }: Props) {
  const filters = useFilters((s) => s.filters);
  const { toggleTown, setRange, reset, clearAll } = useFilters.getState();
  const limits = useMemo(() => dataLimits(features), [features]);
  const listRef = useRef<HTMLDivElement>(null);
  // Before the index loads, a slider's minimum equals its maximum and it has no track to draw.
  if (features.length === 0) return null;

  return (
    <div>
      {/* A smaller gap under the header than between filters, so it reads as theirs. */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-muted-foreground text-xs font-medium">Filters</h2>
        <Button
          variant="link"
          className="h-auto p-0 text-xs"
          disabled={activeCount(filters) === 0}
          onClick={() => {
            clearAll();
            // Clear all disables itself, which would drop focus to the page: hand it to the first
            // filter, the town row's button.
            listRef.current?.querySelector<HTMLElement>("button[aria-expanded]")?.focus();
          }}
        >
          Clear all
        </Button>
      </div>
      <div ref={listRef} className="space-y-5">
        <TownFilter
          towns={towns}
          features={features}
          selected={filters.towns}
          onToggle={toggleTown}
          onReset={() => reset("towns")}
        />
        <RangeFilter
          title="Year completed"
          limits={limits.year}
          value={filters.year}
          onChange={(range) => setRange("year", range)}
        />
        <RangeFilter
          title="Floors"
          limits={limits.floors}
          value={filters.floors}
          onChange={(range) => setRange("floors", range)}
        />
      </div>
    </div>
  );
}

// Rendered by the containers: at the foot of the desktop panel, in the mobile sheet's header.
export function BlockCount({ shown, total }: { shown: number; total: number }) {
  // The mobile sheet's header would otherwise read "Showing 0 of 0 blocks" while loading.
  if (total === 0) return null;
  return (
    <p role="status" className="text-muted-foreground text-xs">
      Showing {shown.toLocaleString()} of {total.toLocaleString()} blocks
    </p>
  );
}
