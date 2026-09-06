import requests
import responses

import config
from geocode import geocode_block

BLOCK = {"blk_no": "123", "street_full": "ANG MO KIO AVENUE 3"}


def _result(blk, road, postal="560123", lat="1.36", lon="103.84"):
    return {"BLK_NO": blk, "ROAD_NAME": road, "POSTAL": postal,
            "LATITUDE": lat, "LONGITUDE": lon}


@responses.activate
def test_gate_passes_on_exact_match():
    body = {"found": 1, "results": [_result("123", "ANG MO KIO AVENUE 3")]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    out = geocode_block(requests.Session(), "tok", BLOCK)
    assert out == {"ok": True, "postal": "560123", "lat": "1.36", "lon": "103.84"}


@responses.activate
def test_gate_normalizes_case_and_whitespace():
    body = {"found": 1, "results": [_result(" 123 ", "ang mo kio avenue 3")]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    assert geocode_block(requests.Session(), "tok", BLOCK)["ok"] is True


@responses.activate
def test_multiple_qualifiers_take_first():
    body = {"found": 2, "results": [
        _result("123", "ANG MO KIO AVENUE 3", postal="560123"),
        _result("123", "ANG MO KIO AVENUE 3", postal="999999"),
    ]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    assert geocode_block(requests.Session(), "tok", BLOCK)["postal"] == "560123"


@responses.activate
def test_gate_skips_nil_postal_and_takes_valid_qualifier():
    # A block+street can return several results: the residential building plus
    # businesses sharing the block. The businesses come back with POSTAL "NIL",
    # so the gate must skip them and select the result with a real postal.
    body = {"found": 2, "results": [
        _result("123", "ANG MO KIO AVENUE 3", postal="NIL"),
        _result("123", "ANG MO KIO AVENUE 3", postal="560123"),
    ]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    out = geocode_block(requests.Session(), "tok", BLOCK)
    assert out == {"ok": True, "postal": "560123", "lat": "1.36", "lon": "103.84"}


@responses.activate
def test_gate_fails_when_all_qualifiers_have_nil_postal():
    body = {"found": 2, "results": [
        _result("123", "ANG MO KIO AVENUE 3", postal="NIL"),
        _result("123", "ANG MO KIO AVENUE 3", postal="NIL"),
    ]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    out = geocode_block(requests.Session(), "tok", BLOCK)
    assert out == {"ok": False, "reason": "no_match", "found": 2}


@responses.activate
def test_gate_requires_postal_to_match_block_number():
    # OneMap can return several results sharing BLK_NO and ROAD_NAME, one per
    # building at that address. A different building's result (valid postal, but
    # not ending in the block number) must not win over the actual HDB block,
    # whichever comes first. Every HDB postal ends with its block number, so
    # 2 QUEEN'S ROAD is 260002, not the co-located 266733.
    block = {"blk_no": "2", "street_full": "QUEEN'S ROAD"}
    body = {"found": 2, "results": [
        _result("2", "QUEEN'S ROAD", postal="266733"),
        _result("2", "QUEEN'S ROAD", postal="260002"),
    ]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    assert geocode_block(requests.Session(), "tok", block)["postal"] == "260002"


@responses.activate
def test_gate_matches_block_number_ignoring_letter_suffix():
    # Block numbers can carry a letter suffix (216B); only the digits appear in
    # the postal, so the suffix must be stripped before comparing.
    block = {"blk_no": "216B", "street_full": "BEDOK NORTH STREET 1"}
    body = {"found": 1, "results": [_result("216B", "BEDOK NORTH STREET 1", postal="460216")]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    assert geocode_block(requests.Session(), "tok", block)["postal"] == "460216"


@responses.activate
def test_gate_fails_when_no_postal_matches_block_number():
    block = {"blk_no": "2", "street_full": "QUEEN'S ROAD"}
    body = {"found": 1, "results": [_result("2", "QUEEN'S ROAD", postal="266733")]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    out = geocode_block(requests.Session(), "tok", block)
    assert out == {"ok": False, "reason": "no_match", "found": 1}


@responses.activate
def test_no_results():
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL,
                  json={"found": 0, "results": []}, status=200)
    out = geocode_block(requests.Session(), "tok", BLOCK)
    assert out == {"ok": False, "reason": "no_results", "found": 0}


@responses.activate
def test_no_match_when_gate_rejects_all():
    body = {"found": 1, "results": [_result("999", "SOME OTHER ROAD")]}
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json=body, status=200)
    out = geocode_block(requests.Session(), "tok", BLOCK)
    assert out == {"ok": False, "reason": "no_match", "found": 1}


@responses.activate
def test_retries_then_succeeds(monkeypatch):
    import geocode
    monkeypatch.setattr(geocode.time, "sleep", lambda *_: None)
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, status=503)
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL,
                  json={"found": 1, "results": [_result("123", "ANG MO KIO AVENUE 3")]},
                  status=200)
    assert geocode_block(requests.Session(), "tok", BLOCK)["ok"] is True


@responses.activate
def test_api_error_after_exhausting_retries(monkeypatch):
    import geocode
    monkeypatch.setattr(geocode.time, "sleep", lambda *_: None)
    for _ in range(3):
        responses.add(responses.GET, config.ONEMAP_SEARCH_URL, status=503)
    out = geocode_block(requests.Session(), "tok", BLOCK, max_retries=3)
    assert out == {"ok": False, "reason": "api_error", "found": 0}
