# HDB Map: Nearby Stations Implementation Plan

**Status:** Planned.

**Goal:** List up to three stations in the details panel instead of one: the
nearest, then up to two more within 1 km, MRT stations before LRT stops; each
row toggles the map's exit highlight onto that station or off, and the
highlight's dashed line shows its distance.

**Architecture:** `stations.py` measures a block to every station once (each
station's nearest exit) and picks the list; `transform` stores it as
`nearest_stations`, which replaces the shard's single `nearest_station`, and
`export` writes it. The index doesn't change (`station_distance` is the first
entry's distance), so coloring, filtering, and the legend are untouched. In
the app, the panel's "Nearest MRT" row becomes a list of toggle buttons that
choose which station's exit the highlight marks, and the highlight's line
gains a distance label.

**Spec:** `docs/specs/hdb-map-design.md` §3.3 (nearest stations), §4.3, §4.5,
§5.5, §5.12 (details panel, choosing the highlighted station, distance on the
line), §6.2 (run summary). The spec is the authority; this plan only adds the
implementation choices.

**Branch / PR:** all work on `feat/nearby-stations`. Code and spec ship in
one PR. Commit per task, in Conventional Commits form with an `app` or
`pipeline` scope, without a `Co-Authored-By` trailer.

## Decisions this plan makes (not in the spec)

- **One list, `nearest_stations`, in place of `nearest_station`.** The panel
  treats every row alike (same layout, every row a toggle, the highlight
  picks one by index), so one list maps straight onto it, and the §4.5 rules
  read as "the first is the nearest". A second `other_stations` field beside
  the old one was considered: it would keep a tab still running the previous
  app working when it fetches a new shard, but that only matters once, for
  tabs open across this deploy (a reload fixes them), and it would leave
  every reader joining two fields. The name avoids plain `stations`, which
  reads like `stations.geojson`.
- **Selection, in `stations.py`:** `nearest_stations(lon, lat, stations)`
  replaces `nearest_station` and returns the list:
  1. for each station, its nearest exit and that distance (the loop
     `nearest_station` runs now, kept per station instead of overall);
  2. sort by (distance, `id`); the first is the nearest, as today;
  3. the candidates are the rest whose rounded distance is at most
     `NEARBY_RADIUS_M` (1000);
  4. take the MRT candidates first, then the LRT ones, each in order, up to
     `MAX_STATIONS - 1` (`MAX_STATIONS` = 3);
  5. re-sort those by (distance, `id`) and put them after the nearest.

  The radius check uses the whole metres the shard stores, so a stored entry
  past the first never shows more than 1000.
- **LRT prefixes in `config.py`:** `LRT_LINES = {"BP", "STC", "SE", "SW",
  "PTC", "PE", "PW"}`, a subset of `OPEN_LINES` (a test checks it). A station
  is LRT-only when every code's letter prefix is in it, the same rule as
  `isLrtOnly` in `app/src/lib/lines.ts`; a comment on each names the other.
- **Summary (§6.2):** the existing `station A → B` line becomes a list line,
  `stations Cove, Compassvale, Meridian → Cove, Compassvale, Punggol`, shown
  when the names or their order differ. The old snapshot of the first run
  after merge has only `nearest_station`; for it, only the first name is
  compared (as today), so that run doesn't list every block whose list grew.
- **Panel:** `NearestStationRow` becomes `NearestStations({ stations,
  showBand, ... })`. A `<section>` with an `<h3>` heading "Nearest MRT" and a
  `<ul>` of rows, each a flex row with the name, chips, and exit on the left
  (wrapping) and the distance on the right (`shrink-0`, `tabular-nums`). In
  MRT mode the first row's distance is followed by the band swatch and the
  others by an `aria-hidden` blank of the same size. The heading was a `<dt>`
  before; a list of stations reads better as a heading and a list.
- **Highlight choice state:** two pieces in `App`. `exitHighlightOn`, a
  boolean starting `true`, outlives selections (not persisted, like the
  color mode). The chosen station is an index into the selected block's
  list, keyed by block id like `exitFor` now, so it reads as `0` for every
  new block and a stale choice can't leak. The panel gets `highlighted`
  (the index, or `null` when off) and an `onHighlight(index | null)`
  callback: a row sets the index and turns the flag on; the pressed row
  passes `null`, which turns the flag off. `App` looks up the exit with
  `nearestExitPoint`, which already takes any station-shaped object, and
  passes `null` to `MapView` when off, which `MapView` already handles. No
  store: only `App` and the panel use it.
- **Rows are `<button type="button" aria-pressed>`** inside the `<li>`, full
  width, with a hover background on pointer devices and the usual focus ring.
  The pressed row's mark is decided in the Task 7 mock (an amber left border
  is the first proposal).
- **Distance label on the line:** `NearestExit` gains `distance` (metres,
  from the chosen entry), and `nearestExitData` puts
  `label: formatDistance(distance)` (from `lib/coloring.ts`, so it reads as
  in the panel and tooltip) on the LineString. A new symbol layer
  `nearest-exit-distance` on the `nearest-exit` source, filtered to the
  line: `symbol-placement: "line-center"`, the label's text, MapLibre's
  default collision (no `text-allow-overlap`), the highlight's dark amber
  (`#92400e`) with a white halo. It sits above `nearest-exit-line`. Font
  weight, size, and whether it sits on the line or just above it
  (`text-offset`) are settled in the Task 7 mock. No line, no label: when
  the block's point isn't loaded the source has no line, as now.

## Data check (2026-10-22, current data)

10,817 blocks. With this rule: 5,387 show one station (1,578 have nothing
else within 1 km), 2,624 show two, 2,806 show three. 612 blocks get a
different list than a plain "three closest", all in the LRT towns (1 Teck Whye
Ave: Keat Hong, Choa Chu Kang, Bukit Panjang; 101A Punggol Field: Cove,
Meridian, Punggol). 631 blocks have no MRT station within 1 km and show three
LRT stops.

## File structure

- `pipeline/src/config.py`: `LRT_LINES`, `NEARBY_RADIUS_M`, `MAX_STATIONS`.
- `pipeline/src/stations.py`: `nearest_stations` replaces `nearest_station`.
- `pipeline/src/transform.py`, `pipeline/src/export.py`: the list field.
- `pipeline/src/summarize.py`: the list line.
- `app/src/types/contract.ts`: `nearest_stations: NearestStation[]`.
- `app/src/App.tsx`: the highlight choice; `app/src/components/MapView.tsx`:
  the line's label; `app/src/components/DetailsPanel.tsx`: `NearestStations`.
- Test fixtures on both sides switch to the list.

### Task 1: Config and selection

**Files:** `pipeline/src/config.py`, `pipeline/src/stations.py`,
`pipeline/src/transform.py`, `pipeline/tests/test_stations.py`

- [ ] **Tests first** on `nearest_stations(lon, lat, stations)`:
  - three MRT stations at about 300, 600, 900 m: all three, in that order;
  - a station at 1,200 m is left out; with nothing else within 1 km, the
    list is just the nearest, even when it is past 1 km;
  - LRT stops at 200, 400, 600 m and an MRT station at 800 m: the 200 m
    stop, the 400 m stop, the MRT station;
  - LRT stops at 200, 400, 600 m and MRT stations at 800 and 900 m: the
    200 m stop and the two MRT stations (the Teck Whye case);
  - a shared stop with `["NE17", "PTC"]` counts as MRT;
  - each entry has `id, name, codes, exit, distance` in that order, the exit
    being that station's own nearest exit;
  - exact ties order by `id`; the existing `nearest_station` cases (nearest
    exit beats a closer mean point, rounding, tie to the lower `id`) move
    over as checks on the first entry;
  - `LRT_LINES` is a subset of `OPEN_LINES`.
- [ ] Implement, and point `transform`'s one call at it for now (its first
  entry), so the run and the tests stay green until Task 2.
- [ ] Commit: `feat(pipeline): pick each block's nearest stations`.

### Task 2: Transform and export

**Files:** `pipeline/src/transform.py`, `pipeline/src/export.py`,
`pipeline/tests/test_transform.py`, `pipeline/tests/test_export.py`

- [ ] **Tests first:**
  - `transform` records carry `nearest_stations` and `station_distance`
    equal to its first entry's distance;
  - the shard entry ends `..., nearest_stations`, with no `nearest_station`;
  - §4.5: one to three entries, distinct ids, each in `stations.geojson`
    with the same name and codes and an exit of that station there; the
    first's distance equals the index's `station_distance`; the rest are at
    most 1,000 and in distance order.
- [ ] Implement.
- [ ] Commit: `feat(pipeline): export each block's nearest stations`.

### Task 3: Run summary

**Files:** `pipeline/src/summarize.py`, `pipeline/tests/test_summarize.py`

- [ ] **Tests first:**
  - `[Cove, Compassvale, Meridian]` to `[Cove, Compassvale, Punggol]`
    reports the list line and counts the block as changed;
  - a distance-only change in the list reports nothing beyond the existing
    `MRT distance` line for the first entry;
  - an old snapshot with only `nearest_station` and the same nearest name
    reports nothing; with a different one, the line names both lists.
- [ ] Implement.
- [ ] Commit: `feat(pipeline): summarize changes to the nearest stations`.

### Task 4: Development data (scratch backfill)

- [ ] A scratch script (not committed) that loads the live index and
  `stations.geojson`, rebuilds the station list with exits, and replaces
  every shard entry's `nearest_station` with `nearest_stations` from Task 1's
  function, writing to a scratch folder. Ask the user before copying it into
  `app/public/data/`.
- [ ] Check the counts against the data check above, and that every first
  entry equals the old `nearest_station` (only ±1 m rounding allowed).
- [ ] Commit: `chore(data): list each block's nearest stations`.

### Task 5: Contract types and fixtures

**Files:** `app/src/types/contract.ts`, app test fixtures, `app/src/App.tsx`,
`app/src/components/DetailsPanel.tsx`

- [ ] `BlockDetail.nearest_stations: NearestStation[]` in place of
  `nearest_station`; the fixtures switch (AMK 123: two entries; Bedok 1:
  one).
- [ ] The two readers use the first entry for now (the panel row and `App`'s
  highlight), so behaviour is unchanged.
- [ ] `npx tsc --noEmit` and the existing tests pass.
- [ ] Commit: `feat(app): read each block's nearest stations as a list`.

### Task 6: The panel list

**Files:** `app/src/components/DetailsPanel.tsx`,
`app/src/components/DetailsPanel.test.tsx`

- [ ] Remove the mock (`MockNearby`, the `?cm=mrt` switch) first.
- [ ] **Tests first:**
  - heading "Nearest MRT" with one station and with three;
  - rows in order, each with its name, chips, exit, and distance (km from
    1,000 m);
  - MRT mode: one swatch, on the first row; the others have the blank and
    no second `img`; other modes: no swatch and no blank.
- [ ] Implement `NearestStations` as decided above.
- [ ] Browser check on the dev data: desktop and 375 px, 1 Beach Rd (three
  MRT), 203A Punggol Field (Punggol in the last slot), 1 Teck Whye Ave (two
  MRT stations), a block with one station, and 1 Changi Village Rd (one
  station at 3.5 km), in MRT mode and another mode.
- [ ] Commit: `feat(app): list the nearby stations in the details panel`.

### Task 7: Toggling the highlight from the rows

**Files:** `app/src/App.tsx`, `app/src/components/DetailsPanel.tsx`,
`app/src/components/MapView.tsx`, their tests

- [ ] Mock the pressed-row mark and the line's distance label with the user
  (desktop and 375 px), then revert the mock.
- [ ] **Tests first:**
  - panel: every row is a button, a lone station's too; the highlighted one
    has `aria-pressed="true"`, the rest `"false"`; clicking a row calls
    `onHighlight` with its index, the pressed one with `null`;
  - App: selecting a block passes MapView its nearest exit; clicking the
    second row passes that station's exit; clicking it again passes `null`;
    selecting another block then still passes `null`, and clicking its first
    row passes its nearest exit; with the highlight on, selecting another
    block passes that block's nearest exit (not the old index's station);
  - MapView: the `nearest-exit` data's line carries the formatted distance
    (`"404 m"`, `"1.2 km"`), and the `nearest-exit-distance` layer exists
    with line-center placement.
- [ ] Implement as decided above.
- [ ] Browser check: 203A Punggol Field, switching between Cove and Punggol
  and off, then another block (still off), then on again and another block
  (its nearest); desktop and 375 px; keyboard (Tab to a row, Enter and
  Space).
- [ ] Commit: `feat(app): choose the highlighted station from the panel`
  (the distance label may be its own commit:
  `feat(app): show the distance on the nearest-exit line`).

### Task 8: Branch run, docs, PR

- [ ] `CLAUDE.md`: the shard description names `nearest_stations`.
- [ ] Re-read spec §3.3, §4.3, §4.5, §5.12, §6.2 against the code.
- [ ] Full CI-equivalent on both halves.
- [ ] Ask the user, then push and dispatch the `pipeline` workflow on the
  branch; read the data commit's summary.
- [ ] Ask the user, then open the PR titled `feat(app,pipeline): list nearby
  stations in the details panel`, noting under known issues that a tab open
  across the deploy needs a reload before its panel works again.

## Risks and checks

- **Tabs open across the deploy:** the previous app reads `nearest_station`,
  so its panel fails on a shard fetched after the deploy until the page is
  reloaded. Accepted (see the first decision); it happens once.
- **Shard size:** up to two more station objects per block, about 100 bytes
  each before compression; measure the largest shard before and after.
- **Run time:** the per-station distances are the loop already run for the
  nearest station, so the stage should stay about as fast; time it in the
  backfill.
- **Line drift:** a new LRT line needs its prefix in `LRT_LINES` as well as in
  `OPEN_LINES` and `lib/lines.ts`; otherwise its stops count as MRT, which
  only changes the order of the stations after the first, never the nearest.
