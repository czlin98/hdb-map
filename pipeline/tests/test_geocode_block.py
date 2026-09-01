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
