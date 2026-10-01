import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # src -> pipeline -> repo root
PIPELINE_DIR = ROOT / "pipeline"
APP_DATA_DIR = ROOT / "app" / "public" / "data"
TOWNS_PATH = PIPELINE_DIR / "towns.json"
FAILURES_PATH = PIPELINE_DIR / "geocode_failures.csv"

DATASETS_API_BASE = "https://api-open.data.gov.sg/v1/public/api/datasets"
# HDB Property Information
RESOURCE_ID = "d_17f5382f26140b1fdae0ba2ef6239d2f"

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
