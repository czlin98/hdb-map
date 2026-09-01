# HDB Map — v1 Design Spec

**Date:** 2026-08-25
**Status:** Approved for planning
**Scope:** v1 (core map + block details + search)

## 1. Overview

A mobile-first, interactive web map of Singapore's ~10,000 residential HDB
blocks. Each block is an individually rendered marker (no clustering). Users
hover (desktop) to see a block's address, tap/click to open its details, and
search by address to fly to a specific block.

The system is two independent halves that meet at a set of static data files:

- A **Python data pipeline** that fetches HDB Property Information from
  data.gov.sg, geocodes each block via the OneMap Search API, and writes
  generated JSON into the repo. It runs monthly in GitHub Actions and never runs
  at request time.
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
- Search: Shadcn combobox, client-side, substring/prefix matching over block,
  full street, and postal. On select → fly + highlight + open details.
- Street names: HDB stores abbreviated forms (`ANG MO KIO AVE 3`). The pipeline
  derives a full form (`ANG MO KIO AVENUE 3`) via OneMap's canonical
  abbreviation map. **Full** street is used for geocoding, detail display, and
  search; the **abbreviated** form is used for the hover tooltip.
- Data: HDB Property Information + OneMap geocoding (lat, lon, postal).

**Deferred (see §7):** marker coloring, filtering, basemap selector,
resale prices & transactions, nearest MRT, nearby amenities, and geocode-speed
optimizations (persistent cache, token-bucket limiter).

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
│     └─ block-details/{town_slug}.json # town-bucketed detail shards (27 files)
├─ pipeline/                     # Python
│  ├─ src/
│  │  ├─ fetch.py                # pull Property Information from data.gov.sg
│  │  ├─ geocode.py              # OneMap geocoding + hard match gate
│  │  ├─ transform.py            # join + derive per-block records
│  │  ├─ export.py               # write index.geojson + detail shards + towns.json
│  │  ├─ config.py               # dataset id, endpoints, paths
│  │  └─ run.py                  # orchestrator
│  ├─ geocode_failures.csv       # committed: blk_no, street_full, reason, found
│  ├─ towns.json                 # canonical master town list (source of truth)
│  └─ tests/
├─ .github/workflows/
│  ├─ pipeline.yml               # monthly cron + manual; runs pipeline, commits data
│  └─ ci.yml                     # lint / typecheck / test on PRs and main
└─ docs/specs/
```

**Boundary decisions:**

- `app/` is the Vercel root; `public/data/` ships as static assets on the same
  origin (no CORS).
- Geocoding runs in full each month (no persistent cache in v1); only
  `pipeline/geocode_failures.csv` is committed, as the safety net that makes the
  hard gate visible.
- `towns.json` has its canonical copy under `pipeline/` (source of truth) and is
  copied into `app/public/data/` at build so the client fetches it as a static
  asset.
- Shared field names live in the data contract and are mirrored as TS types in
  `app/src/types`, hand-kept in v1 (small schema).

## 3. Data Pipeline

Four small, independently testable stages: **fetch → geocode → transform →
export**, orchestrated by `run.py`.

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
- **Match (hard gate).** A returned result qualifies only if **all three**
  hold (normalized, uppercased):
  1. `BLK_NO` == `blk_no`, exactly;
  2. `ROAD_NAME` == `street_full`, exactly;
  3. `POSTAL` is a real postal, not `NIL` or empty.

  With several qualifiers, take the first by OneMap's ranking. A block and
  street can return several results: the residential building plus businesses
  sharing the block, which come back with `POSTAL` = `NIL`; the postal
  requirement selects the residential result. With **zero qualifiers the block
  fails**: the gate never falls back to an unqualified result, choosing
  correctness over coverage so no block gets wrong coordinates or a missing
  postal. Any passing result is necessarily the right Singapore HDB block, so
  no separate coordinate-bounds check is needed.
- **Rate limit:** OneMap allows **300 calls/min** with a token. v1 throttles
  with a plain `time.sleep()` between calls (staying under the cap) plus
  retry-with-backoff on 429/5xx. (A token-bucket limiter is a deferred
  optimization, see §7.7.) Geocoding all ~10k blocks stays well within an
  Actions job budget, run once a month.
- **Failures** (no results, no gate match, or API error): the block is
  **excluded from that month's output** and retried naturally on the next
  full run. Each run writes the failures to `pipeline/geocode_failures.csv`,
  sorted and committed, with columns `blk_no, street_full, reason, found`.
  This file is the safety net that makes the hard gate visible. `reason` is
  one of `no_results` (OneMap returned nothing), `no_match` (results returned
  but none passed the gate), or `api_error` (request failed after retries);
  `found` is the number of results OneMap returned.

### 3.3 transform.py

- **Decode town:** map each record's `bldg_contract_town` **code** to its full
  `town` (plus `town_slug`) via `towns.json`; that full name becomes the
  record's `town` field. An **unknown code** (HDB added or renamed a town) has
  no mapping here, so the run **fails** with a clear error rather than emitting
  a block with no town. This is where the raw code is validated, since after
  this step the record carries `town`/`town_slug` rather than the code.
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
- Write `app/public/data/index.geojson` (all blocks, light props).
- Write `app/public/data/block-details/{town_slug}.json` bucketed by town, using
  `town_slug` values from `towns.json`.
- Copy `towns.json` into `app/public/data/`.
- **Deterministic output:** index features and detail-shard keys are sorted
  by `id`, and each record's fields keep a fixed logical order, so an
  unchanged month produces a zero-line diff and real changes stay legible in
  git.

### 3.5 Shared config, helpers & logging

- `config.py`: dataset id, endpoints, output paths, and the
  **street-abbreviation map** (`STREET_ABBREVIATIONS`, OneMap's canonical list).
  The full table is inlined into `config.py` in the pipeline plan
  ([`../plans/hdb-map-pipeline.md`](../plans/hdb-map-pipeline.md)).
- `expand_street(street)`: splits the uppercase street on whitespace and
  replaces each **whole token** that is a key in the map, leaving numerals and
  unmatched tokens untouched; result stays uppercase. Whole-token matching keeps
  `ST` (→ STREET) distinct from `ST.` (→ SAINT). Examples: `ANG MO KIO AVE 3` →
  `ANG MO KIO AVENUE 3`; `JLN BT MERAH` → `JALAN BUKIT MERAH`; `C'WEALTH CRES` →
  `COMMONWEALTH CRESCENT`. Covered by unit tests.
- Structured logging: per-run counts (fetched, geocoded, failed), and the
  failure list written to `pipeline/geocode_failures.csv`.
- Tests cover each stage with fixture data; OneMap and data.gov.sg are mocked so
  tests need no network.

## 4. Data Contract

Two artifact types plus the town master list. The **index** carries what the
map, tooltip, and search need; **detail shards** carry what the panel shows.
Detail shards are **self-contained** (they repeat the address fields) so a shard
is independently readable, an accepted and well-compressing redundancy.

### 4.1 index.geojson

One FeatureCollection, all blocks, loaded once on startup.

At ~10k features the raw file is roughly **2 MB**, but its highly repetitive
text compresses ~4–5× on the CDN to about **400–500 KB over the wire**, within
the sub-megabyte budget (§1.2). Keeping the index light (no detail fields) is
what protects that budget; detail lives in the shards.

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
        "street": "ANG MO KIO AVE 3",       // abbreviated: hover tooltip
        "street_full": "ANG MO KIO AVENUE 3", // expanded: search only (panel reads from shard)
        "postal": "560123",
        "town": "ANG MO KIO"
      }
    }
  ]
}
```

These props cover: marker geometry, the hover tooltip (`{blk_no} {street}`,
abbreviated), substring search on the full address
(`{blk_no} {street_full} {postal}`), and the `id` plus `town` that locate the
detail shard. Those `street_full`/`postal` copies serve search only; the panel
reads its address fields from the **shard**, not the index. The `id` slug is
derived from the **abbreviated** street, so it stays stable regardless of the
abbreviation map. The client resolves the shard filename from `town` via
`towns.json` (below).

### 4.2 towns.json (master list)

Canonical `pipeline/towns.json`, mirrored to `app/public/data/towns.json`. **27
entries**, well under 1 KB. Single source of truth for the town, consumed by
both the pipeline (decode, naming, validation) and the client (`town_slug`
lookup, plus the future town filter's vocabulary). Each row is
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
    "rental_units_by_type": { "1room": 40, "2room": 20 }                           // public rental; only >0; omitted/{} when none
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
- Every `town` in the index and detail exists in `towns.json`.
- Both files are written with fields in a fixed logical order, and with
  index features and shard keys sorted by `id`.
- TS types (`BlockIndexProperties`, `BlockDetail`, `FlatTypeCounts`, `Town`)
  mirror this contract in `app/src/types`, hand-kept in v1.

## 5. Frontend Architecture

### 5.1 Component tree

```
App                     // loads index + towns.json once; hosts layout
├─ MapView              // MapLibre GL: basemap + markers + hover + click
├─ SearchBox            // Shadcn combobox over the in-memory index
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

### 5.3 Data loading (`lib/`)

- On mount, fetch `index.geojson` **once** → feed (1) the MapLibre GeoJSON
  source and (2) a flat search array
  `[{id, blk_no, street_full, postal, town}]`.
- Fetch `towns.json` once → build the `town → town_slug` map.
- `getBlockDetail(id, town)` lazily fetches `block-details/{town_slug}.json`,
  caches shards in an in-memory `Map`, returns the record.

### 5.4 Map (MapView)

- **Basemap:** OpenFreeMap Positron (light, high marker contrast).
- **Initial camera & bounds.** On load the map fits the whole Singapore island
  so all of Singapore is visible at once. The view is then **locked to
  Singapore:** `maxBounds` set to a small margin around the island's bounding
  box so panning can't wander off-island, `minZoom` at about the island-fit
  level, and `maxZoom` close enough to read individual blocks and no further.
- **Source:** GeoJSON from the index, `cluster: false`.
- **`blocks-circles`** layer: circle marks, radius interpolated by zoom, single
  fixed color in v1 (coloring deferred), subtle stroke for separation. 10k
  points render on the GPU without clustering.
- **`blocks-highlight`** layer: filtered to `selectedId`, larger and distinct so
  the chosen block stands out.
- **Interactions:**
  - `mousemove` → address tooltip (`{blk_no} {street}`, **abbreviated**);
    `mouseleave` → hide, gated to hover-capable pointers (skipped on touch).
  - feature tap/click → set selection → panel opens, or **swaps in place** to
    the new block if a panel is already open.
  - empty-map tap/drag → pans/zooms as normal; does **not** dismiss an open
    panel.
  - search select → set selection + `flyTo` + highlight.
  - The map stays interactive (pan/zoom, marker taps) at all times, including
    while the panel is open (see §5.5).

### 5.5 DetailsPanel

- Reads the selection (`selectedId` + `selectedTown`), calls
  `await getBlockDetail(id, town)`, and renders the **entire panel** from the
  shard record: the header (full address `{blk_no} {street_full} {postal}`),
  then town, year completed, floors, total units, and the units-by-flat-type
  breakdown as a **Sold** group and, when present, a **Rental** group. One
  source, no split between index and shard.
- A loading skeleton fills the **whole card, including the header**, while the
  town's shard fetches. This happens only for the first block opened in a town,
  and is near-instant once that shard is cached in memory. Graceful empty state
  on a miss.
- Vaul `Drawer` (bottom sheet) on mobile, docked side panel on desktop via a
  Tailwind `md` breakpoint.
- **Non-modal: the map stays live behind the panel.** On mobile the Vaul
  `Drawer` runs in non-modal mode, so no dimmed overlay covers the map,
  background focus and scroll aren't trapped, and pan, zoom, and marker taps
  pass straight through. On desktop the docked side column is inherently
  non-modal. Panning or zooming the map, or tapping empty map, never closes the
  panel.
- **Snap points (mobile).** The Vaul `Drawer` is a resizable sheet with three
  rest positions:
  - **peek:** collapsed to ~header height, showing
    `{blk_no} {street_full} {postal}` plus a one-line summary (e.g. total
    units), so the map dominates;
  - **default:** ~half height, full details visible (the sheet opens here);
  - **full:** near-full-screen, with room to scroll and for future longer
    content.

  The user drags to expand toward **full** or minimize toward **peek**. Minimize
  and close are distinct: dragging to **peek** keeps the panel open with the map
  fully usable; only swiping **below peek** (or handle / ESC / close button)
  dismisses. Snap points are **mobile-only**; the desktop side column is a fixed
  column with its own scroll.
- **Dismiss clears selection.** Closing the panel (handle / ESC / close button
  on both platforms, or swiping below **peek** on mobile) resets `selectedId` in
  the store, which drops the `blocks-highlight` marker and returns the map to
  its unselected state.
- **Swap in place on marker change.** Tapping another marker while the panel is
  open updates the selection and the panel **re-renders to that block**, with a
  fresh skeleton only when the new town's shard isn't yet cached. This is an
  in-place content swap, not a close-and-reopen. The **current snap point is
  preserved**, so a marker tapped while peeked stays peeked and just updates the
  header, for comparing blocks without the sheet jumping to full.
- On mobile, `flyTo` applies bottom **map padding matched to the active snap
  height** so the selected marker settles in the visible area **above** the
  sheet rather than behind it (at full, centering falls back to the peek
  offset).

### 5.6 Search (SearchBox)

- Shadcn combobox, **client-side and instant**, over the in-memory index.
- **Substring/prefix matching** (not fuzzy) across block + full street + postal
  (e.g. "123 ang mo kio avenue 3" or a postal code). Matching the full form
  means a user types "Avenue", not "AVE".
- Each result renders as the full address, `{blk_no} {street_full} {postal}`.
- On select → set selection → `flyTo` + highlight + open details.

### 5.7 Initial load & error states

The whole app depends on two startup assets (`index.geojson`, `towns.json`), so
their loading and failure paths are explicit:

- **Loading.** The basemap renders immediately, since it's independent of our
  data, so there is no full-screen blocker. The markers appear once the two
  assets have fetched and the GeoJSON source is populated.
- **Fatal error.** If `index.geojson` **or** `towns.json` fails to load, the app
  can't function. A persistent, centered card over the map shows a plain error
  message ("Couldn't load block data."), with no retry control. Search and the
  details panel stay disabled.
- **Shard failure is local, not fatal.** A failed
  `block-details/{town_slug}.json` fetch is confined to the panel (the §5.5
  empty state) and never triggers the global error card, since the rest of the
  map stays usable.

### 5.8 Attribution

Required by the data providers' terms and shown via MapLibre's built-in
`AttributionControl`, so all credits live in one standard control (collapsed by
default on mobile is acceptable):

- **Basemap:** © OpenStreetMap contributors, plus OpenFreeMap.
- **Block data:** HDB/data.gov.sg (Singapore Open Data Licence), attached as
  custom attribution on the blocks source.
- **Geocoding:** OneMap/SLA.

### 5.9 Extension points

v1 leaves two hooks in place for later work: a `colorBy` slot in the circle
layer's paint expression, and a `filter` slot on the source. Both are unused in
v1, so marker coloring (§7.1) and filtering (§7.2) can be added later without
restructuring the map layers.

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

- **Triggers:** **monthly cron** + `workflow_dispatch` (manual).
- **Steps:** checkout → setup Python → install → run the pipeline. The run
  fetches a fresh OneMap token from `ONEMAP_EMAIL`/`ONEMAP_PASSWORD`, geocodes
  all blocks ≤300/min, and writes `app/public/data/*` and
  `pipeline/geocode_failures.csv`.
- **Commit only if diff**, then push. The push triggers the Vercel redeploy.
  Needs `contents: write`; a concurrency guard prevents overlapping runs.
- **Failure = safe:** if OneMap/data.gov.sg is down, the run fails with no
  commit and the last good data stays live.

**`ci.yml`** (quality gate on PRs + `main`):

- Frontend: `tsc` typecheck, ESLint, `vite build`, Vitest.
- Pipeline: Ruff lint, pytest.

**Secrets:** `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`.

**Flow:**
`cron → Actions runs pipeline → commit data → push → Vercel redeploy → CDN → users`.

## 7. Future Iterations (deferred, documented)

Ordered roughly by how they build on v1. Each is its own spec → plan →
implementation cycle.

### 7.1 Marker coloring

- Add a coloring selector driving the `colorBy` paint slot.
- First dimensions (Property Information only): **year completed**, **number of
  floors**.
- Later dimensions depend on deferred data: **median resale price**, **distance
  to MRT**.
- A "no data" state must be visually distinct from "low value" so an uncolored
  block never reads as cheap/near.

### 7.2 Filtering

- Filters hide non-matching markers via a MapLibre filter expression on the
  `blocks-circles` layer (fast, no re-fetch); coloring recolors whatever stays
  visible. Candidate filters: **town**, **year built (range)**, **number of
  floors (range)**, **flat types available**.
- **v1 structural hook:** the `blocks-highlight` layer must stay **exempt from
  the filter expression** so search can reveal a single filtered-out block (open
  its panel + fly to a visible highlighted marker) without touching the active
  filters. The reveal is scoped to the selection; closing the panel re-hides the
  block. This is why highlight is a separate layer in §5.4.

### 7.3 Basemap selector

- A control to switch the basemap among OpenFreeMap's free, no-key styles
  (Positron default, plus Liberty/Bright for more geographic context); persist
  the choice per viewer via `localStorage`.
- **Implementation note:** switching calls `map.setStyle()`, which discards all
  custom sources and layers. The selector must **re-add** the blocks source,
  `blocks-circles`, and `blocks-highlight` (plus any active `colorBy`/`filter`)
  on the `styledata` event after the new style loads; that
  re-application is the real work, not the dropdown.
- **Couples with coloring (§7.1):** busier basemaps reduce marker-color
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

### 7.5 Nearest MRT + distance

- Requires MRT station location data (OneMap / LTA DataMall) and a
  nearest-station distance computation in the pipeline.
- Powers MRT-distance coloring (§7.1).

### 7.6 Nearby amenities

- Nearby amenities and their distances to the block. Additional data sources;
  lowest priority.

### 7.7 Geocode speed: persistent cache + token-bucket limiter

- **Persistent request-response cache.** v1 re-geocodes all ~10k blocks every
  run. A committed request-response cache (key = normalized `searchVal`,
  value = the captured OneMap fields) would skip already-resolved blocks so only
  new/changed inputs are fetched, cutting a monthly run from ~33 min to near
  instant. Deferred because full monthly geocoding is simpler and also keeps
  coordinates/postal fresh; the cache trades that freshness for speed.
- **Token-bucket limiter.** v1 paces OneMap calls with a plain `time.sleep()`
  (~0.2 s/call). A token-bucket rate limiter would sustain throughput closer to
  the 300/min ceiling while still respecting the cap, and centralize backoff.
- Both are pipeline-speed optimizations with no user-facing effect.
