import responses

import config
from fetch import fetch_blocks


def _page(records, total):
    return {"result": {"records": records, "total": total}}


@responses.activate
def test_fetch_filters_residential_and_expands_street():
    records = [
        {
            "blk_no": "123", "street": "ANG MO KIO AVE 3", "residential": "Y",
            "bldg_contract_town": "AMK", "year_completed": "1978",
            "max_floor_lvl": "12", "total_dwelling_units": "200", "3room_sold": "40",
        },
        {"blk_no": "1", "street": "SOME MKT", "residential": "N", "bldg_contract_town": "CT"},
    ]
    responses.add(responses.GET, config.DATASTORE_URL, json=_page(records, 2), status=200)

    blocks = fetch_blocks(page_size=500)

    assert len(blocks) == 1
    b = blocks[0]
    assert b["blk_no"] == "123"
    assert b["street"] == "ANG MO KIO AVE 3"
    assert b["street_full"] == "ANG MO KIO AVENUE 3"
    assert b["bldg_contract_town"] == "AMK"
    assert b["3room_sold"] == "40"


@responses.activate
def test_fetch_paginates_until_total_reached():
    p1 = _page([{"blk_no": str(i), "street": "X RD", "residential": "Y",
                 "bldg_contract_town": "AMK"} for i in range(2)], 3)
    p2 = _page([{"blk_no": "2", "street": "X RD", "residential": "Y",
                 "bldg_contract_town": "AMK"}], 3)
    responses.add(responses.GET, config.DATASTORE_URL, json=p1, status=200)
    responses.add(responses.GET, config.DATASTORE_URL, json=p2, status=200)

    blocks = fetch_blocks(page_size=2)

    assert len(blocks) == 3
    assert len(responses.calls) == 2
