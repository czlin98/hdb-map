import csv

import responses

import config
import geocode
import run as run_module


@responses.activate
def test_run_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setenv("ONEMAP_EMAIL", "e@x.com")
    monkeypatch.setenv("ONEMAP_PASSWORD", "pw")
    monkeypatch.setattr(config, "APP_DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "FAILURES_PATH", tmp_path / "geocode_failures.csv")
    monkeypatch.setattr(geocode.time, "sleep", lambda *_: None)

    # towns: use the real canonical file.
    responses.add(responses.POST, config.ONEMAP_TOKEN_URL,
                  json={"access_token": "tok"}, status=200)
    responses.add(responses.GET, config.DATASTORE_URL, json={"result": {"records": [
        {"blk_no": "123", "street": "ANG MO KIO AVE 3", "residential": "Y",
         "bldg_contract_town": "AMK", "year_completed": "1978", "max_floor_lvl": "12",
         "total_dwelling_units": "200", "3room_sold": "40"},
        {"blk_no": "999", "street": "NOWHERE RD", "residential": "Y",
         "bldg_contract_town": "AMK"},
    ], "total": 2}}, status=200)
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
