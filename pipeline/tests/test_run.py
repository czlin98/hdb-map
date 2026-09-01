import csv

import responses

import config
import fetch
import geocode
import run as run_module

_INIT_URL = f"{config.DATASETS_API_BASE}/{config.RESOURCE_ID}/initiate-download"
_POLL_URL = f"{config.DATASETS_API_BASE}/{config.RESOURCE_ID}/poll-download"
_CSV_URL = "https://download.example.com/hdb.csv"


@responses.activate
def test_run_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setenv("ONEMAP_EMAIL", "e@x.com")
    monkeypatch.setenv("ONEMAP_PASSWORD", "pw")
    monkeypatch.setattr(config, "APP_DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "FAILURES_PATH", tmp_path / "geocode_failures.csv")
    monkeypatch.setattr(geocode.time, "sleep", lambda *_: None)
    monkeypatch.setattr(fetch.time, "sleep", lambda *_: None)

    # towns: use the real canonical file.
    responses.add(responses.POST, config.ONEMAP_TOKEN_URL,
                  json={"access_token": "tok"}, status=200)
    # data.gov.sg bulk download: initiate -> poll (url ready) -> CSV.
    responses.add(responses.GET, _INIT_URL,
                  json={"code": 0, "data": {"message": "ok"}, "errorMsg": ""}, status=201)
    responses.add(responses.GET, _POLL_URL,
                  json={"code": 0, "data": {"status": "READY", "url": _CSV_URL},
                        "errorMsg": ""}, status=200)
    _cols = ["blk_no", "street", "residential", "bldg_contract_town",
             "year_completed", "max_floor_lvl", "total_dwelling_units", "3room_sold"]
    _csv_body = ",".join(_cols) + "\n" + \
        "123,ANG MO KIO AVE 3,Y,AMK,1978,12,200,40\n" + \
        "999,NOWHERE RD,Y,AMK,,,,\n"
    responses.add(responses.GET, _CSV_URL, body=_csv_body, status=200)
    # block 123 matches; block 999 has no results -> failure
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL, json={"found": 1, "results": [
        {"BLK_NO": "123", "ROAD_NAME": "ANG MO KIO AVENUE 3", "POSTAL": "560123",
         "LATITUDE": "1.36", "LONGITUDE": "103.84"}]}, status=200)
    responses.add(responses.GET, config.ONEMAP_SEARCH_URL,
                  json={"found": 0, "results": []}, status=200)

    run_module.run()

    import json
    index = json.loads((tmp_path / "data" / "index.geojson").read_text())
    assert len(index["features"]) == 1
    assert index["features"][0]["properties"]["id"] == "123-ang-mo-kio-ave-3"

    with (tmp_path / "geocode_failures.csv").open() as fh:
        rows = list(csv.DictReader(fh))
    assert rows == [{"blk_no": "999", "street_full": "NOWHERE ROAD",
                     "reason": "no_results", "found": "0"}]


def test_run_limit_caps_blocks_before_geocode(tmp_path, monkeypatch):
    monkeypatch.setenv("ONEMAP_EMAIL", "e@x.com")
    monkeypatch.setenv("ONEMAP_PASSWORD", "pw")
    monkeypatch.setattr(config, "APP_DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "FAILURES_PATH", tmp_path / "geocode_failures.csv")

    monkeypatch.setattr(run_module, "get_token", lambda *a, **k: "tok")
    monkeypatch.setattr(run_module, "fetch_blocks", lambda *a, **k: [
        {"blk_no": str(i), "street": "X RD", "street_full": "X ROAD",
         "bldg_contract_town": "AMK"} for i in range(5)
    ])
    seen = {}

    def fake_geocode_all(session, token, blocks, **kw):
        seen["n"] = len(blocks)
        return [], []

    monkeypatch.setattr(run_module, "geocode_all", fake_geocode_all)

    run_module.run(limit=2)

    assert seen["n"] == 2  # only the first 2 of 5 fetched blocks are geocoded


def test_write_failures_sorted(tmp_path):
    path = tmp_path / "f.csv"
    run_module.write_failures([
        {"blk_no": "9", "street_full": "Z RD", "reason": "no_match", "found": 2},
        {"blk_no": "1", "street_full": "A RD", "reason": "no_results", "found": 0},
    ], path=path)
    with path.open() as fh:
        rows = list(csv.DictReader(fh))
    assert [r["blk_no"] for r in rows] == ["1", "9"]
