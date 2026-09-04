# HDB Map: Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python pipeline that fetches HDB Property Information,
geocodes every residential block via OneMap, and writes the static data contract
(`index.geojson`, per-town detail shards, `towns.json`) plus a committed
`geocode_failures.csv`, run monthly by GitHub Actions.

**Architecture:** Four small, independently testable stages: **fetch → geocode →
transform → export**, orchestrated by `run.py`. Each stage is a flat module
under `pipeline/src/`. HTTP is done with `requests`; all tests mock HTTP (via
`responses`) so they need no network. Output is deterministic (sorted keys,
stable ordering) so an unchanged month is a zero-line git diff. The pipeline
emits only the data contract files (§4 of the spec); the frontend (separate
plan) consumes them.

**Tech Stack:** Python 3.14, `requests` (runtime); `pytest`, `responses`, `ruff`
(dev). GitHub Actions for the monthly cron + CI.

**Spec:** `docs/specs/hdb-map-v1-design.md`. The plan argues from
the spec; executors read both. This plan covers only the **pipeline half**
(`pipeline/` + the pipeline portions of `.github/workflows/`). The frontend
(`app/`) is a separate plan.

## Post-implementation deltas

The pipeline was later revised in five ways that diverge from the task
listings below. The listings are kept as the original execution record;
the implemented behavior is:

- **Fetch (Task 3):** uses data.gov.sg's dataset download API
  (initiate-download, poll for the CSV url, then fetch the full CSV in one
  request) instead of paginated `datastore_search`. This removed the
  per-page rate-limiting that a full ~10k-row pull triggered.
- **Export (Task 8):** JSON is written with fields in a fixed logical order
  rather than `sort_keys=True`. Determinism is preserved by explicitly
  sorting index features and shard keys by `id`.
- **run.py (Task 9):** gained an optional `--limit N` flag that geocodes
  only the first N blocks, for fast smoke tests.
- **Logging (Task 6 / Task 10):** `geocode_all` logs a per-address progress
  line (`[i/total]` + block/street, failures at WARNING); the monthly
  workflow sets `PYTHONUNBUFFERED` so these stream live in the Actions log.
- **Geocode gate (Task 5):** a result must also have a valid postal (not
  `NIL`/empty) to qualify, so the gate selects the residential building over
  businesses that share a block; a block with no valid-postal result fails as
  `no_match`.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Python 3.14.** Runtime dependency is `requests>=2.32.4` only. Dev-only:
  `pytest>=8`, `responses>=0.25`, `ruff>=0.8`.
- **No network in tests.** Every test that touches HTTP mocks it with
  `responses` (or monkeypatch). A test suite must pass fully offline.
- **Hard geocode gate: correctness over coverage.** A OneMap result qualifies
  only if, normalized (`strip().upper()`), **both** `BLK_NO == blk_no` **and**
  `ROAD_NAME == street_full` hold exactly. Read **page 1 only**. With ≥1
  qualifier, take the first; with **zero**, the block **fails**. Never fall back
  to an unqualified result.
- **Rate limit.** OneMap allows 300 calls/min with a token. Sleep `0.2 s`
  between calls (60/300); real throughput is lower still, since request latency
  adds on top of the sleep. Retry with exponential backoff on
  `429/500/502/503/504`.
- **Fail fast, no commit.** A failed OneMap token request, a failed data.gov.sg
  fetch, or an **unknown town code** aborts the run with a clear error and **no
  file writes / no commit** (last good data stays live). Per-block geocode
  failures are *not* fatal: the block is excluded that month and recorded in
  `geocode_failures.csv`.
- **Deterministic output.** All JSON is written with
  `json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False)` + a trailing
  newline. Index features are sorted by `id`; a detail shard is written for
  **every** `town_slug` (even if empty). `geocode_failures.csv` rows are sorted
  by `(blk_no, street_full)`.
- **Secrets / env:** `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`. Read from the
  environment; never hard-coded, never logged.
- **Paths are cwd-independent.** All output paths derive from the repo root
  computed in `config.py` (`Path(__file__).resolve().parents[2]`), not from the
  current working directory.
- **Bare imports.** Modules under `src/` import siblings by bare name
  (`import config`, `from fetch import fetch_blocks`). This works because pytest
  is configured with `pythonpath = ["src"]` and because running
  `python src/run.py` puts `src/` on `sys.path[0]`.

## Data Contract (what this pipeline must emit)

Written under `app/public/data/`:

- **`index.geojson`:** one `FeatureCollection`, all blocks. Each feature:
  `geometry.coordinates = [lon, lat]`;
  `properties = { id, blk_no, street, street_full, postal, town }`.
- **`block-details/{town_slug}.json`:** object keyed by `id`; each value:
  `{ blk_no, street, street_full, postal, town, year_completed, max_floor_lvl, total_dwelling_units, sold_units_by_type, rental_units_by_type }`.
  `rental_units_by_type` is omitted when empty.
- **`towns.json`:** copy of `pipeline/towns.json` (27 rows of
  `{ town, town_slug, town_code }`).

And under `pipeline/`:

- **`geocode_failures.csv`:** columns `blk_no, street_full, reason, found`;
  `reason ∈ {no_results, no_match, api_error}`.

**Invariants:** `id` is unique across all blocks; every record's
`town`/`town_slug` comes from `towns.json`; `town_slug` values are unique.

---

## File Structure

- `pipeline/pyproject.toml`: tool config only (ruff, pytest `pythonpath`). No
  build backend.
- `pipeline/requirements.txt`: runtime deps (`requests`).
- `pipeline/requirements-dev.txt`: runtime + dev deps.
- `pipeline/towns.json`: canonical 27-row town master list (source of truth).
- `pipeline/geocode_failures.csv`: generated + committed.
- `pipeline/src/config.py`: paths, endpoints, `RESOURCE_ID`,
  `STREET_ABBREVIATIONS`, `expand_street`, `slugify`, `make_id`.
- `pipeline/src/towns.py`: `load_towns`.
- `pipeline/src/fetch.py`: `fetch_blocks`.
- `pipeline/src/geocode.py`: `get_token`, `geocode_block`, `geocode_all`.
- `pipeline/src/transform.py`: flat-type tables, `transform`.
- `pipeline/src/export.py`: `to_index_feature`, `to_detail_entry`,
  `write_outputs`.
- `pipeline/src/run.py`: `run`, `write_failures`, CLI entrypoint.
- `pipeline/tests/`: one test module per stage + an integration test.
- `.github/workflows/ci.yml`: pipeline lint + test job (frontend plan appends a
  frontend job).
- `.github/workflows/pipeline.yml`: monthly cron + manual dispatch; runs
  pipeline, commits data.

---

### Task 1: Project scaffold, config constants & string helpers

Sets up the pipeline package, tool config, and the pure string helpers
(`expand_street`, `slugify`, `make_id`). These helpers have no I/O, so they're
the natural first testable deliverable; the scaffold folds in here.

**Files:**
- Create: `pipeline/pyproject.toml`
- Create: `pipeline/requirements.txt`
- Create: `pipeline/requirements-dev.txt`
- Create: `pipeline/src/config.py`
- Test: `pipeline/tests/test_config.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `expand_street(street: str) -> str`
  - `slugify(text: str) -> str`
  - `make_id(blk_no: str, street: str) -> str`
  - Module constants: `ROOT`, `PIPELINE_DIR`, `APP_DATA_DIR`, `TOWNS_PATH`,
    `FAILURES_PATH` (all `Path`); `DATASTORE_URL`, `RESOURCE_ID`,
    `ONEMAP_TOKEN_URL`, `ONEMAP_SEARCH_URL` (str);
    `STREET_ABBREVIATIONS: dict[str, str]`.

- [ ] **Step 1: Write the scaffold files**

`pipeline/pyproject.toml`:

```toml
[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
```

`pipeline/requirements.txt`:

```
requests>=2.32.4
```

`pipeline/requirements-dev.txt`:

```
-r requirements.txt
pytest>=8
responses>=0.25
ruff>=0.8
```

- [ ] **Step 2: Write the failing test**

`pipeline/tests/test_config.py`:

```python
import config


def test_expand_street_replaces_whole_tokens():
    assert config.expand_street("ANG MO KIO AVE 3") == "ANG MO KIO AVENUE 3"
    assert config.expand_street("JLN BT MERAH") == "JALAN BUKIT MERAH"
    assert config.expand_street("C'WEALTH CRES") == "COMMONWEALTH CRESCENT"


def test_expand_street_keeps_st_distinct_from_st_dot():
    assert config.expand_street("YISHUN ST 11") == "YISHUN STREET 11"
    assert config.expand_street("ST. GEORGE'S RD") == "SAINT GEORGE'S ROAD"


def test_expand_street_leaves_numerals_and_unknown_tokens():
    assert config.expand_street("TAMPINES 8") == "TAMPINES 8"


def test_slugify_and_make_id():
    assert config.slugify("ANG MO KIO AVE 3") == "ang-mo-kio-ave-3"
    assert config.make_id("123", "ANG MO KIO AVE 3") == "123-ang-mo-kio-ave-3"
    assert config.make_id("1A", "C'WEALTH CRES") == "1a-c-wealth-cres"


def test_paths_are_absolute_and_rooted():
    assert config.PIPELINE_DIR.name == "pipeline"
    assert config.APP_DATA_DIR.parts[-3:] == ("app", "public", "data")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_config.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'config'`).

- [ ] **Step 4: Write `config.py`**

`pipeline/src/config.py`:

```python
"""Shared paths, endpoints, and pure string helpers for the pipeline."""

import re
from pathlib import Path

# Repo root: src -> pipeline -> repo root
ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = ROOT / "pipeline"
APP_DATA_DIR = ROOT / "app" / "public" / "data"
TOWNS_PATH = PIPELINE_DIR / "towns.json"
FAILURES_PATH = PIPELINE_DIR / "geocode_failures.csv"

# data.gov.sg CKAN datastore.
DATASTORE_URL = "https://data.gov.sg/api/action/datastore_search"
# HDB Property Information resource id on data.gov.sg. datastore_search accepts
# the d_-prefixed id. Tests mock the datastore URL, so it isn't hit in tests.
RESOURCE_ID = "d_17f5382f26140b1fdae0ba2ef6239d2f"

ONEMAP_TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken"
ONEMAP_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"

# OneMap's canonical abbreviation map. Whole-token match.
STREET_ABBREVIATIONS = {
    "AVE": "AVENUE",
    "BT": "BUKIT",
    "CL": "CLOSE",
    "CRES": "CRESCENT",
    "CTRL": "CENTRAL",
    "C'WEALTH": "COMMONWEALTH",
    "DR": "DRIVE",
    "GDN": "GARDEN",
    "GDNS": "GARDENS",
    "HTS": "HEIGHTS",
    "JLN": "JALAN",
    "KG": "KAMPONG",
    "LOR": "LORONG",
    "MKT": "MARKET",
    "NTH": "NORTH",
    "PK": "PARK",
    "PL": "PLACE",
    "RD": "ROAD",
    "SQ": "SQUARE",
    "ST": "STREET",
    "ST.": "SAINT",
    "STH": "SOUTH",
    "TER": "TERRACE",
    "TG": "TANJONG",
    "UPP": "UPPER",
}


def expand_street(street: str) -> str:
    """Replace each whole token that is a key in STREET_ABBREVIATIONS.

    Splits on whitespace; numerals and unmatched tokens pass through unchanged.
    Whole-token matching keeps ``ST`` (STREET) distinct from ``ST.`` (SAINT).
    """
    return " ".join(STREET_ABBREVIATIONS.get(tok, tok) for tok in street.split())


def slugify(text: str) -> str:
    """Lowercase; collapse each run of non-alphanumerics to a single hyphen."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def make_id(blk_no: str, street: str) -> str:
    """Stable block id from block number + the ABBREVIATED street."""
    return slugify(f"{blk_no} {street}")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_config.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Lint**

Run: `cd pipeline && python -m ruff check src tests`
Expected: no errors. (Install deps first if needed:
`pip install -r requirements-dev.txt`.)

- [ ] **Step 7: Commit**

```bash
git add pipeline/pyproject.toml pipeline/requirements.txt pipeline/requirements-dev.txt pipeline/src/config.py pipeline/tests/test_config.py
git commit -m "feat(pipeline): scaffold + config, street/slug helpers"
```

---

### Task 2: Town master list + loader

Seeds the canonical `pipeline/towns.json` (27 rows) and a loader that validates
row shape. This is the source of truth both halves read; the pipeline uses it to
decode town codes and to enumerate shard filenames.

**Files:**
- Create: `pipeline/towns.json`
- Create: `pipeline/src/towns.py`
- Test: `pipeline/tests/test_towns.py`

**Interfaces:**
- Consumes: `config.TOWNS_PATH`.
- Produces: `load_towns(path: Path) -> list[dict]`. Each dict has keys `town`,
  `town_slug`, `town_code`; raises `ValueError` on a malformed row.

- [ ] **Step 1: Write `pipeline/towns.json`** (the 27-row town master list)

```json
[
  { "town": "ANG MO KIO",      "town_slug": "ang-mo-kio",      "town_code": "AMK" },
  { "town": "BUKIT BATOK",     "town_slug": "bukit-batok",     "town_code": "BB" },
  { "town": "BEDOK",           "town_slug": "bedok",           "town_code": "BD" },
  { "town": "BISHAN",          "town_slug": "bishan",          "town_code": "BH" },
  { "town": "BUKIT MERAH",     "town_slug": "bukit-merah",     "town_code": "BM" },
  { "town": "BUKIT PANJANG",   "town_slug": "bukit-panjang",   "town_code": "BP" },
  { "town": "BUKIT TIMAH",     "town_slug": "bukit-timah",     "town_code": "BT" },
  { "town": "CHOA CHU KANG",   "town_slug": "choa-chu-kang",   "town_code": "CCK" },
  { "town": "CLEMENTI",        "town_slug": "clementi",        "town_code": "CL" },
  { "town": "CENTRAL AREA",    "town_slug": "central-area",    "town_code": "CT" },
  { "town": "GEYLANG",         "town_slug": "geylang",         "town_code": "GL" },
  { "town": "HOUGANG",         "town_slug": "hougang",         "town_code": "HG" },
  { "town": "JURONG EAST",     "town_slug": "jurong-east",     "town_code": "JE" },
  { "town": "JURONG WEST",     "town_slug": "jurong-west",     "town_code": "JW" },
  { "town": "KALLANG/WHAMPOA", "town_slug": "kallang-whampoa", "town_code": "KWN" },
  { "town": "MARINE PARADE",   "town_slug": "marine-parade",   "town_code": "MP" },
  { "town": "PUNGGOL",         "town_slug": "punggol",         "town_code": "PG" },
  { "town": "PASIR RIS",       "town_slug": "pasir-ris",       "town_code": "PRC" },
  { "town": "QUEENSTOWN",      "town_slug": "queenstown",      "town_code": "QT" },
  { "town": "SEMBAWANG",       "town_slug": "sembawang",       "town_code": "SB" },
  { "town": "SERANGOON",       "town_slug": "serangoon",       "town_code": "SGN" },
  { "town": "SENGKANG",        "town_slug": "sengkang",        "town_code": "SK" },
  { "town": "TAMPINES",        "town_slug": "tampines",        "town_code": "TAP" },
  { "town": "TENGAH",          "town_slug": "tengah",          "town_code": "TG" },
  { "town": "TOA PAYOH",       "town_slug": "toa-payoh",       "town_code": "TP" },
  { "town": "WOODLANDS",       "town_slug": "woodlands",       "town_code": "WL" },
  { "town": "YISHUN",          "town_slug": "yishun",          "town_code": "YS" }
]
```

- [ ] **Step 2: Write the failing test**

`pipeline/tests/test_towns.py`:

```python
import json

import pytest

import config
from towns import load_towns


def test_load_canonical_towns_has_27_rows():
    towns = load_towns(config.TOWNS_PATH)
    assert len(towns) == 27
    assert all({"town", "town_slug", "town_code"} <= t.keys() for t in towns)


def test_town_slugs_are_unique():
    towns = load_towns(config.TOWNS_PATH)
    slugs = [t["town_slug"] for t in towns]
    assert len(slugs) == len(set(slugs))


def test_kallang_whampoa_slug():
    towns = load_towns(config.TOWNS_PATH)
    kw = next(t for t in towns if t["town_code"] == "KWN")
    assert kw["town"] == "KALLANG/WHAMPOA"
    assert kw["town_slug"] == "kallang-whampoa"


def test_malformed_row_raises(tmp_path):
    bad = tmp_path / "towns.json"
    bad.write_text(json.dumps([{"town": "X"}]), encoding="utf-8")
    with pytest.raises(ValueError):
        load_towns(bad)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_towns.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'towns'`).

- [ ] **Step 4: Write `towns.py`**

`pipeline/src/towns.py`:

```python
"""Load the canonical town master list."""

import json
from pathlib import Path

REQUIRED_KEYS = {"town", "town_slug", "town_code"}


def load_towns(path: Path) -> list[dict]:
    towns = json.loads(Path(path).read_text(encoding="utf-8"))
    for row in towns:
        if not REQUIRED_KEYS <= row.keys():
            raise ValueError(f"Malformed town row (missing keys): {row!r}")
    return towns
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_towns.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add pipeline/towns.json pipeline/src/towns.py pipeline/tests/test_towns.py
git commit -m "feat(pipeline): town master list + loader"
```

---

### Task 3: Fetch stage (data.gov.sg)

Pulls HDB Property Information from the paginated CKAN datastore, keeps
`residential == 'Y'`, and derives `street_full` via `expand_street`. Both street
forms and every flat-type column are carried downstream.

**Files:**
- Create: `pipeline/src/fetch.py`
- Test: `pipeline/tests/test_fetch.py`

**Interfaces:**
- Consumes: `config.DATASTORE_URL`, `config.RESOURCE_ID`,
  `config.expand_street`.
- Produces:
  `fetch_blocks(session: requests.Session | None = None, page_size: int = 500) -> list[dict]`.
  Each block dict has: `blk_no`, `street` (abbreviated), `street_full`
  (expanded), `bldg_contract_town` (code), `year_completed`, `max_floor_lvl`,
  `total_dwelling_units`, and every column in `FLAT_COLUMNS` (values as returned
  by the API, strings). Also exports `FLAT_COLUMNS: list[str]`.

- [ ] **Step 1: Confirm the resource id is set**

`config.RESOURCE_ID` was set to `d_17f5382f26140b1fdae0ba2ef6239d2f` (HDB
Property Information) in Task 1. The fetch stage reads it; tests mock the
datastore URL so they don't depend on the value. Confirm it's present:

```bash
cd pipeline && python -c "import sys; sys.path.insert(0,'src'); import config; assert config.RESOURCE_ID == 'd_17f5382f26140b1fdae0ba2ef6239d2f'; print('resource id set')"
```
Expected: prints `resource id set`.

- [ ] **Step 2: Write the failing test**

`pipeline/tests/test_fetch.py`:

```python
import responses

import config
from fetch import fetch_blocks


def _page(records, total):
    return {"result": {"records": records, "total": total}}


@responses.activate
def test_fetch_filters_residential_and_expands_street():
    records = [
        {
            "blk_no": "123", "street": "ANG MO KIO AVE 3", "residential": "Y",
            "bldg_contract_town": "AMK", "year_completed": "1978",
            "max_floor_lvl": "12", "total_dwelling_units": "200", "3room_sold": "40",
        },
        {"blk_no": "1", "street": "SOME MKT", "residential": "N", "bldg_contract_town": "CT"},
    ]
    responses.add(responses.GET, config.DATASTORE_URL, json=_page(records, 2), status=200)

    blocks = fetch_blocks(page_size=500)

    assert len(blocks) == 1
    b = blocks[0]
    assert b["blk_no"] == "123"
    assert b["street"] == "ANG MO KIO AVE 3"
    assert b["street_full"] == "ANG MO KIO AVENUE 3"
    assert b["bldg_contract_town"] == "AMK"
    assert b["3room_sold"] == "40"


@responses.activate
def test_fetch_paginates_until_total_reached():
    p1 = _page([{"blk_no": str(i), "street": "X RD", "residential": "Y",
                 "bldg_contract_town": "AMK"} for i in range(2)], 3)
    p2 = _page([{"blk_no": "2", "street": "X RD", "residential": "Y",
                 "bldg_contract_town": "AMK"}], 3)
    responses.add(responses.GET, config.DATASTORE_URL, json=p1, status=200)
    responses.add(responses.GET, config.DATASTORE_URL, json=p2, status=200)

    blocks = fetch_blocks(page_size=2)

    assert len(blocks) == 3
    assert len(responses.calls) == 2
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_fetch.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'fetch'`).

- [ ] **Step 4: Write `fetch.py`**

`pipeline/src/fetch.py`:

```python
"""Stage 1: pull HDB Property Information from data.gov.sg."""

import requests

from config import DATASTORE_URL, RESOURCE_ID, expand_street

FLAT_COLUMNS = [
    "1room_sold", "2room_sold", "3room_sold", "4room_sold", "5room_sold",
    "exec_sold", "multigen_sold", "studio_apartment_sold",
    "1room_rental", "2room_rental", "3room_rental", "other_room_rental",
]


def fetch_blocks(session: requests.Session | None = None, page_size: int = 500) -> list[dict]:
    session = session or requests.Session()
    raw: list[dict] = []
    offset = 0
    while True:
        resp = session.get(
            DATASTORE_URL,
            params={"resource_id": RESOURCE_ID, "limit": page_size, "offset": offset},
            timeout=60,
        )
        resp.raise_for_status()
        result = resp.json()["result"]
        page = result["records"]
        if not page:
            break
        raw.extend(page)
        offset += len(page)
        if offset >= result.get("total", 0):
            break

    blocks: list[dict] = []
    for rec in raw:
        if rec.get("residential") != "Y":
            continue
        street = rec["street"]
        block = {
            "blk_no": rec["blk_no"],
            "street": street,
            "street_full": expand_street(street),
            "bldg_contract_town": rec["bldg_contract_town"],
            "year_completed": rec.get("year_completed"),
            "max_floor_lvl": rec.get("max_floor_lvl"),
            "total_dwelling_units": rec.get("total_dwelling_units"),
        }
        for col in FLAT_COLUMNS:
            block[col] = rec.get(col)
        blocks.append(block)
    return blocks
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_fetch.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/fetch.py pipeline/tests/test_fetch.py
git commit -m "feat(pipeline): fetch stage with residential filter + street expansion"
```

---

### Task 4: Geocode stage (OneMap token)

Fetches a fresh short-lived OneMap access token from credentials. A failure here
must raise so the run aborts before any writes (fail-fast, last good data stays
live).

**Files:**
- Create: `pipeline/src/geocode.py`
- Test: `pipeline/tests/test_geocode_token.py`

**Interfaces:**
- Consumes: `config.ONEMAP_TOKEN_URL`.
- Produces:
  `get_token(session: requests.Session, email: str, password: str) -> str`.
  Returns the access token; raises on HTTP error or a missing token.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_geocode_token.py`:

```python
import pytest
import requests
import responses

import config
from geocode import get_token


@responses.activate
def test_get_token_returns_access_token():
    responses.add(responses.POST, config.ONEMAP_TOKEN_URL,
                  json={"access_token": "tok-123"}, status=200)
    assert get_token(requests.Session(), "e@x.com", "pw") == "tok-123"


@responses.activate
def test_get_token_raises_on_http_error():
    responses.add(responses.POST, config.ONEMAP_TOKEN_URL, json={}, status=401)
    with pytest.raises(requests.HTTPError):
        get_token(requests.Session(), "e@x.com", "pw")


@responses.activate
def test_get_token_raises_when_missing_token():
    responses.add(responses.POST, config.ONEMAP_TOKEN_URL, json={"foo": "bar"}, status=200)
    with pytest.raises(RuntimeError):
        get_token(requests.Session(), "e@x.com", "pw")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_geocode_token.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'geocode'`).

- [ ] **Step 3: Write `geocode.py` (token only for now)**

`pipeline/src/geocode.py`:

```python
"""Stage 2: OneMap geocoding (token, per-block gate, batch loop)."""

import requests

from config import ONEMAP_TOKEN_URL


def get_token(session: requests.Session, email: str, password: str) -> str:
    resp = session.post(
        ONEMAP_TOKEN_URL, json={"email": email, "password": password}, timeout=30
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError("OneMap token request returned no access_token")
    return token
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_geocode_token.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/geocode.py pipeline/tests/test_geocode_token.py
git commit -m "feat(pipeline): OneMap token fetch (fail-fast)"
```

---

### Task 5: Geocode stage (single block + hard gate)

Geocodes one block against OneMap Search (page 1 only) and applies the hard
gate. Returns either a success payload (postal + coords) or a typed failure
(`no_results` / `no_match` / `api_error`), with retry/backoff on transient
errors.

**Files:**
- Modify: `pipeline/src/geocode.py`
- Test: `pipeline/tests/test_geocode_block.py`

**Interfaces:**
- Consumes: `config.ONEMAP_SEARCH_URL`.
- Produces:
  `geocode_block(session, token: str, block: dict, max_retries: int = 3, backoff: float = 1.0) -> dict`.
  Success: `{"ok": True, "postal": str, "lat": str, "lon": str}`. Failure:
  `{"ok": False, "reason": str, "found": int}` with
  `reason ∈ {no_results, no_match, api_error}`.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_geocode_block.py`:

```python
import requests
import responses

import config
from geocode import geocode_block

BLOCK = {"blk_no": "123", "street_full": "ANG MO KIO AVENUE 3"}


def _result(blk, road, postal="560123", lat="1.36", lon="103.84"):
    return {"BLK_NO": blk, "ROAD_NAME": road, "POSTAL": postal,
            "LATITUDE": lat, "LONGITUDE": lon}


@responses.activate
def test_gate_passes_on_exact_match():
    body = {"found": 1, "results": [_result("123", "ANG MO KIO AVENUE 3")]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    out = geocode_block(requests.Session(), "tok", BLOCK)
    assert out == {"ok": True, "postal": "560123", "lat": "1.36", "lon": "103.84"}


@responses.activate
def test_gate_normalizes_case_and_whitespace():
    body = {"found": 1, "results": [_result(" 123 ", "ang mo kio avenue 3")]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    assert geocode_block(requests.Session(), "tok", BLOCK)["ok"] is True


@responses.activate
def test_multiple_qualifiers_take_first():
    body = {"found": 2, "results": [
        _result("123", "ANG MO KIO AVENUE 3", postal="560123"),
        _result("123", "ANG MO KIO AVENUE 3", postal="999999"),
    ]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    assert geocode_block(requests.Session(), "tok", BLOCK)["postal"] == "560123"


@responses.activate
def test_no_results():
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL,
                  json={"found": 0, "results": []}, status=200)
    out = geocode_block(requests.Session(), "tok", BLOCK)
    assert out == {"ok": False, "reason": "no_results", "found": 0}


@responses.activate
def test_no_match_when_gate_rejects_all():
    body = {"found": 1, "results": [_result("999", "SOME OTHER ROAD")]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    out = geocode_block(requests.Session(), "tok", BLOCK)
    assert out == {"ok": False, "reason": "no_match", "found": 1}


@responses.activate
def test_retries_then_succeeds(monkeypatch):
    import geocode
    monkeypatch.setattr(geocode.time, "sleep", lambda *_: None)
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, status=503)
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL,
                  json={"found": 1, "results": [_result("123", "ANG MO KIO AVENUE 3")]},
                  status=200)
    assert geocode_block(requests.Session(), "tok", BLOCK)["ok"] is True


@responses.activate
def test_api_error_after_exhausting_retries(monkeypatch):
    import geocode
    monkeypatch.setattr(geocode.time, "sleep", lambda *_: None)
    for _ in range(3):
        responses.add(responses.GET, config.ONEMAP_SEARCH_URL, status=503)
    out = geocode_block(requests.Session(), "tok", BLOCK, max_retries=3)
    assert out == {"ok": False, "reason": "api_error", "found": 0}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_geocode_block.py -v`
Expected: FAIL (`ImportError: cannot import name 'geocode_block'`).

- [ ] **Step 3: Add `geocode_block` to `geocode.py`**

Add these imports at the top of `pipeline/src/geocode.py`:

```python
import time
```

and add to the same import line group (endpoints):

```python
from config import ONEMAP_SEARCH_URL, ONEMAP_TOKEN_URL
```

Then append:

```python
_TRANSIENT = {429, 500, 502, 503, 504}


def _norm(value: str | None) -> str:
    return (value or "").strip().upper()


def geocode_block(
    session: requests.Session,
    token: str,
    block: dict,
    max_retries: int = 3,
    backoff: float = 1.0,
) -> dict:
    params = {
        "searchVal": f"{block['blk_no']} {block['street_full']}",
        "returnGeom": "Y",
        "getAddrDetails": "Y",
        "pageNum": 1,
    }
    headers = {"Authorization": f"Bearer {token}"}
    for attempt in range(max_retries):
        try:
            resp = session.get(
                ONEMAP_SEARCH_URL, params=params, headers=headers, timeout=30
            )
        except requests.RequestException:
            resp = None

        if resp is not None and resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            found = data.get("found", len(results))
            if not results:
                return {"ok": False, "reason": "no_results", "found": found}
            blk, road = _norm(block["blk_no"]), _norm(block["street_full"])
            for r in results:
                if _norm(r.get("BLK_NO")) == blk and _norm(r.get("ROAD_NAME")) == road:
                    return {
                        "ok": True,
                        "postal": r.get("POSTAL"),
                        "lat": r.get("LATITUDE"),
                        "lon": r.get("LONGITUDE"),
                    }
            return {"ok": False, "reason": "no_match", "found": found}

        # Non-transient HTTP error: give up immediately.
        if resp is not None and resp.status_code not in _TRANSIENT:
            return {"ok": False, "reason": "api_error", "found": 0}

        # Transient or connection error: back off and retry.
        time.sleep(backoff * (2 ** attempt))

    return {"ok": False, "reason": "api_error", "found": 0}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_geocode_block.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/geocode.py pipeline/tests/test_geocode_block.py
git commit -m "feat(pipeline): per-block geocode with hard gate + retries"
```

---

### Task 6: Geocode stage (batch loop, rate limit, failure collection)

Iterates all blocks: paces calls with `sleep`, merges geocode results onto
success records, and collects typed failures for the CSV.

**Files:**
- Modify: `pipeline/src/geocode.py`
- Test: `pipeline/tests/test_geocode_all.py`

**Interfaces:**
- Consumes: `geocode_block`.
- Produces:
  `geocode_all(session, token: str, blocks: list[dict], sleep: float = 0.2) -> tuple[list[dict], list[dict]]`.
  First list: successes, each input block dict merged with `postal`, `lat`,
  `lon`. Second list: failures, `{"blk_no", "street_full", "reason", "found"}`.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_geocode_all.py`:

```python
import geocode
from geocode import geocode_all

BLOCKS = [
    {"blk_no": "1", "street_full": "A ROAD", "bldg_contract_town": "AMK"},
    {"blk_no": "2", "street_full": "B ROAD", "bldg_contract_town": "AMK"},
]


def test_geocode_all_splits_successes_and_failures(monkeypatch):
    calls = {"sleep": 0}
    monkeypatch.setattr(geocode.time, "sleep", lambda *_: calls.__setitem__("sleep", calls["sleep"] + 1))

    def fake_block(session, token, block, **kw):
        if block["blk_no"] == "1":
            return {"ok": True, "postal": "111111", "lat": "1.1", "lon": "103.1"}
        return {"ok": False, "reason": "no_match", "found": 3}

    monkeypatch.setattr(geocode, "geocode_block", fake_block)

    successes, failures = geocode_all(session=None, token="tok", blocks=BLOCKS)

    assert len(successes) == 1
    assert successes[0]["blk_no"] == "1"
    assert successes[0]["postal"] == "111111"
    assert successes[0]["lat"] == "1.1"
    assert successes[0]["bldg_contract_town"] == "AMK"  # original fields preserved

    assert failures == [
        {"blk_no": "2", "street_full": "B ROAD", "reason": "no_match", "found": 3}
    ]
    assert calls["sleep"] == 2  # paced once per block
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_geocode_all.py -v`
Expected: FAIL (`ImportError: cannot import name 'geocode_all'`).

- [ ] **Step 3: Add `geocode_all` to `geocode.py`**

Append to `pipeline/src/geocode.py`:

```python
def geocode_all(
    session: requests.Session,
    token: str,
    blocks: list[dict],
    sleep: float = 0.2,
) -> tuple[list[dict], list[dict]]:
    successes: list[dict] = []
    failures: list[dict] = []
    for block in blocks:
        result = geocode_block(session, token, block)
        if result["ok"]:
            successes.append({
                **block,
                "postal": result["postal"],
                "lat": result["lat"],
                "lon": result["lon"],
            })
        else:
            failures.append({
                "blk_no": block["blk_no"],
                "street_full": block["street_full"],
                "reason": result["reason"],
                "found": result["found"],
            })
        time.sleep(sleep)
    return successes, failures
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_geocode_all.py -v`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/geocode.py pipeline/tests/test_geocode_all.py
git commit -m "feat(pipeline): batch geocode loop with pacing + failure collection"
```

---

### Task 7: Transform stage

Decodes town codes (unknown code → fail the run), joins fetch + geocode into
clean per-block records, and derives the `sold`/`rental` units-by-type maps
(only types with >0 units).

**Files:**
- Create: `pipeline/src/transform.py`
- Test: `pipeline/tests/test_transform.py`

**Interfaces:**
- Consumes: `config.make_id`; success records from `geocode_all`; towns from
  `load_towns`.
- Produces:
  - `FLAT_TYPES_SOLD: list[tuple[str, str]]`,
    `FLAT_TYPES_RENTAL: list[tuple[str, str]]` (source column → key).
  - `transform(geocoded: list[dict], towns: list[dict]) -> list[dict]`. Each
    record:
    `id, blk_no, street, street_full, postal, town, town_slug, lat (float), lon (float), year_completed (int), max_floor_lvl (int), total_dwelling_units (int), sold_units_by_type (dict[str,int]), rental_units_by_type (dict[str,int])`.
    Raises `ValueError` on an unknown town code.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_transform.py`:

```python
import pytest

from transform import transform

TOWNS = [
    {"town": "ANG MO KIO", "town_slug": "ang-mo-kio", "town_code": "AMK"},
    {"town": "KALLANG/WHAMPOA", "town_slug": "kallang-whampoa", "town_code": "KWN"},
]


def _block(**over):
    base = {
        "blk_no": "123", "street": "ANG MO KIO AVE 3",
        "street_full": "ANG MO KIO AVENUE 3", "bldg_contract_town": "AMK",
        "postal": "560123", "lat": "1.36", "lon": "103.84",
        "year_completed": "1978", "max_floor_lvl": "12", "total_dwelling_units": "200",
        "3room_sold": "40", "4room_sold": "60", "5room_sold": "0",
        "1room_rental": "0", "other_room_rental": "5",
    }
    base.update(over)
    return base


def test_transform_builds_clean_record():
    (rec,) = transform([_block()], TOWNS)
    assert rec["id"] == "123-ang-mo-kio-ave-3"
    assert rec["town"] == "ANG MO KIO"
    assert rec["town_slug"] == "ang-mo-kio"
    assert rec["lat"] == 1.36 and rec["lon"] == 103.84
    assert rec["year_completed"] == 1978
    assert rec["max_floor_lvl"] == 12
    assert rec["total_dwelling_units"] == 200


def test_units_by_type_keeps_only_positive_and_drops_suffix():
    (rec,) = transform([_block()], TOWNS)
    assert rec["sold_units_by_type"] == {"3room": 40, "4room": 60}  # 5room=0 dropped
    assert rec["rental_units_by_type"] == {"other_room": 5}  # 1room=0 dropped


def test_missing_flat_columns_default_to_zero():
    block = _block()
    del block["3room_sold"]
    (rec,) = transform([block], TOWNS)
    assert "3room" not in rec["sold_units_by_type"]


def test_unknown_town_code_raises():
    with pytest.raises(ValueError, match="Unknown town code"):
        transform([_block(bldg_contract_town="ZZZ")], TOWNS)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_transform.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'transform'`).

- [ ] **Step 3: Write `transform.py`**

`pipeline/src/transform.py`:

```python
"""Stage 3: decode town, join, derive per-block records."""

from config import make_id

# (source column, output key): source-column display order, low to high.
FLAT_TYPES_SOLD = [
    ("1room_sold", "1room"),
    ("2room_sold", "2room"),
    ("3room_sold", "3room"),
    ("4room_sold", "4room"),
    ("5room_sold", "5room"),
    ("exec_sold", "exec"),
    ("multigen_sold", "multigen"),
    ("studio_apartment_sold", "studio_apartment"),
]
FLAT_TYPES_RENTAL = [
    ("1room_rental", "1room"),
    ("2room_rental", "2room"),
    ("3room_rental", "3room"),
    ("other_room_rental", "other_room"),
]


def _to_int(value) -> int:
    try:
        return int(str(value).strip())
    except (ValueError, TypeError, AttributeError):
        return 0


def _units_by_type(block: dict, mapping: list[tuple[str, str]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for col, key in mapping:
        n = _to_int(block.get(col, 0))
        if n > 0:
            out[key] = n
    return out


def transform(geocoded: list[dict], towns: list[dict]) -> list[dict]:
    code_index = {t["town_code"]: t for t in towns}
    records: list[dict] = []
    for block in geocoded:
        code = block["bldg_contract_town"]
        town = code_index.get(code)
        if town is None:
            raise ValueError(
                f"Unknown town code {code!r} for blk {block['blk_no']} "
                f"{block['street_full']}"
            )
        records.append({
            "id": make_id(block["blk_no"], block["street"]),
            "blk_no": block["blk_no"],
            "street": block["street"],
            "street_full": block["street_full"],
            "postal": block["postal"],
            "town": town["town"],
            "town_slug": town["town_slug"],
            "lat": float(block["lat"]),
            "lon": float(block["lon"]),
            "year_completed": _to_int(block.get("year_completed")),
            "max_floor_lvl": _to_int(block.get("max_floor_lvl")),
            "total_dwelling_units": _to_int(block.get("total_dwelling_units")),
            "sold_units_by_type": _units_by_type(block, FLAT_TYPES_SOLD),
            "rental_units_by_type": _units_by_type(block, FLAT_TYPES_RENTAL),
        })
    return records
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_transform.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/transform.py pipeline/tests/test_transform.py
git commit -m "feat(pipeline): transform stage (town decode + flat-type maps)"
```

---

### Task 8: Export stage

Asserts `town_slug` and block `id` uniqueness, then deterministically writes
`index.geojson`, per-town detail shards (one per slug, empty allowed), and the
`towns.json` copy.

**Files:**
- Create: `pipeline/src/export.py`
- Test: `pipeline/tests/test_export.py`

**Interfaces:**
- Consumes: `config.APP_DATA_DIR`; records from `transform`; towns from
  `load_towns`.
- Produces:
  - `to_index_feature(rec: dict) -> dict`
  - `to_detail_entry(rec: dict) -> dict` (omits `rental_units_by_type` when
    empty)
  - `write_outputs(records: list[dict], towns: list[dict], app_data_dir: Path | None = None) -> None`.
    Raises `ValueError` on duplicate `town_slug` or duplicate `id`.

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_export.py`:

```python
import json

import pytest

from export import to_detail_entry, to_index_feature, write_outputs

TOWNS = [
    {"town": "ANG MO KIO", "town_slug": "ang-mo-kio", "town_code": "AMK"},
    {"town": "BEDOK", "town_slug": "bedok", "town_code": "BD"},
]


def _rec(**over):
    base = {
        "id": "123-ang-mo-kio-ave-3", "blk_no": "123", "street": "ANG MO KIO AVE 3",
        "street_full": "ANG MO KIO AVENUE 3", "postal": "560123", "town": "ANG MO KIO",
        "town_slug": "ang-mo-kio", "lat": 1.36, "lon": 103.84, "year_completed": 1978,
        "max_floor_lvl": 12, "total_dwelling_units": 200,
        "sold_units_by_type": {"3room": 40}, "rental_units_by_type": {},
    }
    base.update(over)
    return base


def test_index_feature_shape():
    f = to_index_feature(_rec())
    assert f["geometry"]["coordinates"] == [103.84, 1.36]  # [lon, lat]
    assert set(f["properties"]) == {"id", "blk_no", "street", "street_full", "postal", "town"}


def test_detail_entry_omits_empty_rental():
    entry = to_detail_entry(_rec())
    assert "rental_units_by_type" not in entry
    entry2 = to_detail_entry(_rec(rental_units_by_type={"1room": 5}))
    assert entry2["rental_units_by_type"] == {"1room": 5}


def test_write_outputs_creates_all_files(tmp_path):
    write_outputs([_rec()], TOWNS, app_data_dir=tmp_path)

    index = json.loads((tmp_path / "index.geojson").read_text())
    assert index["type"] == "FeatureCollection"
    assert len(index["features"]) == 1

    # a shard exists for EVERY slug, even empty ones
    assert json.loads((tmp_path / "block-details" / "bedok.json").read_text()) == {}
    amk = json.loads((tmp_path / "block-details" / "ang-mo-kio.json").read_text())
    assert "123-ang-mo-kio-ave-3" in amk

    assert json.loads((tmp_path / "towns.json").read_text()) == TOWNS


def test_write_outputs_is_deterministic(tmp_path):
    write_outputs([_rec()], TOWNS, app_data_dir=tmp_path)
    first = (tmp_path / "index.geojson").read_text()
    write_outputs([_rec()], TOWNS, app_data_dir=tmp_path)
    assert (tmp_path / "index.geojson").read_text() == first
    assert first.endswith("\n")


def test_duplicate_id_raises(tmp_path):
    with pytest.raises(ValueError, match="Duplicate block id"):
        write_outputs([_rec(), _rec()], TOWNS, app_data_dir=tmp_path)


def test_duplicate_town_slug_raises(tmp_path):
    dupe_towns = TOWNS + [{"town": "X", "town_slug": "bedok", "town_code": "XX"}]
    with pytest.raises(ValueError, match="Duplicate town_slug"):
        write_outputs([_rec()], dupe_towns, app_data_dir=tmp_path)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_export.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'export'`).

- [ ] **Step 3: Write `export.py`**

`pipeline/src/export.py`:

```python
"""Stage 4: write the data contract files, deterministically."""

import json
from collections import Counter
from pathlib import Path

import config


def to_index_feature(rec: dict) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [rec["lon"], rec["lat"]]},
        "properties": {
            "id": rec["id"],
            "blk_no": rec["blk_no"],
            "street": rec["street"],
            "street_full": rec["street_full"],
            "postal": rec["postal"],
            "town": rec["town"],
        },
    }


def to_detail_entry(rec: dict) -> dict:
    entry = {
        "blk_no": rec["blk_no"],
        "street": rec["street"],
        "street_full": rec["street_full"],
        "postal": rec["postal"],
        "town": rec["town"],
        "year_completed": rec["year_completed"],
        "max_floor_lvl": rec["max_floor_lvl"],
        "total_dwelling_units": rec["total_dwelling_units"],
        "sold_units_by_type": rec["sold_units_by_type"],
    }
    if rec["rental_units_by_type"]:
        entry["rental_units_by_type"] = rec["rental_units_by_type"]
    return entry


def _write_json(path: Path, obj) -> None:
    path.write_text(
        json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def write_outputs(records: list[dict], towns: list[dict], app_data_dir: Path | None = None) -> None:
    app_data_dir = Path(app_data_dir or config.APP_DATA_DIR)

    slugs = [t["town_slug"] for t in towns]
    dup_slugs = [s for s, n in Counter(slugs).items() if n > 1]
    if dup_slugs:
        raise ValueError(f"Duplicate town_slug: {sorted(dup_slugs)}")

    ids = [r["id"] for r in records]
    dup_ids = [i for i, n in Counter(ids).items() if n > 1]
    if dup_ids:
        raise ValueError(f"Duplicate block id(s): {sorted(dup_ids)}")

    app_data_dir.mkdir(parents=True, exist_ok=True)

    features = [to_index_feature(r) for r in sorted(records, key=lambda r: r["id"])]
    _write_json(app_data_dir / "index.geojson",
                {"type": "FeatureCollection", "features": features})

    shard_dir = app_data_dir / "block-details"
    shard_dir.mkdir(parents=True, exist_ok=True)
    by_slug: dict[str, dict] = {}
    for r in records:
        by_slug.setdefault(r["town_slug"], {})[r["id"]] = to_detail_entry(r)
    for slug in slugs:  # a shard for EVERY town, even empty
        _write_json(shard_dir / f"{slug}.json", by_slug.get(slug, {}))

    _write_json(app_data_dir / "towns.json", towns)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_export.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/export.py pipeline/tests/test_export.py
git commit -m "feat(pipeline): export stage (deterministic contract writes + uniqueness gates)"
```

---

### Task 9: run.py orchestrator + failures CSV

Wires the four stages, enforces fail-fast ordering (token before any writes),
writes the sorted `geocode_failures.csv`, and logs per-run counts.

**Files:**
- Create: `pipeline/src/run.py`
- Test: `pipeline/tests/test_run.py`

**Interfaces:**
- Consumes: `get_token`, `geocode_all`, `fetch_blocks`, `transform`,
  `write_outputs`, `load_towns`, `config`.
- Produces:
  - `write_failures(failures: list[dict], path: Path | None = None) -> None`.
    Writes `blk_no, street_full, reason, found`, header row, sorted by
    `(blk_no, street_full)`.
  - `run() -> None`. The orchestrator; `python src/run.py` calls it. Reads
    `ONEMAP_EMAIL`/`ONEMAP_PASSWORD` from the environment (KeyError → fail
    fast).

- [ ] **Step 1: Write the failing test**

`pipeline/tests/test_run.py`:

```python
import csv

import responses

import config
import geocode
import run as run_module


@responses.activate
def test_run_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setenv("ONEMAP_EMAIL", "e@x.com")
    monkeypatch.setenv("ONEMAP_PASSWORD", "pw")
    monkeypatch.setattr(config, "APP_DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "FAILURES_PATH", tmp_path / "geocode_failures.csv")
    monkeypatch.setattr(geocode.time, "sleep", lambda *_: None)

    # towns: use the real canonical file.
    responses.add(responses.POST, config.ONEMAP_TOKEN_URL,
                  json={"access_token": "tok"}, status=200)
    responses.add(responses.GET, config.DATASTORE_URL, json={"result": {"records": [
        {"blk_no": "123", "street": "ANG MO KIO AVE 3", "residential": "Y",
         "bldg_contract_town": "AMK", "year_completed": "1978", "max_floor_lvl": "12",
         "total_dwelling_units": "200", "3room_sold": "40"},
        {"blk_no": "999", "street": "NOWHERE RD", "residential": "Y",
         "bldg_contract_town": "AMK"},
    ], "total": 2}}, status=200)
    # block 123 matches; block 999 has no results -> failure
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json={"found": 1, "results": [
        {"BLK_NO": "123", "ROAD_NAME": "ANG MO KIO AVENUE 3", "POSTAL": "560123",
         "LATITUDE": "1.36", "LONGITUDE": "103.84"}]}, status=200)
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL,
                  json={"found": 0, "results": []}, status=200)

    run_module.run()

    import json
    index = json.loads((tmp_path / "data" / "index.geojson").read_text())
    assert len(index["features"]) == 1
    assert index["features"][0]["properties"]["id"] == "123-ang-mo-kio-ave-3"

    with (tmp_path / "geocode_failures.csv").open() as fh:
        rows = list(csv.DictReader(fh))
    assert rows == [{"blk_no": "999", "street_full": "NOWHERE ROAD",
                     "reason": "no_results", "found": "0"}]


def test_write_failures_sorted(tmp_path):
    path = tmp_path / "f.csv"
    run_module.write_failures([
        {"blk_no": "9", "street_full": "Z RD", "reason": "no_match", "found": 2},
        {"blk_no": "1", "street_full": "A RD", "reason": "no_results", "found": 0},
    ], path=path)
    with path.open() as fh:
        rows = list(csv.DictReader(fh))
    assert [r["blk_no"] for r in rows] == ["1", "9"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pipeline && python -m pytest tests/test_run.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'run'`).

- [ ] **Step 3: Write `run.py`**

`pipeline/src/run.py`:

```python
"""Orchestrator: fetch -> geocode -> transform -> export."""

import csv
import logging
import os
from pathlib import Path

import requests

import config
from export import write_outputs
from fetch import fetch_blocks
from geocode import geocode_all, get_token
from towns import load_towns
from transform import transform

log = logging.getLogger("pipeline")


def write_failures(failures: list[dict], path: Path | None = None) -> None:
    path = Path(path or config.FAILURES_PATH)
    rows = sorted(failures, key=lambda f: (f["blk_no"], f["street_full"]))
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["blk_no", "street_full", "reason", "found"])
        writer.writeheader()
        writer.writerows(rows)


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    email = os.environ["ONEMAP_EMAIL"]
    password = os.environ["ONEMAP_PASSWORD"]
    session = requests.Session()

    # Fail fast BEFORE any writes: token, then towns, then fetch.
    token = get_token(session, email, password)
    towns = load_towns(config.TOWNS_PATH)
    blocks = fetch_blocks(session)
    log.info("fetched %d residential blocks", len(blocks))

    successes, failures = geocode_all(session, token, blocks)
    log.info("geocoded %d, failed %d", len(successes), len(failures))

    records = transform(successes, towns)  # unknown town code -> raises, no writes
    write_outputs(records, towns, config.APP_DATA_DIR)
    write_failures(failures, config.FAILURES_PATH)
    log.info("wrote %d blocks to index + %d shards", len(records), len(towns))


if __name__ == "__main__":
    run()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pipeline && python -m pytest tests/test_run.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole suite + lint**

Run: `cd pipeline && python -m pytest -v && python -m ruff check src tests`
Expected: all tests PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/run.py pipeline/tests/test_run.py
git commit -m "feat(pipeline): orchestrator + failures CSV"
```

---

### Task 10: GitHub Actions (CI + monthly pipeline)

Adds the CI job (lint + test the pipeline) and the monthly data-refresh workflow
(run the pipeline, commit data only if it changed). No new code logic. This
task's deliverable is the two workflow files; verify by YAML-linting and by
confirming the referenced commands match the ones used locally.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pipeline.yml`

**Interfaces:**
- Consumes: `pipeline/requirements*.txt`, `pipeline/src/run.py`, secrets
  `ONEMAP_EMAIL` / `ONEMAP_PASSWORD`.
- Produces: nothing consumed by later tasks. (The **frontend plan** will add a
  `frontend` job to `ci.yml`; leave the file structured so a second job appends
  cleanly.)

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  pipeline:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: pipeline
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.14"
      - run: pip install -r requirements-dev.txt
      - run: ruff check src tests
      - run: pytest
  # NOTE: the frontend plan appends a `frontend:` job here (tsc / eslint / vite build / vitest).
```

- [ ] **Step 2: Write `.github/workflows/pipeline.yml`**

```yaml
name: pipeline

on:
  schedule:
    - cron: "0 2 1 * *"   # 02:00 UTC = 10:00 SGT on the 1st of each month (Actions cron is UTC-only)
  workflow_dispatch:

concurrency:
  group: pipeline
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.14"
      - name: Install runtime deps
        working-directory: pipeline
        run: pip install -r requirements.txt
      - name: Run pipeline
        working-directory: pipeline
        env:
          ONEMAP_EMAIL: ${{ secrets.ONEMAP_EMAIL }}
          ONEMAP_PASSWORD: ${{ secrets.ONEMAP_PASSWORD }}
        run: python src/run.py
      - name: Commit data if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add app/public/data pipeline/geocode_failures.csv
          if git diff --cached --quiet; then
            echo "No data changes; nothing to commit."
          else
            git commit -m "chore(data): monthly HDB refresh"
            git push
          fi
```

- [ ] **Step 3: Validate the workflow YAML**

Run:
`python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['.github/workflows/ci.yml','.github/workflows/pipeline.yml']]; print('ok')"`
Expected: prints `ok` (install PyYAML first if needed: `pip install pyyaml`). If
`yamllint` or `actionlint` is available, prefer it.

- [ ] **Step 4: Confirm secrets are documented**

Confirm the repository has (or a maintainer will add) Actions secrets
`ONEMAP_EMAIL` and `ONEMAP_PASSWORD`. Note this in the PR description; the cron
run fails fast without them, leaving last good data live.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/pipeline.yml
git commit -m "ci(pipeline): CI lint/test job + monthly refresh workflow"
```

---

## Self-Review

**1. Spec coverage** (design §3, §4, §6):

- §3.1 fetch (residential filter, `expand_street`, both street forms, flat-type
  columns) → Task 3 + Task 1 (`expand_street`). ✓
- §3.2 geocode (fresh token/fail-fast, hard gate, multiple→first / zero→fail,
  300/min sleep, retry/backoff, failure reasons + `found`,
  exclude-and-retry-next-run) → Tasks 4–6. ✓
- §3.3 transform (town decode, unknown-code fail, join, sold/rental >0 maps,
  projections) → Task 7 (index/detail projections built in Task 8). ✓
- §3.4 export (slug + id uniqueness asserts, index.geojson, shards by slug,
  towns.json copy, deterministic) → Task 8. ✓
- §3.5 config/helpers/logging (`STREET_ABBREVIATIONS`, `expand_street`
  whole-token + ST/ST., structured per-run counts, failures CSV, mocked tests) →
  Tasks 1, 9; mocking used throughout. ✓
- §4.1 index shape ([lon,lat], light props) → Task 8 `to_index_feature`. ✓
- §4.2 towns.json (27 rows, three fields) → Task 2. ✓
- §4.3 detail shape (keyed by id, self-contained, rental omitted when empty) →
  Task 8 `to_detail_entry`. ✓
- §4.5 invariants (unique id, town from towns.json, sorted/stable, `id` from
  abbreviated street) → Task 8 + `make_id` (Task 1). ✓
- §6.2 workflows (cron+dispatch, commit-if-diff, concurrency, contents:write, CI
  ruff+pytest, secrets) → Task 10. ✓
- **`getBlockDetail` / TS types (§4.4, §5):** frontend, out of scope for this
  plan. Deferred to the frontend plan. ✓ (intentional gap)

**2. Placeholder scan:** The only intentional fill-in is `RESOURCE_ID`, handled
as an explicit action (Task 3 Step 1) with a concrete source and a note that
tests mock the URL. No `TBD`/"add error handling"/"write tests for the
above"-style gaps; every code and test step carries real content.

**3. Type consistency:** `expand_street`/`slugify`/`make_id` (Task 1) used with
matching signatures in Tasks 3, 7, 8. Success-record keys produced by
`geocode_all` (Task 6: `+postal/lat/lon`) are exactly those consumed by
`transform` (Task 7). Record keys emitted by `transform` (Task 7) are exactly
those read by `to_index_feature`/`to_detail_entry` (Task 8). Failure dict keys
(`blk_no, street_full, reason, found`) are consistent across Tasks 5, 6, 9 and
the CSV header. `config.APP_DATA_DIR`/`FAILURES_PATH` monkeypatched via
`import config` (not `from`), matching how `run`/`export` read them at call
time.
