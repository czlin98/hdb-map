import { useId, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../lib/utils";
import type { BlockFeature, Town } from "../types/contract";
import { ResetButton } from "./ResetButton";
import { Checkbox } from "./ui/checkbox";

interface Props {
  towns: Town[];
  features: BlockFeature[];
  selected: string[]; // empty = any town
  onToggle: (town: string) => void;
  onReset: () => void;
}

const byName = (a: string, b: string) => a.localeCompare(b);

function summary(selected: string[]): string {
  if (selected.length === 0) return "Any";
  if (selected.length > 2) return `${selected.length} towns`;
  return [...selected].sort(byName).join(", ");
}

export function TownFilter({ towns, features, selected, onToggle, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const summaryId = useId();
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // towns.json is ordered by town code, which reads as random.
  const sorted = useMemo(() => [...towns].sort((a, b) => byName(a.town, b.town)), [towns]);
  // Totals, not narrowed by the other filters, so a town's count doesn't change under the user.
  const counts = useMemo(() => {
    const byTown = new Map<string, number>();
    for (const { properties: p } of features) byTown.set(p.town, (byTown.get(p.town) ?? 0) + 1);
    return byTown;
  }, [features]);

  return (
    <div role="group" aria-labelledby={titleId}>
      <div className="flex items-center gap-2">
        <h3 id={titleId} className="text-sm font-medium">
          Town
        </h3>
        {selected.length > 0 && (
          <ResetButton
            label="Reset town"
            onClick={() => {
              onReset();
              buttonRef.current?.focus();
            }}
          />
        )}
        {/* Stretches to the row's end, so the empty middle of the row is part of the target. */}
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${titleId} ${summaryId}`}
          onClick={() => setOpen((o) => !o)}
          className="focus-visible:ring-ring flex min-w-0 flex-1 items-center justify-end gap-1 rounded-sm py-1 text-sm outline-hidden focus-visible:ring-2"
        >
          {/* Two long names don't fit the row. */}
          <span id={summaryId} className="text-muted-foreground truncate">
            {summary(selected)}
          </span>
          <ChevronDownIcon
            aria-hidden
            className={cn("size-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>
      {/* Desktop only (md matches useIsDesktop in App.tsx): the open list scrolls on its own,
          so the range filters below stay in reach. */}
      <ul id={listId} hidden={!open} className="mt-1 md:max-h-52 md:overflow-y-auto md:pr-2">
        {sorted.map(({ town }) => (
          <li key={town}>
            <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm">
              <Checkbox checked={selected.includes(town)} onCheckedChange={() => onToggle(town)} />
              <span className="flex-1">{town}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {(counts.get(town) ?? 0).toLocaleString()}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
