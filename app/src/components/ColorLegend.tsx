import { useMemo } from "react";
import { COLOR_SCALES, countBands } from "../lib/coloring";
import { cn } from "../lib/utils";
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
      className={cn(
        "bg-popover text-popover-foreground absolute bottom-2 left-2 z-20 rounded-md shadow-md",
        isDesktop ? "p-4" : "px-3 py-2",
      )}
    >
      <p
        className={cn(
          "text-muted-foreground text-xs font-semibold tracking-wide uppercase",
          isDesktop ? "mb-3" : "mb-1.5",
        )}
      >
        {scale.title}
      </p>
      {isDesktop ? (
        // Highest band on top, so up reads as newer or taller.
        <ul className="min-w-48 space-y-2 text-sm">
          {scale.bands
            .map((band, i) => (
              <li key={band.label} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-3.5 shrink-0 rounded-full"
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
        // Gapless, so the bands read as one light-to-dark ramp. Six 48px segments plus padding and
        // insets need a 328px screen, so 320px phones get 44px.
        <ul className="grid auto-cols-max grid-flow-col text-[11px]">
          {scale.bands.map((band) => (
            <li key={band.label} className="group flex flex-col items-center gap-1">
              <span
                aria-hidden
                className="h-3 w-11 group-first:rounded-l-sm group-last:rounded-r-sm min-[360px]:w-12"
                style={{ backgroundColor: band.color }}
              />
              <span className="text-muted-foreground leading-3 tabular-nums">{band.short}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
