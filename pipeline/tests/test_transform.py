import pytest

from transform import transform

TOWNS = [
    {"town": "ANG MO KIO", "town_slug": "ang-mo-kio", "town_code": "AMK"},
    {"town": "KALLANG/WHAMPOA", "town_slug": "kallang-whampoa", "town_code": "KWN"},
]


def _block(**over):
    base = {
        "blk_no": "123", "street": "ANG MO KIO AVE 3",
        "street_full": "ANG MO KIO AVENUE 3", "bldg_contract_town": "AMK",
        "postal": "560123", "lat": "1.36", "lon": "103.84",
        "year_completed": "1978", "max_floor_lvl": "12", "total_dwelling_units": "200",
        "3room_sold": "40", "4room_sold": "60", "5room_sold": "0",
        "1room_rental": "0", "other_room_rental": "5",
    }
    base.update(over)
    return base


def test_transform_builds_clean_record():
    (rec,) = transform([_block()], TOWNS)
    assert rec["id"] == "123-ang-mo-kio-ave-3"
    assert rec["town"] == "ANG MO KIO"
    assert rec["town_slug"] == "ang-mo-kio"
    assert rec["lat"] == 1.36 and rec["lon"] == 103.84
    assert rec["year_completed"] == 1978
    assert rec["max_floor_lvl"] == 12
    assert rec["total_dwelling_units"] == 200


def test_units_by_type_keeps_only_positive_and_drops_suffix():
    (rec,) = transform([_block()], TOWNS)
    assert rec["sold_units_by_type"] == {"3room": 40, "4room": 60}  # 5room=0 dropped
    assert rec["rental_units_by_type"] == {"other_room": 5}  # 1room=0 dropped


def test_missing_flat_columns_default_to_zero():
    block = _block()
    del block["3room_sold"]
    (rec,) = transform([block], TOWNS)
    assert "3room" not in rec["sold_units_by_type"]


def test_unknown_town_code_raises():
    with pytest.raises(ValueError, match="Unknown town code"):
        transform([_block(bldg_contract_town="ZZZ")], TOWNS)
