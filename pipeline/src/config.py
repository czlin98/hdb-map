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
