import { useMemo, useState, type Ref, type RefObject } from "react";
import { InfoIcon, XIcon } from "lucide-react";
import { COLOR_SCALES, countBands } from "../lib/coloring";
import { cn } from "../lib/utils";
import { useColorMode } from "../store/color";
import type { BlockFeature } from "../types/contract";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

// Shared by the header's icon buttons. The ::after pads the 14px icon to a 28px tap target
// without growing the row: on mobile the peek sheet must stay taller than the legend.
const ICON_BUTTON =
  "hover:text-foreground focus-visible:ring-ring relative flex shrink-0 rounded-sm outline-hidden after:absolute after:-inset-[7px] focus-visible:ring-2";

// With a mouse the note follows hover and keyboard focus, so a click adds nothing; on touch a
// tap toggles it.
function LegendNote({ title, note }: { title: string; note: string }) {
  const [open, setOpen] = useState(false);
  const hover = window.matchMedia("(hover: hover)").matches;
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`About ${title}`}
        className={ICON_BUTTON}
        {...(hover && {
          onPointerEnter: show,
          onPointerLeave: hide,
          onFocus: show,
          onBlur: hide,
          onClick: (e) => e.preventDefault(),
        })}
      >
        <InfoIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        // Focus stays on the button: moving it would fire the blur that closes the note, and
        // handing it back on close would reopen it.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Sized to the text, so it sits on one line and wraps only on a narrow screen.
        className="w-max max-w-[calc(100vw-1rem)] px-3 py-2 text-xs text-balance"
      >
        {note}
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  features: BlockFeature[];
  isDesktop: boolean;
  // The legend unmounts with its own button, so focus moves here instead of being lost.
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  ref?: Ref<HTMLElement>;
}

export function ColorLegend({ features, isDesktop, returnFocusRef, ref }: Props) {
  const mode = useColorMode((s) => s.mode);
  const setMode = useColorMode((s) => s.setMode);
  const scale = mode === "none" ? null : COLOR_SCALES[mode];
  const counts = useMemo(() => (scale ? countBands(features, scale) : []), [features, scale]);
  if (!scale) return null;
  const bandOrder = scale.bands.map((_, i) => i);
  if (!scale.lowestOnTop) bandOrder.reverse();

  return (
    // Inset from the corner like the search box (top-2 / md:left-2). index.css hides it by the
    // color-legend class while the mobile credits are open.
    <section
      ref={ref}
      aria-label={`${scale.title} legend`}
      className={cn(
        "color-legend",
        "bg-popover text-popover-foreground absolute bottom-2 left-2 z-20 rounded-md shadow-md",
        isDesktop ? "p-4" : "px-3 py-2",
      )}
    >
      {/* One color for the title and its x, so the x reads as part of the header. */}
      <div
        className={cn(
          "text-muted-foreground flex items-center justify-between gap-3",
          isDesktop ? "mb-3" : "mb-1.5",
        )}
      >
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold tracking-wide uppercase">{scale.title}</p>
          {scale.note && <LegendNote title={scale.title} note={scale.note} />}
        </div>
        <button
          type="button"
          aria-label="Turn off coloring"
          onClick={() => {
            setMode("none");
            returnFocusRef?.current?.focus();
          }}
          className={ICON_BUTTON}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      {/* An empty band stays, greyed, so the scale doesn't shift as filters change. */}
      {isDesktop ? (
        <ul className="min-w-48 space-y-2 text-sm">
          {bandOrder.map((i) => {
            const band = scale.bands[i];
            return (
              <li
                key={band.label}
                data-empty={counts[i] === 0 || undefined}
                className="flex items-center gap-2.5 data-empty:opacity-40"
              >
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
            );
          })}
        </ul>
      ) : (
        // Gapless, so the bands read as one ramp. Six 48px segments plus padding and
        // insets need a 328px screen, so 320px phones get 44px.
        <ul className="grid auto-cols-max grid-flow-col text-[11px]">
          {scale.bands.map((band, i) => (
            <li
              key={band.label}
              data-empty={counts[i] === 0 || undefined}
              className="group flex flex-col items-center gap-1 data-empty:opacity-40"
            >
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
