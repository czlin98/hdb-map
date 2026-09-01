"""Stage 3: decode town, join, derive per-block records."""

from config import make_id

# (source column, output key): source-column display order, low to high.
FLAT_TYPES_SOLD = [
    ("1room_sold", "1room"),
    ("2room_sold", "2room"),
    ("3room_sold", "3room"),
    ("4room_sold", "4room"),
    ("5room_sold", "5room"),
    ("exec_sold", "exec"),
    ("multigen_sold", "multigen"),
    ("studio_apartment_sold", "studio_apartment"),
]
FLAT_TYPES_RENTAL = [
    ("1room_rental", "1room"),
    ("2room_rental", "2room"),
    ("3room_rental", "3room"),
    ("other_room_rental", "other_room"),
]


def _to_int(value) -> int:
    try:
        return int(str(value).strip())
    except (ValueError, TypeError, AttributeError):
        return 0


def _units_by_type(block: dict, mapping: list[tuple[str, str]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for col, key in mapping:
        n = _to_int(block.get(col, 0))
        if n > 0:
            out[key] = n
    return out


def transform(geocoded: list[dict], towns: list[dict]) -> list[dict]:
    code_index = {t["town_code"]: t for t in towns}
    records: list[dict] = []
    for block in geocoded:
        code = block["bldg_contract_town"]
        town = code_index.get(code)
        if town is None:
            raise ValueError(
                f"Unknown town code {code!r} for blk {block['blk_no']} "
                f"{block['street_full']}"
            )
        records.append({
            "id": make_id(block["blk_no"], block["street"]),
            "blk_no": block["blk_no"],
            "street": block["street"],
            "street_full": block["street_full"],
            "postal": block["postal"],
            "town": town["town"],
            "town_slug": town["town_slug"],
            "lat": float(block["lat"]),
            "lon": float(block["lon"]),
            "year_completed": _to_int(block.get("year_completed")),
            "max_floor_lvl": _to_int(block.get("max_floor_lvl")),
            "total_dwelling_units": _to_int(block.get("total_dwelling_units")),
            "sold_units_by_type": _units_by_type(block, FLAT_TYPES_SOLD),
            "rental_units_by_type": _units_by_type(block, FLAT_TYPES_RENTAL),
        })
    return records
