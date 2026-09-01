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
