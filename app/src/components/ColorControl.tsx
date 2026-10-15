import type { Ref } from "react";
import { ChevronDownIcon, PaletteIcon } from "lucide-react";
import { COLOR_SCALES, type ColorMode, type ScaleMode } from "../lib/coloring";
import { useColorMode } from "../store/color";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface Props {
  triggerRef?: Ref<HTMLButtonElement>;
  onOpenChange?: (open: boolean) => void;
}

export function ColorControl({ triggerRef, onOpenChange }: Props) {
  const mode = useColorMode((s) => s.mode);
  const setMode = useColorMode((s) => s.setMode);
  const label = mode === "none" ? "Color" : `Color: ${COLOR_SCALES[mode].name}`;
  return (
    // Non-modal, like the details panel, so the map stays live while the menu is open.
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} variant="control" aria-label={label}>
          <PaletteIcon className="size-4 opacity-70" />
          <span>{label}</span>
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
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
