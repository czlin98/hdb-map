# HDB Map: Frontend SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React + Vite + TypeScript static SPA that renders all ~10k
HDB blocks on a MapLibre map, shows a block's details on tap (loading detail
lazily per town), and searches by address, fetching only its own static data
files from the same origin.

**Architecture:** A single-page app that on mount fetches two startup assets
(`index.geojson`, `towns.json`) once, feeds the index to a MapLibre GeoJSON
source and to an in-memory search array, and lazily fetches per-town detail
shards on demand (cached in memory). A tiny Zustand store holds the selection
(`selectedId`, `selectedTown`); MapView reads it to highlight/fly, DetailsPanel
reads it to load and render the record. Pure logic (data-access, search,
flat-type formatting) lives in `lib/` and is unit-tested; MapLibre is mocked in
tests.

**Tech Stack:** React 19, Vite 8, TypeScript 6, MapLibre GL JS 6, Tailwind CSS
4, Shadcn UI (thin wrappers over cmdk + Vaul), Zustand 5. Tests: Vitest 4 +
Testing Library + jsdom.

**Spec:** `docs/specs/hdb-map-v1-design.md`. The plan argues from
the spec; executors read both. This plan covers the **frontend half** (`app/`).
The **data pipeline** is a separate plan
(`docs/plans/hdb-map-pipeline.md`); this plan depends only on the
data contract (§4 of the spec), and Task 9 commits a tiny sample
`app/public/data/` set so the app runs before the pipeline's first real run
overwrites it.

## Global Constraints

Every task's requirements implicitly include this section.

- **Node 24 LTS, npm.** React 19, Vite 8, TypeScript 6.0. Vercel Hobby (free,
  non-commercial).
- **Mobile-first performance budget.** `index.geojson` is the one blocking
  asset. Keep it light: never add detail fields to it, and never bundle detail
  shards eagerly. Detail loads lazily per town.
- **Same-origin only.** All runtime fetches target `/data/*` on the app's own
  origin. No third-party API calls, no backend, no serverless functions from the
  browser.
- **Types mirror the contract by hand** (§4.5): `BlockIndexProperties`,
  `BlockDetail`, `FlatTypeCounts`, `Town` live in `app/src/types` and match the
  pipeline's output exactly.
- **Street forms:** the hover tooltip uses the **abbreviated** `street`; the
  details panel and search use the **full** `street_full`.
- **Map locked to Singapore:** fit the island on load; `maxBounds` a small
  margin around the island; `minZoom` ≈ island-fit; `maxZoom` block-readable and
  no further.
- **Non-modal panel:** the map stays live behind the panel (pan/zoom/marker taps
  pass through); panning, zooming, or tapping empty map never closes it. Dismiss
  clears the selection.
- **Extension hooks (unused in v1, must exist):** a `colorBy` slot in the
  `blocks-circles` paint expression and a `filter` slot on the source;
  `blocks-highlight` is a **separate layer** kept exempt from any future filter.
- **Attribution** via MapLibre's `AttributionControl` (compact ok on mobile):
  OpenStreetMap + OpenFreeMap (basemap), HDB/data.gov.sg on the blocks source,
  OneMap/SLA (geocoding).
- **All tests run offline:** `fetch` and `maplibre-gl` are mocked.

## Data Contract (what this app consumes)

Fetched from `/data/` (produced by the pipeline; §4 of the spec):

- `index.geojson`: `FeatureCollection`; each feature
  `geometry.coordinates = [lon, lat]`,
  `properties = { id, blk_no, street, street_full, postal, town }`.
- `towns.json`: `[{ town, town_slug, town_code }]` (27 rows).
- `block-details/{town_slug}.json`: object keyed by `id`; value =
  `{ blk_no, street, street_full, postal, town, year_completed, max_floor_lvl, total_dwelling_units, sold_units_by_type, rental_units_by_type? }`.

---

## File Structure

- `app/package.json`, `app/vite.config.ts`, `app/tsconfig*.json`,
  `app/index.html`, `app/eslint.config.js`, `app/src/vite-env.d.ts` (Tailwind v4
  needs no `tailwind.config.ts`/`postcss.config.js`; config lives in CSS)
- `app/src/main.tsx`, `app/src/App.tsx`, `app/src/index.css`
- `app/src/types/contract.ts`: hand-kept mirror of the data contract.
- `app/src/lib/flat-types.ts`: key→label + display order; `orderedUnits`.
- `app/src/lib/data.ts`: `loadIndex`, `loadTowns`, `buildTownSlugMap`,
  `createGetBlockDetail`.
- `app/src/lib/search.ts`: `buildSearchIndex`, `searchBlocks`.
- `app/src/lib/utils.ts`: `cn` class-merge helper.
- `app/src/store/selection.ts`: Zustand selection store.
- `app/src/components/ui/command.tsx`, `app/src/components/ui/drawer.tsx`:
  Shadcn-style wrappers over cmdk / Vaul.
- `app/src/components/SearchBox.tsx`, `DetailsPanel.tsx` (+ `DetailsContent`,
  `useBlockDetail`), `MapView.tsx`.
- `app/src/test/fixtures.ts`, `app/src/test/setup.ts`.
- `app/public/data/`: tiny committed sample (overwritten by the pipeline).
- `.github/workflows/ci.yml`: **modify** to add a `frontend` job.
- `app/vercel.json`: `Cache-Control` for `/data/*`.

---

### Task 1: Vite + React + TS scaffold, Tailwind, Vitest

Stands up the app with build + test tooling and a smoke test. Scaffolding folds
into this task because its deliverable (a building app with a passing render
test) needs all of it.

**Files:**
- Create: `app/package.json`, `app/vite.config.ts`, `app/tsconfig.json`,
  `app/tsconfig.node.json`, `app/index.html`, `app/eslint.config.js`,
  `app/src/vite-env.d.ts`
- Create: `app/src/main.tsx`, `app/src/App.tsx`, `app/src/index.css`,
  `app/src/test/setup.ts`
- Test: `app/src/App.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a mounting `App` component; `npm run build`, `npm run test`,
  `npm run lint`, `npx tsc --noEmit` all work.

- [ ] **Step 1: Write `app/package.json`**

```json
{
  "name": "hdb-map-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "vitest"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "lucide-react": "^0.454.0",
    "maplibre-gl": "^6.6.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^3.0.0",
    "vaul": "^1.1.2",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^6.1.0",
    "eslint": "^10.9.1",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.14",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.68.0",
    "vite": "^8.2.2",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: Write the config files**

`app/vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
  },
});
```

`app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`app/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

Tailwind v4 needs no `postcss.config.js` or `tailwind.config.ts`: the
`@tailwindcss/vite` plugin (added above) handles everything, content is
auto-detected, and any theme customization goes in `index.css` via `@theme`.
Autoprefixer is built in.

`app/eslint.config.js` (ESLint 10 flat config; the unified `typescript-eslint`
package replaces the separate parser + plugin):

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
```

`app/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 3: Write the app entry files**

`app/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>HDB Map</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`app/src/index.css`:

```css
@import "tailwindcss";

html, body, #root { height: 100%; margin: 0; }
```

`app/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`app/src/App.tsx` (minimal placeholder replaced in Task 9):

```tsx
export default function App() {
  return <main aria-label="HDB Map">HDB Map</main>;
}
```

`app/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement window.matchMedia; components read it at render
// time (App's useIsDesktop, MapView's hover gating), so stub it or those
// renders throw. Report the desktop breakpoint as active so integration
// tests exercise the plain side-panel path; Vaul's mobile drawer (portal
// + measurement) is unreliable in jsdom.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
```

- [ ] **Step 4: Write the smoke test**

`app/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

test("App renders", () => {
  render(<App />);
  expect(screen.getByRole("main", { name: "HDB Map" })).toBeInTheDocument();
});
```

- [ ] **Step 5: Install, then verify build + test + typecheck + lint**

Run:
```bash
cd app && npm install
npm run test -- --run
npx tsc --noEmit
npm run build
npm run lint
```
Expected: test PASSES; `tsc` clean; `vite build` succeeds; lint clean.

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/package-lock.json app/vite.config.ts app/tsconfig*.json app/index.html app/eslint.config.js app/src
git commit -m "feat(app): Vite + React + TS scaffold with Tailwind and Vitest"
```

---

### Task 2: Contract types, flat-type labels, test fixtures

Adds the hand-kept TS mirror of the data contract, the flat-type key→label +
display-order constant with an `orderedUnits` helper, and reusable typed
fixtures for later tests. `orderedUnits` is the testable deliverable; the types
are verified by `tsc` against the typed fixtures.

**Files:**
- Create: `app/src/types/contract.ts`
- Create: `app/src/lib/flat-types.ts`
- Create: `app/src/test/fixtures.ts`
- Test: `app/src/lib/flat-types.test.ts`

**Interfaces:**
- Produces:
  - Types: `FlatTypeCounts`, `BlockIndexProperties`, `BlockFeature`,
    `IndexFeatureCollection`, `BlockDetail`, `Town`.
  - `SOLD_FLAT_TYPES`, `RENTAL_FLAT_TYPES: FlatTypeDef[]` where
    `FlatTypeDef = { key: string; label: string }`.
  - `orderedUnits(counts: FlatTypeCounts | undefined, order: FlatTypeDef[]) -> { label: string; count: number }[]`.
  - Fixtures: `sampleIndex: IndexFeatureCollection`, `sampleTowns: Town[]`,
    `sampleShard: Record<string, BlockDetail>`.

- [ ] **Step 1: Write `app/src/types/contract.ts`**

```ts
export type FlatTypeCounts = Record<string, number>;

export interface BlockIndexProperties {
  id: string;
  blk_no: string;
  street: string;       // abbreviated (tooltip)
  street_full: string;  // expanded (search)
  postal: string;
  town: string;
}

export interface BlockFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] }; // [lon, lat]
  properties: BlockIndexProperties;
}

export interface IndexFeatureCollection {
  type: "FeatureCollection";
  features: BlockFeature[];
}

export interface BlockDetail {
  blk_no: string;
  street: string;
  street_full: string;
  postal: string;
  town: string;
  year_completed: number;
  max_floor_lvl: number;
  total_dwelling_units: number;
  sold_units_by_type: FlatTypeCounts;
  rental_units_by_type?: FlatTypeCounts;
}

export interface Town {
  town: string;
  town_slug: string;
  town_code: string;
}
```

- [ ] **Step 2: Write the failing test**

`app/src/lib/flat-types.test.ts`:

```ts
import { orderedUnits, SOLD_FLAT_TYPES, RENTAL_FLAT_TYPES } from "./flat-types";

test("sold order and labels match the reference table", () => {
  expect(SOLD_FLAT_TYPES.map((t) => t.key)).toEqual([
    "1room", "2room", "3room", "4room", "5room", "exec", "multigen", "studio_apartment",
  ]);
  expect(SOLD_FLAT_TYPES.find((t) => t.key === "exec")!.label).toBe("Executive");
});

test("rental has other_room labelled Other", () => {
  expect(RENTAL_FLAT_TYPES.map((t) => t.key)).toEqual(["1room", "2room", "3room", "other_room"]);
  expect(RENTAL_FLAT_TYPES.find((t) => t.key === "other_room")!.label).toBe("Other");
});

test("orderedUnits keeps only present keys, in display order", () => {
  const out = orderedUnits({ "5room": 20, "3room": 40 }, SOLD_FLAT_TYPES);
  expect(out).toEqual([
    { label: "3-Room", count: 40 },
    { label: "5-Room", count: 20 },
  ]);
});

test("orderedUnits on undefined returns empty", () => {
  expect(orderedUnits(undefined, RENTAL_FLAT_TYPES)).toEqual([]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npm run test -- --run flat-types`
Expected: FAIL (cannot find module `./flat-types`).

- [ ] **Step 4: Write `app/src/lib/flat-types.ts`**

```ts
import type { FlatTypeCounts } from "../types/contract";

export interface FlatTypeDef {
  key: string;
  label: string;
}

export const SOLD_FLAT_TYPES: FlatTypeDef[] = [
  { key: "1room", label: "1-Room" },
  { key: "2room", label: "2-Room" },
  { key: "3room", label: "3-Room" },
  { key: "4room", label: "4-Room" },
  { key: "5room", label: "5-Room" },
  { key: "exec", label: "Executive" },
  { key: "multigen", label: "Multi-Generation" },
  { key: "studio_apartment", label: "Studio Apartment" },
];

export const RENTAL_FLAT_TYPES: FlatTypeDef[] = [
  { key: "1room", label: "1-Room" },
  { key: "2room", label: "2-Room" },
  { key: "3room", label: "3-Room" },
  { key: "other_room", label: "Other" },
];

export function orderedUnits(
  counts: FlatTypeCounts | undefined,
  order: FlatTypeDef[],
): { label: string; count: number }[] {
  if (!counts) return [];
  return order
    .filter((t) => (counts[t.key] ?? 0) > 0)
    .map((t) => ({ label: t.label, count: counts[t.key] }));
}
```

- [ ] **Step 5: Write `app/src/test/fixtures.ts`**

```ts
import type { BlockDetail, IndexFeatureCollection, Town } from "../types/contract";

export const sampleTowns: Town[] = [
  { town: "ANG MO KIO", town_slug: "ang-mo-kio", town_code: "AMK" },
  { town: "BEDOK", town_slug: "bedok", town_code: "BD" },
];

export const sampleIndex: IndexFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.845, 1.362] },
      properties: {
        id: "123-ang-mo-kio-ave-3", blk_no: "123", street: "ANG MO KIO AVE 3",
        street_full: "ANG MO KIO AVENUE 3", postal: "560123", town: "ANG MO KIO",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [103.93, 1.326] },
      properties: {
        id: "1-bedok-nth-st-1", blk_no: "1", street: "BEDOK NTH ST 1",
        street_full: "BEDOK NORTH STREET 1", postal: "460001", town: "BEDOK",
      },
    },
  ],
};

export const sampleShard: Record<string, BlockDetail> = {
  "123-ang-mo-kio-ave-3": {
    blk_no: "123", street: "ANG MO KIO AVE 3", street_full: "ANG MO KIO AVENUE 3",
    postal: "560123", town: "ANG MO KIO", year_completed: 1978, max_floor_lvl: 12,
    total_dwelling_units: 200, sold_units_by_type: { "3room": 40, "4room": 60 },
    rental_units_by_type: { "1room": 20 },
  },
};
```

- [ ] **Step 6: Run test + typecheck**

Run: `cd app && npm run test -- --run flat-types && npx tsc --noEmit`
Expected: 4 tests PASS; `tsc` clean (fixtures typecheck against the contract
types).

- [ ] **Step 7: Commit**

```bash
git add app/src/types/contract.ts app/src/lib/flat-types.ts app/src/test/fixtures.ts app/src/lib/flat-types.test.ts
git commit -m "feat(app): contract types, flat-type labels, fixtures"
```

---

### Task 3: Data-access lib

Fetches the two startup assets, builds the `town → town_slug` map, and provides
`getBlockDetail(id, town)` that lazily fetches a shard and caches it in memory.

**Files:**
- Create: `app/src/lib/data.ts`
- Test: `app/src/lib/data.test.ts`

**Interfaces:**
- Consumes: contract types; fixtures.
- Produces:
  - `loadIndex(url?: string): Promise<IndexFeatureCollection>`
  - `loadTowns(url?: string): Promise<Town[]>`
  - `buildTownSlugMap(towns: Town[]): Map<string, string>`
  - `type GetBlockDetail = (id: string, town: string) => Promise<BlockDetail | undefined>`
  - `createGetBlockDetail(slugMap: Map<string, string>, baseUrl?: string): GetBlockDetail`

- [ ] **Step 1: Write the failing test**

`app/src/lib/data.test.ts`:

```ts
import { afterEach, expect, test, vi } from "vitest";
import { buildTownSlugMap, createGetBlockDetail, loadIndex, loadTowns } from "./data";
import { sampleIndex, sampleShard, sampleTowns } from "../test/fixtures";

afterEach(() => vi.restoreAllMocks());

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => body });
}

test("loadIndex / loadTowns parse JSON", async () => {
  vi.stubGlobal("fetch", mockFetchOnce(sampleIndex));
  expect((await loadIndex()).features).toHaveLength(2);
  vi.stubGlobal("fetch", mockFetchOnce(sampleTowns));
  expect(await loadTowns()).toHaveLength(2);
});

test("loadIndex throws on non-ok", async () => {
  vi.stubGlobal("fetch", mockFetchOnce({}, false, 500));
  await expect(loadIndex()).rejects.toThrow();
});

test("getBlockDetail resolves slug, fetches shard once, caches", async () => {
  const fetchMock = mockFetchOnce(sampleShard);
  vi.stubGlobal("fetch", fetchMock);
  const get = createGetBlockDetail(buildTownSlugMap(sampleTowns));

  const first = await get("123-ang-mo-kio-ave-3", "ANG MO KIO");
  expect(first?.year_completed).toBe(1978);
  expect(fetchMock).toHaveBeenCalledWith("/data/block-details/ang-mo-kio.json");

  // second call for the same town hits the cache, no new fetch
  await get("123-ang-mo-kio-ave-3", "ANG MO KIO");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("getBlockDetail returns undefined for a missing id", async () => {
  vi.stubGlobal("fetch", mockFetchOnce(sampleShard));
  const get = createGetBlockDetail(buildTownSlugMap(sampleTowns));
  expect(await get("nope", "ANG MO KIO")).toBeUndefined();
});

test("getBlockDetail throws on an unknown town", async () => {
  vi.stubGlobal("fetch", mockFetchOnce({}));
  const get = createGetBlockDetail(buildTownSlugMap(sampleTowns));
  await expect(get("x", "ATLANTIS")).rejects.toThrow(/unknown town/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- --run data`
Expected: FAIL (cannot find module `./data`).

- [ ] **Step 3: Write `app/src/lib/data.ts`**

```ts
import type { BlockDetail, IndexFeatureCollection, Town } from "../types/contract";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

export function loadIndex(url = "/data/index.geojson"): Promise<IndexFeatureCollection> {
  return fetchJson<IndexFeatureCollection>(url);
}

export function loadTowns(url = "/data/towns.json"): Promise<Town[]> {
  return fetchJson<Town[]>(url);
}

export function buildTownSlugMap(towns: Town[]): Map<string, string> {
  return new Map(towns.map((t) => [t.town, t.town_slug]));
}

export type GetBlockDetail = (id: string, town: string) => Promise<BlockDetail | undefined>;

export function createGetBlockDetail(
  slugMap: Map<string, string>,
  baseUrl = "/data/block-details",
): GetBlockDetail {
  const cache = new Map<string, Record<string, BlockDetail>>();
  return async (id, town) => {
    const slug = slugMap.get(town);
    if (!slug) throw new Error(`Unknown town: ${town}`);
    let shard = cache.get(slug);
    if (!shard) {
      shard = await fetchJson<Record<string, BlockDetail>>(`${baseUrl}/${slug}.json`);
      cache.set(slug, shard);
    }
    return shard[id];
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- --run data`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/data.ts app/src/lib/data.test.ts
git commit -m "feat(app): data-access lib with lazy shard cache"
```

---

### Task 4: Search lib

Builds a flat in-memory search array from the index and does instant
substring/prefix matching over block + full street + postal.

**Files:**
- Create: `app/src/lib/search.ts`
- Test: `app/src/lib/search.test.ts`

**Interfaces:**
- Consumes: `IndexFeatureCollection`.
- Produces:
  - `interface SearchRow { id; blk_no; street_full; postal; town; haystack }`
  - `buildSearchIndex(fc: IndexFeatureCollection): SearchRow[]`
  - `searchBlocks(rows: SearchRow[], query: string, limit?: number): SearchRow[]`

- [ ] **Step 1: Write the failing test**

`app/src/lib/search.test.ts`:

```ts
import { buildSearchIndex, searchBlocks } from "./search";
import { sampleIndex } from "../test/fixtures";

const rows = buildSearchIndex(sampleIndex);

test("empty query returns nothing", () => {
  expect(searchBlocks(rows, "  ")).toEqual([]);
});

test("matches full street words, case-insensitive", () => {
  const out = searchBlocks(rows, "ang mo kio avenue 3");
  expect(out.map((r) => r.id)).toEqual(["123-ang-mo-kio-ave-3"]);
});

test("matches on block number + street tokens (AND across tokens)", () => {
  expect(searchBlocks(rows, "123 avenue").map((r) => r.id)).toEqual(["123-ang-mo-kio-ave-3"]);
  expect(searchBlocks(rows, "123 bedok")).toEqual([]);
});

test("matches on postal", () => {
  expect(searchBlocks(rows, "460001").map((r) => r.id)).toEqual(["1-bedok-nth-st-1"]);
});

test("respects the limit", () => {
  expect(searchBlocks(rows, "street", 1)).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- --run search`
Expected: FAIL (cannot find module `./search`).

- [ ] **Step 3: Write `app/src/lib/search.ts`**

```ts
import type { IndexFeatureCollection } from "../types/contract";

export interface SearchRow {
  id: string;
  blk_no: string;
  street_full: string;
  postal: string;
  town: string;
  haystack: string;
}

export function buildSearchIndex(fc: IndexFeatureCollection): SearchRow[] {
  return fc.features.map((f) => {
    const p = f.properties;
    return {
      id: p.id,
      blk_no: p.blk_no,
      street_full: p.street_full,
      postal: p.postal,
      town: p.town,
      haystack: `${p.blk_no} ${p.street_full} ${p.postal}`.toUpperCase(),
    };
  });
}

export function searchBlocks(rows: SearchRow[], query: string, limit = 20): SearchRow[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const matches = rows.filter((r) => tokens.every((t) => r.haystack.includes(t)));
  // Prefix hits on the first token rank above mid-string substring hits.
  matches.sort(
    (a, b) =>
      Number(b.haystack.startsWith(tokens[0])) - Number(a.haystack.startsWith(tokens[0])),
  );
  return matches.slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- --run search`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/search.ts app/src/lib/search.test.ts
git commit -m "feat(app): client-side substring/prefix search"
```

---

### Task 5: Zustand selection store

Holds the selection (`selectedId`, `selectedTown`) with `select` and `clear`
actions: the single source of truth MapView and DetailsPanel both read.

**Files:**
- Create: `app/src/store/selection.ts`
- Test: `app/src/store/selection.test.ts`

**Interfaces:**
- Produces:
  - `interface SelectionState { selectedId: string | null; selectedTown: string | null; select(id: string, town: string): void; clear(): void; }`
  - `useSelection`: a Zustand hook/store with `.getState()` / `.setState()`.

- [ ] **Step 1: Write the failing test**

`app/src/store/selection.test.ts`:

```ts
import { beforeEach, expect, test } from "vitest";
import { useSelection } from "./selection";

beforeEach(() => useSelection.getState().clear());

test("starts empty", () => {
  const s = useSelection.getState();
  expect(s.selectedId).toBeNull();
  expect(s.selectedTown).toBeNull();
});

test("select sets id + town; clear resets", () => {
  useSelection.getState().select("123-ang-mo-kio-ave-3", "ANG MO KIO");
  expect(useSelection.getState().selectedId).toBe("123-ang-mo-kio-ave-3");
  expect(useSelection.getState().selectedTown).toBe("ANG MO KIO");
  useSelection.getState().clear();
  expect(useSelection.getState().selectedId).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- --run selection`
Expected: FAIL (cannot find module `./selection`).

- [ ] **Step 3: Write `app/src/store/selection.ts`**

```ts
import { create } from "zustand";

interface SelectionState {
  selectedId: string | null;
  selectedTown: string | null;
  select: (id: string, town: string) => void;
  clear: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selectedId: null,
  selectedTown: null,
  select: (id, town) => set({ selectedId: id, selectedTown: town }),
  clear: () => set({ selectedId: null, selectedTown: null }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- --run selection`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/store/selection.ts app/src/store/selection.test.ts
git commit -m "feat(app): Zustand selection store"
```

---

### Task 6: UI primitives + SearchBox

Adds the `cn` helper and Shadcn-style thin wrappers over cmdk (Command) and Vaul
(Drawer), then the SearchBox combobox that renders `searchBlocks` results and
reports selection.

**Files:**
- Create: `app/src/lib/utils.ts`
- Create: `app/src/components/ui/command.tsx`
- Create: `app/src/components/ui/drawer.tsx`
- Create: `app/src/components/SearchBox.tsx`
- Test: `app/src/components/SearchBox.test.tsx`

**Interfaces:**
- Consumes: `searchBlocks`, `SearchRow`.
- Produces:
  - `cn(...inputs: ClassValue[]): string`
  - `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandItem`
    (re-exported cmdk primitives with classes).
  - `Drawer`, `DrawerContent`, `DrawerTitle`, `DrawerClose` (Vaul wrappers),
    consumed by Task 7.
  - `SearchBox({ rows, onSelect }: { rows: SearchRow[]; onSelect: (row: SearchRow) => void })`.

- [ ] **Step 1: Write `app/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Write the UI wrappers**

`app/src/components/ui/command.tsx`:

```tsx
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "../../lib/utils";

export const Command = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) => (
  <CommandPrimitive className={cn("flex flex-col overflow-hidden rounded-md bg-white text-sm shadow", className)} {...props} />
);

export const CommandInput = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) => (
  <CommandPrimitive.Input className={cn("h-11 w-full border-b px-3 outline-none", className)} {...props} />
);

export const CommandList = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) => (
  <CommandPrimitive.List className={cn("max-h-72 overflow-y-auto", className)} {...props} />
);

export const CommandEmpty = CommandPrimitive.Empty;

export const CommandItem = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) => (
  <CommandPrimitive.Item className={cn("cursor-pointer px-3 py-2 aria-selected:bg-slate-100", className)} {...props} />
);
```

`app/src/components/ui/drawer.tsx`:

```tsx
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "../../lib/utils";

export const Drawer = DrawerPrimitive.Root;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerTitle = DrawerPrimitive.Title;

export const DrawerContent = ({ className, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) => (
  <DrawerPrimitive.Portal>
    <DrawerPrimitive.Content
      className={cn("fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl bg-white", className)}
      {...props}
    >
      <div className="mx-auto my-2 h-1.5 w-10 rounded-full bg-slate-300" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPrimitive.Portal>
);
```

- [ ] **Step 3: Write the failing test**

`app/src/components/SearchBox.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBox } from "./SearchBox";
import { buildSearchIndex } from "../lib/search";
import { sampleIndex } from "../test/fixtures";

const rows = buildSearchIndex(sampleIndex);

test("typing filters and shows the full address; selecting reports the row", async () => {
  const onSelect = vi.fn();
  render(<SearchBox rows={rows} onSelect={onSelect} />);

  await userEvent.type(screen.getByPlaceholderText(/search/i), "avenue 3");
  const item = await screen.findByText("123 ANG MO KIO AVENUE 3 560123");
  await userEvent.click(item);

  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ id: "123-ang-mo-kio-ave-3", town: "ANG MO KIO" }),
  );
});

test("shows empty state when nothing matches", async () => {
  render(<SearchBox rows={rows} onSelect={vi.fn()} />);
  await userEvent.type(screen.getByPlaceholderText(/search/i), "zzzz");
  expect(await screen.findByText(/no matches/i)).toBeInTheDocument();
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd app && npm run test -- --run SearchBox`
Expected: FAIL (cannot find module `./SearchBox`).

- [ ] **Step 5: Write `app/src/components/SearchBox.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";
import { searchBlocks, type SearchRow } from "../lib/search";

interface Props {
  rows: SearchRow[];
  onSelect: (row: SearchRow) => void;
}

export function SearchBox({ rows, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchBlocks(rows, query), [rows, query]);

  return (
    // We filter ourselves; disable cmdk's built-in filtering.
    <Command shouldFilter={false} className="w-full">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search block, street, or postal…" />
      <CommandList>
        {query.trim() !== "" && results.length === 0 && (
          <CommandEmpty className="px-3 py-2 text-slate-500">No matches</CommandEmpty>
        )}
        {results.map((r) => (
          <CommandItem key={r.id} value={r.id} onSelect={() => onSelect(r)}>
            {r.blk_no} {r.street_full} {r.postal}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd app && npm run test -- --run SearchBox`
Expected: PASS (2 tests). (cmdk renders items only when a query is present and
`CommandEmpty` shows on no results.)

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/utils.ts app/src/components/ui app/src/components/SearchBox.tsx app/src/components/SearchBox.test.tsx
git commit -m "feat(app): UI primitives + SearchBox combobox"
```

---

### Task 7: DetailsPanel (content, loader hook, shell)

Renders the whole panel from a shard record: full-address header, town / year /
floors / total units, and Sold + (when present) Rental groups. A loading
skeleton fills the card while a town's shard fetches; a graceful empty state
covers a miss. Vaul `Drawer` (non-modal, snap points) on mobile; docked side
panel on desktop.

**Files:**
- Create: `app/src/components/DetailsPanel.tsx` (exports `DetailsContent`,
  `useBlockDetail`, `DetailsPanel`)
- Test: `app/src/components/DetailsPanel.test.tsx`

**Interfaces:**
- Consumes: `GetBlockDetail`, `BlockDetail`, `orderedUnits`, `SOLD_FLAT_TYPES`,
  `RENTAL_FLAT_TYPES`, `Drawer*` wrappers.
- Produces:
  - `DetailsContent({ detail }: { detail: BlockDetail })`: pure render of a
    record.
  - `useBlockDetail(id, town, getBlockDetail): { status: "loading" | "ready" | "empty"; detail?: BlockDetail }`
  - `DetailsPanel({ selectedId, selectedTown, getBlockDetail, isDesktop, snapPoints, activeSnap, onSnapChange, onClose })`:
    renders the shell (Drawer on mobile / `<aside>` on desktop) around
    content/skeleton/empty. `onClose` clears selection.

- [ ] **Step 1: Write the failing test**

`app/src/components/DetailsPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { DetailsContent, useBlockDetail } from "./DetailsPanel";
import { renderHook } from "@testing-library/react";
import { sampleShard } from "../test/fixtures";

test("DetailsContent renders header, fields, and Sold/Rental groups", () => {
  render(<DetailsContent detail={sampleShard["123-ang-mo-kio-ave-3"]} />);
  expect(screen.getByRole("heading", { name: "123 ANG MO KIO AVENUE 3 560123" })).toBeInTheDocument();
  expect(screen.getByText("1978")).toBeInTheDocument();
  expect(screen.getByText("Sold")).toBeInTheDocument();
  expect(screen.getByText(/3-Room/)).toBeInTheDocument();
  expect(screen.getByText("Rental")).toBeInTheDocument();
});

test("DetailsContent omits the Rental group when there is no rental", () => {
  const detail = { ...sampleShard["123-ang-mo-kio-ave-3"], rental_units_by_type: undefined };
  render(<DetailsContent detail={detail} />);
  expect(screen.queryByText("Rental")).not.toBeInTheDocument();
});

test("useBlockDetail: loading -> ready", async () => {
  const get = vi.fn().mockResolvedValue(sampleShard["123-ang-mo-kio-ave-3"]);
  const { result } = renderHook(() => useBlockDetail("123-ang-mo-kio-ave-3", "ANG MO KIO", get));
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.detail?.year_completed).toBe(1978);
});

test("useBlockDetail: missing record -> empty", async () => {
  const get = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useBlockDetail("nope", "ANG MO KIO", get));
  await waitFor(() => expect(result.current.status).toBe("empty"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- --run DetailsPanel`
Expected: FAIL (cannot find module `./DetailsPanel`).

- [ ] **Step 3: Write `app/src/components/DetailsPanel.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { BlockDetail } from "../types/contract";
import type { GetBlockDetail } from "../lib/data";
import { orderedUnits, RENTAL_FLAT_TYPES, SOLD_FLAT_TYPES } from "../lib/flat-types";
import { Drawer, DrawerContent, DrawerTitle } from "./ui/drawer";

export function DetailsContent({ detail }: { detail: BlockDetail }) {
  const sold = orderedUnits(detail.sold_units_by_type, SOLD_FLAT_TYPES);
  const rental = orderedUnits(detail.rental_units_by_type, RENTAL_FLAT_TYPES);
  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-semibold">
        {detail.blk_no} {detail.street_full} {detail.postal}
      </h2>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-slate-500">Town</dt><dd>{detail.town}</dd></div>
        <div><dt className="text-slate-500">Year completed</dt><dd>{detail.year_completed}</dd></div>
        <div><dt className="text-slate-500">Floors</dt><dd>{detail.max_floor_lvl}</dd></div>
        <div><dt className="text-slate-500">Total units</dt><dd>{detail.total_dwelling_units}</dd></div>
      </dl>
      {sold.length > 0 && (
        <section>
          <h3 className="font-medium">Sold</h3>
          <ul className="text-sm">
            {sold.map((u) => <li key={u.label}>{u.label}: {u.count}</li>)}
          </ul>
        </section>
      )}
      {rental.length > 0 && (
        <section>
          <h3 className="font-medium">Rental</h3>
          <ul className="text-sm">
            {rental.map((u) => <li key={u.label}>{u.label}: {u.count}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

export function useBlockDetail(
  id: string,
  town: string,
  getBlockDetail: GetBlockDetail,
): { status: "loading" | "ready" | "empty"; detail?: BlockDetail } {
  const [state, setState] = useState<{ status: "loading" | "ready" | "empty"; detail?: BlockDetail }>({
    status: "loading",
  });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getBlockDetail(id, town)
      .then((detail) => {
        if (!alive) return;
        setState(detail ? { status: "ready", detail } : { status: "empty" });
      })
      .catch(() => alive && setState({ status: "empty" }));
    return () => { alive = false; };
  }, [id, town, getBlockDetail]);

  return state;
}

function Skeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading block details">
      <div className="h-6 w-3/4 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
      <div className="h-24 w-full animate-pulse rounded bg-slate-200" />
    </div>
  );
}

function Body({ id, town, getBlockDetail }: { id: string; town: string; getBlockDetail: GetBlockDetail }) {
  const { status, detail } = useBlockDetail(id, town, getBlockDetail);
  if (status === "loading") return <Skeleton />;
  if (status === "empty" || !detail) return <div className="p-4 text-slate-500">Details unavailable.</div>;
  return <DetailsContent detail={detail} />;
}

interface PanelProps {
  selectedId: string;
  selectedTown: string;
  getBlockDetail: GetBlockDetail;
  isDesktop: boolean;
  snapPoints: (string | number)[];
  activeSnap: string | number | null;
  onSnapChange: (snap: string | number | null) => void;
  onClose: () => void;
}

export function DetailsPanel(props: PanelProps) {
  const body = (
    <Body id={props.selectedId} town={props.selectedTown} getBlockDetail={props.getBlockDetail} />
  );

  if (props.isDesktop) {
    return (
      <aside className="absolute right-0 top-0 z-40 h-full w-96 overflow-y-auto border-l bg-white shadow-lg">
        <button className="absolute right-2 top-2 text-slate-500" aria-label="Close" onClick={props.onClose}>✕</button>
        {body}
      </aside>
    );
  }

  return (
    <Drawer
      open
      modal={false}
      snapPoints={props.snapPoints}
      activeSnapPoint={props.activeSnap}
      setActiveSnapPoint={props.onSnapChange}
      onClose={props.onClose}
    >
      <DrawerContent className="max-h-[95%]">
        <DrawerTitle className="sr-only">Block details</DrawerTitle>
        <div className="overflow-y-auto">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- --run DetailsPanel`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/DetailsPanel.tsx app/src/components/DetailsPanel.test.tsx
git commit -m "feat(app): DetailsPanel with lazy detail loader, skeleton, snap points"
```

---

### Task 8: MapView

MapLibre map: Positron basemap, Singapore-locked camera, blocks source
(`cluster:false`), `blocks-circles` (with a `colorBy`-ready paint + unused
`filter` slot), a separate `blocks-highlight` layer, hover tooltip (abbreviated
street, hover-capable pointers only), click → select, and highlight + `flyTo` on
selection.

**Files:**
- Create: `app/src/components/MapView.tsx`
- Test: `app/src/components/MapView.test.tsx`

**Interfaces:**
- Consumes: `IndexFeatureCollection`.
- Produces:
  `MapView({ data, selectedId, onSelectBlock, flyPaddingBottom }: { data: IndexFeatureCollection; selectedId: string | null; onSelectBlock: (id: string, town: string) => void; flyPaddingBottom?: number })`.

- [ ] **Step 1: Write the failing test** (maplibre-gl mocked)

`app/src/components/MapView.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const handlers: Record<string, ((e?: unknown) => void)[]> = {};
const map = {
  addControl: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  getLayer: vi.fn().mockReturnValue({}),
  getSource: vi.fn().mockReturnValue({ setData: vi.fn() }),
  setFilter: vi.fn(),
  flyTo: vi.fn(),
  getZoom: vi.fn().mockReturnValue(11),
  getCanvas: vi.fn().mockReturnValue({ style: {} }),
  on: vi.fn((ev: string, a: unknown, b?: unknown) => {
    const cb = (typeof a === "function" ? a : b) as (e?: unknown) => void;
    (handlers[ev] ??= []).push(cb);
  }),
  remove: vi.fn(),
};
const MapCtor = vi.fn(() => map);

vi.mock("maplibre-gl", () => ({
  default: {
    Map: MapCtor,
    AttributionControl: vi.fn(),
    Popup: vi.fn(() => ({ setLngLat: () => ({ setText: () => ({ addTo: vi.fn() }) }), remove: vi.fn() })),
  },
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

import { MapView } from "./MapView";
import { sampleIndex } from "../test/fixtures";

afterEach(() => { for (const k of Object.keys(handlers)) delete handlers[k]; vi.clearAllMocks(); });

function fire(ev: string, e?: unknown) { (handlers[ev] ?? []).forEach((cb) => cb(e)); }

test("locks the camera to Singapore and adds both layers on load", () => {
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  const opts = MapCtor.mock.calls[0][0] as Record<string, unknown>;
  expect(opts.maxBounds).toBeDefined();
  expect(opts.minZoom).toBeGreaterThan(9);

  fire("load");
  const layerIds = map.addLayer.mock.calls.map((c) => (c[0] as { id: string }).id);
  expect(layerIds).toContain("blocks-circles");
  expect(layerIds).toContain("blocks-highlight");
});

test("creates the source with the latest data if index beats load", () => {
  const empty = {
    type: "FeatureCollection",
    features: [],
  } as typeof sampleIndex;
  const { rerender } = render(
    <MapView data={empty} selectedId={null} onSelectBlock={vi.fn()} />,
  );
  // Index arrives before the style's "load" event fires.
  rerender(
    <MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />,
  );
  fire("load");
  const call = map.addSource.mock.calls.find((c) => c[0] === "blocks");
  const sourceArg = call?.[1] as { data: typeof sampleIndex };
  expect(sourceArg.data.features).toHaveLength(2);
});

test("clicking a feature reports id + town", () => {
  const onSelectBlock = vi.fn();
  render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={onSelectBlock} />);
  fire("load");
  fire("click", { features: [{ properties: { id: "123-ang-mo-kio-ave-3", town: "ANG MO KIO" } }] });
  expect(onSelectBlock).toHaveBeenCalledWith("123-ang-mo-kio-ave-3", "ANG MO KIO");
});

test("selection sets the highlight filter and flies", () => {
  const { rerender } = render(<MapView data={sampleIndex} selectedId={null} onSelectBlock={vi.fn()} />);
  fire("load");
  rerender(<MapView data={sampleIndex} selectedId="123-ang-mo-kio-ave-3" onSelectBlock={vi.fn()} />);
  expect(map.setFilter).toHaveBeenCalledWith("blocks-highlight", ["==", ["get", "id"], "123-ang-mo-kio-ave-3"]);
  expect(map.flyTo).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- --run MapView`
Expected: FAIL (cannot find module `./MapView`).

- [ ] **Step 3: Write `app/src/components/MapView.tsx`**

```tsx
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { IndexFeatureCollection } from "../types/contract";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// Singapore island bounding box with a small margin.
const SG_BOUNDS: [[number, number], [number, number]] = [[103.55, 1.13], [104.12, 1.50]];

interface Props {
  data: IndexFeatureCollection;
  selectedId: string | null;
  onSelectBlock: (id: string, town: string) => void;
  flyPaddingBottom?: number;
}

function highlightFilter(id: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "id"], id ?? ""];
}

export function MapView({ data, selectedId, onSelectBlock, flyPaddingBottom = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelectBlock);
  onSelectRef.current = onSelectBlock;
  // Latest data, read inside the one-shot load handler so the source is
  // created with populated features even when the index resolves before
  // the style loads.
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      bounds: SG_BOUNDS,
      maxBounds: SG_BOUNDS,
      minZoom: 10.5,
      maxZoom: 17,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    map.on("load", () => {
      map.addSource("blocks", {
        type: "geojson",
        data: dataRef.current,
        cluster: false,
        attribution: "Block data © HDB/data.gov.sg (Singapore Open Data Licence); Geocoding © OneMap/SLA",
      });
      map.addLayer({
        id: "blocks-circles",
        type: "circle",
        source: "blocks",
        // filter slot (extension point): no filter in v1.
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 6],
          // colorBy slot (extension point): single fixed color in v1.
          "circle-color": "#2563eb",
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "blocks-highlight",
        type: "circle",
        source: "blocks",
        // Separate layer, exempt from any future filter, so search can reveal a block.
        filter: highlightFilter(selectedIdRef.current),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 16, 10],
          "circle-color": "#f59e0b",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
    });

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
    map.on("mousemove", "blocks-circles", (e) => {
      if (!window.matchMedia("(hover: hover)").matches) return;
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { blk_no: string; street: string };
      popup.setLngLat(e.lngLat).setText(`${p.blk_no} ${p.street}`).addTo(map);
    });
    map.on("mouseleave", "blocks-circles", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("click", "blocks-circles", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { id: string; town: string };
      onSelectRef.current(p.id, p.town);
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the source data fresh (markers appear once the index has loaded).
  useEffect(() => {
    const src = mapRef.current?.getSource("blocks") as maplibregl.GeoJSONSource | undefined;
    src?.setData(data as unknown as GeoJSON.FeatureCollection);
  }, [data]);

  // Highlight + fly on selection change.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("blocks-highlight")) return;
    map.setFilter("blocks-highlight", highlightFilter(selectedId));
    if (selectedId) {
      const f = data.features.find((ft) => ft.properties.id === selectedId);
      if (f) {
        map.flyTo({
          center: f.geometry.coordinates,
          zoom: Math.max(map.getZoom(), 15),
          padding: { top: 0, right: 0, left: 0, bottom: flyPaddingBottom },
        });
      }
    }
  }, [selectedId, data, flyPaddingBottom]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- --run MapView`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/MapView.tsx app/src/components/MapView.test.tsx
git commit -m "feat(app): MapView with Singapore-locked camera, highlight + fly"
```

---

### Task 9: App integration, load/error states, sample data

Wires everything: fetch `index.geojson` + `towns.json` once, derive the search
array / slug map / detail loader, connect the store to Map/Search/Details,
handle loading and the fatal-error card, and match `flyTo` bottom padding to the
active mobile snap. Commits a tiny sample `app/public/data/` so the app runs
before the pipeline's first run.

**Files:**
- Modify: `app/src/App.tsx`
- Create: `app/public/data/index.geojson`, `app/public/data/towns.json`,
  `app/public/data/block-details/ang-mo-kio.json`,
  `app/public/data/block-details/bedok.json`
- Test: `app/src/App.test.tsx` (replace the Task 1 smoke test)

**Interfaces:**
- Consumes: `loadIndex`, `loadTowns`, `buildTownSlugMap`,
  `createGetBlockDetail`, `buildSearchIndex`, `useSelection`, `MapView`,
  `SearchBox`, `DetailsPanel`.
- Produces: the composed `App` (default export).

- [ ] **Step 1: Write the sample data files**

`app/public/data/towns.json`:

```json
[
  { "town": "ANG MO KIO", "town_slug": "ang-mo-kio", "town_code": "AMK" },
  { "town": "BEDOK", "town_slug": "bedok", "town_code": "BD" }
]
```

`app/public/data/index.geojson`:

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "geometry": { "type": "Point", "coordinates": [103.845, 1.362] },
      "properties": { "id": "123-ang-mo-kio-ave-3", "blk_no": "123", "street": "ANG MO KIO AVE 3", "street_full": "ANG MO KIO AVENUE 3", "postal": "560123", "town": "ANG MO KIO" } },
    { "type": "Feature", "geometry": { "type": "Point", "coordinates": [103.93, 1.326] },
      "properties": { "id": "1-bedok-nth-st-1", "blk_no": "1", "street": "BEDOK NTH ST 1", "street_full": "BEDOK NORTH STREET 1", "postal": "460001", "town": "BEDOK" } }
  ]
}
```

`app/public/data/block-details/ang-mo-kio.json`:

```json
{
  "123-ang-mo-kio-ave-3": { "blk_no": "123", "street": "ANG MO KIO AVE 3", "street_full": "ANG MO KIO AVENUE 3", "postal": "560123", "town": "ANG MO KIO", "year_completed": 1978, "max_floor_lvl": 12, "total_dwelling_units": 200, "sold_units_by_type": { "3room": 40, "4room": 60 }, "rental_units_by_type": { "1room": 20 } }
}
```

`app/public/data/block-details/bedok.json`:

```json
{
  "1-bedok-nth-st-1": { "blk_no": "1", "street": "BEDOK NTH ST 1", "street_full": "BEDOK NORTH STREET 1", "postal": "460001", "town": "BEDOK", "year_completed": 1985, "max_floor_lvl": 10, "total_dwelling_units": 120, "sold_units_by_type": { "3room": 50, "4room": 70 } }
}
```

- [ ] **Step 2: Write the failing test** (replace `app/src/App.test.tsx`)

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

// MapView is exercised in its own test; stub it here to a clickable list so App wiring is testable.
vi.mock("./components/MapView", () => ({
  MapView: ({ data, onSelectBlock }: any) => (
    <div>
      {data.features.map((f: any) => (
        <button key={f.properties.id} onClick={() => onSelectBlock(f.properties.id, f.properties.town)}>
          marker-{f.properties.id}
        </button>
      ))}
    </div>
  ),
}));

import App from "./App";
import { sampleIndex, sampleShard, sampleTowns } from "./test/fixtures";
import { useSelection } from "./store/selection";

afterEach(() => { vi.restoreAllMocks(); useSelection.getState().clear(); });

function stubFetch(map: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => map[key] };
  }));
}

test("loads data, then opens details when a marker is selected", async () => {
  stubFetch({
    "index.geojson": sampleIndex,
    "towns.json": sampleTowns,
    "ang-mo-kio.json": sampleShard,
  });
  render(<App />);

  await userEvent.click(await screen.findByText("marker-123-ang-mo-kio-ave-3"));
  expect(await screen.findByRole("heading", { name: /123 ANG MO KIO AVENUE 3 560123/ })).toBeInTheDocument();
});

test("shows a fatal error card when index fails to load", async () => {
  stubFetch({ "towns.json": sampleTowns }); // index.geojson -> 404
  render(<App />);
  expect(await screen.findByText(/couldn't load block data/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app && npm run test -- --run App`
Expected: FAIL. App still renders the Task 1 placeholder (no error card / no
details wiring).

- [ ] **Step 4: Write `app/src/App.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import type { IndexFeatureCollection, Town } from "./types/contract";
import { buildTownSlugMap, createGetBlockDetail, loadIndex, loadTowns } from "./lib/data";
import { buildSearchIndex } from "./lib/search";
import { useSelection } from "./store/selection";
import { MapView } from "./components/MapView";
import { SearchBox } from "./components/SearchBox";
import { DetailsPanel } from "./components/DetailsPanel";

const EMPTY_INDEX: IndexFeatureCollection = { type: "FeatureCollection", features: [] };
const SNAP_POINTS = ["120px", 0.5, 0.95] as const;

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export default function App() {
  const [index, setIndex] = useState<IndexFeatureCollection>(EMPTY_INDEX);
  const [towns, setTowns] = useState<Town[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeSnap, setActiveSnap] = useState<string | number | null>(SNAP_POINTS[1]);
  const isDesktop = useIsDesktop();

  const { selectedId, selectedTown, select, clear } = useSelection();

  useEffect(() => {
    let alive = true;
    Promise.all([loadIndex(), loadTowns()])
      .then(([idx, tw]) => { if (alive) { setIndex(idx); setTowns(tw); setStatus("ready"); } })
      .catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, []);

  const searchRows = useMemo(() => buildSearchIndex(index), [index]);
  const getBlockDetail = useMemo(() => createGetBlockDetail(buildTownSlugMap(towns)), [towns]);

  // On mobile, keep the selected marker above the sheet by matching fly padding to the snap.
  const flyPaddingBottom = useMemo(() => {
    if (isDesktop) return 0;
    if (activeSnap === SNAP_POINTS[0] || activeSnap === SNAP_POINTS[2]) return 140;
    return Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.5);
  }, [isDesktop, activeSnap]);

  return (
    <main aria-label="HDB Map" className="relative h-full w-full">
      <MapView
        data={index}
        selectedId={selectedId}
        onSelectBlock={select}
        flyPaddingBottom={flyPaddingBottom}
      />

      {status !== "error" && (
        <div className="absolute left-2 top-2 z-30 w-[min(92vw,22rem)]">
          <SearchBox rows={searchRows} onSelect={(r) => select(r.id, r.town)} />
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/10">
          <div className="rounded-lg bg-white p-6 shadow-lg">Couldn't load block data.</div>
        </div>
      )}

      {status === "ready" && selectedId && selectedTown && (
        <DetailsPanel
          selectedId={selectedId}
          selectedTown={selectedTown}
          getBlockDetail={getBlockDetail}
          isDesktop={isDesktop}
          snapPoints={[...SNAP_POINTS]}
          activeSnap={activeSnap}
          onSnapChange={setActiveSnap}
          onClose={clear}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npm run test -- --run App`
Expected: PASS (2 tests).

- [ ] **Step 6: Full verification (whole suite, typecheck, build, lint, dev
      smoke)**

Run:
```bash
cd app
npm run test -- --run
npx tsc --noEmit
npm run build
npm run lint
```
Expected: all tests PASS; `tsc` clean; build succeeds; lint clean. Optionally
`npm run dev` and confirm the basemap renders, two sample markers appear,
clicking one opens the panel, and searching "bedok" flies to that block.

- [ ] **Step 7: Commit**

```bash
git add app/src/App.tsx app/src/App.test.tsx app/public/data
git commit -m "feat(app): wire App (load/error states, selection, snap-matched fly) + sample data"
```

---

### Task 10: Vercel config + CI frontend job

Adds `Cache-Control` for `/data/*` and appends the `frontend` job to the CI
workflow the pipeline plan created. Deliverable is the config + workflow change;
verify by YAML parse and by confirming the commands match the ones used locally.

**Files:**
- Create: `app/vercel.json`
- Modify: `.github/workflows/ci.yml` (append `frontend` job under the existing
  `pipeline` job)

**Interfaces:**
- Consumes: `app/package.json` scripts; the pipeline plan's `ci.yml`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `app/vercel.json`**

```json
{
  "headers": [
    {
      "source": "/data/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=300, must-revalidate" }
      ]
    }
  ]
}
```

Note (record in the PR description): in the Vercel project settings, set **Root
Directory = `app`** (Vite preset; build `vite build` → `dist/`). Production
deploys on push to `main`, preview deploys on PRs; each pipeline data commit
triggers a redeploy that purges the CDN.

- [ ] **Step 2: Append the `frontend` job to `.github/workflows/ci.yml`**

Add this job under the existing `pipeline:` job (replacing the
`# NOTE: the frontend plan appends...` comment left by the pipeline plan):

```yaml
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: app/package-lock.json
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run build
      - run: npm run test -- --run
```

- [ ] **Step 3: Validate the workflow + config**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
python -c "import json; json.load(open('app/vercel.json')); print('json ok')"
```
Expected: prints `yaml ok` and `json ok`. Confirm the `frontend` job's commands
match the local ones from Task 9 Step 6.

- [ ] **Step 4: Commit**

```bash
git add app/vercel.json .github/workflows/ci.yml
git commit -m "ci(app): frontend CI job + Vercel /data cache headers"
```

---

## Self-Review

**1. Spec coverage** (design §4.4, §5, §5.6, §5.7, §5.8, §5.9, §6.1):

- §4.4 `getBlockDetail(id, town)` (resolve slug, lazy fetch, in-memory cache) →
  Task 3. ✓
- §4.5 TS types mirror the contract → Task 2. ✓
- §5.1 component tree (App / MapView / SearchBox / DetailsPanel) → Tasks 6–9. ✓
- §5.2 Zustand selection (`selectedId`, `selectedTown`), written on
  click/search, read by Map + Panel → Tasks 5, 8, 9. ✓
- §5.3 data loading (index once → source + search array; towns once → slug map;
  lazy shards) → Tasks 3, 9. ✓
- §5.4 map (Positron, island fit + `maxBounds`/`minZoom`/`maxZoom`,
  `cluster:false`, `blocks-circles`, separate `blocks-highlight`, hover tooltip
  abbreviated + hover-only, click→select, search fly+highlight, always
  interactive) → Task 8 (+ App wiring). ✓
- §5.5 DetailsPanel (renders entirely from shard, full-address header, skeleton
  over whole card, empty state, Vaul non-modal + snap points, desktop side
  column, dismiss clears selection, swap-in-place via selection change, mobile
  fly padding matched to snap) → Tasks 7, 9. ✓
- §5.6 search (client-side instant, substring/prefix over blk + full street +
  postal, full-address rows, select → fly+highlight+open) → Tasks 4, 6, 9. ✓
- §5.7 initial load & error (basemap immediate, markers on data, fatal card on
  index/towns failure, shard failure local → empty state) → Tasks 7 (empty
  state), 9 (fatal card, immediate basemap via empty index). ✓
- §5.8 attribution (AttributionControl; OSM+OpenFreeMap; HDB/data.gov.sg on
  source; OneMap/SLA) → Task 8. ✓
- §5.9 extension points (`colorBy` paint slot, `filter` source slot, highlight
  separate/filter-exempt) → Task 8 (commented slots + separate layer). ✓
- §6.1 Vercel (root `app/`, `/data` cache headers) + §6.2 CI frontend gate
  (tsc/eslint/build/vitest) → Task 10. ✓

**2. Placeholder scan:** No `TBD`/"add error handling"/"write tests for the
above" gaps. Every code and test step carries real content. Package versions are
pinned; `npm install` in Task 1 resolves the lockfile. The one deliberately
deferred behavior is per-snap exact fly padding, which is implemented (Task 9
`flyPaddingBottom` from `activeSnap`) rather than left open.

**3. Type/name consistency:** `GetBlockDetail`/`createGetBlockDetail` (Task 3)
is the exact type consumed by `useBlockDetail`/`DetailsPanel` (Task 7) and
produced in App (Task 9). `SearchRow`/`searchBlocks`/`buildSearchIndex` (Task 4)
match SearchBox (Task 6) and App (Task 9). `useSelection` shape (`selectedId`,
`selectedTown`, `select`, `clear`) is identical across Tasks 5, 8, 9.
`orderedUnits` + `SOLD_FLAT_TYPES`/`RENTAL_FLAT_TYPES` (Task 2) are used with
matching signatures in DetailsContent (Task 7). MapView props (`data`,
`selectedId`, `onSelectBlock`, `flyPaddingBottom`) match App's usage and the
MapView test. The `highlight` filter expression is identical in the layer
definition, the update effect, and the MapView test.

**Cross-plan consistency:** the data shapes this plan fetches (index props, town
fields, detail fields, shard filename `{town_slug}.json`, `[lon, lat]`
coordinate order, `rental_units_by_type` omitted when empty) match exactly what
the pipeline plan's `export.py` writes (§4). Task 10 edits the same `ci.yml` the
pipeline plan created, appending rather than replacing the `pipeline` job.
