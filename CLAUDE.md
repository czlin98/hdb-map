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
- `ruff check src tests`: lint (also `ruff format`)
- `python src/run.py --limit 20`: smoke-test the full pipeline against the live APIs on the first N
  blocks. Requires `ONEMAP_EMAIL` / `ONEMAP_PASSWORD` env vars. Without `--limit` it geocodes all
  ~10k blocks and overwrites the contract in `app/public/data/`.

CI (`.github/workflows/ci.yml`) runs both jobs on every PR: ruff + pytest for the pipeline;
format:check + tsc + lint + build + vitest for the frontend.

## The data contract (`app/public/data/`)

This is the interface between the two halves. `export.py` writes it and `app/src/types/contract.ts`
types it. **Keep these two in sync when changing any field.** Files:

- `index.geojson`: one Point `Feature` per block, with lightweight properties (`id`, `blk_no`,
  `street`/`street_full`, `postal`, `town`). Loaded whole at startup; drives the map and the search
  index.
- `block-details/{town_slug}.json`: heavy per-block detail (unit counts, year, floors) **sharded by
  town** and keyed by block `id`. Lazy-loaded one shard at a time and cached (`createGetBlockDetail`
  in `app/src/lib/data.ts`). A shard is written for _every_ town, even empty ones.
- `towns.json`: town → slug → code mapping. `towns.json` also lives at `pipeline/towns.json` as the
  pipeline's input; the app copy is generated.

**Block `id`** is the join key across everything: `slugify("{blk_no} {street}")` using the
_abbreviated_ street (`make_id` in `pipeline/src/config.py`). It is the GeoJSON feature id and the
detail-shard key. Outputs are written deterministically (id-sorted, stable key order) so monthly
diffs stay minimal.

## Pipeline internals

`run.py` orchestrates four stages: `fetch → geocode → transform → export`. It is **fail-fast**:
token auth, town loading, and fetching all happen _before_ any file is written, and an unknown town
code in `transform` raises rather than writing partial output, so a failed run never corrupts the
committed contract. Geocode failures are non-fatal: they're collected and written to
`pipeline/geocode_failures.csv` (committed alongside the data). Street abbreviations
(`AVE`→`AVENUE`, etc.) are expanded via whole-token matching in `config.py`.

## Frontend internals

`App.tsx` loads `index.geojson` + `towns.json` once, builds the search index and the cached
detail-loader with `useMemo`, and holds the loading/ready/error state. Block selection lives in a
small Zustand store (`store/selection.ts`, `selectedId` + `selectedTown`); the town is needed to
pick the right detail shard. Layout is mobile-first: a Vaul drawer with snap points on mobile vs. a
side panel on desktop (`useIsDesktop`, 768px breakpoint), and map fly-to padding is adjusted to keep
the selected marker visible above the sheet. Basemap is OpenFreeMap (Positron) vector tiles via
MapLibre GL, free, no API key.

## Code style

- **Comments explain _why_, not _what_.** Keep them concise and skip comments that only restate the
  code; match the surrounding file's density and idiom.
- **Avoid em dashes** in code comments, commit messages, Markdown, and user-facing copy. Use commas,
  colons, or parentheses instead.
- **Line length is 100 columns.** Tooling enforces it: Prettier for TS/JS and the maintained
  Markdown (`CLAUDE.md`, `README.md`), ruff for Python. Wrap Markdown prose at 100 too. The
  `docs/specs` and `docs/plans` design docs are frozen artifacts full of illustrative embedded code,
  so they are exempt from the formatter (`.prettierignore`); leave their formatting as-is.

## Git & PR conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org) with a scope:
  `type(scope): summary`, e.g. `feat(app):`, `fix(app):`, `style(app):`, `ci(app):`. Use `app` for
  frontend work and `pipeline` for the data pipeline. Keep the summary imperative and lower-case.
- **Do not add a Claude `Co-Authored-By` trailer** to commit messages.
- **Branch, don't commit to `main`.** Work on `feat/*` or `fix/*` branches and merge to `main` via
  pull request (`main` is the default/protected branch).
- CI must be green before merge; see the CI job described under Commands.

## Docs

`docs/specs/hdb-map-v1-design.md` (design spec) and `docs/plans/` (frontend + pipeline
implementation plans) hold the authoritative design decisions.
