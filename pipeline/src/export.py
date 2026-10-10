import json
from collections import Counter
from pathlib import Path

import config

# ~11 cm. OneMap's 15-16 digits are noise that barely compresses.
COORD_DECIMALS = 6


def to_index_feature(rec: dict) -> dict:
    lon, lat = round(rec["lon"], COORD_DECIMALS), round(rec["lat"], COORD_DECIMALS)
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "id": rec["id"],
            "blk_no": rec["blk_no"],
            "street": rec["street"],
            "street_full": rec["street_full"],
            "postal": rec["postal"],
            "town": rec["town"],
            "year_completed": rec["year_completed"],
            "max_floor_lvl": rec["max_floor_lvl"],
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
    path.write_text(
        # No sort_keys: fields keep their construction order above, which is already stable.
        json.dumps(obj, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _write_index(path: Path, features: list[dict]) -> None:
    # The app loads this file whole before the map works, so it is compact; one block per line
    # (not minified to one line) keeps a monthly change to a block a one-line git diff.
    lines = [json.dumps(f, ensure_ascii=False, separators=(",", ":")) for f in features]
    body = "\n" + ",\n".join(lines) + "\n" if lines else ""
    path.write_text(
        '{"type":"FeatureCollection","features":[' + body + "]}\n",
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
    _write_index(app_data_dir / "index.geojson", features)

    shard_dir = app_data_dir / "block-details"
    shard_dir.mkdir(parents=True, exist_ok=True)
    by_slug: dict[str, dict] = {}
    for r in sorted(records, key=lambda r: r["id"]):  # id-sorted -> stable key order
        by_slug.setdefault(r["town_slug"], {})[r["id"]] = to_detail_entry(r)
    for slug in slugs:  # a shard for EVERY town, even empty, so the app never 404s
        _write_json(shard_dir / f"{slug}.json", by_slug.get(slug, {}))

    _write_json(app_data_dir / "towns.json", towns)


def write_meta(data_accessed: str, app_data_dir: Path | None = None) -> None:
    app_data_dir = Path(app_data_dir or config.APP_DATA_DIR)
    app_data_dir.mkdir(parents=True, exist_ok=True)
    _write_json(app_data_dir / "meta.json", {"data_accessed": data_accessed})
