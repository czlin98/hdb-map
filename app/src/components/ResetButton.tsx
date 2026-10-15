import { RotateCcwIcon } from "lucide-react";

interface Props {
  label: string; // the accessible name, e.g. "Reset floors"
  onClick: () => void;
}

// Styled like the legend's x, so the small header controls match.
export function ResetButton({ label, onClick }: Props) {
  return (
    // The ::after pads the 14px icon to a 28px tap target without growing the title row: the
    // mobile sheet's half position has no height to spare.
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative flex shrink-0 rounded-sm outline-hidden after:absolute after:-inset-[7px] focus-visible:ring-2"
    >
      <RotateCcwIcon className="size-3.5" />
    </button>
  );
}
