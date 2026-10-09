import type { Ref } from "react";
import { ChevronDownIcon, PaletteIcon } from "lucide-react";
import { COLOR_SCALES, type ColorMode, type ScaleMode } from "../lib/coloring";
import { useColorMode } from "../store/color";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface Props {
  compact: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
}

export function ColorControl({ compact, triggerRef }: Props) {
  const mode = useColorMode((s) => s.mode);
  const setMode = useColorMode((s) => s.setMode);
  const label = mode === "none" ? "Color" : `Color: ${COLOR_SCALES[mode].name}`;
  return (
    // Non-modal, like the details panel, so the map stays live while the menu is open.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        ref={triggerRef}
        aria-label={label}
        className={cn(
          "bg-popover text-popover-foreground focus-visible:ring-ring relative inline-flex h-9 shrink-0 items-center rounded-md text-sm shadow-md outline-hidden focus-visible:ring-2",
          compact ? "w-9 justify-center" : "gap-2 px-3",
        )}
      >
        <PaletteIcon className="size-4 opacity-70" />
        {!compact && <span>{label}</span>}
        {!compact && <ChevronDownIcon className="size-4 opacity-50" />}
        {compact && mode !== "none" && (
          <span
            data-testid="color-on"
            className="ring-popover absolute top-1.5 right-1.5 size-2 rounded-full bg-blue-600 ring-2"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"}>
        <DropdownMenuLabel className="text-muted-foreground text-xs">Color by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ColorMode)}>
          <DropdownMenuRadioItem value="none">No coloring</DropdownMenuRadioItem>
          {(Object.keys(COLOR_SCALES) as ScaleMode[]).map((m) => (
            <DropdownMenuRadioItem key={m} value={m}>
              {COLOR_SCALES[m].title}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
