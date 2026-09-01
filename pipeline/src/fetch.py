"""Stage 1: pull HDB Property Information from data.gov.sg."""

import requests

from config import DATASTORE_URL, RESOURCE_ID, expand_street

FLAT_COLUMNS = [
    "1room_sold", "2room_sold", "3room_sold", "4room_sold", "5room_sold",
    "exec_sold", "multigen_sold", "studio_apartment_sold",
    "1room_rental", "2room_rental", "3room_rental", "other_room_rental",
]


def fetch_blocks(session: requests.Session | None = None, page_size: int = 500) -> list[dict]:
    session = session or requests.Session()
    raw: list[dict] = []
    offset = 0
    while True:
        resp = session.get(
            DATASTORE_URL,
            params={"resource_id": RESOURCE_ID, "limit": page_size, "offset": offset},
            timeout=60,
        )
        resp.raise_for_status()
        result = resp.json()["result"]
        page = result["records"]
        if not page:
            break
        raw.extend(page)
        offset += len(page)
        if offset >= result.get("total", 0):
            break

    blocks: list[dict] = []
    for rec in raw:
        if rec.get("residential") != "Y":
            continue
        street = rec["street"]
        block = {
            "blk_no": rec["blk_no"],
            "street": street,
            "street_full": expand_street(street),
            "bldg_contract_town": rec["bldg_contract_town"],
            "year_completed": rec.get("year_completed"),
            "max_floor_lvl": rec.get("max_floor_lvl"),
            "total_dwelling_units": rec.get("total_dwelling_units"),
        }
        for col in FLAT_COLUMNS:
            block[col] = rec.get(col)
        blocks.append(block)
    return blocks
