# HDB Map: Nearest MRT Station Implementation Plan

**Status:** Planned.

**Goal:** Give every block its nearest MRT or LRT station and the straight-line
distance to that station's nearest exit; show it in the details panel, add an
"MRT distance" coloring mode, draw the stations and their exits on the map, and
mark the selected block's nearest exit.

**Architecture:** A new pipeline stage, `stations.py`, builds the station list
from LTA's exit dataset (data.gov.sg) and OneMap's line codes, keeping only
codes on open lines and failing the run if a station is left with none.
`transform` finds each block's nearest exit; `export` writes the distance into
the index, the station into the shard, and a new `stations.geojson` holding
both the stations and their exits. In the
app, the mode is one more entry in `COLOR_SCALES`, which the menu, mobile row,
legend, tooltip, and panel swatch already read; MapView gains a station source
with station and exit layers fed from `stations.geojson`, loaded beside the
index but not required by it, plus a highlight of the selected block's nearest
exit.

**Spec:** `docs/specs/hdb-map-design.md` §3.6, §4.7, §5.12 (plus §1, §2,
§3.3 to §3.5, §4.1, §4.3, §4.5, §5.2 to §5.10, §6.2, §7.1 to §7.3, §7.5,
§7.8), committed on this branch in 6749828 and extended with the exit layer
and the nearest-exit highlight. The spec is the authority; this
plan only adds the implementation choices.

**Branch / PR:** all work on `feat/mrt-distance`. Code and spec ship in one
PR. Commit per task, in Conventional Commits form with an `app` or `pipeline`
scope, without a `Co-Authored-By` trailer.

**Order:** pipeline first (Tasks 1 to 8), then the UI mocks with the user
(Task 9), then the app (Tasks 10 to 16). The pipeline doesn't depend on any
UI decision, and the mocks are best judged on real data.

## Decisions this plan makes (not in the spec)

- **OneMap results are read across every page.** The station-code entries
  have always come first on page 1 in testing, but Orchard returns 18 results
  over two pages, and nothing guarantees the order. Reading `totalNumPages`
  costs a few extra calls for the big stations only.
- **Line codes are sorted by `OPEN_LINES` order, then by number**, so an
  interchange reads the same every month whatever order OneMap returns. A
  code with no number (`STC`, `PTC`) sorts as 0.
- **A code counts as open when its whole letter prefix is in `OPEN_LINES`**
  (`re.match(r"[A-Z]+", code)`), so `STC` is never mistaken for `SE`.
- **Exits at a merged stop keep their building:** Bukit Panjang has an
  "Exit A" at both its MRT and its LRT station, and Choa Chu Kang an "Exit B",
  so at a stop with exits from both, each exit name gains its prefix ("MRT
  Exit A", "LRT Exit A"). Other stations keep LTA's name ("Exit 1").
- **Every exit point is kept, for the distance, the station's mean point,
  and the exit layer.** 8 exits have more than one point. Most are a few
  metres to 44 m apart, but Bukit Panjang's Exit A spans 348 m over three
  points and HarbourFront's Exit A 249 m, so they are separate entrances:
  averaging an exit's points into one was rejected, since it would put an
  exit where there is no entrance. Checked 2026-10-21 against OneMap's own
  station points: the exit mean is a median 23 m from them, 5 of 185 stations
  over 100 m (Marine Parade 244 m), where OneMap's point is the postal address
  at one end of the station.
- **Haversine in plain Python**, block by exit. About 10.8k blocks times 613
  exits took 6 s in a scratch run; no spatial index or NumPy needed.
- **The station lookup reuses `fetch._api_get` and `fetch._download_url`**
  for the exits download, and its own small retry loop for OneMap, like
  `geocode_block`. A OneMap error after retries raises, unlike geocoding,
  since the spec makes it fatal.
- **`transform` takes the station list as a third argument** and returns the
  station fields on each record; `export` only projects them.
- **The station-count guard lives in `run.py`** beside `check_block_count`
  and runs right after the stations stage, before geocoding, so a truncated
  exit download fails in about a minute.
- **Summary:** the snapshot also reads `stations.geojson`. Stations added,
  removed, or with changed codes get their own sections, and one line counts
  the exits added, removed, and moved, grouping exits by station and name so
  a re-surveyed exit reads as moved rather than added and removed. A block's
  changes gain "MRT distance a → b" and "station A → B". A run whose blocks
  are unchanged but whose station data changed gets a new kind, `stations`,
  and the workflow its own subject ("station data changed"). Without it, an
  exit move too small to change any block's whole-metre distance would
  commit as a plain refresh whose body says nothing changed. Kinds in order:
  `refresh`, `stations`, `failures`, `none`.
- **One reader for the live stations file** (`stations.load_live_stations`)
  returns its station features only, for both the station-count guard and the
  summary, so neither counts exits as stations.
- **The development backfill needs no OneMap login:** search answered
  without a token in testing when calls were 1.2 s apart (about 8 minutes for
  every station). The scratch script patches out the auth header and the
  pacing; the pipeline itself always uses the run's token.
- **Final data comes from a pipeline run on this branch** (`workflow_dispatch`
  on `feat/mrt-distance`), which is also the end-to-end test against the live
  APIs. Until then a scratch backfill (Task 8, not committed) adds the new
  fields to the committed data for development and the mocks.
- **App: stations are a prop on MapView** (`stations`), like `data`, read
  through a ref by the load handler; a later arrival adds the source then.
  The layer order is left to the mock (Task 9): under the blocks, station
  names lose MapLibre's label placement to the block numbers from zoom 16,
  and block dots cover the markers. Whatever the order, the station layers
  stay out of the hover and tap layer list, so blocks remain the only
  targets.
- **App: the nearest exit comes from the shard, not a search in the
  browser.** App asks `getBlockDetail` for the selected block too, and passes
  MapView a `nearestExit` (`{ lon, lat }` or `null`): the exit features whose
  `station` and `exit` match the shard's `nearest_station`, the one nearest
  the block if the name has several points (plain squared-degree comparison;
  the candidates sit within a few hundred metres). The loader caches each
  shard's promise instead of its result, so the panel's request and this one
  share a fetch, and drops a rejected promise so a later selection retries.
  Lifting the detail out of DetailsPanel was rejected as a larger change for
  the same result.
- **App: the highlight has its own GeoJSON source** (`nearest-exit`: the exit
  point and a LineString from the block), updated with `setData` on each
  selection and emptied on clear, added right before `blocks-highlight`: over
  the block dots, under the selected block and every label (the block layers
  stack circles, highlight, labels, highlight label). Like the station layers,
  it is not a hover or tap target.
- **App: the legend gets an optional note** from the scale (`note` on
  `ColorScale`), used only by the MRT mode: "Straight-line distance to the nearest MRT or LRT exit" (Task 9). It shows in a
  popover from an info button beside the legend title, not as a line.

## Band proposal for the mocks

Measured on the committed index against today's exits: median 507 m, 90th
percentile 1,134 m, max 3,544 m.

| Edges (m) | Blocks per band |
| --- | --- |
| 400, 800, 1200, 1600 | 4,085 / 4,138 / 1,689 / 597 / 308 |
| 200, 400, 600, 800, 1000 | 1,369 / 2,716 / 2,351 / 1,787 / 1,011 / 1,583 |
| 300, 600, 900, 1200, 1500 | 2,717 / 3,719 / 2,381 / 1,095 / 476 / 429 |

The spec's "roughly 400 m" bands put three quarters of all blocks in the first
two. **Proposal: 200 m steps to 1 km** (six bands like the other modes, about
2.5 minutes' walk each), labels "Under 200 m" … "1 km and more", short "<200"
… "1k+". The spec's band sentence is updated once the user picks (Task 9).
Palette and direction (near = dark or light) are chosen in the mock.

## Names and copy

- Mode: menu "MRT distance", button "Color: MRT", mobile row "MRT", legend
  title "MRT distance".
- Tooltip value: `350 m` (after the address, like `12 floors`).
- Panel row: label "Nearest MRT"; "Outram Park" + chips `EW16` `NE3` `TE17`
  + "· Exit 5"; then "350 m" (Task 9).
- Credit: `© HDB, LTA, OneMap/SLA`.

## File structure

```
pipeline/src/config.py               # modify: dataset id, OPEN_LINES, name overrides, ratio
pipeline/src/fetch.py                # unchanged; stations.py imports its helpers
pipeline/src/stations.py             # new: exits, line codes, station list, nearest station
pipeline/src/transform.py            # modify: nearest station per block
pipeline/src/export.py               # modify: index + shard fields, stations.geojson
pipeline/src/run.py                  # modify: stations stage, station-count guard
pipeline/src/summarize.py            # modify: station sections, new block fields
pipeline/tests/test_stations.py      # new
pipeline/tests/test_transform.py     # modify
pipeline/tests/test_export.py        # modify
pipeline/tests/test_run.py           # modify: mocked exits + OneMap, guard
pipeline/tests/test_summarize.py     # modify
.github/workflows/pipeline.yml       # modify: subject for the stations kind
app/public/data/*                    # regenerate (Task 8 backfill, then the branch run)
app/src/types/contract.ts            # modify: station_distance, NearestStation, stations
app/src/test/fixtures.ts             # modify: values, sampleStations
app/src/lib/data.ts                  # modify: loadStations, nearestExitPoint, promise cache
app/src/lib/coloring.ts              # modify: "mrt" scale, optional note
app/src/components/MapView.tsx       # modify: stations + nearestExit props, layers, credit, tooltip
app/src/components/DetailsPanel.tsx  # modify: nearest-station row + swatch
app/src/components/ColorLegend.tsx   # modify: note line
app/src/App.tsx                      # modify: load stations, look up the nearest exit
CLAUDE.md, README.md                 # modify
docs/specs/hdb-map-design.md         # mock outcomes, header date at merge
```

---

### Task 1: Config and the exits download

**Files:** `pipeline/src/config.py`, `pipeline/src/stations.py`,
`pipeline/tests/test_stations.py`

- [ ] `config.py`:

  ```python
  # LTA MRT Station Exit (GeoJSON); LRT stations are in it too.
  EXITS_DATASET_ID = "d_b39d3a0871985372d7e1637193335da5"
  # Lines in service, in display order. A new line's first stations fail the run until it is
  # added here, since a station must have at least one code (stations.py).
  OPEN_LINES = ["NS", "EW", "CG", "NE", "CC", "DT", "TE", "BP", "STC", "SE", "SW", "PTC", "PE", "PW"]
  # Official names that title case gets wrong.
  STATION_NAME_OVERRIDES = {"HARBOURFRONT": "HarbourFront", "ONE-NORTH": "one-north",
                            "MACPHERSON": "MacPherson"}
  # One closure in ~185 stations passes; a truncated exits download doesn't.
  MIN_STATION_RATIO = 0.99
  ```

  The lookup of every station in testing saw these prefixes plus `CR`,
  `JS`, and `JE`, the closed ones. Confirm `STC` once the LRT-form lookup
  (Task 2) returns Sengkang's code.
- [ ] **Tests first:** `fetch_exits` with `responses` (initiate, poll, then a
  small GeoJSON body): returns `{"station", "exit", "lon", "lat"}` rows with
  the suffix stripped ("OUTRAM PARK"); "PUNGGOL LRT STATION" and "PUNGGOL MRT
  STATION" both become "PUNGGOL"; a name without the suffix, a non-Point
  geometry, or an empty collection raises.
- [ ] Implement `fetch_exits(session)` with `_download_url(session,
  config.EXITS_DATASET_ID)` and `_api_get`; suffix regex
  `r"^(.*\S)\s+(?:MRT|LRT) STATION$"`.
- [ ] Commit: `feat(pipeline): fetch the MRT and LRT station exits`.

### Task 2: Line codes from OneMap

**Files:** `pipeline/src/stations.py`, `pipeline/tests/test_stations.py`

- [ ] **Tests first** (`responses` on `ONEMAP_SEARCH_URL`, sleep patched):
  - Outram Park: three entries "(EW16)", "(NE3)", "(TE17)" among exit rows →
    `["EW16", "NE3", "TE17"]`;
  - Raffles Place: "(EW14 / NS26)" → both codes;
  - Sengkang: the MRT query gives "(NE16)", the LRT query "(STC)" → both;
  - an entry for a different station ("ORCHARD BOULEVARD MRT STATION (TE13)"
    when looking up "ORCHARD") is ignored;
  - page 2 is fetched when `totalNumPages` is 2;
  - a 500 that persists past retries raises; a 429 then 200 succeeds.
- [ ] Implement `lookup_codes(session, token, station) -> list[str]`: query
  `f"{station} MRT STATION"` and `f"{station} LRT STATION"`, every page, with
  the run's bearer token and `time.sleep(0.2)` between calls. Keep a result
  only on `re.fullmatch(rf"{re.escape(station)} (?:MRT|LRT) STATION \((.+)\)",
  r["SEARCHVAL"])`, split the group on `/`, strip.
- [ ] Commit: `feat(pipeline): look up station line codes on OneMap`.

### Task 3: The station list

**Files:** `pipeline/src/stations.py`, `pipeline/tests/test_stations.py`

- [ ] **Tests first** on a pure `build_stations(exits, codes_by_station)`:
  - Ang Mo Kio with `["CR11", "NS16"]` keeps `["NS16"]`;
  - codes are ordered by `OPEN_LINES`, then number (`["TE17", "EW16",
    "NE3"]` → `["EW16", "NE3", "TE17"]`), duplicates dropped;
  - a station whose codes are all closed (`["CR5"]`) or empty raises, and the
    message lists every such station, not just the first;
  - name: "OUTRAM PARK" → "Outram Park", "HARBOURFRONT" → "HarbourFront",
    "ONE-NORTH" → "one-north"; `id` is `slugify(name)`;
  - point is the mean of the exit points' lon and lat, an exit with two
    points counting both, and both points stay in the station's exits;
    result sorted by `id`;
  - Bukit Panjang with MRT and LRT exits both named "Exit A" gets "MRT Exit A"
    and "LRT Exit A"; Outram Park (MRT only) keeps "Exit 1";
  - codes `["STC", "SE5", "NE16"]` sort to `["NE16", "STC", "SE5"]`.
- [ ] Implement `build_stations` and `fetch_stations(session, token)` (exits,
  then one lookup per distinct station). Each station keeps its exits
  (`[{"exit", "lon", "lat"}]`) for Task 4 and for the exit features Task 5
  writes. `fetch_exits`
  keeps which suffix each exit came from, so this step can prefix the names
  at merged stops.
- [ ] Commit: `feat(pipeline): build the station list from exits and open lines`.

### Task 4: Each block's nearest station

**Files:** `pipeline/src/stations.py`, `pipeline/src/transform.py`,
`pipeline/tests/test_stations.py`, `pipeline/tests/test_transform.py`

- [ ] **Tests first:**
  - `haversine_m` on a known pair (two points 0.001° of latitude apart,
    about 111 m);
  - `nearest_station(lon, lat, stations)` picks the station of the nearest
    exit even when another station's mean point is closer; distance rounded
    to whole metres; on an exact tie the lower `id` wins;
  - `transform(geocoded, towns, stations)` adds `station_distance` and
    `nearest_station` (`id, name, codes, exit, distance`) to each record.
- [ ] Implement; update every `transform(...)` call in tests and `run.py`.
- [ ] Commit: `feat(pipeline): find each block's nearest station`.

### Task 5: Export the station fields and `stations.geojson`

**Files:** `pipeline/src/export.py`, `pipeline/tests/test_export.py`

- [ ] **Tests first:**
  - index property order ends `..., sold_types, rental_types,
    station_distance`; shard entry ends `..., rental_units_by_type (if any),
    nearest_station` in the field order of spec §4.3;
  - mirror test (§4.5): each index `station_distance` equals its shard's
    `nearest_station.distance`, and that station's `id`, name, and codes
    exist in the written `stations.geojson`;
  - `stations.geojson`: one feature per line, the stations first, sorted by
    `id`, with properties exactly `kind, id, name, codes`, then the exits,
    sorted by station, exit, and coordinates, with properties exactly `kind,
    station, exit`; an exit with two points writes two features; coordinates
    rounded to 6 decimals;
  - every shard `nearest_station.exit` names an exit of that station in the
    file, and every exit's `station` is a station `id` there (§4.5);
  - two stations with the same `id` raise, like duplicate block ids and town
    slugs (a name override could make two names slug alike).
- [ ] Implement: rename `_write_index` to `_write_feature_collection` (both
  files share the one-per-line format); `write_stations(stations,
  app_data_dir)`.
- [ ] Commit: `feat(pipeline): write the nearest station and the stations file`.

### Task 6: Run order and the station-count guard

**Files:** `pipeline/src/run.py`, `pipeline/tests/test_run.py`

- [ ] **Tests first:** extend the end-to-end test with mocked exits and
  OneMap code lookups; `stations.geojson` is written, and the index has
  `station_distance`. New: `check_station_count` allows one station of 100
  missing, rejects two, skips with no live file, and counts only station
  features (a live file of 100 stations and 300 exits: 99 found passes, 98
  fails); a run whose stations stage
  raises (station without codes) writes nothing; the guard trips before any
  geocode call (assert no geocode request was made). Existing tests: the
  stage stubs in `_stub_stages` gain `fetch_stations` and a recorded
  `write_stations`, so the "writes nothing" tests cover `stations.geojson`
  and the passing one expects it among the writes.
- [ ] Implement in `run()`: after `fetch_blocks`, `stations =
  fetch_stations(session, token)`, log the count, `check_station_count(...)`;
  pass `stations` to `transform`; `write_stations` with the other writes.
- [ ] Commit: `feat(pipeline): run the stations stage before geocoding`.

### Task 7: Run summary

**Files:** `pipeline/src/summarize.py`, `pipeline/tests/test_summarize.py`,
`.github/workflows/pipeline.yml`

- [ ] **Tests first:** a block whose distance changes reads "MRT distance 350
  → 420"; a changed nearest station reads "station Bishan → Marymount";
  "Stations added", "Stations removed", and "Station codes changed" sections
  list names (and codes); the exits line counts an added, a removed, and a
  moved exit, and an exit name with two points that moves reads as one moved;
  station or exit changes with no block change are kind `stations`; with a
  block change too, the kind stays `refresh` and the station lines are still
  in the body; station and failure changes together are kind `stations`; a
  first run (no `stations.geojson`) has no station sections.
- [ ] Implement: `SCALAR_FIELDS` gains `("station_distance", "MRT distance")`;
  `_changes` compares `nearest_station["name"]`; `Snapshot.stations` and
  `Snapshot.exits` loaded from the file; `RunSummary.kind` gains `stations`.
- [ ] Workflow: a `stations` kind gets `chore(data): $RUN_TYPE check, station
  data changed ($DATE)`, beside the `failures` branch.
- [ ] Commit: `feat(pipeline): report station changes in the run summary`.

### Task 8: Development data (scratch backfill)

- [ ] Scratch script, not committed, run from `pipeline/` without a OneMap
  login (see the decision above): `fetch_stations`, then for every block in
  the committed index and shards apply the Task 4 fields, writing through the
  pipeline's own exporters, so the result matches what a run would write.
- [ ] Check: `git diff --stat` touches the index, every shard, and adds
  `stations.geojson`; feature count unchanged; spot-check three blocks
  (Outram, Punggol, a Bukit Panjang LRT block) by hand on a map.
- [ ] Measure the index's brotli size (command in the coloring plan, Task 1).
  Expect about 30 KB more (spec §4.1); if far off, update §4.1.
- [ ] Full pipeline checks: `pytest`, `ruff check src tests`,
  `ruff format --check src tests`.
- [ ] Commit: `chore(data): add nearest stations to the data (development backfill)`.
  The branch run (Task 17) replaces it.

### Task 9: UI mocks with the user

Browser mocks on the dev server with real data, desktop and 390 px wide, one
decision at a time:

- [x] **Bands:** the three edge sets above, with palette and direction
  (near = dark vs light). Update spec §5.12's band sentence to the choice.
  Chosen: 200 m steps to 1 km, near = dark, ColorBrewer YlGn (7-class minus
  its lightest step). Greens and PuRd were mocked and not chosen.
- [x] **Panel row:** wording, where it sits, line codes plain or as chips,
  whether the exit is named, how "straight line" is said. Chosen: label
  "Nearest MRT" below the grid, above Sold; line 1 "Outram Park" +
  line-colored chips + "· Exit 5"; line 2 "176 m" + swatch in MRT mode,
  right after the value as for Year and Floors. No "straight line" in the
  panel (user); the legend note keeps it. Rejected: one plain line (spec
  example), grey chips, distance-first grid cells, "176 m to Exit 5" (the
  swatch would split the phrase), a small grey "to Exit 5" line, "Outram
  Park, Exit 5" before the chips. Fits one line at 320 px for the longest
  real cases (Outram Park 3 chips, Bukit Panjang "LRT Exit B").
- [x] **Station markers:** style (must not resemble a block dot or the amber
  highlight), name labels and their zoom, whether a station shows a tooltip,
  and the layer order: check the station names still show at zoom 16 and 17
  among the block numbers, and that no block becomes hard to tap.
  Chosen: circle, fill `#ffffff`, stroke `#374151` 2 px, radius interpolate
  11: 3, 14: 5, 17: 8; layer `minzoom` 12 (hidden at the island view, which
  fits at about 10.3 on a laptop and 10.9 at 1920 px). Labels `minzoom` 13:
  Noto Sans Bold, size 13: 11 to 17: 14, `#111827`, white halo 2, variable
  anchor top/bottom/left/right, radial offset 0.8, text-padding 2; text is a
  `format` of the name, a newline, and one inline image chip per code
  (`match` on codes length 1/2/3). Chips are canvas images added with
  `addImage` per code after the stations load: 600 weight 8 px text, 11 px
  tall, 5 px horizontal padding, radius 2.5, `pixelRatio` = device pixel
  ratio, `LINE_COLORS` fill, dark text on CC/CE. Layer order: station circles
  right before `blocks-highlight`, station labels right before
  `blocks-highlight-label`. No tooltip, no tap. Checked: names and chips at
  zoom 13 in the city centre (all fit but a few at the densest core),
  Tampines at 14/15, Ang Mo Kio at 16.5 among block numbers. Rejected:
  filled dark dot (looks like a block), red ring (loud, reads as NS line),
  line-colored rings (clash with block colors, interchanges show no line),
  colored code text (less legible), hover/tap popup (phones miss it; would
  make stations tap targets), chips only from zoom 15.
- [x] **Exit markers:** style (smaller and plainer than a station or block),
  the zoom they appear at, label zoom, and that their labels yield to block
  numbers. Chosen: circle, fill `#6b7280`, stroke `#ffffff` 1 px, radius
  interpolate 15: 2.5, 17: 4, `minzoom` 16, added before `blocks-circles`.
  Labels `minzoom` 16, full exit name (user chose full over "A"), Noto Sans
  Regular 10, `#4b5563`, white halo 1.5, variable anchor left/right/top/
  bottom, radial offset 0.6, added before `blocks-labels` so block numbers
  and station labels win. Known and accepted (user): next to a station a few
  exit labels hide at zoom 16 (they show from 16.5); the basemap rail line can
  cross a label (thicker halo declined). Rejected: hollow ring, short labels,
  markers from 15 without labels.
- [x] **Nearest-exit highlight:** the exit marker and the dashed line, on a
  selected block near a station and on one far from it, desktop and 390 px
  (where the sheet can cover the exit). Keep the line or drop it; check
  Marine Parade and Holland Village, the largest gaps from OneMap's points.
  Chosen: line KEPT (`#92400e`, width 1.5, dasharray [2, 2]); exit circle
  radius 5, fill `#ffffff`, stroke `#d97706` 2.5; label = the exit name,
  Noto Sans Bold 11, `#92400e`, white halo 2, variable anchor, radial offset
  0.9, `text-allow-overlap` true. Line and circle right before
  `blocks-highlight`; label right before `blocks-highlight-label`. The
  regular `exits-labels` filter excludes the highlighted exit (match on
  station and exit). Checked 1 Everton Park (176 m, on screen) and 207A
  Punggol Pl (463 m: exit off screen at the fly-to, the line points to it),
  desktop and 390 px. Marine Parade / Holland Village not checked (exit
  points, not the station dot, drive this).
- [x] **Mobile Color row:** four segments (None, Year, Floors, MRT) at 320 px.
  Fits: 67 px each, no overflow. No change needed.
- [x] **Legend note** wording. Chosen (user): "Straight-line distance to the nearest MRT or LRT exit", in a Radix Popover
  from a lucide `InfoIcon` (size-3.5, aria-label "About MRT distance") right
  after the legend title, both layouts. Desktop (`(hover: hover)`): opens on
  hover and on keyboard focus, closes on leave/blur; a click does nothing
  extra (user: hover only). Touch: tap opens, tap elsewhere closes. Content
  `side="top" align="start"`, `w-max max-w-[calc(100vw-1rem)] px-3 py-2
  text-xs text-balance`: the box fits its text on one line (a fixed
  max-w-64 broke after "MRT" and left empty space), wrapping into even lines
  only if the screen is too narrow. The trigger gets the x button's ::after
  tap padding. Rejected: the note as a visible line
  under the title (costs a mobile legend line); "Straight line to the
  nearest exit" (drops LRT); "as the crow flies" (longer).
- [ ] Record the outcomes in this plan's tasks below and in the spec.

### Task 10: Contract types, fixtures, data loading

**Files:** `app/src/types/contract.ts`, `app/src/test/fixtures.ts`,
`app/src/lib/data.ts`, `app/src/lib/data.test.ts`

- [ ] Types: `station_distance: number` on `BlockIndexProperties`;
  `NearestStation { id; name; codes: string[]; exit: string; distance: number }`;
  `BlockDetail.nearest_station: NearestStation`; `StationProperties { kind:
  "station"; id; name; codes }`, `ExitProperties { kind: "exit"; station;
  exit }`, and a `StationFeatureCollection` whose features carry either.
- [ ] Fixtures: AMK 123 `station_distance` 350 and Bedok 1 a value in a
  different band; `sampleShard` gets a matching `nearest_station`;
  `sampleStations` with two stations and their exits, one exit name with two
  points.
- [ ] `loadStations(url = "/data/stations.geojson")`, tested like
  `loadTowns`.
- [ ] `createGetBlockDetail` caches the shard's promise. Tests: two calls for
  the same town before the fetch settles make one request; after a failed
  fetch the next call fetches again.
- [ ] `nearestExitPoint(stations, nearest, blockLonLat)` returns the matching
  exit's `{ lon, lat }`, the nearer of two same-named points, and `null` when
  nothing matches.
- [ ] `tsc`, tests: green. Commit: `feat(app): type the station data`.

### Task 11: The MRT distance scale

**Files:** `app/src/lib/coloring.ts`, `app/src/lib/coloring.test.ts`

- [ ] `ColorMode` gains `"mrt"`; `property` union gains `"station_distance"`;
  optional `note?: string`. The `mrt` scale uses the Task 9 edges, labels,
  and colors; `describe: (m) => \`${m} m\``. Edges 200, 400, 600, 800, 1000;
  colors near to far `#005a32 #238443 #41ab5d #78c679 #addd8e #d9f0a3`;
  labels "Under 200 m", "200 to 400 m", ... "1 km and more"; short labels are
  upper bounds, "<200", "<400", "<600", "<800", "<1k", "1k+" (Task 12: ranges
  like "200–400" crowded the 44 px mobile segments, and km ranges were
  rejected too).
- [ ] Tests: the existing expression-vs-lookup check covers the new scale
  automatically; add `bandIndex` cases at each edge and `countBands` on the
  fixtures.
- [ ] Commit: `feat(app): add the MRT distance bands`.

### Task 12: Legend note, menu, mobile row

**Files:** `ColorLegend.tsx`, `ColorControl.test.tsx`, `ColorModeRow.test.tsx`,
`ColorLegend.test.tsx`

- [ ] ColorLegend renders an info button beside the title when `scale.note`
  is present (both layouts), showing the note in a popover on hover or focus
  (desktop) or tap (touch) (Task 9). Tests: the MRT legend has the button and
  focusing it shows the note; Year has none; the menu lists "MRT distance";
  the mobile row has four options.
- [ ] Commit: `feat(app): offer MRT distance in the color controls`.

### Task 13: Details panel row

**Files:** `DetailsPanel.tsx`, `DetailsPanel.test.tsx`

- [ ] Tests on `DetailsContent`: the "Nearest MRT" row shows the station
  name, one chip per code, "· Exit 5", and "176 m"; mode `"mrt"` adds the band
  swatch to it, other modes don't; an unknown prefix gets the LRT grey.
- [ ] Line colors (`LINE_COLORS` by code prefix, in `lib/` beside the scale):
  NS `#d42e12`; EW, CG `#009645`; NE `#9900aa`; CC `#fa9e0d`; DT `#005ec4`;
  TE `#9d5b25`; LRT (BP, STC, SE, SW, PTC, PE, PW) `#748477`. White chip text.
  Comment the coupling with `OPEN_LINES` in `pipeline/src/config.py`.
  White on CC orange is only about 2:1 contrast: use dark text on light chips.
- [ ] Implement per Task 9.
- [ ] Commit: `feat(app): show the nearest station in the details panel`.

### Task 14: Stations and exits on the map

**Files:** `MapView.tsx`, `MapView.test.tsx`

- [ ] Tests: with `stations` before load, a `stations` source and its layers
  are added in the order Task 9 chose; stations arriving after load add them
  then; `null` stations add nothing and nothing throws; the exit layers
  filter on `kind` and have the Task 9 `minzoom`; station and exit layers are
  not in the click/hover layer list; the blocks source credit reads
  `© HDB, LTA, OneMap/SLA`; the tooltip in mode `"mrt"` ends `· 350 m`.
- [ ] Implement per Task 9's marker decisions.
- [ ] Commit: `feat(app): draw the stations and exits on the map`.

### Task 15: App wiring

**Files:** `App.tsx`, `App.test.tsx`

- [ ] Tests: stations load in parallel and reach MapView; a failed stations
  fetch leaves the app `ready` with no error card and `stations` null; the
  index or towns failing still shows the card.
- [ ] Implement: a separate `loadStations().then(setStations).catch(() =>
  {})` effect, not part of the `Promise.all`.
- [ ] Commit: `feat(app): load the stations beside the index`.

### Task 16: The nearest-exit highlight

**Files:** `MapView.tsx`, `MapView.test.tsx`, `App.tsx`, `App.test.tsx`

- [ ] Tests (MapView): a `nearestExit` sets the `nearest-exit` source to the
  exit point and a line from the selected block to it; `null` empties it; the
  line and circle are added right before `blocks-highlight` (above
  `blocks-circles`, below the selected block), the exit label right before
  `blocks-highlight-label`; none is a hover or tap target; the line is
  dashed; `exits-labels` excludes the highlighted exit and gets its plain
  filter back on clear.
- [ ] Tests (App): selecting a block passes MapView its nearest exit once the
  shard and stations are in; a failed stations fetch or shard leaves it
  `null` with the panel unaffected; clearing the selection clears it; a
  quick second selection never shows the first block's exit.
- [ ] Implement per Task 9.
- [ ] Commit: `feat(app): mark the selected block's nearest exit`.

### Task 17: Branch run, docs, manual check, PR

- [ ] **Merge before 1 November if possible** (see Risks). If `main` gets
  its monthly data commit first, merge `main` in taking its data files, and
  repeat the branch run.
- [ ] **Branch run** (after the user confirms): dispatch `pipeline.yml` on
  `feat/mrt-distance`; about 1.5 h. Check the log (station count, no
  warnings), pull the bot's data commit, and read its summary: it should show
  only the differences from the backfill, if any.
- [ ] **CLAUDE.md:** the stations stage in the pipeline paragraph (fail-fast
  list, `OPEN_LINES`), `stations.geojson` and the new fields in the contract
  section, the station and exit layers, the nearest-exit highlight, and the
  loader in frontend internals.
  `npm run format:check`.
- [ ] **README:** feature sentence and data sources (LTA).
- [ ] **Spec:** re-read §3.6, §4.7, §5.12 and their cross-references against
  the build; fix drift; set the header date at merge.
- [ ] **Manual check**, desktop and ~375 px: each mode still works; MRT bands
  match the legend; the panel row reads right for an interchange (Outram
  Park), an LRT block (Sengkang), and a merged stop (Punggol); stations never
  take a block tap; filters leave stations visible; exits appear only
  zoomed in; the highlight marks the right exit for a block by Bukit Panjang's
  three-point Exit A and for one at HarbourFront; a broken
  `stations.geojson` (rename it locally) leaves the app working.
- [ ] Full CI-equivalent locally, then push and open the PR (after the user
  confirms): `feat(app,pipeline): show each block's nearest MRT station`.

## Risks and checks

- **The 1 November data run on `main`:** it rewrites the index, every shard,
  and `meta.json` with the old code, while this branch commits regenerated
  versions of the same files. Merged after it, the data files conflict and
  can't sensibly be merged by hand. Merge before then, or take `main`'s data
  and rerun the pipeline on the branch (Task 17).
- **OneMap without a station LTA lists:** the run fails by design (no
  override table; the user's call). The error names the station.
- **OneMap rate limit:** quick unauthenticated calls were throttled in
  testing; the pipeline uses the token and 0.2 s spacing, as geocoding does.
  Watch the branch run's log.
- **Exit coordinate churn:** LTA re-surveys exits; small distance changes may
  appear monthly. Whole metres keeps them few.
- **Index size:** measured in Task 8.
- **Station layer and block taps:** checked by test (not in the hit list) and
  by hand in dense estates near a station.
- **Station names vs block numbers:** MapLibre places labels layer by layer,
  so the drawing order decides which yields; checked in Task 9.
- **Exit labels vs block numbers:** the same placement contest as station
  names; exit labels must lose. Checked in Task 9.
- **Highlight under the mobile sheet:** the exit can sit under the sheet or
  off screen, with the fly-to unchanged by design; judged in Task 9.
- **Legend note on narrow phones:** checked in Task 9 at 320 px (popover
  from the info button).
