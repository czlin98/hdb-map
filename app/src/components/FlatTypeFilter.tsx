import { useId, useRef } from "react";
import type { FlatTypeGroup } from "../lib/filtering";
import { RENTAL_FLAT_TYPES, SOLD_FLAT_TYPES, type FlatTypeDef } from "../lib/flat-types";
import { cn } from "../lib/utils";
import { ResetButton } from "./ResetButton";

interface Props {
  sold: string[];
  rental: string[];
  onToggle: (group: FlatTypeGroup, type: string) => void;
  onReset: () => void;
}

export function FlatTypeFilter({ sold, rental, onToggle, onReset }: Props) {
  const titleId = useId();
  const chipsRef = useRef<HTMLDivElement>(null);

  return (
    <div role="group" aria-labelledby={titleId}>
      <div className="flex items-center gap-2">
        <h3 id={titleId} className="text-sm font-medium">
          Flat types
        </h3>
        {(sold.length > 0 || rental.length > 0) && (
          <ResetButton
            label="Reset flat types"
            onClick={() => {
              onReset();
              chipsRef.current?.querySelector("button")?.focus();
            }}
          />
        )}
      </div>
      <div ref={chipsRef} className="mt-2 space-y-2.5">
        <ChipGroup
          title="Sold"
          types={SOLD_FLAT_TYPES}
          selected={sold}
          onToggle={(t) => onToggle("sold", t)}
        />
        <ChipGroup
          title="Rental"
          types={RENTAL_FLAT_TYPES}
          selected={rental}
          onToggle={(t) => onToggle("rental", t)}
        />
      </div>
    </div>
  );
}

interface ChipGroupProps {
  title: string;
  types: FlatTypeDef[];
  selected: string[];
  onToggle: (type: string) => void;
}

function ChipGroup({ title, types, selected, onToggle }: ChipGroupProps) {
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId}>
      <h4 id={titleId} className="text-muted-foreground mb-1.5 text-xs">
        {title}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {types.map(({ key, label }) => {
          const on = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(key)}
              className={cn(
                "focus-visible:ring-ring h-7 rounded-full border px-3 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-offset-1",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-accent text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
