import { useMemo } from "react";
import { COLOR_SCALES, countBands } from "../lib/coloring";
import { useColorMode } from "../store/color";
import type { BlockFeature } from "../types/contract";

interface Props {
  features: BlockFeature[];
  isDesktop: boolean;
}

export function ColorLegend({ features, isDesktop }: Props) {
  const mode = useColorMode((s) => s.mode);
  const scale = mode === "none" ? null : COLOR_SCALES[mode];
  const counts = useMemo(() => (scale ? countBands(features, scale) : []), [features, scale]);
  if (!scale) return null;

  return (
    // Inset from the corner like the search box (top-2 / md:left-2).
    <section
      aria-label={`${scale.title} legend`}
      className="bg-popover text-popover-foreground absolute bottom-2 left-2 z-20 rounded-md p-2.5"
    >
      <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
        {scale.title}
      </p>
      {isDesktop ? (
        // Highest band on top, so up reads as newer or taller.
        <ul className="min-w-44 space-y-1 text-sm">
          {scale.bands
            .map((band, i) => (
              <li key={band.label} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: band.color }}
                />
                <span className="flex-1">{band.label}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {counts[i].toLocaleString()}
                </span>
              </li>
            ))
            .reverse()}
        </ul>
      ) : (
        <ul className="grid auto-cols-max grid-flow-col gap-1 text-[11px]">
          {scale.bands.map((band) => (
            <li key={band.label} className="flex flex-col items-center gap-0.5">
              <span
                aria-hidden
                className="h-2.5 w-9 rounded-sm"
                style={{ backgroundColor: band.color }}
              />
              <span className="text-muted-foreground tabular-nums">{band.short}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
