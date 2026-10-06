import csv
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

import config
from export import write_meta, write_outputs
from fetch import fetch_blocks
from geocode import geocode_all, get_token
from towns import load_towns
from transform import transform

log = logging.getLogger("pipeline")


def write_failed_blocks(failures: list[dict], path: Path | None = None) -> None:
    path = Path(path or config.FAILED_BLOCKS_PATH)
    # Sorted: the CSV is committed, so a stable order keeps monthly diffs minimal.
    rows = sorted(failures, key=lambda f: (f["blk_no"], f["street_full"]))
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["blk_no", "street_full", "reason", "found"])
        writer.writeheader()
        writer.writerows(rows)


def today_sgt() -> str:
    # Singapore has no DST, so a fixed offset avoids needing tzdata on Windows.
    return datetime.now(timezone(timedelta(hours=8))).date().isoformat()


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


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    email = os.environ["ONEMAP_EMAIL"]
    password = os.environ["ONEMAP_PASSWORD"]
    session = requests.Session()

    # Fail fast before any writes, so a failed run never corrupts the committed contract.
    token = get_token(session, email, password)
    towns = load_towns(config.TOWNS_PATH)
    data_accessed = today_sgt()
    blocks = fetch_blocks(session)
    log.info("Fetched %d residential blocks", len(blocks))

    successes, failures = geocode_all(session, token, blocks)
    log.info("Geocoded %d, failed %d", len(successes), len(failures))

    records, skipped = transform(successes, towns)  # unknown town code -> raises, no writes
    log.info("Skipped %d blocks with missing values", len(skipped))
    check_block_count(len(records), Path(config.APP_DATA_DIR) / "index.geojson")
    write_outputs(records, towns, config.APP_DATA_DIR)
    write_meta(data_accessed, config.APP_DATA_DIR)
    write_failed_blocks(failures + skipped, config.FAILED_BLOCKS_PATH)
    log.info("Wrote %d blocks to index + %d shards", len(records), len(towns))


if __name__ == "__main__":
    run()
