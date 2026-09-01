"""Stage 1: pull HDB Property Information from data.gov.sg (bulk CSV download).

Uses data.gov.sg's dataset download API: initiate-download, then poll-download
until a temporary CSV url is ready, then fetch that CSV in one request.
"""

import csv
import io
import time

import requests

from config import DATASETS_API_BASE, RESOURCE_ID, expand_street

FLAT_COLUMNS = [
    "1room_sold", "2room_sold", "3room_sold", "4room_sold", "5room_sold",
    "exec_sold", "multigen_sold", "studio_apartment_sold",
    "1room_rental", "2room_rental", "3room_rental", "other_room_rental",
]

# Transient HTTP codes worth retrying on any of the three download calls.
_TRANSIENT = {429, 500, 502, 503, 504}


def _api_get(
    session: requests.Session,
    url: str,
    max_retries: int = 5,
    backoff: float = 1.0,
    stream: bool = False,
) -> requests.Response:
    """GET a url, retrying transient errors with backoff (honoring Retry-After).

    A non-transient error raises immediately; exhausting retries on a transient
    error also raises (fail fast, no writes).
    """
    resp = None
    for attempt in range(max_retries):
        resp = session.get(url, timeout=120, stream=stream)
        if resp.status_code not in _TRANSIENT:
            resp.raise_for_status()
            return resp
        retry_after = resp.headers.get("Retry-After", "")
        delay = float(retry_after) if retry_after.isdigit() else backoff * (2 ** attempt)
        time.sleep(delay)
    resp.raise_for_status()  # retries exhausted on a transient error
    return resp  # unreachable; keeps the return type honest


def _download_url(
    session: requests.Session,
    dataset_id: str,
    poll_attempts: int = 15,
    poll_interval: float = 2.0,
    max_retries: int = 5,
) -> str:
    """Initiate a dataset download and poll until the CSV url is ready."""
    base = f"{DATASETS_API_BASE}/{dataset_id}"
    _api_get(session, f"{base}/initiate-download", max_retries=max_retries)
    for _ in range(poll_attempts):
        data = _api_get(session, f"{base}/poll-download", max_retries=max_retries).json()
        url = (data.get("data") or {}).get("url")
        if url:
            return url
        time.sleep(poll_interval)
    raise RuntimeError(
        f"poll-download did not return a url after {poll_attempts} attempts"
    )


def fetch_blocks(
    session: requests.Session | None = None,
    poll_attempts: int = 15,
    max_retries: int = 5,
) -> list[dict]:
    session = session or requests.Session()

    csv_url = _download_url(
        session, RESOURCE_ID, poll_attempts=poll_attempts, max_retries=max_retries
    )
    resp = _api_get(session, csv_url, max_retries=max_retries)
    # utf-8-sig strips a leading BOM if data.gov.sg includes one, which would
    # otherwise corrupt the first column name (e.g. "﻿blk_no").
    text = resp.content.decode("utf-8-sig")
    records = list(csv.DictReader(io.StringIO(text)))

    blocks: list[dict] = []
    for rec in records:
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
