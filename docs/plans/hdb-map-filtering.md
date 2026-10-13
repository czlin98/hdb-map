# HDB Map: Filtering Implementation Plan (PR 1: town, year, floors)

**Status:** Planned.

**Goal:** Let the user hide the blocks that don't match a town, a year-completed
range, or a floors range. On desktop a "Filters" button sits with the Color
button in a row under the search box and opens a panel that stays open. On
mobile one options button opens a bottom sheet holding Color and Filters.

**Out of scope (PR 2):** the flat-type filter and its pipeline and contract
change (spec §7.2). Nothing in `pipeline/` or `app/public/data/` changes here.

**Architecture:** One pure module (`lib/filtering.ts`) owns what a filter is:
the predicate, the MapLibre filter expression, the data limits, and the
active count. The filters live in a small Zustand store of their own
(`store/filters.ts`). `App` reads the store, derives the visible blocks once,
and hands them on: MapView gets the filters as a prop and sets one expression
on `blocks-circles` and `blocks-labels`; ColorLegend gets the visible blocks,
so its counts follow the filter with no logic of its own. The filter list
(`FilterFields`) is one component used inside two containers: a Radix Popover
on desktop (`FiltersControl`) and a Vaul drawer on mobile
(`MapOptionsControl`).

**Spec:** `docs/specs/hdb-map-design.md` §5.11 (plus §5.1, §5.2, §5.4, §5.5,
§5.6, §5.9, §5.10, §7.2), already committed on this branch. The spec is the
authority; this plan only adds the implementation choices.

**Branch / PR:** all work on `feat/filtering`. Code and spec ship in one PR.
Commit per task, in Conventional Commits form with the `app` scope, without a
`Co-Authored-By` trailer.

## Decisions this plan makes (not in the spec)

- **A range is stored as `[from, to]` or `null`.** `null` means off. A range
  that equals the data limits is normalized to `null` on the way into the
  store, so "off" has one representation and the Reset link, the badge, and
  the expression all agree.
- **`App` derives the visible blocks; the legend stays filter-unaware.**
  `ColorLegend` already takes a block list (`countBands(features, scale)`),
  so it only gains the greyed look for an empty band. MapView gets `filters`
  as a prop, like `colorMode`, so the mount-once map keeps reading reactive
  values through refs and its tests stay prop-driven. Spec §5.2 says the
  legend reads the filter store; Task 12 rewords that sentence.
- **Desktop panel: shadcn `Popover`** (adds `@radix-ui/react-popover`),
  controlled from `App`, non-modal, with outside interaction prevented so it
  stays open while the map is used. Escape and its button close it.
  - It keeps the stock portal but gets a z-index **below** the top bar's, so
    an open search results list covers it (§5.11) without the top bar having
    to rise above the details panel.
  - `avoidCollisions={false}` keeps it under its button; its height is capped
    by Radix's available-height variable, with bottom collision padding that
    reaches the legend's top while a coloring mode is on.
- **Range control: shadcn `Slider`** (adds `@radix-ui/react-slider`), which
  gives two thumbs, keyboard steps, and slider semantics.
- **Three more shadcn components, chosen with the user:**
  - `Input` for the number boxes (`type="number"`, committed on Enter or
    blur): one border and focus ring on every browser. No new package.
  - `Checkbox` for the town list (adds `@radix-ui/react-checkbox`): native
    checkboxes look different on iOS, Android, and desktop.
  - `Button` for every text or card-style button this PR adds, and for the
    existing Color button: the top-bar buttons share one `control` variant,
    and Reset, Clear all, and Done use the stock `link` variant. It keeps
    stock `asChild` support, so `@radix-ui/react-slot` (already installed
    as a transitive dependency) becomes a direct one.
- **Everything else stays plain HTML for now**, to be revisited with the
  user later: the mobile Color row (native radios styled as segments), the
  town row's disclosure button, the bare icon buttons (legend ×, search
  clear ×, details close ×), and the static pieces (details layout, legend
  card, loading placeholder, error card, count badge, band swatch).
- **Town names are shown as the data has them** (upper case, as the details
  panel and search results show them), not title-cased as in the mockup.
- **The count line always reads "Showing N of M blocks"**, including when no
  filter is on (N equals M). It is a `role="status"` region.
- **The search box gets a fixed-height wrapper.** Its results list grows the
  search card in normal flow today, which was harmless beside it but would
  push a row beneath it down. The card becomes absolutely positioned inside a
  wrapper of the input's height, so the list overlays the row (§5.11).
- **Mobile sheet reuses the details sheet's snap points** (`SNAP_POINTS` in
  `App.tsx`) and its Vaul settings, so the two cannot drift apart.
- **Desktop vs mobile is chosen by `useIsDesktop` in `App`**, as today, not
  by CSS hiding, so tests never see two copies. `ColorControl` loses its
  `compact` variant: on mobile the options sheet replaces it.

## Names and copy

| Thing | Text |
| --- | --- |
| Desktop button | "Filters", with a count badge while any filter is on |
| Mobile button | accessible name "Map options"; count badge, or a dot when only a coloring mode is on |
| Mobile sheet title | "Map options" |
| Sections | "Color by" (mobile sheet), "Filters" |
| Filter titles | "Town", "Year completed", "Floors" |
| Town summary | "Any", up to two names in alphabetical order, or "N towns" |
| Number boxes | accessible names "{title}, from" and "{title}, to" |
| Actions | "Reset" (per filter; accessible names "Reset town", "Reset year completed", "Reset floors", so the three aren't identical to a screen reader), "Clear all", "Done" (mobile) |
| Count | "Showing N of M blocks" |
| Mobile Color row | "None", "Year", "Floors" |

Icons (both present in the installed lucide): `ListFilterIcon` on the Filters
button, `SlidersHorizontalIcon` on the mobile options button.

## File structure

```
app/src/lib/filtering.ts                    # new: Filters, matches, filterExpression, dataLimits, activeCount
app/src/lib/filtering.test.ts               # new
app/src/store/filters.ts                    # new: useFilters
app/src/store/filters.test.ts               # new
app/src/components/ui/slider.tsx            # new: stock shadcn, plus thumb labels
app/src/components/ui/popover.tsx           # new: stock shadcn
app/src/components/ui/button.tsx            # new: stock shadcn, plus a `control` variant
app/src/components/ui/input.tsx             # new: stock shadcn
app/src/components/ui/checkbox.tsx          # new: stock shadcn
app/src/components/RangeFilter.tsx          # new: two-thumb slider + from/to boxes
app/src/components/RangeFilter.test.tsx     # new
app/src/components/TownFilter.tsx           # new: folded checklist with counts
app/src/components/TownFilter.test.tsx      # new
app/src/components/FilterFields.tsx         # new: heading, Clear all, the three filters, BlockCount
app/src/components/FilterFields.test.tsx    # new
app/src/components/FiltersControl.tsx       # new: desktop button + popover
app/src/components/FiltersControl.test.tsx  # new
app/src/components/ColorModeRow.tsx         # new: compact mobile Color row
app/src/components/ColorModeRow.test.tsx    # new
app/src/components/MapOptionsControl.tsx    # new: mobile button + sheet
app/src/components/MapOptionsControl.test.tsx # new
app/src/components/MapView.tsx              # modify: filters prop
app/src/components/MapView.test.tsx         # modify
app/src/components/ColorLegend.tsx          # modify: grey an empty band
app/src/components/ColorLegend.test.tsx     # modify
app/src/components/ColorControl.tsx         # modify: drop compact, add onOpenChange
app/src/components/ColorControl.test.tsx    # modify
app/src/components/DetailsPanel.tsx         # modify: share the sheet body-scroll rule
app/src/components/SearchBox.tsx            # modify: the card overlays what is below it
app/src/App.tsx                             # modify: layout + wiring
app/src/App.test.tsx                        # modify
app/package.json, package-lock.json         # four Radix packages: slider, popover, checkbox, slot
CLAUDE.md                                   # modify: frontend internals
README.md                                   # modify if it lists features
docs/specs/hdb-map-design.md                # §5.2 wording, drift from Task 12, header date at merge
```

---

### Task 1: `lib/filtering.ts`

**Files:** `app/src/lib/filtering.ts`, `app/src/lib/filtering.test.ts`

- [ ] **Tests first:**
  - `matches`: with `EMPTY_FILTERS` every block passes; a town list passes
    only its towns; a year range is inclusive at both ends; filters combine
    with AND (right town, wrong year fails).
  - `filterExpression(EMPTY_FILTERS)` is `null`; with all three on it equals
    the `["all", ...]` array below, in town, year, floors order.
  - **expression and predicate agree:** a tiny evaluator of the expression
    (`all`, `in` over a literal, `>=`, `<=`, `get`) gives the same answer as
    `matches` for every `sampleIndex` feature across a handful of filter
    combinations, including each range edge and edge ± 1. This guards the
    map and the counts drifting apart.
  - `dataLimits(sampleIndex.features)` is `{ year: [1978, 2015], floors: [12, 30] }`.
  - `normalizeRange`: a range equal to the limits becomes `null`; values are
    clamped to the limits; `from` above `to` is pulled down to `to`.
  - `activeCount`: 0 for empty, counts each of the three once.
- [ ] Implement:

  ```ts
  import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
  import type { BlockFeature, BlockIndexProperties } from "../types/contract";

  export type Range = [from: number, to: number];
  export type RangeKey = "year" | "floors";

  export interface Filters {
    towns: string[]; // empty = any town
    year: Range | null; // null = off
    floors: Range | null;
  }

  export const EMPTY_FILTERS: Filters = { towns: [], year: null, floors: null };

  export const RANGE_PROPERTY = {
    year: "year_completed",
    floors: "max_floor_lvl",
  } as const satisfies Record<RangeKey, keyof BlockIndexProperties>;

  export function matches(p: BlockIndexProperties, f: Filters): boolean { /* ... */ }

  // null when nothing is on, so the caller can clear the layer filter.
  export function filterExpression(f: Filters): FilterSpecification | null {
    const parts: ExpressionSpecification[] = [];
    if (f.towns.length) parts.push(["in", ["get", "town"], ["literal", f.towns]]);
    for (const key of ["year", "floors"] as const) {
      const range = f[key];
      if (!range) continue;
      const value: ExpressionSpecification = ["get", RANGE_PROPERTY[key]];
      parts.push([">=", value, range[0]], ["<=", value, range[1]]);
    }
    return parts.length ? ["all", ...parts] : null;
  }

  export function dataLimits(features: BlockFeature[]): Record<RangeKey, Range> { /* ... */ }
  export function normalizeRange(range: Range, limits: Range): Range | null { /* ... */ }
  export function activeCount(f: Filters): number { /* ... */ }
  ```

  `dataLimits` on an empty list (before the index loads) returns `[0, 0]`
  for both, so callers need no special case.
- [ ] `npx vitest run src/lib/filtering.test.ts`, `tsc`, lint: green.
- [ ] Commit: `feat(app): define block filters and their map expression`.

### Task 2: Filters store

**Files:** `app/src/store/filters.ts`, `app/src/store/filters.test.ts`

- [ ] Tests (`beforeEach` calls `clearAll`, like `color.test.ts`): starts
  empty; `toggleTown` adds then removes; `setRange("year", [1980, 1999])`
  then `setRange("year", null)`; `reset("towns")` empties only the towns;
  `clearAll` empties everything.
- [ ] Implement `useFilters` as
  `{ filters, toggleTown(town), setRange(key, range | null), reset(key: "towns" | RangeKey), clearAll() }`.
  The three values live under one `filters` key, replaced immutably on
  every change, and callers select `(s) => s.filters`. A selector that built
  a fresh `{ towns, year, floors }` object would re-render forever under
  zustand v5, and MapView's effect needs a stable identity to key on. Add a
  test that an action which changes nothing (resetting a filter that is
  already off) keeps the `filters` reference.
  Comment: not persisted, like the coloring mode.
- [ ] Commit: `feat(app): add the filters store`.

### Task 3: MapView hides the blocks that don't match

**Files:** `app/src/components/MapView.tsx`, `app/src/components/MapView.test.tsx`

- [ ] **Tests first:**
  - "starts filtered when filters beat load": render with a town filter
    before `load`; the `blocks-circles` layer spec has
    `filter: filterExpression(filters)`, and `blocks-labels` has it combined
    with the selected-block condition.
  - "no filter key when nothing is on": the `blocks-circles` spec has no
    `filter`.
  - "refilters when filters change": rerender with a year range;
    `setFilter("blocks-circles", expr)` and `setFilter("blocks-labels", ["all", labelCondition, expr])`.
    Rerender with `EMPTY_FILTERS`: `setFilter("blocks-circles", null)` and
    the labels go back to the bare selected-block condition.
  - "a selection change keeps the block filter on the labels": with a filter
    on, change `selectedId`; the `blocks-labels` call still carries the
    filter.
  - "the highlight layers never get the block filter": their `setFilter`
    calls are only ever `highlightFilter(id)`.
  - "a filter change doesn't move the map": no `flyTo` or `easeTo` from a
    filters-only rerender.
- [ ] Implement:
  - Prop `filters?: Filters` (default `EMPTY_FILTERS`), with a `filtersRef`
    beside `colorModeRef` for the load handler.
  - `labelFilter(id, blockFilter)` returns the bare condition when
    `blockFilter` is null, else `["all", condition, blockFilter]`.
  - Layer specs on load take their filter from the refs; `blocks-circles`
    gets the key only when the expression is non-null.
  - New effect on `[filters]`: `setFilter("blocks-circles", expr)` and
    `setFilter("blocks-labels", labelFilter(selectedIdRef.current, expr))`.
  - The selection effect reads `filtersRef.current` for the labels. `filters`
    stays **out of** its dependency list, or every slider step would re-fly
    to the selected block; say so in a one-line comment.
  - Update the comment above `blocks-highlight`: the filter it guarded
    against now exists.
- [ ] Tests, `tsc`, lint: green.
- [ ] Commit: `feat(app): hide blocks that don't match the filters`.

### Task 4: ColorLegend greys an empty band

**Files:** `app/src/components/ColorLegend.tsx`, `app/src/components/ColorLegend.test.tsx`

- [ ] Tests: with `sampleIndex` in year mode, the four bands with no blocks
  are marked (`data-empty`), the two with blocks are not, in both layouts;
  all six bands still render in the same order.
- [ ] Implement: a band whose count is 0 gets `data-empty` and reduced
  opacity on its row (desktop) or segment and label (mobile). No other
  change: the counts already come from whatever list `App` passes.
- [ ] Commit: `feat(app): grey legend bands with no visible blocks`.

### Task 5: RangeFilter (slider with number boxes)

**Files:** `app/src/components/ui/slider.tsx`, `app/src/components/ui/input.tsx`,
`app/src/components/ui/button.tsx`, `app/src/components/RangeFilter.tsx`,
`app/src/components/RangeFilter.test.tsx`, `app/package.json`

- [ ] `npm install @radix-ui/react-slider`. Add the stock shadcn new-york
  `slider.tsx`, aligned with the existing ui files (direct
  `@radix-ui/react-slider` import, relative `cn`). As in the coloring plan,
  check `package.json` afterwards: the only new dependencies are the ones
  this task names.
  One deliberate change from stock: a `thumbLabels` prop, since the stock
  file renders its thumbs unnamed.
- [ ] Add the stock shadcn `input.tsx` and `button.tsx` the same way, and
  `npm install @radix-ui/react-slot` for the button's `asChild`. Both stay
  stock in this task; the button's `control` variant arrives in Task 8 with
  its first use.
- [ ] **Tests first** (controlled by a small wrapper holding the value;
  sliders are driven from the keyboard, since jsdom has no layout for
  pointer drags):
  - off (`value={null}`): the boxes show the limits, both thumbs sit at the
    ends, and there is no Reset link;
  - typing `1986` in "to" and pressing Enter calls `onChange([min, 1986])`;
    the same on blur;
  - a typed value outside the limits is clamped; "from" above "to" is pulled
    down to "to", and "to" below "from" is pulled up to "from"; an empty or
    non-numeric box reverts to the current value;
  - a range typed back to the full limits calls `onChange(null)`;
  - ArrowRight on the "from" thumb raises it by one and updates the box;
  - while on, a Reset link shows, named "Reset {title}" in lower case after
    the first word; clicking it calls `onChange(null)` and
    moves focus to the "from" thumb. Not to a number box: on a phone that
    would open the keyboard and raise the sheet.
  - a thumb and its box share an accessible name, so the tests query by
    role (`slider`, `spinbutton`), not by label text alone.
- [ ] Implement `RangeFilter({ title, limits, value, onChange, onBoxFocus })`:
  - a title row: the title, the Reset link while `value` is non-null, then
    the two boxes with "to" between them. The row may wrap: on a 320 px
    phone the title, Reset, and both boxes don't fit one line, so the boxes
    drop below the title there;
  - `<Slider min max step={1} value={value ?? limits} minStepsBetweenThumbs={0}>`
    with `onValueChange` going through `normalizeRange`; thumbs named
    "{title}, from" and "{title}, to";
  - the boxes are `Input`s holding a local draft string, committed on Enter
    or blur; a `useEffect` on `value` refreshes the draft so slider drags
    show in them. Reset is a `Button` with the `link` variant, with its
    height and padding removed at the call site (`h-auto p-0`): the stock
    sizes would make every title row taller, which the mobile sheet's
    half-height budget can't afford;
  - `data-vaul-no-drag` on the slider root, so inside the mobile sheet a
    drag moves the thumb, not the sheet (harmless on desktop);
  - keep the stock `Input`'s `text-base md:text-sm` when narrowing it to a
    four-digit width: under 16 px, iOS Safari zooms the page when a box
    takes focus;
  - `onBoxFocus` is optional; the mobile sheet uses it to rise to full.
- [ ] Tests, `tsc`, lint, build: green.
- [ ] Commit: `feat(app): add the range filter control`.

### Task 6: TownFilter

**Files:** `app/src/components/ui/checkbox.tsx`, `app/src/components/TownFilter.tsx`,
`app/src/components/TownFilter.test.tsx`, `app/package.json`

- [ ] `npm install @radix-ui/react-checkbox`; add the stock shadcn
  `checkbox.tsx`, aligned with the existing ui files; check `package.json`.
- [ ] **Tests first:**
  - folded by default: one row reading "Town" and "Any", `aria-expanded="false"`;
  - expanding lists every town sorted by name, each with its total block
    count from the features (AMK 1, Bedok 1 for `sampleIndex`). `towns.json`
    is ordered by town code, which puts Bukit Batok before Bedok, so the
    test passes its towns out of alphabetical order;
  - ticking a town calls `onToggle("BEDOK")`; a selected town is checked;
  - the summary reads the one or two selected names, then "3 towns"; it
    truncates with an ellipsis instead of wrapping (two long names don't
    fit the row);
  - Reset shows only with a selection, calls `onReset`, and moves focus to
    the row's button;
  - counts are totals: they don't change with the selection.
- [ ] Implement `TownFilter({ towns, features, selected, onToggle, onReset })`:
  a disclosure button (`aria-expanded`, `aria-controls`) over a list of
  shadcn `Checkbox`es, each inside its `<label>` so the whole row toggles
  it, sorted by name. Radix renders a checkbox as a button with
  `role="checkbox"`, so the tests query by that role and read
  `aria-checked`. Reset is a `link` Button. Counts come from one
  `useMemo` pass over `features`. The open state is local.
- [ ] Commit: `feat(app): add the town filter control`.

### Task 7: FilterFields and BlockCount

**Files:** `app/src/components/FilterFields.tsx`, `app/src/components/FilterFields.test.tsx`

- [ ] **Tests first** (reset the store in `beforeEach`):
  - renders the "Filters" heading, then Town, Year completed, Floors, in
    that order;
  - the range limits come from the features (`sampleIndex`: 1978 to 2015,
    12 to 30);
  - changing a control writes the store (tick a town; type a year);
  - "Clear all" is disabled with nothing on, enabled with any filter on, and
    empties the store;
  - `BlockCount` renders "Showing 1 of 2 blocks" in a status region, with
    `toLocaleString()` grouping.
- [ ] Implement:
  - `FilterFields({ features, towns, onBoxFocus })` reads and writes
    `useFilters`, computes `dataLimits(features)` once per features list,
    and composes `TownFilter` and two `RangeFilter`s. "Clear all" is a
    `link` Button.
  - `features` here is always the **whole** index, never the visible
    blocks: the limits and the town counts must not shrink as filters
    narrow. Only `BlockCount`'s `shown` comes from the visible list.
  - It renders nothing until the index has loaded (no features): a slider
    whose minimum equals its maximum has no track to draw. Add a test.
  - `BlockCount({ shown, total })`, exported from the same file. It renders
    nothing while `total` is 0, so the mobile sheet's header doesn't read
    "Showing 0 of 0 blocks" during loading. The count
    is rendered by the containers, not here: the desktop panel puts it at
    its foot, the mobile sheet in its header (§5.11).
- [ ] Commit: `feat(app): compose the filter list`.

### Task 8: FiltersControl (desktop button and panel)

**Files:** `app/src/components/ui/popover.tsx`, `app/src/components/ui/button.tsx`,
`app/src/components/FiltersControl.tsx`, `app/src/components/FiltersControl.test.tsx`,
`app/src/components/ColorControl.tsx`, `app/package.json`

- [ ] `npm install @radix-ui/react-popover`; add the stock shadcn
  `popover.tsx`, aligned as above; check `package.json`.
- [ ] Add a `control` variant to `button.tsx` holding the top-bar button
  classes that `ColorControl` has inline today (white card, `h-9`, shadow,
  focus ring), with the stock `icon` size squared to match for the mobile
  button. Move the Color button onto it
  (`<DropdownMenuTrigger asChild><Button variant="control">`), so the three
  top-bar buttons can't drift apart. The Color button must look and behave
  exactly as before: its tests stay green unchanged, and it is compared by
  eye against `main` in Task 12. The stock base classes differ from today's
  button in ways no test will catch, so the variant has to override them:
  `font-medium` (today's label is normal weight), the wider focus ring, the
  centered content, and the default horizontal padding.
- [ ] **Tests first** (controlled by a wrapper holding `open`):
  - the button reads "Filters" with no badge; with two filters on it shows
    "2" and its accessible name is "Filters, 2 on";
  - clicking it opens a dialog-role panel labelled "Filters" containing the
    filter list and "Showing 2 of 2 blocks" at its foot;
  - a pointer-down outside leaves it open; Escape closes it; the button
    closes it;
  - the button is disabled while `features` is empty (index still loading).

  `bottomInset` is not tested here: collision padding only shows up in
  layout, which jsdom lacks. It is checked by hand in Task 12.
- [ ] Implement `FiltersControl({ open, onOpenChange, features, towns, shown, total, bottomInset })`:

  ```tsx
  // Non-modal and deaf to outside clicks: it stays open while the map is used.
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <Button variant="control" aria-label={name}>…</Button>
    </PopoverTrigger>
    <PopoverContent
      aria-label="Filters"
      align="start"
      // Keeps it under its button; without this it would flip above when space is short.
      avoidCollisions={false}
      collisionPadding={{ bottom: bottomInset + 8 }}
      onInteractOutside={(e) => e.preventDefault()}
      className="z-[25] flex max-h-(--radix-popover-content-available-height) w-[22rem] flex-col p-0"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <FilterFields features={features} towns={towns} />
      </div>
      <div className="border-t px-3 py-2"><BlockCount shown={shown} total={total} /></div>
    </PopoverContent>
  </Popover>
  ```

  The width matches the search box above it (`22rem` in `App.tsx`), so the
  two share both edges; it is also the least that fits a range filter's
  title, Reset link, and two boxes on one line.

  The `z-[25]` needs a comment naming its coupling: below the top bar
  (`z-30` in `App.tsx`) so the search results list covers the panel, above
  the legend (`z-20`).

  Focus on close: Radix returns focus to the trigger whenever the panel
  closes. When the Color menu is what closed it (Task 9), that focus move
  lands outside the just-opened menu and dismisses it. So
  `onCloseAutoFocus` is prevented unless the panel was closed from its own
  button or by Escape; a ref set in those two paths tells them apart.
- [ ] Tests, `tsc`, lint, build: green.
- [ ] Commit: `feat(app): add the desktop filters panel`.

### Task 9: Desktop wiring and layout

**Files:** `app/src/App.tsx`, `app/src/App.test.tsx`,
`app/src/components/ColorControl.tsx`, `app/src/components/ColorControl.test.tsx`,
`app/src/components/SearchBox.tsx`, `app/src/components/ColorLegend.tsx`

- [ ] **Tests first** (App tests run on the desktop path; reset the filters
  store in `afterEach`):
  - Filters and Color buttons render once loaded, Filters first, and
    neither on the error card;
  - the stubbed MapView receives `filters` (extend the stub with
    `data-filters={JSON.stringify(filters)}`), and it follows the panel;
  - with year coloring on, ticking Bedok drops the "Before 1980" count to 0
    and greys that band;
  - the panel stays open after selecting a marker and after a map
    background click;
  - opening the Color menu closes the filter panel **and the menu stays
    open** (guards the focus-return trap noted in Task 8); opening Filters
    with the Color menu open leaves only Filters open;
  - a search result that the filter hides still opens its details;
  - replace "the Color menu sits beside the search box" with the row test.
- [ ] Implement:
  - `const filters = useFilters(...)`; `visible = useMemo(() => activeCount(filters) ? features.filter((f) => matches(f.properties, filters)) : features, …)`;
    pass `filters` to MapView and `visible` to ColorLegend.
  - `filtersOpen` state in `App`. `ColorControl` gains
    `onOpenChange?: (open: boolean) => void` (forwarded to `DropdownMenu`);
    `App` closes the filter panel when it opens. The other direction needs
    no code: the menu already closes on an outside pointer-down.
  - Layout, desktop: the top bar becomes a column. First the search wrapper
    (`relative h-9 w-[22rem]`) with the search card absolutely positioned
    inside it (`absolute inset-x-0 top-0 z-10`, and `h-auto` to undo the
    card's `h-full`), so the results list overlays what is below. The
    classes go on the `Command` in `SearchBox.tsx`. The `z-10` is needed:
    the buttons in the row are positioned and come later in the DOM, so
    without it they would paint over the list. Then a row
    (`flex gap-2`) with FiltersControl and ColorControl. Mobile keeps
    today's single row until Task 11, but its search wrapper needs the
    same fixed height (`relative h-9 min-w-0 flex-1`), since the card is now
    out of flow on both layouts.
  - `bottomInset`: the distance from the window's bottom edge to the
    legend's top while a coloring mode is on (its height plus its own
    inset), else 0, measured from the legend element in a layout effect
    keyed on the mode (`ColorLegend` forwards a ref to its section).
  - Both buttons hidden when `status === "error"`, like search.
- [ ] Tests, `tsc`, lint, build: green.
- [ ] Commit: `feat(app): wire filtering into the desktop layout`.

### Task 10: ColorModeRow and MapOptionsControl (mobile)

**Files:** `app/src/components/ColorModeRow.tsx` (+ test),
`app/src/components/MapOptionsControl.tsx` (+ test),
`app/src/components/DetailsPanel.tsx`

- [ ] **Tests first:**
  - `ColorModeRow`: a radiogroup "Color by" with None, Year, Floors, the
    current mode checked; choosing Floors sets the store; arrow keys move
    between them (native radios).
  - `MapOptionsControl`, closed: the button is named "Map options"; with a
    coloring mode on and no filters it shows the dot; with filters on it
    shows the count instead and is named "Map options, 2 filters on".
  - `MapOptionsControl`, open: render with `open` and assert the title, the
    count, the Color row before the Filters heading, and "Done"; clicking
    "Done" calls `onOpenChange(false)`. `DetailsPanel.test.tsx` already
    renders the mobile drawer open in jsdom, so this is expected to work;
    drag gestures and snap positions still need the manual pass.
- [ ] Implement `ColorModeRow`: native radios in labels, laid out as three
  equal segments, the checked one raised. Options come from `COLOR_SCALES`
  (`name`), so the order matches the desktop menu.
- [ ] Implement `MapOptionsControl({ open, onOpenChange, snapPoints, activeSnap, onSnapChange, features, towns, shown, total, triggerRef })`:
  - the trigger is a `Button` (`control` variant, `icon` size) that toggles
    `open`, not a `DrawerTrigger`, so `App` can run its own rules first;
  - a non-modal Vaul `Drawer` with the same props as the details sheet
    (`snapPoints`, controlled snap, `repositionInputs={false}`);
  - header: the title "Map options", `BlockCount`, and "Done" (a `link`
    Button inside `DrawerClose asChild`), sized to fit inside the peek
    height;
  - body: `ColorModeRow`, then `FilterFields` with
    `onBoxFocus={() => onSnapChange(full)}`;
  - the body scrolls only at the top snap. Move the two class strings that
    encode that Vaul rule out of `DetailsPanel` into one shared helper
    (`sheetBodyClass(fullyOpen)`), carrying its comment, and use it in both.
- [ ] Tests, `tsc`, lint: green.
- [ ] Commit: `feat(app): add the mobile options sheet`.

### Task 11: Mobile wiring

**Files:** `app/src/App.tsx`, `app/src/App.test.tsx`,
`app/src/components/ColorControl.tsx`, `app/src/components/ColorControl.test.tsx`

- [ ] Tests: `ColorControl` loses its compact cases (they moved to
  `MapOptionsControl` in Task 10).
- [ ] **App tests on the mobile path.** `setup.ts` stubs `matchMedia` to
  report desktop; a `describe` block spies on it to report mobile instead.
  The sheet swap is the riskiest logic in this PR, so try to cover it:
  - the options button opens the sheet, with Color above Filters;
  - selecting a marker closes the options sheet and opens that block's
    details;
  - with details open, the options button closes them and opens the sheet,
    and the selection clears;
  - a map background click closes the options sheet;
  - filters set in the sheet survive it closing (the stubbed MapView still
    receives them).

  `setup.ts` warns that Vaul is unreliable in jsdom for integration tests.
  If a case can't be made stable, drop that case, say so in the PR, and
  leave it to the manual pass, rather than polyfilling.
- [ ] Implement:
  - Mobile top bar: SearchBox, then `MapOptionsControl`, replacing the
    compact ColorControl. Remove `compact` from `ColorControl`.
  - `optionsOpen` and `optionsSnap` state; the sheet opens at the half snap.
  - One sheet at a time:
    - `openBlock` closes the options sheet before selecting;
    - opening the options sheet calls `panelRef.current?.close()`, which
      clears the selection once its animation ends.
  - `onBackgroundClick` closes the options sheet as well as the details
    panel.
  - `colorButtonRef` (the legend's × returns focus to it) points at the
    options button on mobile.
  - Crossing the breakpoint closes whichever of the two surfaces is open.
- [ ] Tests, `tsc`, lint, build: green.
- [ ] Commit: `feat(app): wire the options sheet into the mobile layout`.

### Task 12: Docs, manual check, PR

- [ ] **CLAUDE.md:** "Frontend internals" gains a filtering paragraph
  (`lib/filtering.ts` as the single definition, `store/filters.ts`, `App`
  deriving the visible blocks, `FiltersControl` and `MapOptionsControl`),
  and the marker-coloring paragraph stops saying the Color control is beside
  the search box. The Docs section's list of plans gains this one.
  `npm run format:check`.
- [ ] **Spec:** reword the §5.2 sentence (the store is read by `App` and the
  filter controls; the legend receives the visible blocks). Re-read §5.11
  and its cross-references against the build and fix any drift. The header's
  "filtering added" date is set just before merging.
- [ ] **README:** if it lists features, add filtering.
- [ ] **Manual check** (`npm run dev -- --host`), desktop and a real phone:
  - each filter hides and restores markers and labels; combined filters
    narrow; the selected block stays amber when filtered out and hides again
    once its details close;
  - a hidden block's spot shows no tooltip, and a click there acts as a
    background click;
  - a search result hidden by the filters opens and highlights;
  - legend counts follow the filter and sum to the count line; empty bands
    grey in place;
  - desktop: the row sits under the search box; the panel opens under
    Filters at the left edge, never flips above, stays open through pans,
    zooms, marker clicks, and background clicks, and closes on Escape and
    its button; with coloring on it stops above the legend and scrolls,
    including with the town list expanded on a short window;
  - desktop: the search results list covers the row and the panel, and the
    row doesn't move when the list opens; Color menu and filter panel never
    show together;
  - desktop: Escape order with both the filter panel and block details open;
  - mobile: the button's dot and badge; the sheet opens at half with the
    Color row and all three filters visible on a typical phone; peek shows
    the title and count; drag gestures match the details sheet;
  - mobile: dragging a slider thumb never moves the sheet; a vertical drag
    that starts on a slider track is acceptable either way, note which;
  - mobile: focusing a number box raises the sheet to full, the box stays
    visible above the keyboard, and the page doesn't zoom;
  - mobile: a marker tap closes the sheet and opens details; the options
    button closes details and opens the sheet; a map tap closes the sheet;
    the two sheets never overlap after the swap animation;
  - 320 px: the search box, button, Color row, and number boxes all fit;
  - the Color button is unchanged from `main` on desktop (size, shadow,
    label, focus ring), now that it is built on `Button`;
  - checkboxes, number boxes, and the link buttons look right on the phone
    as well as on desktop; Reset, Clear all, and Done read as actions, not
    as plain text (the stock link style is dark text, underlined only on
    hover, which a phone never shows);
  - mobile: opening the options sheet doesn't focus a number box or open
    the keyboard.
- [ ] Full CI-equivalent locally: `format:check`, `tsc --noEmit`, `lint`,
  `build`, `test -- --run`.
- [ ] Push the branch and open the PR (after the user confirms), title
  `feat(app): filter blocks by town, year completed and floors`.

## Risks and checks

- **Two Vaul drawers.** The details sheet and the options sheet are separate
  drawers that swap. `DetailsPanel` already works around Vaul skipping close
  callbacks for a snap-point drawer closed through its `open` prop; the
  options sheet may need the same treatment (closing by clicking its
  `DrawerClose`). Checked in Task 11 and the manual pass.
- **Keyboard and the mobile sheet.** `repositionInputs` is off on the details
  sheet because Vaul's refit broke its layout around the search box. The
  plan keeps it off and rises to full on focus instead. If a box ends up
  under the keyboard on a small phone, try turning it on for the options
  sheet only.
- **Popover placement.** With `avoidCollisions={false}` the panel must still
  get a sensible available height from Radix; verify in the browser, since
  jsdom has no layout. Fallback: a fixed `max-h` computed from the viewport
  and `bottomInset`.
- **Search card overlay.** Making the search card absolutely positioned must
  not change the mobile fly-to clearance, which measures the search input
  (`topClearanceRef`), nor clip the card's shadow.
- **Escape with several layers open.** Radix closes its topmost dismissable
  layer first, and the search box has its own Escape rule. Confirm the order
  feels right with the filter panel, block details, and search list in play.
  Known and left as is for now: Escape in the search box also closes the
  filter panel. Revisit after implementation; the alternative is to close
  the panel on Escape only while focus is in it or on its button.
- **Stock shadcn styles.** `Button`, `Input`, and `Checkbox` bring their own
  sizes, focus rings, and hover styles. The `link` variant underlines on
  hover and the `Input` has a shadow; adjust with classes at the call site
  where they clash with the panel, and keep the ui files themselves stock
  apart from the two changes named in Tasks 5 and 8.
- **Half-height budget.** With stock control sizes the header, Color row,
  and three filters come to roughly 400 px, against about 420 px at half
  height on a typical phone. Spacing in the sheet has to be set with that
  in mind, and checked on the phone before the mobile tasks are called done.
- **Narrow phones.** A range filter's title row is the widest thing in the
  sheet. It wraps at 320 px, which makes each filter taller and pushes
  Floors further below the half-height fold there. Accepted for the
  smallest phones; check that it reads cleanly rather than broken.
- **Slider in jsdom.** Tests drive it from the keyboard. Pointer behavior,
  and thumb overlap when both sit on one value, are checked by hand.
- **Per-step work.** Each slider step refilters ~10.8k blocks for the counts
  and sets two layer filters. Expected to be well within a frame; if a drag
  stutters on a phone, defer the counts with `useDeferredValue`.
