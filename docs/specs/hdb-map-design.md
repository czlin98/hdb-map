# HDB Map: Design Spec

**Date:** 2026-08-25 (revised 2026-10-01 to match the shipped v1; marker
coloring added 2026-10-11; filtering added 2026-10-15; flat-type filter added
2026-10-16; nearest MRT/LRT station added 2026-10-20)
**Status:** Implemented. This spec describes the app as shipped. The plans in
`docs/plans/` are the original execution record; the two v1 plans list their
later deviations under "Post-implementation deltas".
**Scope:** v1 (core map + block details + search), plus marker coloring (§5.10),
filtering (§5.11), and the nearest MRT/LRT station (§5.12)

## 1. Overview

A mobile-first, interactive web map of Singapore's ~10,000 residential HDB
blocks. Each block is an individually rendered marker (no clustering). Users
hover (desktop) to see a block's address, tap/click to open its details, and
search by address to fly to a specific block.

The system is two independent halves that meet at a set of static data files:

- A **Python data pipeline** that fetches HDB Property Information from
  data.gov.sg, geocodes each block via the OneMap Search API, finds each
  block's nearest MRT or LRT station, and writes generated JSON into the repo.
  It runs monthly in GitHub Actions and never runs at request time.
- A **React static SPA** (Vite + TypeScript) that, at runtime, fetches only its
  own static data files from the Vercel CDN. No backend, no serverless
  functions, no third-party API calls from the browser.

Those files are the **data contract** (§4): each half depends only on the
contract and can change internally without breaking the other.

### 1.1 Tech stack

- **Frontend:** React + Vite + TypeScript, MapLibre GL JS, Shadcn UI, Tailwind
  CSS. Vaul (via Shadcn Drawer) for the mobile bottom sheet. Zustand for shared
  selection state.
- **Basemap:** OpenFreeMap vector tiles (Positron style), free, no API key.
- **Pipeline:** Python.
- **Hosting:** Vercel Hobby tier (free, non-commercial).
- **Automation:** GitHub Actions (monthly cron + manual dispatch).
- **Repo:** single public GitHub monorepo.

### 1.2 Constraints

- **Free tier only.** Every service used (Vercel Hobby, OpenFreeMap, OneMap,
  data.gov.sg, GitHub Actions on a public repo) is on a free tier. No paid
  storage or compute in v1.
- **Non-commercial.** Vercel Hobby is non-commercial; monetizing would require a
  plan change.
- **Mobile-first performance.** The map must be interactive after a sub-megabyte
  initial download. The budget is the compressed (brotli/gzip) transfer of
  `index.geojson`, the one blocking asset (see §4.1 for the estimate).

### 1.3 v1 scope

**In:**

- All ~10k residential blocks as individual markers (MapLibre circle layer).
- Desktop hover → address tooltip; tap/click (mobile + desktop) → details panel.
- Details: full address (`{blk_no} {street_full} {postal}`), town, year
  completed, number of floors, total dwelling units, and units-by-flat-type
  broken out by tenure into a **sold** (owner-occupied) group and a **rental**
  (public rental) group, each listing only types with >0 units. No facilities
  flags.
- Search: Shadcn combobox, client-side, ranked substring matching over block,
  both street forms, and postal (§5.6). On select → fly + highlight + open
  details.
- Street names: HDB stores abbreviated forms (`ANG MO KIO AVE 3`). The pipeline
  derives a full form (`ANG MO KIO AVENUE 3`) via OneMap's canonical
  abbreviation map. **Full** street is used for geocoding and detail display;
  the **abbreviated** form is used for the hover tooltip. Search matches both.
- Data: HDB Property Information + OneMap geocoding (lat, lon, postal).

**Added since v1:** marker coloring by year completed or number of floors
(§5.10), filtering by town, year completed, floors, and flat type (§5.11),
and each block's nearest MRT or LRT station, with the stations on the map and
coloring by the distance to them (§5.12).

**Deferred (see §7):** further coloring modes, a collapsible sidebar, basemap
selector, resale prices & transactions, filtering by MRT distance, nearby
amenities, geocode-speed optimizations (persistent cache, token-bucket
limiter), and an About page with the full data-licence notice.

## 2. Repository Layout

```
hdb-map/
├─ app/                          # Vercel project root (React + Vite + TS)
│  ├─ src/
│  │  ├─ components/             # MapView, SearchBox, DetailsPanel (Shadcn UI)
│  │  ├─ lib/                    # data-access (getBlockDetail), search, map style, towns
│  │  ├─ store/                  # Zustand selection store
│  │  └─ types/                  # TS types mirrored from the data contract
│  └─ public/data/               # ← generated; committed by the pipeline
│     ├─ index.geojson           # light index: geometry + light props (all blocks)
│     ├─ towns.json              # master town list (mirrored from source of truth)
│     ├─ meta.json               # data-access date of the last successful run
│     ├─ stations.geojson        # MRT/LRT stations in service: name, line codes, point
│     └─ block-details/{town_slug}.json # town-bucketed detail shards (27 files)
├─ pipeline/                     # Python
│  ├─ src/
│  │  ├─ fetch.py                # pull Property Information from data.gov.sg
│  │  ├─ stations.py             # station exits (data.gov.sg) + line codes (OneMap)
│  │  ├─ geocode.py              # OneMap geocoding + hard match gate
│  │  ├─ transform.py            # join + derive per-block records
│  │  ├─ export.py               # write index.geojson + detail shards + towns.json
│  │  ├─ config.py               # dataset ids, endpoints, paths, open lines
│  │  └─ run.py                  # orchestrator
│  ├─ failed_blocks.csv          # committed: blk_no, street_full, reason, found
│  ├─ towns.json                 # canonical master town list (source of truth)
│  └─ tests/
├─ .github/workflows/
│  ├─ pipeline.yml               # monthly cron + manual; runs pipeline, commits data
│  └─ ci.yml                     # lint / typecheck / test on PRs and main
└─ docs/
   ├─ specs/                     # this spec
   └─ plans/                     # frontend + pipeline implementation plans
```

**Boundary decisions:**

- `app/` is the Vercel root; `public/data/` ships as static assets on the same
  origin (no CORS).
- Geocoding runs in full each month (no persistent cache in v1); only
  `pipeline/failed_blocks.csv` is committed, as the safety net that makes the
  hard gate visible.
- `towns.json` has its canonical copy under `pipeline/` (source of truth) and is
  copied into `app/public/data/` at build so the client fetches it as a static
  asset.
- Shared field names live in the data contract and are mirrored as TS types in
  `app/src/types`, hand-kept in v1 (small schema).

## 3. Data Pipeline

Five small, independently testable stages: **fetch → stations → geocode →
transform → export**, orchestrated by `run.py`. The stations stage (§3.6) runs
before geocoding, so a station problem fails the run in a couple of minutes
rather than after the hour-long geocode.

### 3.1 fetch.py

- Pull HDB Property Information from data.gov.sg via the dataset download
  API (initiate-download, poll for the CSV url, then fetch the full CSV in
  one request; dataset id in `config.py`).
- Keep only `residential == 'Y'`.
- **Expand street abbreviations:** derive `street_full` from the abbreviated
  `street` by token-wise replacement using the OneMap abbreviation map in
  `config.py` (`expand_street()`, see §3.5). Both forms are carried downstream:
  abbreviated `street` (tooltip) and `street_full` (geocode query, display,
  search).
- **Output:** the raw block records. Each carries `blk_no`, abbreviated
  `street`, `street_full`, `bldg_contract_town` **code** (decoded to a full name
  in transform), `year_completed`, `max_floor_lvl`, `total_dwelling_units`, and
  the per-flat-type **sold** and **rental** counts. The per-flat-type source
  columns are enumerated in the flat-type table inlined into the pipeline plan
  ([`../plans/hdb-map-pipeline.md`](../plans/hdb-map-pipeline.md),
  transform stage).

### 3.2 geocode.py

v1 geocodes **every block in full on each monthly run**, with no persistent
cache. (A committed request-response cache is a natural speed optimization
for later, see §7.7.) For each block the pipeline calls OneMap Search with
`searchVal="{blk_no} {street_full}"`, `returnGeom=Y`, `getAddrDetails=Y`, and
**reads page 1 only** (the expanded street is OneMap's own canonical
vocabulary). The matched result's fields are captured as OneMap returns them
(strings): `BLK_NO`, `ROAD_NAME`, `POSTAL`, `LATITUDE`, `LONGITUDE`;
`transform.py` parses `LATITUDE`/`LONGITUDE` to floats downstream.

- **Token:** OneMap access tokens are short-lived, so the pipeline fetches a
  **fresh token at the start of each run** using credentials stored as GitHub
  secrets (`ONEMAP_EMAIL`, `ONEMAP_PASSWORD`). No static token is stored. If the
  token request fails, **fail the run fast** with no commit (last good data
  stays live).
- **Match (hard gate).** A returned result qualifies only if **all five**
  hold (normalized, uppercased):
  1. `BLK_NO` == `blk_no`, exactly;
  2. `ROAD_NAME` == `street_full`, exactly;
  3. `POSTAL` is a real postal, not `NIL` or empty;
  4. `POSTAL` ends with the digits of `blk_no` (`216B` → ends with `216`);
  5. `LATITUDE` and `LONGITUDE` are both present and numeric, so a result
     with unusable coordinates fails this one block instead of crashing the
     whole run when `transform.py` parses them.

  With several qualifiers, take the first by OneMap's ranking. A block and
  street can return several results: the residential building plus businesses
  sharing the block, which come back with `POSTAL` = `NIL`, and sometimes
  other buildings at the same address with a real postal (2 Queen's Road
  returns both 260002 and the co-located 266733). Rules 3 and 4 select the
  residential result, since every HDB postal ends with its block number.
  With **zero qualifiers the block fails**: the gate never falls back to an
  unqualified result, choosing correctness over coverage so no block gets
  wrong coordinates or a missing postal. Any passing result is necessarily
  the right Singapore HDB block, so no separate coordinate-bounds check is
  needed.
- **Rate limit:** OneMap allows **300 calls/min** with a token. v1 throttles
  with a plain `time.sleep()` between calls (staying under the cap) plus
  retry-with-backoff on 429/5xx. (A token-bucket limiter is a deferred
  optimization, see §7.7.) Geocoding all ~10k blocks stays well within an
  Actions job budget, run once a month.
- **Failures** (no results, no gate match, or API error): the block is
  **excluded from that month's output** and retried naturally on the next
  full run. Each run writes the failures to `pipeline/failed_blocks.csv`,
  sorted and committed, with columns `blk_no, street_full, reason, found`.
  This file is the safety net that makes the hard gate visible. `reason` is
  one of `no_results` (OneMap returned nothing), `no_match` (results returned
  but none passed the gate), `no_coords` (no result passed all five rules,
  but at least one passed rules 1 to 4, so only its coordinates were
  unusable), or `api_error` (request failed after retries); `found` is the
  number of results OneMap returned. The same file also records blocks that
  transform skips for missing values (§3.3), with `found` left empty since
  those blocks geocoded fine.
- **Block-count guard.** A failure of any reason is non-fatal on its own, so
  a OneMap outage partway through a run would leave out every block geocoded
  while it lasted. Before writing, `run.py` therefore compares the run's
  block count with the live `index.geojson` and **aborts with no writes** if
  it is below `MIN_BLOCK_RATIO` (99%, in `config.py`) of it. Real monthly
  change is a few demolitions, well inside that margin; an outage or a
  truncated data.gov.sg download is not. The guard is skipped only when no
  index exists yet.

### 3.3 transform.py

- **Decode town:** map each record's `bldg_contract_town` **code** to its full
  `town` (plus `town_slug`) via `towns.json`; that full name becomes the
  record's `town` field. An **unknown code** (HDB added or renamed a town) has
  no mapping here, so the run **fails** with a clear error rather than emitting
  a block with no town. This is where the raw code is validated, since after
  this step the record carries `town`/`town_slug` rather than the code.
- **Required values:** `year_completed`, `max_floor_lvl`, and
  `total_dwelling_units` must each be present and above zero. A block missing
  any of them is **skipped and recorded** in the failures file (§3.2) with
  the reason `missing_year`, `missing_floors`, or `missing_units`, instead of
  being exported with a silent 0 that the panel would show as a real value.
  A block missing several gets one row, naming the first missing value in
  that order, so the file keeps one row per block.
  Unlike an unknown town, a blank cell is a one-block data glitch, so it
  doesn't stop the run; skipped blocks count against the block-count guard
  (§3.2), so a broken feed still does.
- **Nearest station:** the straight-line distance from the block to every
  station exit (§3.6). The nearest exit's station becomes the block's nearest
  station, with the distance in whole metres; ties go to the lower station
  `id`, so the output stays deterministic. A straight line, not a walking
  route: routing would add about 10k OneMap calls to every run, and the app
  labels the distance as straight-line (§5.12).
- Join Property Information and the geocode result into one clean per-block
  record.
- Derive two units-by-flat-type maps, **sold** and **rental**. Drop the
  `_sold`/`_rental` suffix since the map name already carries the tenure, and
  keep only types with >0 units. The source columns, resulting keys, client
  labels, and display order are the flat-type table inlined into the plans
  (source columns + keys in the pipeline plan's transform stage; client labels +
  display order in the frontend plan's `flat-types.ts`).
- Produce the two projections in §4 (light index fields vs detail
  fields).

### 3.4 export.py

- **Assert `town_slug` uniqueness** across towns, and **assert block `id`
  uniqueness** across all blocks (fail the run on any collision rather than
  silently overwriting a shard entry).
- Write `app/public/data/index.geojson` (all blocks, light props plus the
  values coloring and filtering read), compact with one block per line and
  coordinates rounded to 6 decimals (§4.1).
- Write `app/public/data/block-details/{town_slug}.json` bucketed by town, using
  `town_slug` values from `towns.json`.
- Copy `towns.json` into `app/public/data/`.
- Write `app/public/data/meta.json` with the run's data-access date (§4.6).
- Write `app/public/data/stations.geojson` (§4.7).
- **Deterministic output:** index features and detail-shard keys are sorted
  by `id`, and each record's fields keep a fixed logical order, so an
  unchanged month changes only the date in `meta.json` and real changes stay
  legible in git.

### 3.5 Shared config, helpers & logging

- `config.py`: dataset ids, endpoints, output paths, the block- and
  station-count guards' `MIN_BLOCK_RATIO` and `MIN_STATION_RATIO`, the open
  lines and station-name overrides (§3.6), and the **street-abbreviation map**
  (`STREET_ABBREVIATIONS`, OneMap's canonical list). The full table is inlined into `config.py` in the pipeline plan
  ([`../plans/hdb-map-pipeline.md`](../plans/hdb-map-pipeline.md)).
- `expand_street(street)`: splits the uppercase street on whitespace and
  replaces each **whole token** that is a key in the map, leaving numerals and
  unmatched tokens untouched; result stays uppercase. Whole-token matching keeps
  `ST` (→ STREET) distinct from `ST.` (→ SAINT). Examples: `ANG MO KIO AVE 3` →
  `ANG MO KIO AVENUE 3`; `JLN BT MERAH` → `JALAN BUKIT MERAH`; `C'WEALTH CRES` →
  `COMMONWEALTH CRESCENT`. Covered by unit tests.
- Structured logging: per-run counts (fetched, geocoded, failed), and the
  failure list written to `pipeline/failed_blocks.csv`.
- Tests cover each stage with fixture data; OneMap and data.gov.sg are mocked so
  tests need no network.

### 3.6 stations.py

Finds the stations every block is measured against, and the lines each one
serves. It takes two sources, because neither has both:

- **Exits:** LTA's MRT Station Exit dataset on data.gov.sg, a GeoJSON file
  fetched the same way as the blocks (§3.1). One point per exit, named by
  station and exit ("OUTRAM PARK MRT STATION", "Exit 1"), with no line codes.
  LRT stations are in it too. It lists only stations in service, so a station
  still being built has no exits and is never anyone's nearest. LTA adds a new
  station some months after it opens; until then the blocks around it measure
  to the next one.
- **Line codes:** OneMap Search, which names a station once per line it
  serves ("OUTRAM PARK MRT STATION (EW16)", "(NE3)", "(TE17)") or once with
  all its codes ("(TE31 / DT37)"). Only results whose name matches exactly
  count. The lookups use the run's token and are paced like geocoding
  (§3.2). The official station-code list on data.gov.sg was last updated in
  2024 and lacks whole lines, so it isn't used.

Steps:

- **One station per name.** Exit names lose their "MRT STATION" or "LRT
  STATION" suffix, so an MRT and an LRT stop sharing a name (Punggol, Choa Chu
  Kang, Bukit Panjang) become one station with the exits of both. Their exit
  names gain "MRT" or "LRT" ("LRT Exit A"), since both buildings can have an
  "Exit A". LTA lists some shared stops only once (Sengkang), so the code
  lookup searches both the MRT and the LRT form of every name.
- **Open lines only.** OneMap also gives codes for lines still being built
  (Ang Mo Kio's CR11, Jurong East's JE5). `config.py` keeps `OPEN_LINES`, the
  code prefixes of the lines in service in display order, and drops every
  other code. Showing planned codes was rejected: nothing would mark them as
  not yet open, and OneMap's are patchy (Ang Mo Kio has its Cross Island Line
  code, Pasir Ris doesn't).
- **Every station must have a code.** A station left with none fails the run
  before any write. This is how a new line announces itself: its first
  stations reach LTA's data with only unlisted codes, and the run fails until
  their prefix joins `OPEN_LINES`, a one-line change. A OneMap error during
  the lookup fails the run too, since the codes can't be partly right.
- **Name and id:** the display name is title case ("Outram Park"), with an
  override table in `config.py` for official spellings that title case gets
  wrong (HarbourFront, one-north, MacPherson). The station `id` is the slug of
  the display name.
- **Map point:** the mean of the station's exits, which lands in or beside the
  station.
- **Station-count guard:** like the block-count guard (§3.2), the run aborts
  with no writes if it finds fewer than `MIN_STATION_RATIO` (99%) of the
  stations in the live `stations.geojson`, so a truncated download can't move
  every block's nearest station. A single closure stays inside the margin.
  The guard is skipped only when no `stations.geojson` exists yet.

## 4. Data Contract

Two artifact types plus the town master list and the station list. The
**index** carries what the map, tooltip, and search need; **detail shards**
carry what the panel shows. Detail shards are **self-contained** (they repeat
the address fields) so a shard is independently readable, an accepted and
well-compressing redundancy.

### 4.1 index.geojson

One FeatureCollection, all blocks, loaded once on startup.

At ~10k features the file is about **3.5 MB** as written, and its highly
repetitive text reaches the browser as about **240 KB of brotli**, within the
sub-megabyte budget (§1.2). Two choices keep it there:

- **Coordinates rounded to 6 decimals** (~11 cm).
  OneMap returns 15-16 digits, which are noise that barely compresses;
  rounding is most of the transfer saving.
- **One block per line, no indentation.** Indentation is most of the raw
  size the phone must parse. A fully minified single line would be no
  smaller compressed, and would turn every monthly change into a whole-file
  git diff; one line per block keeps a changed block a one-line diff.

Keeping the index light is what protects that budget; detail lives in the
shards. The exceptions are the values that coloring and filtering need for
every block at once, since neither can wait for lazily loaded shards:

- `year_completed` and `max_floor_lvl`, for marker coloring (§5.10) and the
  range filters (§5.11). The two short integers add about an eighth to the
  compressed size.
- `sold_types` and `rental_types`, for the flat-type filter (§5.11): which
  types the block has units of, as the shard's unit-count keys in the
  details panel's order. Both are always present, empty when the block has
  none, so the filter never has to handle a missing list. Another eighth.
  The counts themselves stay in the shard.
- `station_distance`, for the MRT-distance coloring (§5.12): straight-line
  metres to the nearest station's nearest exit. A short integer like the
  coloring values, so about another eighth. The station itself stays in the
  shard.

Filtering also reads `town`.

```jsonc
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [103.845, 1.362] }, // [lon, lat]
      "properties": {
        "id": "123-ang-mo-kio-ave-3",       // stable slug of blk_no + abbreviated street; unique
        "blk_no": "123",
        "street": "ANG MO KIO AVE 3",       // abbreviated: hover tooltip + search
        "street_full": "ANG MO KIO AVENUE 3", // expanded: search only (panel reads from shard)
        "postal": "560123",
        "town": "ANG MO KIO",
        "year_completed": 1978,             // coloring + filtering (§5.10, §5.11); mirrors the shard
        "max_floor_lvl": 12,                // coloring + filtering (§5.10, §5.11); mirrors the shard
        "sold_types": ["3room", "4room"],   // filtering (§5.11): the shard's sold_units_by_type keys
        "rental_types": [],                 // filtering: rental_units_by_type keys; [] if none
        "station_distance": 350             // coloring (§5.12): metres; mirrors the shard
      }
    }
  ]
}
```

These props cover: marker geometry, the hover tooltip (`{blk_no} {street}`,
abbreviated), substring search on the full address
(`{blk_no} {street_full} {postal}`), the `id` plus `town` that locate the
detail shard, and the coloring and filtering values. Those `street_full`/`postal`
copies serve search only, and the coloring and filtering values serve the
map, its legend, and the filters only; the panel
reads its address fields from the **shard**, not the index. The `id` slug is
derived from the **abbreviated** street, so it stays stable regardless of the
abbreviation map. The client resolves the shard filename from `town` via
`towns.json` (below).

### 4.2 towns.json (master list)

Canonical `pipeline/towns.json`, mirrored to `app/public/data/towns.json`. **27
entries**, well under 1 KB. Single source of truth for the town, consumed by
both the pipeline (decode, naming, validation) and the client (`town_slug`
lookup, plus the town filter's list, §5.11). Each row is
`{ town, town_slug, town_code }` where `town` and `town_code` are HDB's and
`town_slug` = `town` lowercased with spaces/slashes → hyphens. The full 27-row
table seeds `pipeline/towns.json` in the pipeline plan
([`../plans/hdb-map-pipeline.md`](../plans/hdb-map-pipeline.md)).

Three fields per town, each for a distinct job:

- **`town`:** the full display name, stored under the **same field name** in the
  index and detail, and the value the client's `townToSlug()` lookup matches on.
- **`town_slug`:** the file-safe form for the shard filename. Full names contain
  spaces and slashes (`KALLANG/WHAMPOA`), which are unsafe as filenames/URLs.
- **`town_code`:** the raw `bldg_contract_town` value in HDB Property
  Information, which is a **short code** (`AMK`, `KWN`, …), not the full name.
  The pipeline decodes it to `town` here.

Because both halves read this one table, no decode or slugify algorithm has to
stay in sync, so there is no drift risk. The pipeline's town validation makes
the rare town change fail loudly. The 27 codes are HDB's current set. A newly
introduced town would surface as an unknown-code hard failure, prompting a
one-line table update.

### 4.3 block-details/{town_slug}.json

An object **keyed by `id`** for O(1) lookup after the shard loads.
Self-contained (repeats address fields).

```jsonc
{
  "123-ang-mo-kio-ave-3": {
    "blk_no": "123",
    "street": "ANG MO KIO AVE 3",         // abbreviated (mirrors index)
    "street_full": "ANG MO KIO AVENUE 3",  // expanded: used by the panel
    "postal": "560123",
    "town": "ANG MO KIO",
    "year_completed": 1978,
    "max_floor_lvl": 12,
    "total_dwelling_units": 200,
    "sold_units_by_type": { "3room": 40, "4room": 60, "5room": 20, "exec": 20 },   // only >0; keys/labels/order per the flat-type table in the plans (e.g. exec → "Executive")
    "rental_units_by_type": { "1room": 40, "2room": 20 },                          // public rental; only >0; omitted/{} when none
    "nearest_station": { "id": "ang-mo-kio", "name": "Ang Mo Kio", "codes": ["NS16"], "exit": "Exit A", "distance": 350 } // open lines only (§3.6); distance mirrors the index
  }
}
```

### 4.4 Client data access (`getBlockDetail`)

One function the panel calls to load a block's detail record:

```ts
getBlockDetail(id: string, town: string): Promise<BlockDetail>
```

It resolves `town` → `town_slug` via `towns.json` (loaded once), lazily fetches
that town's shard the first time and caches it in memory, then returns
`shard[id]`.

### 4.5 Invariants

- `id` is unique and identical wherever it appears (index key ↔ detail key).
- A block's `year_completed` and `max_floor_lvl` are the same in the index and
  its shard record.
- Every block has numeric coordinates, and a `year_completed`,
  `max_floor_lvl`, and `total_dwelling_units` above zero; blocks without them
  are left out of the output and recorded (§3.2, §3.3).
- Every `town` in the index and detail exists in `towns.json`.
- A block's `station_distance` equals its shard's `nearest_station.distance`,
  and that station exists in `stations.geojson` with the same name and codes.
- Every station has at least one line code, and every code is on an open line.
- Both files are written with fields in a fixed logical order, and with
  index features and shard keys sorted by `id`.
- TS types (`BlockIndexProperties`, `BlockDetail`, `FlatTypeCounts`, `Town`,
  `DataMeta`, `NearestStation`, `StationProperties`) mirror this contract in
  `app/src/types`, hand-kept in v1.

### 4.6 meta.json

```jsonc
{ "data_accessed": "2026-10-01" } // YYYY-MM-DD, Singapore time
```

The date the pipeline fetched the data, written on every successful run, so
each monthly run leaves a commit even when nothing else changed. A failed run
writes nothing, so the date always belongs to the data that is live. It is the
"accessed on" date the licence notice needs (§5.8).

### 4.7 stations.geojson

One FeatureCollection of the stations in service (§3.6), loaded once at
startup for the station layer (§5.12). About 190 Point features, a few KB
compressed.

```jsonc
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [103.8392, 1.2806] }, // mean of its exits
  "properties": { "id": "outram-park", "name": "Outram Park", "codes": ["EW16", "NE3", "TE17"] }
}
```

The exits themselves aren't shipped: a block's nearest exit reaches the panel
through its shard. Written like the index: one station per line, sorted by
`id`, coordinates rounded to 6 decimals.

## 5. Frontend Architecture

### 5.1 Component tree

```
App                     // loads index + towns.json once; hosts layout
├─ MapView              // MapLibre GL: basemap + markers + hover + click
├─ SearchBox            // Shadcn combobox over the in-memory index
├─ FiltersControl       // desktop: "Filters" button under the search box + its panel
├─ ColorControl         // desktop: "Color" button beside it: coloring mode menu
├─ MapOptionsControl    // mobile: one button beside the search box + a sheet with both
├─ ColorLegend          // bottom-left legend, shown while a coloring mode is on
└─ DetailsPanel         // Drawer (mobile bottom sheet) / side panel (desktop)
```

### 5.2 Shared state

A small **Zustand** store holds the selection: `selectedId` and `selectedTown`,
enough to resolve the shard and fetch the record. The panel reads its fields
from the shard, so no feature properties are cached here. The selection is
written when the user clicks a map marker or picks a search result, and read by
MapView (highlight/fly) and DetailsPanel (load detail). Zustand avoids context
re-render churn on the map. (Plain Context is an acceptable no-dependency
alternative.)

The **coloring mode** (none, year, floors, or MRT distance) is shared
state too, read by MapView, ColorControl, ColorLegend, and DetailsPanel, and
lives in a small Zustand store of its own. It is not persisted (§5.10).

The **filters** (towns, year range, floor range) live in a third small
store, read by App and the filter controls. App derives the visible blocks
once, passes the filters to MapView, and passes the visible blocks to
ColorLegend and the block count, so the legend counts what the map shows
without knowing about filters. They are not persisted either (§5.11).

### 5.3 Data loading (`lib/`)

- On mount, fetch `index.geojson` **once** → feed (1) the MapLibre GeoJSON
  source and (2) a flat search array
  `[{id, blk_no, street_full, postal, town}]`.
- Fetch `towns.json` once → build the `town → town_slug` map.
- Fetch `stations.geojson` once, alongside the index, for the station layer
  (§5.12). It isn't one of the assets the app depends on (§5.7).
- `getBlockDetail(id, town)` lazily fetches `block-details/{town_slug}.json`,
  caches shards in an in-memory `Map`, returns the record.

### 5.4 Map (MapView)

- **Basemap:** OpenFreeMap Positron (light, high marker contrast).
- **Initial camera & bounds.** On load the map fits the whole Singapore island
  (a bounding box centered on the main island's landmass) so all of Singapore
  is visible at once, re-fitting once layout settles. The view is then
  **locked to Singapore:** `maxBounds` is a looser box around the island so
  panning can't wander off-island, `minZoom` is recomputed on every resize as
  the zoom that fits the island (so a narrow phone can still see all of it),
  and `maxZoom` is 17, close enough to read individual blocks and no further.
- **North-up and flat.** Rotation and pitch are disabled for mouse, touch, and
  keyboard: they add nothing to flat markers, and an accidental twist would
  need a compass to undo.
- **Zoom buttons** (desktop only) sit bottom-right, stacked above the
  attribution ⓘ, leaving the bottom-left corner to the coloring legend
  (§5.10). Touch users pinch. The open details panel covers both controls;
  wheel, trackpad, double-click, and keyboard zoom keep working meanwhile.
- **Source:** GeoJSON from the index, `cluster: false`.
- **`blocks-circles`** layer: circle marks, radius interpolated by zoom (small
  at low zoom, a 10 px radius at zoom 17 for an easy tap target), subtle
  stroke for separation. One fixed color while coloring is off; a coloring
  mode swaps in a data-driven color (§5.10). 10k points render on the GPU
  without clustering. Active filters hide the blocks that don't match
  (§5.11).
- **`blocks-highlight`** layer: filtered to `selectedId`, larger and amber so
  the chosen block stands out.
- **Block labels** (`blocks-labels`, `blocks-highlight-label`): from zoom 16,
  each marker shows its `blk_no` beside it, since touch has no hover. Collision
  detection thins labels in dense estates; the dots always stay. The selected
  block's label is bold amber and always shown.
- **Interactions:**
  - `mousemove` over a dot or label → address tooltip (`{blk_no} {street}`,
    **abbreviated**); `mouseleave` → hide, gated to hover-capable pointers
    (skipped on touch). While a coloring mode is on, the block's exact value
    for that mode follows the address on the same line (§5.10): the legend
    only shows its band. It stays on one line, with short wording, so the
    tooltip covers as little of the map as it can.
  - dot or label tap/click → set selection → panel opens, or **swaps in place**
    to the new block if a panel is already open. Where a label overlaps
    another block's dot, the dot wins.
  - empty-map tap → **dismisses** an open panel (the close animation runs,
    then the selection clears). Drags pan/zoom as normal and never dismiss.
    Block and background taps share one handler, so a tap can't both select
    and dismiss.
  - selection (marker or search) → `flyTo` + highlight. The fly lands at
    zoom 16 or closer, so the block arrives with its neighbours labelled.
  - The map stays interactive (pan/zoom, marker taps) at all times, including
    while the panel is open (see §5.5).

### 5.5 DetailsPanel

- Reads the selection (`selectedId` + `selectedTown`), calls
  `await getBlockDetail(id, town)`, and renders the **entire panel** from the
  shard record: the header (full address `{blk_no} {street_full} {postal}`),
  then town, year completed, floors, total units, the nearest station
  (§5.12), and the units-by-flat-type breakdown as a **Sold** group and, when
  present, a **Rental** group. One source, no split between index and shard.
- While a coloring mode is on, the row for that value (year completed, floors,
  or nearest station) shows its band's color swatch. On mobile the open sheet
  covers the legend (§5.10), so the swatch is how the selected block's band
  stays readable.
- A loading skeleton fills the **whole card, including the header**, while the
  town's shard fetches. This happens only for the first block opened in a town,
  and is near-instant once that shard is cached in memory. Graceful empty state
  on a miss.
- Vaul `Drawer` (bottom sheet) on mobile, side panel on desktop, switched in
  JS by a 768 px media query (`useIsDesktop`, matching Tailwind's `md`).
- **Non-modal: the map stays live behind the panel.** On mobile the Vaul
  `Drawer` runs in non-modal mode, so no dimmed overlay covers the map,
  background focus and scroll aren't trapped, and pan, zoom, and marker taps
  pass straight through. On desktop the side panel is a right-hand Radix
  `Sheet` that slides in, also non-modal (no overlay, no focus trap, and
  clicking outside doesn't dismiss it). Panning or zooming the map never
  closes the panel; tapping empty map does (§5.4).
  - Known weakness (both mobile sheets, this one and the options sheet of
    §5.11): Vaul leaves Radix's dialog modal underneath, so while a sheet is
    open the rest of the app is `aria-hidden`. A screen reader reaches only
    the sheet, which it can still close, so nothing is out of reach, but it
    takes an extra step: the search box and the options button come back
    once the sheet closes. Desktop is unaffected. The same modal default
    also locks pointer events on the page; Vaul releases that a frame later
    for the details sheet, and the options sheet releases it itself, since
    it opens through its `open` prop, which Vaul's release misses.
- **Snap points (mobile).** The Vaul `Drawer` is a resizable sheet with three
  rest positions:
  - **peek:** 95 px, enough for the header
    `{blk_no} {street_full} {postal}` even when a long address wraps to two
    lines, so the map dominates;
  - **default:** half height, full details visible (the sheet opens here);
  - **full:** full-screen. Content scrolls only at this snap (a Vaul
    constraint); below it, a drag anywhere on the sheet moves the sheet.

  The user drags to expand toward **full** or minimize toward **peek**. Minimize
  and close are distinct: dragging to **peek** keeps the panel open with the map
  fully usable; only swiping **below peek** (or the close button, ESC, or an
  empty-map tap) dismisses. Snap points are **mobile-only**; the desktop side
  panel is a fixed column with its own scroll.
- **Dismiss clears selection.** Closing the panel (close button / ESC /
  empty-map tap on both platforms, or swiping below **peek** on mobile) plays
  the close animation, then resets the selection in the store, which drops the
  `blocks-highlight` marker. The map itself stays still. On mobile, opening the
  options sheet closes the panel the same way (§5.11).
- **Swap in place on marker change.** Tapping another marker while the panel is
  open updates the selection and the panel **re-renders to that block**, with a
  fresh skeleton only when the new town's shard isn't yet cached. This is an
  in-place content swap, not a close-and-reopen. On mobile the sheet **returns
  to the default (half) snap** for each new selection, so its details are
  visible.
- On mobile, `flyTo` **offsets** its target into the visible band between the
  search box's bottom edge and the sheet at its active snap, so the selected
  marker settles there rather than behind either. An offset, not map padding:
  padding outlives the fly, and clearing it when the sheet closes would slide
  the whole map. At **full** the sheet covers the map, so the fly is skipped.

### 5.6 Search (SearchBox)

- Shadcn combobox (cmdk), **client-side and instant**, over the in-memory
  index. Centered at the top on mobile, top-left on desktop. On desktop the
  Filters and Color buttons sit in a row beneath it; on mobile one options
  button sits beside it and the box narrows to make room (§5.11).
- Search ignores the filters: every block is always findable, and picking
  one that the filters hide still opens and highlights it (§5.11).
- **Normalized, ranked substring matching** (not fuzzy). Query and index are
  uppercased, apostrophes dropped (`GEORGE'S` matches `GEORGES`), and other
  punctuation split into words. Each row's search text covers block + full
  street + abbreviated street + postal, so "avenue", "ave", and a postal code
  all match. A leading "blk" or "block" is ignored.
- Every query word must appear somewhere in a row's search text, mid-word
  included ("ave" matches inside "AVENUE"). Rows rank by match quality per
  word: exact block number (first word only; "104" also matches 104A/104B) >
  whole word > word prefix > mid-word, with a whole-phrase hit breaking ties
  so "ave 3" prefers Avenue 3 over block 3. Remaining ties keep `id` order.
  At most **50** results; the query is capped at 50 characters.
- Each result renders as the full address, `{blk_no} {street_full} {postal}`.
- On select → set selection → `flyTo` + highlight + open details. The query
  stays in the box and the list collapses; it reopens with the same results on
  a click, tap, typing, or arrow key. A clear (×) button empties it.
- The list closes when focus or a tap lands outside the search box. ESC in the
  search box hides the list, drops focus, and closes any open details panel,
  but keeps the query.

### 5.7 Initial load & error states

The whole app depends on two startup assets (`index.geojson`, `towns.json`), so
their loading and failure paths are explicit:

- **Loading.** The basemap renders immediately, since it's independent of our
  data, so there is no full-screen blocker. The markers appear once the two
  assets have fetched and the GeoJSON source is populated.
- **Fatal error.** If `index.geojson` **or** `towns.json` fails to load, the app
  can't function. A persistent, centered card over the map shows a plain error
  message ("Couldn't load block data."), with no retry control. Search and the
  details panel are hidden.
- **Shard failure is local, not fatal.** A failed
  `block-details/{town_slug}.json` fetch is confined to the panel (the §5.5
  empty state) and never triggers the global error card, since the rest of the
  map stays usable.
- **Station failure is local too.** A failed `stations.geojson` fetch leaves
  the station layer off the map, with no error card. The panel's
  nearest-station row comes from the shard, so it still shows.

### 5.8 Attribution

Required by the data providers' terms and shown via MapLibre's built-in
`AttributionControl` in compact mode at every screen size (it starts expanded
and collapses to an ⓘ toggle on the first map drag), so all credits live in
one standard control:

- **Basemap:** "OpenFreeMap © OpenMapTiles Data from OpenStreetMap", supplied
  automatically by the OpenFreeMap tile source.
- **Block and station data, geocoding, and line codes:** "© HDB, LTA,
  OneMap/SLA", attached as custom attribution on the blocks source. LTA
  supplies the station exits (§3.6).

They also collapse when a block is selected, since the details sheet or panel
covers their corner, and on a phone when a coloring mode turns on, since there
the expanded credits span the screen's width (§5.10).

**Open question:** the Singapore Open Data Licence v1.0 asks for a
conspicuous notice naming the dataset, its access date and source, and
linking the licence ("Contains information from {dataset} accessed on {date}
from {source} which is made available under the terms of the Singapore Open
Data Licence version 1.0"). Neither the current credit nor the longer one it
replaced ("Block data © HDB/data.gov.sg (Singapore Open Data Licence);
Geocoding © OneMap/SLA") meets that in full. The planned fix is a separate
**About page** carrying the full notice, since the attribution control has no
room for it; it is deferred, with its design in §7.8.

### 5.9 Extension points

`blocks-highlight` (and its label) are separate layers from
`blocks-circles`, which is what lets filtering (§5.11) hide blocks without
ever hiding the selected one. Anything else that hides markers should set
its condition on `blocks-circles` and `blocks-labels` the same way, and
leave the highlight layers alone. `blocks-labels` also filters out the
selected block (its label is drawn by `blocks-highlight-label`), so a new
condition must be combined with that one, not replace it. The station layers
(§5.12) are separate from all of these, and nothing hides them.

### 5.10 Marker coloring

Colors every block by one value at a time, so island-wide patterns (where the
old estates are, where the tall blocks cluster) show at a glance.

- **Modes:** no coloring, **year completed**, **floors** (`max_floor_lvl`), or
  **MRT distance** (`station_distance`, §5.12). Every visit starts with no
  coloring, and the choice is not remembered between visits: picking a mode
  again is two taps, which didn't justify the storage handling.
- **Stepped bands, not a continuous gradient,** so each dot reads as one
  legend entry. Six bands per mode, about as many steps as a sequential ramp
  keeps distinguishable on small dots. The exact edges live in the code; the
  rules behind them:
  - **Year** uses decades, the unit people already describe estates by, so
    each step of color is the same span of time. The old end is merged into
    one "before 1980" band, and the newest end is split into the 2010s and
    "2020 and later", because the newest blocks matter to more users than the
    split between the very oldest. The open-ended top band grows with each
    monthly refresh, so the bands need a review when the 2030s start.
  - **Floors** has edges at the data's natural breaks. Block heights cluster
    at a few standard values, so each common height sits at the top of its
    band and none is split across two. The tallest towers get their own top
    band so they stand out.
- **Palette:** ColorBrewer sequential ramps, yellow-green-blue for year and
  blue-purple for floors, light to dark meaning older to newer and lower to
  taller. The hard constraint is that no band may resemble the amber selected
  marker. Bands resembling the plain blue used while coloring is off are fine,
  since the active mode is always shown. Known weakness: each ramp's lightest
  band has low contrast against the Positron land color at island zoom (§7.1).
- **Rendering:** the mode swaps the fixed `circle-color` on `blocks-circles`
  for a step expression over the mode's value in the index (§4.1). Highlight
  and label layers are unchanged, so the selected block stays amber in every
  mode.
- **Picker:** the choices are No coloring, Year completed, Floors, and MRT
  distance.
  - Desktop (ColorControl): a "Color" button in the row under the search
    box, after Filters (§5.11), opens them as a menu that closes on a pick.
    The button names the active mode ("Color: Year").
  - Mobile: the same choices are the Color section of the options sheet
    (§5.11). There they
    are one compact row of short labels instead of a list, which leaves
    the filters room at the sheet's half height. Picking one leaves the
    sheet open.
  - It sits at the top, not in the legend, because later modes (resale price
    with its own options; §7.1) won't fit a small card, while a menu can grow.
- **Legend (ColorLegend):** in the bottom-left corner, inset like the search
  box, and shown only while a mode is on.
  - Desktop: a card titled by the mode, listing the bands with the highest on
    top (so up reads as newer or taller), each with its block count.
  - Mobile: a compact ramp under the mode's title, the bands joined light to
    dark from left to right, with short labels and no counts. The title
    matters most here, since the mobile options button never names the mode. It is sized
    to its content rather than a fixed width, so it leaves room on narrow
    phones. The details sheet covers it, even at its peek height, and
    uncovers it as it closes (§5.5 covers the selected block's band).
  - Not collapsible: turning coloring off removes it, and a colored map
    without its key is hard to read. A × at the end of its title row turns
    coloring off in one tap (the menu's "No coloring" takes two), and focus
    moves to the Color button (on mobile, the options button). It fits in
    the title line, so the legend stays shorter than the mobile sheet's
    peek height.
  - Sharing the bottom edge with the credits (mobile): turning on a mode
    collapses the expanded credits to the ⓘ (§5.8), and the legend hides
    while the user has them open. Desktop is wide enough for both.
- **Counts** are computed in the browser from the loaded index. Under a
  filter (§5.11) they cover the visible blocks only, so they always add up
  to what the map shows. A band with no visible blocks stays in place,
  greyed, so the scale doesn't shift as filters change.

### 5.11 Filtering

Hides the blocks that don't match, so the map can show only one town's
blocks, only the towers above a given height, or only the blocks with
rental flats. Filters combine with coloring (§5.10): a coloring mode colors
whatever stays visible.

- **Filters:** town, year completed, floors, and flat types. A block shows
  only if it passes every filter that is on. A filter is off while nothing
  is ticked or picked, or its range spans all the data.
  - **Town:** a checklist of the towns in `towns.json`, each with its total
    block count (not narrowed by the other filters), folded into one row
    that names the current choice. Ticking several shows the blocks in any
    of them. On desktop the open list scrolls on its own, so the range
    filters below it stay in reach.
  - **Year completed** and **floors:** each a two-thumb range slider with a
    "from" and a "to" number box. The slider sweeps a range quickly; the
    boxes give an exact value, which a thumb can't on a phone-width track.
    A typed value is clamped to the data's range and can't cross the other
    end. The limits come from the loaded index, so they follow each data
    refresh.
  - A range, not the legend's bands (§5.10), because exact cut-offs matter
    ("built before 1986") and a band picker can only offer the band edges.
  - **Flat types:** two groups of toggle chips, **Sold** and **Rental**,
    with the same type names and order as the details panel (§5.5). A block
    shows if it has units of any chosen type, in either group, so it is one
    filter with one reset. The groups stay separate because rental blocks
    are a small minority that a combined list would bury, and because a
    block that rents out 3-Room flats may sell none.
  - The chips carry no block counts, unlike the town list: a number beside
    "4-Room" reads as a number of flats, not blocks. A chip that matches only a
    handful of blocks shows up in the count line (below) the moment it is
    picked.
- **Reset:** each filter's title carries a reset icon (↺) while that filter
  is on, a small header control like the legend's × (§5.10). It also marks
  the filter as on, which the number boxes can't, since they always show
  numbers. "Clear all" resets every filter.
- **Count:** "Showing N of M blocks", at the foot of the desktop panel and
  in the mobile sheet's header, where it stays in view at every rest
  position. There is no separate message when nothing matches: zero is one
  more count, and Clear all sits with the filters.
- **Not remembered** between visits and not part of the URL, like the
  coloring mode (§5.10).
- **Rendering:** one MapLibre filter expression over the index's `town`,
  `year_completed`, `max_floor_lvl`, `sold_types`, and `rental_types`
  (§4.1), set on `blocks-circles` and `blocks-labels` (combined with the
  labels' own condition, §5.9). Nothing is re-fetched. A hidden block has
  no tooltip and can't be tapped. The map never moves when a filter
  changes: a camera that jumped mid-drag of a slider would be disorienting.
- **The selected block always shows.** The highlight layers are exempt from
  the filter (§5.9). Search ignores the filters (§5.6), so picking a hidden
  block still flies to it, highlights it, and opens its details; and a block
  that a filter change hides while its details are open stays highlighted.
  Either way it is hidden again once the details close.
- **Desktop (FiltersControl):** a "Filters" button, then the Color button
  (§5.10), in a row under the search box.
  - A row of their own, because beside the search box the three made a bar
    long enough for the details panel (§5.5) to cover on narrower windows,
    and left the filter panel hanging far from the left edge, into that
    panel's space. Under the search box each menu opens beneath its own
    button, in a column the search box already occupies.
  - Filters comes first so its panel sits at the left edge, and so the Color
    button's label can change length without moving anything.
  - The button shows the number of filters that are on.
  - Its panel is non-modal and stays open through pans, zooms, and block
    selection, so the map can be watched while a filter is adjusted and the
    remaining blocks inspected beside it. Otherwise it dismisses like the
    details panel (§5.5), and together with it: ESC or a tap on empty map
    closes both, so there is no order of panels to learn. Its button closes
    it too. The Color menu still closes on a pick.
  - Only one of the two is open at a time: opening the Color menu closes the
    filter panel, and the other way round, since the menu would otherwise
    open on top of the panel.
  - While search results are showing, their list covers the row and any open
    filter panel; both are back once the list closes.
  - With a coloring mode on, the panel stops above the legend, which shares
    its column, and scrolls.
- **Mobile (MapOptionsControl):** one options button beside the search box
  opens a bottom sheet with a Color section (§5.10) and a Filters section.
  - One button, because a second would squeeze the search box on a narrow
    phone; and the filters need a sheet anyway, where the coloring choices
    fit as one short row.
  - The button shows the number of filters that are on, or a dot when only
    a coloring mode is.
  - Color comes first: it is the smaller, separate feature, and under the
    filters it would read as one more filter and sit below the fold.
  - The sheet is non-modal like the details sheet (§5.5): the map stays live
    above it and updates as filters change. It covers the legend at every
    rest position, peek included, and the coloring key is not repeated
    inside it; closing the sheet brings the legend back.
  - It has the details sheet's drag gestures and its full rest position
    (§5.5), but its other two rests are sized to its content rather than to
    the screen: content scrolls only at **full**, and at half height the
    floors filter fell below the sheet's edge on shorter phones. The middle
    rest, where it opens, shows the Color row and the town, year, and floors
    filters, and ends just above the flat-type filter's title, rather than
    cutting through it. The flat-type chips and the expanded town list need
    full. **Peek** shows the header and the Color row, so the coloring can
    be switched with most of the map in view. The legend stays covered
    there too, so until the sheet closes the colors read only from light to
    dark (older to newer, lower to taller).
  - A slider's thumbs are exempt from the sheet's drag, so dragging one
    moves the thumb, not the sheet.
  - Focusing a number box leaves the sheet where it is: the browser brings
    the box into view above the on-screen keyboard, and back when it
    closes. Raising the sheet as well overshot it on iOS, where Safari's
    own move adds to the sheet's.
  - One sheet at a time: selecting a block (on the map or from search)
    closes the options sheet and opens that block's details, and opening
    the options sheet closes any open details, which clears the selection.
    Filters and coloring are unaffected either way.
  - It closes the way the details sheet does: its Done button, a swipe below
    peek, ESC, or a tap on the map. The options button closes it too.

### 5.12 Nearest station

Shows each block's nearest MRT or LRT station and how far it is, and draws
the stations on the map, which the Positron basemap leaves out.

- **What counts:** every MRT and LRT station in service (§3.6). A shared
  MRT/LRT stop is one station, and an interchange is one station with all its
  lines. The distance runs to the station's nearest exit in a straight line,
  and the app says "straight line" wherever it gives the distance, so it isn't
  read as a walk.
- **Details panel (§5.5):** a row naming the nearest station, its line codes,
  and the distance, such as "Outram Park · EW16 NE3 TE17 · 350 m". It reads
  from the shard, so it needs no extra fetch. Wording and layout are settled
  with the UI mocks.
- **Coloring mode (§5.10):** "MRT distance", in bands of roughly 400 m, about
  five minutes' walk each. "MRT" stands for the whole network, LRT included,
  as it does in common use and in LTA's own "MRT Station Exit" data; the
  legend says so, and the panel names the actual station. The edges, palette,
  and which end is dark are settled with the UI mocks. There is no "no data"
  band, since every block has a nearest station.
- **Station layer:** every station in `stations.geojson` (§4.7), with its name.
  Stations never take a block's hover or tap, and filters don't hide them
  (§5.9). Marker style, label zoom, and whether a station responds to hover
  or tap are settled with the UI mocks.
- **Not in this iteration:** filtering by distance (§7.2), and the later
  refinements in §7.5.

## 6. Deployment & CI

### 6.1 Vercel

- Project root = `app/`, Vite preset (`vite build` → `dist/`). Free Hobby tier.
- Everything in `app/public/`, including `data/`, is served from the CDN, same
  origin.
- Auto-deploys: production on push to `main`, preview deploys on PRs.
- **Serving fresh data:** data filenames are stable but content changes monthly.
  A new deploy purges the CDN, so each pipeline commit → redeploy → fresh files.
  Set a modest `Cache-Control` (max-age + revalidate) on `/data/*` so browsers
  re-check after a refresh.

### 6.2 GitHub Actions

**`pipeline.yml`** (data refresh):

- **Triggers:** **monthly cron** (08:00 SGT on the 1st) + `workflow_dispatch`
  (manual). The data commit is labelled `monthly` or `manual` accordingly.
- **Commit message:** names what the run found, so a refresh can be read
  without opening the data diffs:
  - only `meta.json` changed: `chore(data): monthly check, no data changes
    (2026-11-01)`;
  - blocks added, removed, or changed: `chore(data): monthly HDB data refresh
    (2026-11-01): +21 -0 ~46`, with a summary in the body;
  - only the failure list changed: `chore(data): monthly check, failed blocks
    changed (2026-11-01)`, with the summary.
- **Run summary:** the pipeline compares the data and the failure list before
  and after its write (`summarize.py`). It lists the blocks added, the blocks
  removed with why (gone from HDB's data, or failed this run), and each
  changed block's fields with both values, coordinates as stored, so even a
  small geocode shift shows. The failure list's count and its newly failing,
  fixed, and changed entries follow. Long lists are cut short, with the full
  count kept. The same text goes in the commit body and on the run's summary
  page in Actions. Stations added or removed are listed as well; a block whose
  nearest station or distance moved shows as a changed block like any other.
  It only describes the run, so any failure in it logs a warning and the data
  is committed with the plain message.
- **Steps:** checkout → setup Python → install → run the pipeline. The run
  fetches a fresh OneMap token from `ONEMAP_EMAIL`/`ONEMAP_PASSWORD`, geocodes
  all blocks ≤300/min, and writes `app/public/data/*` and
  `pipeline/failed_blocks.csv`.
- **Commit only if diff**, then push. The push triggers the Vercel redeploy.
  Needs `contents: write`; a concurrency guard prevents overlapping runs.
- **Failure = safe:** if the OneMap token request, a data.gov.sg fetch, the
  station lookup (a station with no open-line code, or a OneMap error), or
  town decoding fails, or the block- or station-count guard trips (§3.2,
  §3.6), the run stops before any write, so nothing is committed and the last
  good data stays live. The failed run shows in Actions, and GitHub notifies
  the user who created the workflow or last changed its cron schedule.

**`ci.yml`** (quality gate on PRs + `main`):

- Frontend: Prettier check, `tsc` typecheck, ESLint, `vite build`, Vitest.
- Pipeline: Ruff lint, Ruff format check, pytest.

**Secrets:** `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`.

**Flow:**
`cron → Actions runs pipeline → commit data → push → Vercel redeploy → CDN → users`.

## 7. Future Iterations (deferred, documented)

Ordered roughly by how they build on v1. Each is its own spec → plan →
implementation cycle.

### 7.1 Marker coloring: later modes and refinements

Coloring by year completed and floors shipped (§5.10). Still to come:

- **More modes** once their data exists, starting with **median resale
  price** (§7.4), a new entry in the coloring menu. The mobile sheet's
  compact Color row (§5.10) only holds a few short choices, so it needs
  revisiting when they arrive.
- A **"no data" state** visually distinct from "low value", so an uncolored
  block never reads as cheap or near. Year, floors, and MRT distance don't
  need one, since every block has all three (§4.5); price will.
- **Refinements deferred on purpose**, to revisit after real use:
  - the palettes, starting with the low-contrast lightest band, and the band
    edges;
  - a collapsible legend, if the mobile strip proves to get in the way;
  - sliding the desktop zoom buttons and ⓘ left with the open details panel,
    so they stay visible and usable instead of being covered.

### 7.2 Filtering: later refinements

Filtering by town, year completed, floors, and flat type shipped (§5.11).
Still to come:

- **A collapsible sidebar** on desktop holding search, coloring with its
  legend, and filters in one full-height column, in place of the floating
  controls. Deferred as a larger redesign than filtering needed; it becomes
  more attractive as more controls arrive (§7.3 to §7.6).
- **The legend as a control:** hovering a band to pick it out on the map, or
  clicking one to filter by it.
- **Flying to the matches** when none of them are in view.
- **Filtering by MRT distance** (§5.12): a range like year and floors,
  over the index's `station_distance`. The planned follow-up to §5.12.

### 7.3 Basemap selector

- A control to switch the basemap among OpenFreeMap's free, no-key styles
  (Positron default, plus Liberty/Bright for more geographic context); persist
  the choice per viewer via `localStorage`.
- **Implementation note:** switching calls `map.setStyle()`, which discards
  all custom sources and layers. The selector must **re-add** the blocks
  source, and all four block layers (circles, highlight, and both label
  layers), plus the station source and layers (§5.12) and any active coloring
  or filter, on the `styledata` event after the new style loads; that
  re-application is the real work, not the dropdown. The label layers also
  depend on the style's glyphs serving `Noto Sans Regular`/`Bold`.
- **Couples with coloring (§5.10):** busier basemaps reduce marker-color
  legibility, so neutral styles remain preferred while a coloring mode is
  active.
- **Free-tier boundary:** stays within OpenFreeMap. Satellite/aerial imagery
  generally needs a keyed, non-free provider and is out of scope under the
  free-tier constraint. A dark basemap would pair with a future dark theme.

### 7.4 Resale prices & transactions

- **Source:** data.gov.sg Resale Flat Prices, one dataset powering both the
  median price mode and the raw transaction list; recency window last 12 months
  (widen or mark "no data" on thin coverage).
- **Median price.** One **"Price"** mode with two lenses: **user-selectable flat
  type** (default 4-room, matches how people shop) and a **blended $/sqm index**
  (`median(resale_price / floor_area_sqm)`, better coverage since any
  transaction contributes). Avoid a naive overall-median-across-types, which
  silently blends 2-room and 5-room and misleads.
- **Latest transactions.** Raw recent sales per block (the payload bloat driver
  deferred from v1). Transaction history is the natural candidate to
  shard/lazy-load separately if detail shards grow large; the object-storage
  path (Vercel Blob / R2, still free tier) is the escape hatch if committed data
  ever strains git.

### 7.5 Nearest station: later refinements

The nearest station, its distance, and the station layer shipped (§5.12).
Still to come:

- **Planned lines marked as future,** such as "CR11 (future)" at Ang Mo Kio.
  It needs a complete list of planned interchanges of its own, since OneMap's
  planned codes are patchy (§3.6).
- **The nearest station on each line,** for someone who needs one line in
  particular rather than any station.
- **Walking distance,** if a free routing source can cover every block within
  a run's time budget.
- **Searching by station,** such as "Bishan MRT", flying to the station so
  the blocks around it are in view.

### 7.6 Nearby amenities

- Nearby amenities and their distances to the block. Additional data sources;
  lowest priority.

### 7.7 Geocode speed: persistent cache + token-bucket limiter

- **Persistent request-response cache.** v1 re-geocodes all ~10k blocks every
  run. A committed request-response cache (key = normalized `searchVal`,
  value = the captured OneMap fields) would skip already-resolved blocks so only
  new/changed inputs are fetched, cutting a monthly run from ~1.5 h to near
  instant. Deferred because full monthly geocoding is simpler and also keeps
  coordinates/postal fresh; the cache trades that freshness for speed.
- **Token-bucket limiter.** v1 paces OneMap calls with a plain `time.sleep()`
  (~0.2 s/call). A token-bucket rate limiter would sustain throughput closer to
  the 300/min ceiling while still respecting the cap, and centralize backoff.
- Both are pipeline-speed optimizations with no user-facing effect.

### 7.8 About page and licence notice

Closes the §5.8 open question: the full Singapore Open Data Licence v1.0
notice, which the attribution control has no room for. It builds on none of
the iterations above and can ship at any time; until it does, v1 does not
fully meet the licence's notice requirement.

- **Form:** an overlay over the map (a Radix dialog), full-screen on mobile and
  centered on desktop, with no separate URL or router. Closing it returns to
  the map as it was.
- **Content:** the licence notice ("Contains information from HDB Property
  Information accessed on {date} from data.gov.sg which is made available
  under the terms of the Singapore Open Data Licence version 1.0", each source
  linked), the same notice for LTA's MRT Station Exit dataset (§3.6), the
  OneMap/SLA geocoding and line-code credit, the OpenStreetMap / OpenMapTiles /
  OpenFreeMap basemap credit, and a link to the source code.
- **Data:** the date is `meta.json`'s `data_accessed` (§4.6), fetched when the
  overlay first opens rather than at startup, so it adds nothing to the first
  load. If that fetch fails, the notice reads "accessed monthly" and the rest
  still shows; it never triggers the global error card (§5.7).
