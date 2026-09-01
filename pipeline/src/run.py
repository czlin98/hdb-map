"""Orchestrator: fetch -> geocode -> transform -> export."""

import argparse
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


def run(limit: int | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    email = os.environ["ONEMAP_EMAIL"]
    password = os.environ["ONEMAP_PASSWORD"]
    session = requests.Session()

    # Fail fast BEFORE any writes: token, then towns, then fetch.
    token = get_token(session, email, password)
    towns = load_towns(config.TOWNS_PATH)
    blocks = fetch_blocks(session)
    log.info("Fetched %d residential blocks", len(blocks))
    if limit is not None:
        blocks = blocks[:limit]
        log.info("Limited to first %d blocks (--limit)", len(blocks))

    successes, failures = geocode_all(session, token, blocks)
    log.info("Geocoded %d, failed %d", len(successes), len(failures))

    records = transform(successes, towns)  # unknown town code -> raises, no writes
    write_outputs(records, towns, config.APP_DATA_DIR)
    write_failures(failures, config.FAILURES_PATH)
    log.info("Wrote %d blocks to index + %d shards", len(records), len(towns))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the HDB data pipeline.")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Geocode only the first N blocks (smoke test); default: all blocks.",
    )
    args = parser.parse_args()
    run(limit=args.limit)
