from config import make_id

# (source column, output key). Output keys must match app/src/lib/flat-types.ts.
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
    except ValueError, TypeError, AttributeError:
        return 0


def _units_by_type(block: dict, mapping: list[tuple[str, str]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for col, key in mapping:
        n = _to_int(block.get(col, 0))
        if n > 0:
            out[key] = n
    return out


# (field, failure reason), checked in this order: a block missing several is recorded once,
# under the first. _to_int turns a blank or unreadable value into 0, so 0 means missing.
REQUIRED_VALUES = [
    ("year_completed", "missing_year"),
    ("max_floor_lvl", "missing_floors"),
    ("total_dwelling_units", "missing_units"),
]


def transform(geocoded: list[dict], towns: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return (records, skipped); skipped rows match geocode failures for the failures CSV."""
    code_index = {t["town_code"]: t for t in towns}
    records: list[dict] = []
    skipped: list[dict] = []
    for block in geocoded:
        code = block["bldg_contract_town"]
        town = code_index.get(code)
        if town is None:
            raise ValueError(
                f"Unknown town code {code!r} for blk {block['blk_no']} {block['street_full']}"
            )
        values = {field: _to_int(block.get(field)) for field, _ in REQUIRED_VALUES}
        missing = next((reason for field, reason in REQUIRED_VALUES if values[field] <= 0), None)
        if missing:
            skipped.append(
                {
                    "blk_no": block["blk_no"],
                    "street_full": block["street_full"],
                    "reason": missing,
                    "found": "",
                }
            )
            continue
        records.append(
            {
                "id": make_id(block["blk_no"], block["street"]),
                "blk_no": block["blk_no"],
                "street": block["street"],
                "street_full": block["street_full"],
                "postal": block["postal"],
                "town": town["town"],
                "town_slug": town["town_slug"],
                "lat": float(block["lat"]),
                "lon": float(block["lon"]),
                **values,
                "sold_units_by_type": _units_by_type(block, FLAT_TYPES_SOLD),
                "rental_units_by_type": _units_by_type(block, FLAT_TYPES_RENTAL),
            }
        )
    return records, skipped
