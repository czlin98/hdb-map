# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## What this is

An interactive web map of Singapore's ~10,000 residential HDB blocks. Every block is an individually
rendered marker (no clustering). The system is **two independent halves that meet at a set of static
JSON files, the data contract** (`app/public/data/`). Each half depends only on the contract and can
change internally without breaking the other:

- **`pipeline/`**: Python. Fetches HDB Property Information from data.gov.sg, geocodes each block
  via the OneMap API, and _writes_ the contract JSON into `app/public/data/`. Runs monthly in GitHub
  Actions, never at request time.
- **`app/`**: React 19 + Vite + TypeScript static SPA. At runtime _reads_ only those static files
  from the CDN. No backend, no serverless functions, no third-party API calls from the browser.

Data flow: `cron → Actions runs pipeline → commits data → Vercel redeploy → CDN → users`.

The two halves have separate toolchains and separate CI jobs; `cd` into the relevant directory
before running commands.

## Commands

**Frontend** (run in `app/`):

- `npm run dev`: Vite dev server
- `npm run build`: `tsc -b && vite build` (type-check then bundle)
- `npm run lint`: ESLint
- `npm run format`: Prettier write; `npm run format:check` verifies without writing (matches CI)
- `npm run test`: Vitest (watch); `npm run test -- --run` for a single CI-style pass
- Single test file: `npx vitest run src/lib/search.test.ts`
- Type-check only (matches CI): `npx tsc --noEmit`

**Pipeline** (run in `pipeline/`; requires Python 3.14):

- `pip install -r requirements-dev.txt`
- `pytest`: all tests; `pytest tests/test_transform.py` for one file; `pytest -k geocode` to filter
- `ruff check src tests`: lint; `ruff format src tests` formats, `ruff format --check src tests`
  verifies (matches CI)
- `python src/run.py`: the full pipeline against the live APIs. Requires `ONEMAP_EMAIL` /
  `ONEMAP_PASSWORD` env vars, geocodes all ~10k blocks (~1.5 h), and overwrites the contract in
  `app/public/data/`. Prefer a manual dispatch of the `pipeline` workflow, which commits the result.

CI (`.github/workflows/ci.yml`) runs both jobs on every PR: ruff check + ruff format check + pytest
for the pipeline; format:check + tsc + lint + build + vitest for the frontend.

## The data contract (`app/public/data/`)

This is the interface between the two halves. `export.py` writes it and `app/src/types/contract.ts`
types it. **Keep these two in sync when changing any field.** Files:

- `index.geojson`: one Point `Feature` per block, with lightweight properties (`id`, `blk_no`,
  `street`/`street_full`, `postal`, `town`) plus the two marker-coloring values (`year_completed`,
  `max_floor_lvl`, mirrored from the shard), since coloring needs every block at once. Loaded whole
  at startup; drives the map and the search index. Written compact, one block per line, coordinates
  rounded to 6 decimals (`export.py`).
- `block-details/{town_slug}.json`: heavy per-block detail (unit counts, year, floors) **sharded by
  town** and keyed by block `id`. Lazy-loaded one shard at a time and cached (`createGetBlockDetail`
  in `app/src/lib/data.ts`). A shard is written for _every_ town, even empty ones.
- `towns.json`: town → slug → code mapping. `towns.json` also lives at `pipeline/towns.json` as the
  pipeline's input; the app copy is generated.
- `meta.json`: `data_accessed`, the Singapore-time date of the last successful run. Rewritten on
  every run, so each monthly run commits even when the data is unchanged.

**Block `id`** is the join key across everything: `slugify("{blk_no} {street}")` using the
_abbreviated_ street (`make_id` in `pipeline/src/config.py`). It is the GeoJSON feature id and the
detail-shard key. Outputs are written deterministically (id-sorted, stable key order) so monthly
diffs stay minimal.

## Pipeline internals

`run.py` orchestrates four stages: `fetch → geocode → transform → export`. It is **fail-fast**:
token auth, town loading, and fetching all happen _before_ any file is written, and an unknown town
code in `transform` raises rather than writing partial output, so a failed run never corrupts the
committed contract. Per-block problems are non-fatal instead: a geocode failure (including a match
with unusable coordinates), or a block that `transform` skips for a missing year, floor count, or
unit total, is left out and written to `pipeline/failed_blocks.csv` (committed alongside the data)
with its reason. The block-count guard caps them: a full run that would write fewer than
`MIN_BLOCK_RATIO` (99%) of the live blocks aborts before any write. Street abbreviations
(`AVE`→`AVENUE`, etc.) are expanded via whole-token matching in `config.py`.

## Frontend internals

`App.tsx` loads `index.geojson` + `towns.json` once, builds the search index and the cached
detail-loader with `useMemo`, and holds the loading/ready/error state. Block selection lives in a
small Zustand store (`store/selection.ts`, `selectedId` + `selectedTown`); the town is needed to
pick the right detail shard. Layout is mobile-first: a Vaul drawer with snap points on mobile vs. a
side panel on desktop (`useIsDesktop`, 768px breakpoint), and map fly-to padding is adjusted to keep
the selected marker visible above the sheet. Basemap is OpenFreeMap (Positron) vector tiles via
MapLibre GL, free, no API key.

Marker coloring: `lib/coloring.ts` is the single definition of the bands (edges, labels, colors) and
derives the MapLibre `step` expression, the band lookup, and the legend counts from it. The active
mode lives in its own Zustand store (`store/color.ts`, not persisted). `ColorControl` (the menu
beside the search box), `ColorLegend` (bottom-left), and the details panel's band swatch read the
store; `MapView` gets the mode as a prop and swaps `circle-color` with `setPaintProperty`.

## Code style

- **Comments explain _why_, not _what_.** See [Code comments](#code-comments) below; match the
  surrounding file's density and idiom.
- **Avoid em dashes** in code comments, commit messages, Markdown, and user-facing copy. Use commas,
  colons, or parentheses instead.
- **Line length is 100 columns.** Prettier wraps TS/JS code and the maintained Markdown
  (`CLAUDE.md`, `README.md`), and ruff checks Python, comments included. Prettier never wraps or
  flags comments, so keep TS/JS and CSS comments within 100 columns yourself. The `docs/specs` and
  `docs/plans` design docs are frozen artifacts full of illustrative embedded code, so they are
  exempt from the formatter (`.prettierignore`); leave their formatting as-is.

### Code comments

A comment earns its place only by saying something the code can't. Write one for:

- **A reason:** why this approach, when a simpler-looking one would be wrong.
- **A workaround:** name the library and the behaviour it works around.
- **A coupling:** a constraint shared with another place; name that place.
- **A surprise:** external data or code behaving in a way a careful reader wouldn't expect.
- **A magic number:** where it comes from or what breaks if it changes.

Don't write a comment that:

- restates the code, or explains a name that should be renamed instead;
- records what the code used to do or why it changed, which belongs in the commit message (a test
  may name the regression it guards);
- states a guessed reason as fact; if you can't confirm why, ask, or flag it in the PR;
- keeps dead code or an untracked TODO; delete the code, and link a TODO to an issue.

Form:

- One line by default, at most three. If it needs more, simplify the code or move the detail to the
  PR description.
- Put a comment above the line it explains; keep trailing comments to a few words, such as a unit.
- Docstrings and JSDoc only where the contract isn't clear from the name and signature.
- When a change makes a comment wrong, fix or delete it in the same change.

## Git & PR conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org) with a scope:
  `type(scope): summary`, e.g. `feat(app):`, `fix(app):`, `style(app):`, `ci(app):`. Use `app` for
  frontend work and `pipeline` for the data pipeline. Keep the summary imperative and lower-case.
- **Do not add a Claude `Co-Authored-By` trailer** to commit messages.
- **Branch, don't commit to `main`.** Work on `feat/*` or `fix/*` branches and merge to `main` via
  pull request (`main` is the default/protected branch).
- CI must be green before merge; see the CI job described under Commands.

## Docs

`docs/specs/hdb-map-design.md` (design spec) is the authoritative description of current behavior
and its design decisions. `docs/plans/` (frontend + pipeline implementation plans) is the frozen
record of how v1 was built; each plan's "Post-implementation deltas" section is closed.

- **Keep the spec in sync.** When a change alters behavior the spec describes, update the spec in
  the same PR. Don't add new deltas to the plans.
- **Describe behavior and reasons, not tuning values.** Leave numbers that change often (pixel
  sizes, zoom levels, result caps) to the code, so the spec doesn't go stale on every tweak.
