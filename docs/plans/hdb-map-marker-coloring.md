# HDB Map: Marker Coloring Implementation Plan

**Goal:** Let the user color every block marker by year completed or by floors,
with a "Color" menu beside the search box, a legend in the bottom-left corner,
and the selected block's band shown in the details panel.

**Architecture:** The pipeline adds `year_completed` and `max_floor_lvl` to
every `index.geojson` feature, so the map can color all blocks without loading
shards. In the app, one pure module (`lib/coloring.ts`) owns the bands: edges,
labels, colors, the MapLibre step expression, band lookup, and band counts.
Everything else reads from it. The mode lives in a small Zustand store of its
own (`store/color.ts`). MapView swaps `circle-color` on `blocks-circles` with
`setPaintProperty`; ColorControl, ColorLegend, and DetailsContent read the
store. The desktop zoom buttons move from bottom-left to bottom-right.

**Spec:** `docs/specs/hdb-map-design.md` §5.10 (plus §4.1, §4.5, §5.1, §5.2,
§5.4, §5.5, §5.6, §5.9, §7.1), already committed on this branch.
The spec is the authority; this plan only adds the implementation choices.

**Branch / PR:** all work on `feat/marker-coloring`. Code and spec ship in one
PR (CLAUDE.md: spec changes land with the behavior). Commit per task, in
Conventional Commits form with an `app` or `pipeline` scope, without a
`Co-Authored-By` trailer.

## Decisions this plan makes (not in the spec)

- **Picker primitive: shadcn `DropdownMenu`** (adds
  `@radix-ui/react-dropdown-menu`, matching the existing per-package Radix
  imports). A radio group under a "Color by" label gives arrow-key
  navigation, checked state, and `menuitemradio` semantics for free, and the
  menu closes on pick, as in the mockup. That also keeps mobile simple: with
  the menu already closed, the next tap on the map is only a map tap.
  `modal={false}` keeps the map live while it is open, like the details panel.
  An outside tap closes the menu and also reaches what is under it (selects a
  block, dismisses the panel, starts a pan); kept on purpose over Radix's
  modal default.
- **MapView gets the mode as a prop** (`colorMode`), like `selectedId`, so the
  mount-once map keeps reading reactive values through refs and its tests
  stay prop-driven. ColorControl, ColorLegend, and DetailsContent read the
  store directly.
- **Desktop vs mobile variants are chosen by props from `App`** (`compact`
  on ColorControl, `isDesktop` on ColorLegend), using the existing
  `useIsDesktop`, not CSS-only hiding, so tests don't see two copies.
- **Live data is backfilled in this PR** rather than waiting for the next
  pipeline run: a one-off script (not committed) adds the two values to the
  committed `index.geojson` from the committed shards, writing through
  `export._write_index` so the result is byte-identical to what the next
  pipeline run will write. The alternative, a `workflow_dispatch` of the
  pipeline on this branch, costs ~1.5 h and also refreshes unrelated data.

## Band table (single source: `lib/coloring.ts`)

A value equal to an edge belongs to the higher band (MapLibre `step`
semantics).

| Mode | Band labels (desktop) | Short (mobile strip) | Edges | Colors (light to dark) |
| --- | --- | --- | --- | --- |
| Year | Before 1980, 1980s, 1990s, 2000s, 2010s, 2020 and later | <80, 80s, 90s, 00s, 10s, 20s+ | 1980, 1990, 2000, 2010, 2020 | YlGnBu `#c7e9b4 #7fcdbb #41b6c4 #1d91c0 #225ea8 #0c2c84` |
| Floors | Up to 9, 10 to 12, 13 to 16, 17 to 25, 26 to 39, 40 and up | ≤9, 10–12, 13–16, 17–25, 26–39, 40+ | 10, 13, 17, 26, 40 | BuPu `#bfd3e6 #9ebcda #8c96c6 #8c6bb1 #88419d #6e016b` |

Both ramps are ColorBrewer's 7-class ramp with its lightest step dropped.

Names: menu items "No coloring", "Year completed", "Floors"; legend titles
"Year completed", "Floors"; button "Color", "Color: Year", "Color: Floors".

## File structure

```
pipeline/src/export.py              # modify: two index properties
pipeline/tests/test_export.py       # modify: shape, order, mirror tests
app/public/data/index.geojson       # regenerate (backfill, Task 1)
app/src/types/contract.ts           # modify: BlockIndexProperties
app/src/test/fixtures.ts            # modify: sampleIndex values
app/src/lib/coloring.ts             # new: scales, step expression, bandIndex, countBands
app/src/lib/coloring.test.ts        # new
app/src/store/color.ts              # new: useColorMode
app/src/store/color.test.ts         # new
app/src/components/ui/dropdown-menu.tsx  # new: stock shadcn
app/src/components/ColorControl.tsx      # new
app/src/components/ColorControl.test.tsx # new
app/src/components/ColorLegend.tsx       # new
app/src/components/ColorLegend.test.tsx  # new
app/src/components/MapView.tsx      # modify: colorMode prop, zoom bottom-right
app/src/components/MapView.test.tsx # modify
app/src/components/DetailsPanel.tsx # modify: band swatch
app/src/components/DetailsPanel.test.tsx # modify
app/src/App.tsx                     # modify: layout + wiring
app/src/App.test.tsx                # modify
CLAUDE.md                           # modify: contract + frontend internals
docs/specs/hdb-map-design.md        # header date at merge, plus any drift found in Task 10
```

---

### Task 1: Pipeline writes the two coloring values into the index

**Files:** `pipeline/src/export.py`, `pipeline/tests/test_export.py`,
`app/public/data/index.geojson`

- [ ] **Tests first.** In `test_export.py`:
  - `test_index_feature_shape`: the property set gains `year_completed` and
    `max_floor_lvl`.
  - `test_written_fields_follow_logical_order`: index order becomes
    `id, blk_no, street, street_full, postal, town, year_completed, max_floor_lvl`
    (same order as §4.1's example).
  - New `test_written_index_coloring_values_mirror_shards` (§4.5 invariant):
    `write_outputs` two records in different towns with different values,
    e.g. `_rec()` (AMK, 1978, 12) and a Bedok `_rec(...)` (2015, 30), into
    `tmp_path`. Read back `index.geojson` and both shard files, and for every
    feature assert its `year_completed` and `max_floor_lvl` equal its shard
    entry's. This is the only test of the index's values (the shape and order
    tests check keys only), so it catches a swapped or mistyped field, and it
    covers the writers and the per-town grouping, not just the projections.
- [ ] Run `pytest tests/test_export.py`; the three fail.
- [ ] In `to_index_feature`, append after `"town"`:

  ```python
  "year_completed": rec["year_completed"],
  "max_floor_lvl": rec["max_floor_lvl"],
  ```

  No comment needed in `export.py`: the spec §4.1 carries the reason, and the
  contract type (Task 2) will carry a short one.
- [ ] `pytest`, `ruff check src tests`, `ruff format --check src tests`: all green.
- [ ] **Backfill the live index** with a scratchpad script (not committed),
  run from `pipeline/`:

  ```python
  # backfill_index.py: add the two coloring values to the committed index from the shards.
  import json, sys
  from pathlib import Path
  sys.path.insert(0, "src")
  import config
  from export import _write_index

  data = Path(config.APP_DATA_DIR)
  slug = {t["town"]: t["town_slug"] for t in json.loads((data / "towns.json").read_text("utf-8"))}
  shards = {}
  index = json.loads((data / "index.geojson").read_text("utf-8"))
  for f in index["features"]:
      p = f["properties"]
      s = slug[p["town"]]
      shard = shards.setdefault(s, json.loads((data / "block-details" / f"{s}.json").read_text("utf-8")))
      d = shard[p["id"]]
      p["year_completed"], p["max_floor_lvl"] = d["year_completed"], d["max_floor_lvl"]
  _write_index(data / "index.geojson", index["features"])
  ```

- [ ] Check the result: `git diff --stat` shows only `index.geojson`; every
  line changed (one per block) and nothing else; feature count unchanged.
  Spot-check one block against its shard.
- [ ] Measure brotli size from `app/`:
  `node -e "const z=require('zlib'),f=require('fs');console.log(z.brotliCompressSync(f.readFileSync('public/data/index.geojson')).length)"`.
  Expect about 220 KB (spec §4.1). If it is far off, stop and update §4.1.
- [ ] Commit: `feat(pipeline): add year completed and floors to the index`.

### Task 2: Contract type and fixtures

**Files:** `app/src/types/contract.ts`, `app/src/test/fixtures.ts`

- [ ] Add to `BlockIndexProperties`, after `town`:

  ```ts
  year_completed: number; // marker coloring; mirrors the detail shard
  max_floor_lvl: number; // marker coloring; mirrors the detail shard
  ```

- [ ] `sampleIndex`: AMK 123 gets `1978` / `12` (matches `sampleShard`);
  Bedok 1 gets `2015` / `30`, so the two fixtures fall in different bands in
  both modes.
- [ ] `npx tsc --noEmit` and `npm run test -- --run`: green (any other
  hand-built index features in tests get the two fields too).
- [ ] Commit: `feat(app): type the index coloring values`.

### Task 3: `lib/coloring.ts`

**Files:** `app/src/lib/coloring.ts`, `app/src/lib/coloring.test.ts`

- [ ] **Tests first** (`coloring.test.ts`):
  - each scale has `bands.length === edges.length + 1`, ascending edges, and
    6 bands;
  - `bandIndex`: year 1979→0, 1980→1, 2019→4, 2020→5, 2031→5; floors 9→0,
    10→1, 39→4, 40→5;
  - `circleColor("none")` is `BLOCK_COLOR`; `circleColor("year")` equals
    `["step", ["get", "year_completed"], c0, 1980, c1, 1990, c2, ...]`;
  - **expression and lookup agree:** for each scale, a tiny evaluator of the
    step array gives the same color as `bands[bandIndex(...)].color` at every
    edge, edge − 1, and a value far above the top (guards the two drifting
    apart);
  - `countBands(sampleIndex.features, COLOR_SCALES.year)` is
    `[1, 0, 0, 0, 1, 0]`, and its total equals the feature count.
- [ ] Implement:

  ```ts
  import type { ExpressionSpecification } from "maplibre-gl";
  import type { BlockFeature } from "../types/contract";

  export type ColorMode = "none" | "year" | "floors";
  export type ScaleMode = Exclude<ColorMode, "none">;

  export interface Band {
    label: string;
    short: string;
    color: string;
  }

  export interface ColorScale {
    property: "year_completed" | "max_floor_lvl";
    name: string;
    title: string;
    // Lower bound of every band after the first. A value on an edge belongs to the higher
    // band, matching MapLibre's `step`.
    edges: number[];
    bands: Band[];
  }

  // Also used by MapView while coloring is off.
  export const BLOCK_COLOR = "#2563eb";

  export const COLOR_SCALES: Record<ScaleMode, ColorScale> = {
    year: {
      property: "year_completed",
      name: "Year",
      title: "Year completed",
      edges: [1980, 1990, 2000, 2010, 2020],
      // ColorBrewer YlGnBu, 7-class ramp minus its lightest step.
      bands: [/* six {label, short, color} from the band table */],
    },
    floors: { /* likewise, BuPu */ },
  };

  export function bandIndex(scale: ColorScale, value: number): number {
    return scale.edges.filter((e) => value >= e).length;
  }

  export function circleColor(mode: ColorMode): string | ExpressionSpecification {
    if (mode === "none") return BLOCK_COLOR;
    const { property, edges, bands } = COLOR_SCALES[mode];
    return [
      "step",
      ["get", property],
      bands[0].color,
      ...edges.flatMap((e, i) => [e, bands[i + 1].color]),
    ] as ExpressionSpecification;
  }

  export function countBands(features: BlockFeature[], scale: ColorScale): number[] {
    const counts = scale.bands.map(() => 0);
    for (const f of features) counts[bandIndex(scale, f.properties[scale.property])]++;
    return counts;
  }
  ```

  Iteration order of `COLOR_SCALES` (year, then floors) is the menu order.
- [ ] `npx vitest run src/lib/coloring.test.ts`, then `tsc`, lint: green.
- [ ] Commit: `feat(app): define the marker coloring bands`.

### Task 4: Color mode store

**Files:** `app/src/store/color.ts`, `app/src/store/color.test.ts`

- [ ] Tests: starts at `"none"`; `setMode("year")` then `setMode("none")`.
  `beforeEach` resets to `"none"`, like `selection.test.ts`.
- [ ] Implement:

  ```ts
  import { create } from "zustand";
  import type { ColorMode } from "../lib/coloring";

  interface ColorState {
    mode: ColorMode;
    setMode: (mode: ColorMode) => void;
  }

  // Not persisted: every visit starts uncolored (spec §5.10).
  export const useColorMode = create<ColorState>((set) => ({
    mode: "none",
    setMode: (mode) => set({ mode }),
  }));
  ```

- [ ] Commit: `feat(app): add the color mode store`.

### Task 5: MapView colors markers and moves the zoom buttons

**Files:** `app/src/components/MapView.tsx`, `app/src/components/MapView.test.tsx`

- [ ] **Tests first.** Add `setPaintProperty: vi.fn()` to the hoisted map mock.
  - "colors markers by the mode on load": render with `colorMode="year"`
    before `load`; the `blocks-circles` layer's `circle-color` equals
    `circleColor("year")` (proves the ref path when the mode beats load).
  - "recolors when the mode changes": load with `"none"`, rerender with
    `"floors"`; `setPaintProperty` called with
    `("blocks-circles", "circle-color", circleColor("floors"))`; rerender
    `"none"` restores `BLOCK_COLOR`.
  - "doesn't touch paint before load": `getLayer` returns `undefined`, change
    the mode, no `setPaintProperty` call.
  - Update "adds compass-free zoom buttons only when asked": expect
    `"bottom-right"`.
  - Highlight layer stays amber in every mode (assert its paint is unchanged
    by `colorMode`), per §5.10.
- [ ] Implement:
  - Prop `colorMode?: ColorMode` (default `"none"`), plus a `colorModeRef`
    alongside `dataRef`/`selectedIdRef` so the load handler reads the latest.
  - In `blocks-circles` paint: `"circle-color": circleColor(colorModeRef.current)`;
    replace the literal `#2563eb` with `BLOCK_COLOR` via `circleColor`.
  - New effect:

    ```ts
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !map.getLayer("blocks-circles")) return;
      map.setPaintProperty("blocks-circles", "circle-color", circleColor(colorMode));
    }, [colorMode]);
    ```

  - Zoom control: `map.addControl(nav, "bottom-right")`, replacing the
    current comment with one that names the coupling, e.g.
    `// Bottom-left is the coloring legend's. MapLibre stacks a later-added bottom control on top,`
    `// so this sits above the attribution ⓘ added at mount.`
    (Memory note: this MapLibre detail goes in the code, not the spec.)
- [ ] `npx vitest run src/components/MapView.test.tsx`, `tsc`, lint: green.
- [ ] Commit: `feat(app): color markers by the active mode`.

### Task 6: ColorControl (picker menu)

**Files:** `app/src/components/ui/dropdown-menu.tsx`,
`app/src/components/ColorControl.tsx`, `app/src/components/ColorControl.test.tsx`,
`app/package.json`

- [ ] `npm install @radix-ui/react-dropdown-menu`. Add the stock shadcn
  new-york `dropdown-menu.tsx` (via `npx shadcn@latest add dropdown-menu`, or
  by hand), then align it with the existing ui files: import
  `@radix-ui/react-dropdown-menu` directly and `cn` from `../../lib/utils`
  (relative paths, as in `sheet.tsx`). Keep it stock otherwise.
- [ ] Check `package.json` after the CLI: current shadcn may add the umbrella
  `radix-ui` package instead. The only new dependency should be
  `@radix-ui/react-dropdown-menu`, next to the existing
  `@radix-ui/react-dialog`; remove anything else the CLI added.
- [ ] **Tests first** (`ColorControl.test.tsx`, store reset in `beforeEach`):
  - desktop (`compact={false}`): button reads "Color"; open it, the menu
    shows a "Color by" label and three `menuitemradio`s with "No coloring"
    checked; choose "Year completed" → store is `"year"`, button reads
    "Color: Year", menu closed;
  - keyboard: open with Enter, ArrowDown to "Floors", Enter → store is
    `"floors"`; Escape closes an open menu without changing the mode;
  - compact: button has accessible name "Color" and no visible text; after
    choosing "Floors" its name is "Color: Floors" and the dot indicator is
    present; back to "No coloring" removes the dot.
  - jsdom note: if Radix's pointer-driven open misbehaves under
    `user.click`, open with the keyboard (`trigger.focus(); user.keyboard("{Enter}")`)
    rather than adding pointer polyfills.
- [ ] Implement, matching the mockup and the search box's look (white card,
  `h-9` like `CommandInput`'s wrapper, same border/shadow/radius as the
  search `Command`):

  ```tsx
  export function ColorControl({ compact }: { compact: boolean }) {
    const mode = useColorMode((s) => s.mode);
    const setMode = useColorMode((s) => s.setMode);
    const label = mode === "none" ? "Color" : `Color: ${COLOR_SCALES[mode].name}`;
    return (
      // Non-modal, like the details panel, so the map stays live while the menu is open.
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger aria-label={label} className={/* card button; square when compact */}>
          <PaletteIcon className="size-4" />
          {!compact && <span>{label}</span>}
          {!compact && <ChevronDownIcon className="size-4 opacity-50" />}
          {compact && mode !== "none" && <span data-testid="color-on" className={/* dot */} />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={compact ? "end" : "start"}>
          <DropdownMenuLabel>Color by</DropdownMenuLabel>
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
  ```

  The visible text equals the accessible name on desktop, so the
  `aria-label` doesn't break label-in-name.
- [ ] Tests, `tsc`, lint, `npm run build` (new dependency): green.
- [ ] Commit: `feat(app): add the color mode menu`.

### Task 7: ColorLegend

**Files:** `app/src/components/ColorLegend.tsx`, `app/src/components/ColorLegend.test.tsx`

- [ ] **Tests first** (set the store directly):
  - renders nothing while the mode is `"none"`;
  - desktop: titled "Year completed", lists six bands **highest first**
    ("2020 and later" first, "Before 1980" last), each with its count
    (`sampleIndex`: "Before 1980" 1, "2010s" 1, others 0), counts formatted
    with `toLocaleString()`;
  - mobile: titled "Year completed" like desktop, then six swatches with
    short labels in **ascending** order ("<80" first), no counts;
  - switching mode re-titles it ("Floors") and recounts.
- [ ] Implement `ColorLegend({ features, isDesktop })`:
  - reads `mode` from the store; returns `null` for `"none"`;
  - `const counts = useMemo(() => countBands(features, scale), [features, scale])`;
  - wrapper `absolute bottom-2 left-2 z-20`: inset from the corner by the
    same 8 px the search box keeps from the top edge (`top-2`, `md:left-2`),
    below the search layer's `z-30` and the panels' `z-50`; card styling
    like the search box, rounded on all corners;
  - both: a `<section aria-label="{title} legend">` with a small uppercase
    title. On mobile the title is the only place the active mode is named,
    since the compact Color button shows just a dot;
  - desktop: under the title, a `<ul>` of rows `[swatch][label][count]`,
    reversed;
  - mobile: under the title, a strip of `inline-grid` columns sized to
    content (`grid-auto-flow: column`), each a swatch over its short label;
  - swatches are `aria-hidden`; the label text carries the meaning.
  - Not collapsible (spec §5.10); no close control.
- [ ] Tests, `tsc`, lint: green.
- [ ] Commit: `feat(app): add the color legend`.

### Task 8: DetailsPanel band swatch

**Files:** `app/src/components/DetailsPanel.tsx`, `app/src/components/DetailsPanel.test.tsx`

- [ ] **Tests first** on `DetailsContent` with `sampleShard` (1978, 12 floors):
  - mode `"none"`: no swatch (`queryByRole("img")` is null);
  - mode `"year"`: the Year completed row has a swatch named "Before 1980"
    with background `#c7e9b4`; the Floors row has none;
  - mode `"floors"`: the Floors row's swatch is named "10 to 12".
- [ ] Implement: `DetailsContent` reads `mode` from the store; a small
  `BandSwatch({ scale, value })` renders
  `<span role="img" aria-label={band.label} className="inline-block size-3 rounded-full" style={{ backgroundColor: band.color }} />`
  after the value inside the matching `<dd>` (`flex items-center gap-1.5`),
  so the value stays aligned under its label whichever mode is on (chosen over
  the mockup's swatch-first order). Value comes from the shard, which mirrors
  the index (§4.5), so the swatch always matches the marker.
- [ ] Tests, `tsc`, lint: green.
- [ ] Commit: `feat(app): show the selected block's band in the details panel`.

### Task 9: App wiring and layout

**Files:** `app/src/App.tsx`, `app/src/App.test.tsx`

- [ ] **Tests first** (App tests run on the desktop path; reset the color
  store in `afterEach`):
  - the Color button renders beside the search once loaded, and not on the
    error card;
  - choosing "Year completed" shows the "Year completed legend" region;
    "No coloring" removes it;
  - the stubbed MapView receives `colorMode` (extend the stub to print it,
    e.g. `data-color-mode`), and it follows the menu;
  - legend hidden while the index is loading and on error.
- [ ] Implement:
  - Top bar: the search wrapper becomes a flex row (`flex items-start gap-2`)
    holding SearchBox then ColorControl (`compact={!isDesktop}`), keeping
    today's positions. SearchBox's `Command` is `w-full`, so it takes its
    width from a wrapper div: `min-w-0 flex-1 md:w-[22rem] md:flex-none`.
    - Mobile: the row keeps today's `w-[min(92vw,22rem)]`, centered, and the
      `flex-1` search narrows by the square button's width (§5.6).
    - Desktop (`md:left-2 md:w-auto md:translate-x-0`): the row sizes to its
      content, the search wrapper holds its own `22rem`, and the button sits
      to its right.

    Keep `topClearanceRef` on the search input, so the fly-to clearance is
    unchanged (both controls share a height).
  - `const colorMode = useColorMode((s) => s.mode)`; pass to `MapView`.
  - Legend: `status === "ready" && (isDesktop || !panelOpen) && <ColorLegend features={index.features} isDesktop={isDesktop} />`.
    The mobile sheet hides the legend (§5.10); keyed on `panelOpen` so it
    leaves as the sheet starts opening and returns as it starts closing.
  - Both new controls hidden when `status === "error"`, like search.
- [ ] Tests, `tsc`, lint, build: green.
- [ ] Commit: `feat(app): wire marker coloring into the layout`.

### Task 10: Docs, manual check, PR

- [ ] **CLAUDE.md:** the contract bullet for `index.geojson` lists the two
  coloring values; "Frontend internals" gains a sentence on the color mode
  store (`store/color.ts`), `lib/coloring.ts` as the single band definition,
  and ColorControl/ColorLegend. `npm run format:check` (CLAUDE.md is
  Prettier-wrapped).
- [ ] **Spec:** re-read §5.10 and its cross-references against the build;
  fix any drift in the same PR. The header's "marker coloring added" date is
  set to the merge date just before merging.
- [ ] **README:** if it lists features, add marker coloring.
- [ ] **Manual check** (`npm run dev`), at desktop width and at ~375 px:
  - each mode recolors all markers; the selected block stays amber; labels
    unaffected;
  - legend inset bottom-left only while on, titled by the mode on both
    layouts; desktop counts sum to the block count; the mobile strip doesn't
    overflow at 320 px;
  - mobile: opening the sheet hides the legend, closing brings it back; the
    swatch in the panel matches the marker;
  - desktop: zoom buttons bottom-right above the ⓘ; the open panel covers
    both, and wheel/keyboard zoom still work;
  - search box narrows on mobile without clipping the clear (×) button;
  - menu: opens from the keyboard, arrow keys move, Enter picks and closes,
    Escape closes; an outside tap closes the menu and also reaches the map
    (selects a block, dismisses the panel, or starts a pan);
  - mobile, before any map drag (attribution still expanded): turn a mode on
    and see whether the legend covers the credit text. Report the overlap to
    the user before choosing a fix; accepting it (it clears on the first
    drag or an ⓘ tap) is the leading option.
- [ ] Full CI-equivalent locally: pipeline `ruff check`, `ruff format --check`,
  `pytest`; app `format:check`, `tsc --noEmit`, `lint`, `build`,
  `test -- --run`.
- [ ] Push the branch and open the PR (after the user confirms), title
  `feat(app,pipeline): color markers by year completed or floors`, body
  summarizing the spec sections and the backfill.

## Risks and checks

- **Radix DropdownMenu in jsdom:** pointer-open can be flaky; keyboard open in
  tests avoids polyfills (Task 6).
- **Menu on mobile:** it opens under a button at the top-right of a narrow
  screen; check it aligns to the button's end and stays on-screen at 320 px
  (Task 10).
- **Legend vs expanded attribution (mobile):** the credit line spans most of
  a phone's bottom edge until the first map drag, so the legend may cover
  part of it. Checked in Task 10; the fix, if any, is the user's call.
- **Stacking order of bottom-right controls** relies on MapLibre inserting
  later bottom controls first; verify visually in Task 10, since the mocked
  tests can't.
- **Index size:** measured in Task 1; the spec's ~220 KB figure must stay
  true.
- **Backfill vs pipeline drift:** the backfill writes through the pipeline's
  own `_write_index`, and the next monthly run should produce no diff in
  `index.geojson` beyond real data changes. Worth glancing at that commit.
