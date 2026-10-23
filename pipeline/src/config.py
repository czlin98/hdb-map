import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # src -> pipeline -> repo root
PIPELINE_DIR = ROOT / "pipeline"
APP_DATA_DIR = ROOT / "app" / "public" / "data"
TOWNS_PATH = PIPELINE_DIR / "towns.json"
FAILED_BLOCKS_PATH = PIPELINE_DIR / "failed_blocks.csv"

# A run may drop at most 1% of the live blocks (~108 of ~10.8k). Real monthly change is a few
# demolitions; a OneMap outage or truncated download drops hundreds, and must not be published.
MIN_BLOCK_RATIO = 0.99

DATASETS_API_BASE = "https://api-open.data.gov.sg/v1/public/api/datasets"
# HDB Property Information
RESOURCE_ID = "d_17f5382f26140b1fdae0ba2ef6239d2f"

# LTA MRT Station Exit (GeoJSON); LRT stations are in it too.
EXITS_DATASET_ID = "d_b39d3a0871985372d7e1637193335da5"
# Lines in service, in display order. A new line's first stations fail the run until it is added
# here, since a station must have at least one code (stations.py).
OPEN_LINES = ["NS", "EW", "CG", "NE", "CC", "DT", "TE", "BP", "STC", "SE", "SW", "PTC", "PE", "PW"]
# A station is LRT-only when every code is on one of these; isLrtOnly in app/src/lib/lines.ts uses
# the same rule and must agree.
LRT_LINES = {"BP", "STC", "SE", "SW", "PTC", "PE", "PW"}
# A block lists its nearest station and up to MAX_STATIONS - 1 more within NEARBY_RADIUS_M.
NEARBY_RADIUS_M = 1000
MAX_STATIONS = 3
# Official names that title case gets wrong.
STATION_NAME_OVERRIDES = {
    "HARBOURFRONT": "HarbourFront",
    "ONE-NORTH": "one-north",
    "MACPHERSON": "MacPherson",
    "GARDENS BY THE BAY": "Gardens by the Bay",
}
# Up to 1% of ~185 stations may go (one or two closures); a truncated exits download can't.
MIN_STATION_RATIO = 0.99

ONEMAP_TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken"
ONEMAP_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"

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
    """Expand each whole token found in STREET_ABBREVIATIONS.

    Whole-token matching keeps ``ST`` (STREET) distinct from ``ST.`` (SAINT).
    """
    return " ".join(STREET_ABBREVIATIONS.get(tok, tok) for tok in street.split())


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def make_id(blk_no: str, street: str) -> str:
    """Block id, the join key across the data contract, built from the ABBREVIATED street."""
    return slugify(f"{blk_no} {street}")
