import json

import pytest

from export import to_detail_entry, to_index_feature, write_meta, write_outputs

TOWNS = [
    {"town": "ANG MO KIO", "town_slug": "ang-mo-kio", "town_code": "AMK"},
    {"town": "BEDOK", "town_slug": "bedok", "town_code": "BD"},
]


def _rec(**over):
    base = {
        "id": "123-ang-mo-kio-ave-3", "blk_no": "123", "street": "ANG MO KIO AVE 3",
        "street_full": "ANG MO KIO AVENUE 3", "postal": "560123", "town": "ANG MO KIO",
        "town_slug": "ang-mo-kio", "lat": 1.36, "lon": 103.84, "year_completed": 1978,
        "max_floor_lvl": 12, "total_dwelling_units": 200,
        "sold_units_by_type": {"3room": 40}, "rental_units_by_type": {},
    }
    base.update(over)
    return base


def test_index_feature_shape():
    f = to_index_feature(_rec())
    assert f["geometry"]["coordinates"] == [103.84, 1.36]
    assert set(f["properties"]) == {"id", "blk_no", "street", "street_full", "postal", "town"}


def test_detail_entry_omits_empty_rental():
    entry = to_detail_entry(_rec())
    assert "rental_units_by_type" not in entry
    entry2 = to_detail_entry(_rec(rental_units_by_type={"1room": 5}))
    assert entry2["rental_units_by_type"] == {"1room": 5}


def test_write_outputs_creates_all_files(tmp_path):
    write_outputs([_rec()], TOWNS, app_data_dir=tmp_path)

    index = json.loads((tmp_path / "index.geojson").read_text())
    assert index["type"] == "FeatureCollection"
    assert len(index["features"]) == 1

    assert json.loads((tmp_path / "block-details" / "bedok.json").read_text()) == {}
    amk = json.loads((tmp_path / "block-details" / "ang-mo-kio.json").read_text())
    assert "123-ang-mo-kio-ave-3" in amk

    assert json.loads((tmp_path / "towns.json").read_text()) == TOWNS


def test_written_fields_follow_logical_order(tmp_path):
    write_outputs([_rec()], TOWNS, app_data_dir=tmp_path)

    index = json.loads((tmp_path / "index.geojson").read_text())
    props = list(index["features"][0]["properties"].keys())
    assert props == ["id", "blk_no", "street", "street_full", "postal", "town"]

    amk = json.loads((tmp_path / "block-details" / "ang-mo-kio.json").read_text())
    entry = next(iter(amk.values()))
    assert list(entry.keys()) == [
        "blk_no", "street", "street_full", "postal", "town",
        "year_completed", "max_floor_lvl", "total_dwelling_units",
        "sold_units_by_type",
    ]


def test_shard_ids_written_in_sorted_order(tmp_path):
    recs = [
        _rec(id="9-ang-mo-kio-ave-3"),
        _rec(id="1-ang-mo-kio-ave-3"),
        _rec(id="5-ang-mo-kio-ave-3"),
    ]
    write_outputs(recs, TOWNS, app_data_dir=tmp_path)
    amk = json.loads((tmp_path / "block-details" / "ang-mo-kio.json").read_text())
    assert list(amk.keys()) == [
        "1-ang-mo-kio-ave-3", "5-ang-mo-kio-ave-3", "9-ang-mo-kio-ave-3",
    ]


def test_write_outputs_is_deterministic(tmp_path):
    write_outputs([_rec()], TOWNS, app_data_dir=tmp_path)
    first = (tmp_path / "index.geojson").read_text()
    write_outputs([_rec()], TOWNS, app_data_dir=tmp_path)
    assert (tmp_path / "index.geojson").read_text() == first
    assert first.endswith("\n")


def test_duplicate_id_raises(tmp_path):
    with pytest.raises(ValueError, match="Duplicate block id"):
        write_outputs([_rec(), _rec()], TOWNS, app_data_dir=tmp_path)


def test_duplicate_town_slug_raises(tmp_path):
    dupe_towns = TOWNS + [{"town": "X", "town_slug": "bedok", "town_code": "XX"}]
    with pytest.raises(ValueError, match="Duplicate town_slug"):
        write_outputs([_rec()], dupe_towns, app_data_dir=tmp_path)


def test_write_meta_records_access_date(tmp_path):
    write_meta("2026-10-01", app_data_dir=tmp_path)
    assert json.loads((tmp_path / "meta.json").read_text()) == {"data_accessed": "2026-10-01"}


def test_index_feature_rounds_coordinates_to_six_decimals():
    f = to_index_feature(_rec(lat=1.303671350608798, lon=103.8644786609251))
    assert f["geometry"]["coordinates"] == [103.864479, 1.303671]


def test_index_written_one_block_per_line(tmp_path):
    recs = [_rec(id="9-ang-mo-kio-ave-3"), _rec(id="1-ang-mo-kio-ave-3")]
    write_outputs(recs, TOWNS, app_data_dir=tmp_path)

    lines = (tmp_path / "index.geojson").read_text().splitlines()
    # Header, one line per block, footer: a changed block shows as one changed line in git.
    assert len(lines) == 2 + len(recs)
    blocks = [json.loads(line.rstrip(",")) for line in lines[1:-1]]
    assert [b["properties"]["id"] for b in blocks] == ["1-ang-mo-kio-ave-3", "9-ang-mo-kio-ave-3"]
    assert ": " not in lines[1] and ", " not in lines[1]


def test_index_with_no_blocks_is_valid_geojson(tmp_path):
    write_outputs([], TOWNS, app_data_dir=tmp_path)
    index = json.loads((tmp_path / "index.geojson").read_text())
    assert index == {"type": "FeatureCollection", "features": []}
