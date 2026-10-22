import { useId, useRef, useState } from "react";
import { normalizeRange, type Range } from "../lib/filtering";
import { cn } from "../lib/utils";
import { ResetButton } from "./ResetButton";
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";

type End = 0 | 1;
const END_NAMES = ["from", "to"] as const;

interface Props {
  title: string;
  limits: Range;
  value: Range | null; // null = off
  onChange: (value: Range | null) => void;
  unit?: { symbol: string; name: string }; // e.g. "m", spoken as "metres"
}

export function RangeFilter({ title, limits, value, onChange, unit }: Props) {
  const titleId = useId();
  const sliderRef = useRef<HTMLSpanElement>(null);
  const current = value ?? limits;
  const label = unit ? `${title} in ${unit.name}` : title;
  // A box's text while it is being typed in; undefined shows the current value, so slider drags
  // show in the boxes without syncing state.
  const [drafts, setDrafts] = useState<[string?, string?]>([]);
  const setDraft = (end: End, text: string | undefined) =>
    setDrafts((d) => (end === 0 ? [text, d[1]] : [d[0], text]));

  const commit = (end: End) => {
    const text = drafts[end];
    if (text === undefined) return;
    setDraft(end, undefined);
    const typed = Math.round(Number(text));
    if (text.trim() === "" || !Number.isFinite(typed)) return;
    // The typed end stops at the other end instead of pushing it along.
    const next: Range =
      end === 0
        ? [Math.min(typed, current[1]), current[1]]
        : [current[0], Math.max(typed, current[0])];
    onChange(normalizeRange(next, limits));
  };

  const box = (end: End) => (
    <Input
      type="number"
      inputMode="numeric"
      aria-label={`${label}, ${END_NAMES[end]}`}
      min={limits[0]}
      max={limits[1]}
      value={drafts[end] ?? String(current[end])}
      onChange={(e) => setDraft(end, e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit(end)}
      onBlur={() => commit(end)}
      // Keeps the stock text-base below md: under 16px, iOS Safari zooms in on focus. The spinner
      // arrows are hidden: they cover the last digit, and the arrow keys still step.
      className="h-8 w-16 [appearance:textfield] px-2 tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );

  return (
    <div role="group" aria-labelledby={titleId}>
      {/* Wraps on a 320px phone, dropping the boxes below the title. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2">
          <h3 id={titleId} className="text-sm font-medium">
            {title}
          </h3>
          {value && (
            <ResetButton
              label={`Reset ${title}`}
              onClick={() => {
                onChange(null);
                // Not a number box: on a phone that would open the keyboard.
                sliderRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
              }}
            />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {box(0)}
          <span className="text-muted-foreground text-sm">to</span>
          {box(1)}
          {unit && (
            <span aria-hidden className="text-muted-foreground text-sm">
              {unit.symbol}
            </span>
          )}
        </div>
      </div>
      <Slider
        ref={sliderRef}
        // Inside the mobile sheet, a drag moves the thumb rather than the sheet.
        data-vaul-no-drag
        // A track that shows on white, so the whole scale stays visible once a thumb moves; the
        // range is grey while the filter is off and black once it narrows, like the reset icon.
        className={cn(
          "mt-3 [&_[data-slot=slider-track]]:bg-input",
          !value && "[&_[data-slot=slider-range]]:bg-muted-foreground",
        )}
        min={limits[0]}
        max={limits[1]}
        step={1}
        minStepsBetweenThumbs={0}
        value={current}
        thumbLabels={END_NAMES.map((end) => `${label}, ${end}`)}
        onValueChange={([from, to]) => onChange(normalizeRange([from, to], limits))}
      />
    </div>
  );
}
