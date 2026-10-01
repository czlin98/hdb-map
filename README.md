# HDB Map

A mobile-first, interactive web map of Singapore's ~10,000 residential HDB blocks. Every block is an
individually rendered marker (no clustering). Hover (desktop) to see a block's address, tap/click to
open its details, and search by address to fly to a specific block.

**Live:** [hdb-map.vercel.app](https://hdb-map.vercel.app)

> **Status:** v1 is live. Block data refreshes automatically on the 1st of each month. The
> [design spec](docs/specs/hdb-map-v1-design.md) describes v1 as shipped, and lists the planned next
> iterations (marker coloring, filters, resale prices, and more).

## How it works

The system is two independent halves that meet at a set of static JSON data files, the **data
contract**. Each half depends only on the contract and can change internally without breaking the
other.

- **Python data pipeline**: fetches HDB Property Information from
  [data.gov.sg](https://data.gov.sg), geocodes each block via the OneMap Search API, and writes
  generated JSON into the repo. Runs monthly in GitHub Actions; never at request time.
- **React static SPA** (Vite + TypeScript): at runtime fetches only its own static data files from
  the CDN. No backend, no serverless functions, no third-party API calls from the browser.

```
cron → Actions runs pipeline → commit data → push → Vercel redeploy → CDN → users
```

## Tech stack

- **Frontend:** React 19, Vite, TypeScript, MapLibre GL JS, Shadcn UI (cmdk + Vaul), Tailwind CSS 4,
  Zustand.
- **Basemap:** OpenFreeMap vector tiles (Positron), free, no API key.
- **Pipeline:** Python 3.14, `requests`; `pytest` + `ruff`.
- **Hosting:** Vercel Hobby tier (free, non-commercial).
- **Automation:** GitHub Actions (monthly cron + manual dispatch).

Everything runs on free tiers.

## Repository layout

```
hdb-map/
├─ app/                 # React + Vite + TS static SPA (Vercel project root)
│  ├─ src/              # components, lib, store, types
│  └─ public/data/      # generated data contract, committed by the pipeline
├─ pipeline/            # Python data pipeline (fetch → geocode → transform → export)
├─ .github/workflows/   # pipeline.yml (monthly cron) + ci.yml (lint/typecheck/test)
└─ docs/
   ├─ specs/            # v1 design spec
   └─ plans/            # frontend + pipeline implementation plans
```

## Running locally

**App** (Node 24), in `app/`:

```sh
npm install
npm run dev            # Vite dev server, using the committed data in public/data/
npm run test -- --run  # Vitest, single pass
```

**Pipeline** (Python 3.14), in `pipeline/`:

```sh
pip install -r requirements-dev.txt
pytest                         # offline; all HTTP is mocked
python src/run.py --limit 20   # live smoke test on the first 20 blocks
```

The live run needs a free [OneMap](https://www.onemap.gov.sg) account in the `ONEMAP_EMAIL` and
`ONEMAP_PASSWORD` environment variables. Without `--limit` it geocodes all ~10k blocks and
overwrites the data in `app/public/data/`. See [`CLAUDE.md`](CLAUDE.md) for the full command list.

## Documentation

- [v1 Design Spec](docs/specs/hdb-map-v1-design.md): the authoritative description of v1 as shipped
- [Frontend Implementation Plan](docs/plans/hdb-map-frontend.md) and
  [Data Pipeline Implementation Plan](docs/plans/hdb-map-pipeline.md): the original task-by-task
  build record, each with a "Post-implementation deltas" section for later changes

## Data & attribution

- **Basemap:** © OpenStreetMap contributors, via OpenFreeMap.
- **Block data:** HDB / data.gov.sg, under the Singapore Open Data Licence.
- **Geocoding:** OneMap / SLA.

## License

Code is licensed under the [MIT License](LICENSE). HDB/OneMap data is subject to its providers'
respective terms (see above).
