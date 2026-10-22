import pytest

from stations import haversine_m
from transform import transform

TOWNS = [
    {"town": "ANG MO KIO", "town_slug": "ang-mo-kio", "town_code": "AMK"},
    {"town": "KALLANG/WHAMPOA", "town_slug": "kallang-whampoa", "town_code": "KWN"},
]

STATIONS = [
    {
        "id": "ang-mo-kio",
        "name": "Ang Mo Kio",
        "codes": ["NS16"],
        "lon": 103.85,
        "lat": 1.37,
        "exits": [{"exit": "Exit A", "lon": 103.849, "lat": 1.369}],
    }
]


def _block(**over):
    base = {
        "blk_no": "123",
        "street": "ANG MO KIO AVE 3",
        "street_full": "ANG MO KIO AVENUE 3",
        "bldg_contract_town": "AMK",
        "postal": "560123",
        "lat": "1.36",
        "lon": "103.84",
        "year_completed": "1978",
        "max_floor_lvl": "12",
        "total_dwelling_units": "200",
        "3room_sold": "40",
        "4room_sold": "60",
        "5room_sold": "0",
        "1room_rental": "0",
        "other_room_rental": "5",
    }
    base.update(over)
    return base


def test_transform_builds_clean_record():
    (rec,), skipped = transform([_block()], TOWNS, STATIONS)
    assert skipped == []
    assert rec["id"] == "123-ang-mo-kio-ave-3"
    assert rec["town"] == "ANG MO KIO"
    assert rec["town_slug"] == "ang-mo-kio"
    assert rec["lat"] == 1.36 and rec["lon"] == 103.84
    assert rec["year_completed"] == 1978
    assert rec["max_floor_lvl"] == 12
    assert rec["total_dwelling_units"] == 200


def test_units_by_type_keeps_only_positive_and_drops_suffix():
    (rec,), _ = transform([_block()], TOWNS, STATIONS)
    assert rec["sold_units_by_type"] == {"3room": 40, "4room": 60}  # 5room=0 dropped
    assert rec["rental_units_by_type"] == {"other_room": 5}


def test_units_by_type_follow_display_order_not_column_order():
    # The index's sold_types/rental_types are these dicts' keys, read as the display order.
    block = {k: v for k, v in _block().items() if not k.endswith(("_sold", "_rental"))}
    block.update(
        {
            "exec_sold": "5",
            "4room_sold": "60",
            "2room_sold": "10",
            "other_room_rental": "1",
            "1room_rental": "3",
        }
    )
    (rec,), _ = transform([block], TOWNS, STATIONS)
    assert list(rec["sold_units_by_type"]) == ["2room", "4room", "exec"]
    assert list(rec["rental_units_by_type"]) == ["1room", "other_room"]


def test_missing_flat_columns_default_to_zero():
    block = _block()
    del block["3room_sold"]
    (rec,), _ = transform([block], TOWNS, STATIONS)
    assert "3room" not in rec["sold_units_by_type"]


def test_unknown_town_code_raises():
    with pytest.raises(ValueError, match="Unknown town code"):
        transform([_block(bldg_contract_town="ZZZ")], TOWNS, STATIONS)


@pytest.mark.parametrize(
    ("field", "value", "reason"),
    [
        ("year_completed", "", "missing_year"),
        ("year_completed", "0", "missing_year"),
        ("year_completed", None, "missing_year"),
        ("max_floor_lvl", "", "missing_floors"),
        ("max_floor_lvl", "0", "missing_floors"),
        ("total_dwelling_units", "", "missing_units"),
        ("total_dwelling_units", "abc", "missing_units"),
    ],
)
def test_block_missing_a_required_value_is_skipped_and_recorded(field, value, reason):
    records, skipped = transform([_block(**{field: value}), _block(blk_no="124")], TOWNS, STATIONS)
    assert [r["blk_no"] for r in records] == ["124"]
    assert skipped == [
        {"blk_no": "123", "street_full": "ANG MO KIO AVENUE 3", "reason": reason, "found": ""}
    ]


def test_block_missing_several_values_names_the_first_in_order():
    _, skipped = transform([_block(year_completed="", total_dwelling_units="")], TOWNS, STATIONS)
    assert [s["reason"] for s in skipped] == ["missing_year"]


def test_unknown_town_still_raises_when_values_are_missing():
    with pytest.raises(ValueError, match="Unknown town code"):
        transform([_block(bldg_contract_town="ZZZ", year_completed="")], TOWNS, STATIONS)


def _station(station_id, name, code, exit_name, lon, lat):
    return {
        "id": station_id,
        "name": name,
        "codes": [code],
        "lon": lon,
        "lat": lat,
        "exits": [{"exit": exit_name, "lon": lon, "lat": lat}],
    }


def test_transform_adds_the_nearest_stations():
    # Ang Mo Kio's exit is about 1.4 km away, past the radius once a nearer station exists.
    mayflower = _station("mayflower", "Mayflower", "TE6", "Exit 2", 103.836, 1.364)
    bishan = _station("bishan", "Bishan", "NS17", "Exit C", 103.84, 1.368)
    (rec,), _ = transform([_block()], TOWNS, [*STATIONS, bishan, mayflower])
    near = round(haversine_m(103.84, 1.36, 103.836, 1.364))
    assert rec["station_distance"] == near
    assert rec["nearest_stations"] == [
        {
            "id": "mayflower",
            "name": "Mayflower",
            "codes": ["TE6"],
            "exit": "Exit 2",
            "distance": near,
        },
        {
            "id": "bishan",
            "name": "Bishan",
            "codes": ["NS17"],
            "exit": "Exit C",
            "distance": round(haversine_m(103.84, 1.36, 103.84, 1.368)),
        },
    ]
