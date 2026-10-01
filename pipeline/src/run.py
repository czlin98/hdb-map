import argparse
import csv
import json
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
    # Sorted: the CSV is committed, so a stable order keeps monthly diffs minimal.
    rows = sorted(failures, key=lambda f: (f["blk_no"], f["street_full"]))
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["blk_no", "street_full", "reason", "found"])
        writer.writeheader()
        writer.writerows(rows)


def check_block_count(new_count: int, index_path: Path) -> None:
    if not index_path.exists():
        return  # first run: nothing live to protect
    current = len(json.loads(index_path.read_text(encoding="utf-8"))["features"])
    minimum = int(current * config.MIN_BLOCK_RATIO)
    if new_count < minimum:
        raise RuntimeError(
            f"Refusing to write {new_count} blocks over the {current} live ones "
            f"(minimum {minimum}, {config.MIN_BLOCK_RATIO:.0%}). "
            "Compare the fetched and geocoded counts in the log above."
        )


def run(limit: int | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    email = os.environ["ONEMAP_EMAIL"]
    password = os.environ["ONEMAP_PASSWORD"]
    session = requests.Session()

    # Fail fast before any writes, so a failed run never corrupts the committed contract.
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
    # A --limit smoke run is meant to be small, so only a full run is held to the live count.
    if limit is None:
        check_block_count(len(records), Path(config.APP_DATA_DIR) / "index.geojson")
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
