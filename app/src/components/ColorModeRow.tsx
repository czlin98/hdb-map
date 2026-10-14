import { useId } from "react";
import { COLOR_SCALES, type ColorMode, type ScaleMode } from "../lib/coloring";
import { useColorMode } from "../store/color";

// The desktop menu's order, from COLOR_SCALES.
const OPTIONS: [ColorMode, string][] = [
  ["none", "None"],
  ...(Object.keys(COLOR_SCALES) as ScaleMode[]).map((m): [ColorMode, string] => [
    m,
    COLOR_SCALES[m].name,
  ]),
];

export function ColorModeRow() {
  const mode = useColorMode((s) => s.mode);
  const setMode = useColorMode((s) => s.setMode);
  const titleId = useId();
  const name = useId();

  return (
    <section>
      {/* Styled like the Filters heading below it, so the two sections match. */}
      <h2 id={titleId} className="text-muted-foreground mb-3 text-xs font-medium">
        Color by
      </h2>
      {/* Native radios, laid out as three segments with the checked one raised. */}
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="bg-muted grid grid-cols-3 gap-1 rounded-md p-1"
      >
        {OPTIONS.map(([value, label]) => (
          <label
            key={value}
            className="text-muted-foreground has-[:checked]:bg-background has-[:checked]:text-foreground has-[:focus-visible]:ring-ring flex h-8 cursor-pointer items-center justify-center rounded-sm text-sm has-[:checked]:shadow-sm has-[:focus-visible]:ring-2"
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </section>
  );
}
