import pytest
import requests
import responses

import config
from fetch import fetch_blocks

INIT_URL = f"{config.DATASETS_API_BASE}/{config.RESOURCE_ID}/initiate-download"
POLL_URL = f"{config.DATASETS_API_BASE}/{config.RESOURCE_ID}/poll-download"
CSV_URL = "https://download.example.com/hdb.csv"


def _init_ok():
    return {"code": 0, "data": {"message": "initiated"}, "errorMsg": ""}


def _poll(url=""):
    return {"code": 0, "data": {"status": "PROCESSING" if not url else "READY",
                                "url": url}, "errorMsg": ""}


def _csv(*rows, columns=None):
    columns = columns or [
        "blk_no", "street", "residential", "bldg_contract_town",
        "year_completed", "max_floor_lvl", "total_dwelling_units", "3room_sold",
    ]
    lines = [",".join(columns)]
    for row in rows:
        lines.append(",".join(str(row.get(c, "")) for c in columns))
    return "\n".join(lines) + "\n"


@responses.activate
def test_fetch_filters_residential_and_expands_street():
    responses.add(responses.GET, INIT_URL, json=_init_ok(), status=201)
    responses.add(responses.GET, POLL_URL, json=_poll(CSV_URL), status=200)
    body = _csv(
        {"blk_no": "123", "street": "ANG MO KIO AVE 3", "residential": "Y",
         "bldg_contract_town": "AMK", "year_completed": "1978", "max_floor_lvl": "12",
         "total_dwelling_units": "200", "3room_sold": "40"},
        {"blk_no": "1", "street": "SOME MKT", "residential": "N",
         "bldg_contract_town": "CT"},
    )
    responses.add(responses.GET, CSV_URL, body=body, status=200)

    blocks = fetch_blocks()

    assert len(blocks) == 1
    b = blocks[0]
    assert b["blk_no"] == "123"
    assert b["street"] == "ANG MO KIO AVE 3"
    assert b["street_full"] == "ANG MO KIO AVENUE 3"
    assert b["bldg_contract_town"] == "AMK"
    assert b["3room_sold"] == "40"


@responses.activate
def test_fetch_strips_utf8_bom_from_csv():
    responses.add(responses.GET, INIT_URL, json=_init_ok(), status=201)
    responses.add(responses.GET, POLL_URL, json=_poll(CSV_URL), status=200)
    body = "﻿" + _csv(
        {"blk_no": "123", "street": "ANG MO KIO AVE 3", "residential": "Y",
         "bldg_contract_town": "AMK"})
    responses.add(responses.GET, CSV_URL, body=body.encode("utf-8"), status=200)

    blocks = fetch_blocks()

    assert len(blocks) == 1
    assert blocks[0]["blk_no"] == "123"  # first column not corrupted by the BOM


@responses.activate
def test_fetch_polls_until_url_ready(monkeypatch):
    import fetch
    monkeypatch.setattr(fetch.time, "sleep", lambda *_: None)
    responses.add(responses.GET, INIT_URL, json=_init_ok(), status=201)
    responses.add(responses.GET, POLL_URL, json=_poll(""), status=200)      # not ready
    responses.add(responses.GET, POLL_URL, json=_poll(CSV_URL), status=200)  # ready
    responses.add(responses.GET, CSV_URL, body=_csv(
        {"blk_no": "1", "street": "X RD", "residential": "Y",
         "bldg_contract_town": "AMK"}), status=200)

    blocks = fetch_blocks(poll_attempts=5)

    assert len(blocks) == 1


@responses.activate
def test_fetch_retries_transient_then_succeeds(monkeypatch):
    import fetch
    monkeypatch.setattr(fetch.time, "sleep", lambda *_: None)
    responses.add(responses.GET, INIT_URL, json=_init_ok(), status=201)
    responses.add(responses.GET, POLL_URL, json=_poll(CSV_URL), status=200)
    responses.add(responses.GET, CSV_URL, status=429)  # transient
    responses.add(responses.GET, CSV_URL, body=_csv(
        {"blk_no": "1", "street": "X RD", "residential": "Y",
         "bldg_contract_town": "AMK"}), status=200)

    blocks = fetch_blocks()

    assert len(blocks) == 1


@responses.activate
def test_fetch_raises_after_exhausting_retries(monkeypatch):
    import fetch
    monkeypatch.setattr(fetch.time, "sleep", lambda *_: None)
    responses.add(responses.GET, INIT_URL, json=_init_ok(), status=201)
    responses.add(responses.GET, POLL_URL, json=_poll(CSV_URL), status=200)
    for _ in range(4):
        responses.add(responses.GET, CSV_URL, status=503)

    with pytest.raises(requests.HTTPError):
        fetch_blocks(max_retries=4)


@responses.activate
def test_fetch_raises_if_poll_never_ready(monkeypatch):
    import fetch
    monkeypatch.setattr(fetch.time, "sleep", lambda *_: None)
    responses.add(responses.GET, INIT_URL, json=_init_ok(), status=201)
    responses.add(responses.GET, POLL_URL, json=_poll(""), status=200)

    with pytest.raises(RuntimeError, match="poll-download"):
        fetch_blocks(poll_attempts=3)
