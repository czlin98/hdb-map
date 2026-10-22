import csv
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

import config
from export import write_meta, write_outputs, write_stations
from fetch import fetch_blocks
from geocode import geocode_all, get_token
from stations import fetch_stations, load_live_stations
from summarize import Snapshot, load_snapshot, summarize, write_summary
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


def check_station_count(new_count: int, stations_path: Path) -> None:
    current = len(load_live_stations(stations_path))
    if not current:
        return  # first run: nothing live to protect
    minimum = int(current * config.MIN_STATION_RATIO)
    if new_count < minimum:
        raise RuntimeError(
            f"Refusing to write {new_count} stations over the {current} live ones "
            f"(minimum {minimum}, {config.MIN_STATION_RATIO:.0%}). "
            "Check the exits download in the log above."
        )


def report_summary(before: Snapshot | None, summary_path: Path) -> None:
    if before is None:
        return  # reading it already logged a warning
    # The summary only describes the run, so no failure in it may stop the data from being written.
    try:
        after = load_snapshot(config.APP_DATA_DIR, config.FAILED_BLOCKS_PATH)
        summary = summarize(before, after)
        write_summary(summary, summary_path)
        log.info(
            "Summary: +%d added, %d removed, %d changed",
            summary.added,
            summary.removed,
            summary.changed,
        )
    except Exception:
        log.warning("Could not write the run summary", exc_info=True)


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
    stations = fetch_stations(session, token)
    log.info("Found %d stations", len(stations))
    # Before the hour-long geocode, so a truncated exits download fails in a couple of minutes.
    check_station_count(len(stations), Path(config.APP_DATA_DIR) / "stations.geojson")

    successes, failures = geocode_all(session, token, blocks)
    log.info("Geocoded %d, failed %d", len(successes), len(failures))

    # An unknown town code raises here, before any write.
    records, skipped = transform(successes, towns, stations)
    log.info("Skipped %d blocks with missing values", len(skipped))
    check_block_count(len(records), Path(config.APP_DATA_DIR) / "index.geojson")

    # Set by the workflow, which puts the summary in the data commit's message.
    summary_path = os.environ.get("RUN_SUMMARY_PATH")
    before = None
    if summary_path:
        try:
            before = load_snapshot(config.APP_DATA_DIR, config.FAILED_BLOCKS_PATH)
        except Exception:
            log.warning("Could not read the data before this run", exc_info=True)

    write_outputs(records, towns, config.APP_DATA_DIR)
    write_stations(stations, config.APP_DATA_DIR)
    write_meta(data_accessed, config.APP_DATA_DIR)
    write_failed_blocks(failures + skipped, config.FAILED_BLOCKS_PATH)
    log.info("Wrote %d blocks to index + %d shards", len(records), len(towns))
    if summary_path:
        report_summary(before, Path(summary_path))


if __name__ == "__main__":
    run()
