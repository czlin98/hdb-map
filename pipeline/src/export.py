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
    # Fields follow their construction order above.
    path.write_text(
        json.dumps(obj, indent=2, ensure_ascii=False) + "\n",
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
    for r in sorted(records, key=lambda r: r["id"]):  # id-sorted -> stable key order
        by_slug.setdefault(r["town_slug"], {})[r["id"]] = to_detail_entry(r)
    for slug in slugs:  # a shard for EVERY town, even empty
        _write_json(shard_dir / f"{slug}.json", by_slug.get(slug, {}))

    _write_json(app_data_dir / "towns.json", towns)
