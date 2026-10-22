import json

import pytest

from export import to_detail_entry, to_index_feature, write_meta, write_outputs, write_stations

TOWNS = [
    {"town": "ANG MO KIO", "town_slug": "ang-mo-kio", "town_code": "AMK"},
    {"town": "BEDOK", "town_slug": "bedok", "town_code": "BD"},
]


def _rec(**over):
    base = {
        "id": "123-ang-mo-kio-ave-3",
        "blk_no": "123",
        "street": "ANG MO KIO AVE 3",
        "street_full": "ANG MO KIO AVENUE 3",
        "postal": "560123",
        "town": "ANG MO KIO",
        "town_slug": "ang-mo-kio",
        "lat": 1.36,
        "lon": 103.84,
        "year_completed": 1978,
        "max_floor_lvl": 12,
        "total_dwelling_units": 200,
        "sold_units_by_type": {"3room": 40},
        "rental_units_by_type": {},
        "station_distance": 350,
        "nearest_station": {
            "id": "ang-mo-kio",
            "name": "Ang Mo Kio",
            "codes": ["NS16"],
            "exit": "Exit A",
            "distance": 350,
        },
    }
    base.update(over)
    return base


def _station(station_id="ang-mo-kio", name="Ang Mo Kio", codes=("NS16",), exits=None):
    exits = exits or [("Exit A", 103.849, 1.369)]
    return {
        "id": station_id,
        "name": name,
        "codes": list(codes),
        "lon": sum(x for _, x, _ in exits) / len(exits),
        "lat": sum(y for _, _, y in exits) / len(exits),
        "exits": [{"exit": e, "lon": x, "lat": y} for e, x, y in exits],
    }


def _features(path):
    return json.loads(path.read_text())["features"]


def test_index_feature_shape():
    f = to_index_feature(_rec())
    assert f["geometry"]["coordinates"] == [103.84, 1.36]
    assert set(f["properties"]) == {
        "id",
        "blk_no",
        "street",
        "street_full",
        "postal",
        "town",
        "year_completed",
        "max_floor_lvl",
        "sold_types",
        "rental_types",
        "station_distance",
    }


def test_index_flat_types_list_types_with_units_in_display_order():
    # transform builds the unit dicts in display order and drops types with no units.
    rec = _rec(
        sold_units_by_type={"3room": 40, "4room": 60, "exec": 2},
        rental_units_by_type={"1room": 5, "other_room": 1},
    )
    p = to_index_feature(rec)["properties"]
    assert p["sold_types"] == ["3room", "4room", "exec"]
    assert p["rental_types"] == ["1room", "other_room"]


def test_index_flat_types_are_empty_lists_when_none():
    p = to_index_feature(_rec(sold_units_by_type={}, rental_units_by_type={}))["properties"]
    assert p["sold_types"] == []
    assert p["rental_types"] == []


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
    assert props == [
        "id",
        "blk_no",
        "street",
        "street_full",
        "postal",
        "town",
        "year_completed",
        "max_floor_lvl",
        "sold_types",
        "rental_types",
        "station_distance",
    ]

    amk = json.loads((tmp_path / "block-details" / "ang-mo-kio.json").read_text())
    entry = next(iter(amk.values()))
    assert list(entry.keys()) == [
        "blk_no",
        "street",
        "street_full",
        "postal",
        "town",
        "year_completed",
        "max_floor_lvl",
        "total_dwelling_units",
        "sold_units_by_type",
        "nearest_station",
    ]


def test_written_index_values_mirror_shards(tmp_path):
    bedok = _rec(
        id="1-bedok-nth-st-1",
        town="BEDOK",
        town_slug="bedok",
        year_completed=2015,
        max_floor_lvl=30,
        sold_units_by_type={"4room": 80, "5room": 20},
        rental_units_by_type={"2room": 10},
    )
    write_outputs([_rec(), bedok], TOWNS, app_data_dir=tmp_path)

    index = json.loads((tmp_path / "index.geojson").read_text())
    shards = {
        t["town"]: json.loads((tmp_path / "block-details" / f"{t['town_slug']}.json").read_text())
        for t in TOWNS
    }
    assert len(index["features"]) == 2
    for f in index["features"]:
        p = f["properties"]
        entry = shards[p["town"]][p["id"]]
        assert (p["year_completed"], p["max_floor_lvl"]) == (
            entry["year_completed"],
            entry["max_floor_lvl"],
        )
        assert p["sold_types"] == list(entry["sold_units_by_type"])
        assert p["rental_types"] == list(entry.get("rental_units_by_type", {}))
        assert p["station_distance"] == entry["nearest_station"]["distance"]


def test_shard_ids_written_in_sorted_order(tmp_path):
    recs = [
        _rec(id="9-ang-mo-kio-ave-3"),
        _rec(id="1-ang-mo-kio-ave-3"),
        _rec(id="5-ang-mo-kio-ave-3"),
    ]
    write_outputs(recs, TOWNS, app_data_dir=tmp_path)
    amk = json.loads((tmp_path / "block-details" / "ang-mo-kio.json").read_text())
    assert list(amk.keys()) == [
        "1-ang-mo-kio-ave-3",
        "5-ang-mo-kio-ave-3",
        "9-ang-mo-kio-ave-3",
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


def test_detail_entry_puts_the_nearest_station_after_the_units():
    entry = to_detail_entry(_rec(rental_units_by_type={"1room": 5}))
    assert list(entry)[-2:] == ["rental_units_by_type", "nearest_station"]
    assert entry["nearest_station"] == _rec()["nearest_station"]


def test_write_stations_writes_stations_then_exits(tmp_path):
    outram = _station(
        "outram-park",
        "Outram Park",
        ["EW16", "NE3", "TE17"],
        [("Exit 1", 103.8387, 1.2801), ("Exit 1", 103.8381, 1.2805), ("Exit 2", 103.84, 1.28)],
    )
    write_stations([outram, _station()], app_data_dir=tmp_path)

    features = _features(tmp_path / "stations.geojson")
    assert [f["properties"] for f in features] == [
        {"kind": "station", "id": "ang-mo-kio", "name": "Ang Mo Kio", "codes": ["NS16"]},
        {
            "kind": "station",
            "id": "outram-park",
            "name": "Outram Park",
            "codes": ["EW16", "NE3", "TE17"],
        },
        {"kind": "exit", "station": "ang-mo-kio", "exit": "Exit A"},
        {"kind": "exit", "station": "outram-park", "exit": "Exit 1"},
        {"kind": "exit", "station": "outram-park", "exit": "Exit 1"},
        {"kind": "exit", "station": "outram-park", "exit": "Exit 2"},
    ]
    # An exit with two points writes both, sorted by coordinates.
    assert [f["geometry"]["coordinates"] for f in features[3:5]] == [
        [103.8381, 1.2805],
        [103.8387, 1.2801],
    ]


def test_write_stations_rounds_coordinates_to_six_decimals(tmp_path):
    station = _station(exits=[("Exit A", 103.8644786609251, 1.303671350608798)])
    write_stations([station], app_data_dir=tmp_path)

    features = _features(tmp_path / "stations.geojson")
    assert [f["geometry"]["coordinates"] for f in features] == [[103.864479, 1.303671]] * 2


def test_stations_written_one_feature_per_line(tmp_path):
    write_stations([_station()], app_data_dir=tmp_path)

    lines = (tmp_path / "stations.geojson").read_text().splitlines()
    assert len(lines) == 2 + 2  # header, station, exit, footer


def test_shard_stations_and_exits_exist_in_the_stations_file(tmp_path):
    write_outputs([_rec()], TOWNS, app_data_dir=tmp_path)
    write_stations([_station()], app_data_dir=tmp_path)

    features = _features(tmp_path / "stations.geojson")
    stations = {
        f["properties"]["id"]: f["properties"]
        for f in features
        if f["properties"]["kind"] == "station"
    }
    exits = {
        (f["properties"]["station"], f["properties"]["exit"])
        for f in features
        if f["properties"]["kind"] == "exit"
    }
    assert {station for station, _ in exits} <= set(stations)
    amk = json.loads((tmp_path / "block-details" / "ang-mo-kio.json").read_text())
    for entry in amk.values():
        nearest = entry["nearest_station"]
        station = stations[nearest["id"]]
        assert (station["name"], station["codes"]) == (nearest["name"], nearest["codes"])
        assert (nearest["id"], nearest["exit"]) in exits
