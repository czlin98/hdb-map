import csv
import json

import pytest
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
    monkeypatch.setattr(run_module, "today_sgt", lambda: "2026-10-01")

    responses.add(responses.POST, config.ONEMAP_TOKEN_URL, json={"access_token": "tok"}, status=200)
    responses.add(
        responses.GET,
        _INIT_URL,
        json={"code": 0, "data": {"message": "ok"}, "errorMsg": ""},
        status=201,
    )
    responses.add(
        responses.GET,
        _POLL_URL,
        json={"code": 0, "data": {"status": "READY", "url": _CSV_URL}, "errorMsg": ""},
        status=200,
    )
    _cols = [
        "blk_no",
        "street",
        "residential",
        "bldg_contract_town",
        "year_completed",
        "max_floor_lvl",
        "total_dwelling_units",
        "3room_sold",
    ]
    _csv_body = (
        ",".join(_cols)
        + "\n"
        + "123,ANG MO KIO AVE 3,Y,AMK,1978,12,200,40\n"
        + "999,NOWHERE RD,Y,AMK,,,,\n"
    )
    responses.add(responses.GET, _CSV_URL, body=_csv_body, status=200)
    # block 123 matches; block 999 has no results -> failure
    responses.add(
        responses.GET,
        config.ONEMAP_SEARCH_URL,
        json={
            "found": 1,
            "results": [
                {
                    "BLK_NO": "123",
                    "ROAD_NAME": "ANG MO KIO AVENUE 3",
                    "POSTAL": "560123",
                    "LATITUDE": "1.36",
                    "LONGITUDE": "103.84",
                }
            ],
        },
        status=200,
    )
    responses.add(
        responses.GET, config.ONEMAP_SEARCH_URL, json={"found": 0, "results": []}, status=200
    )

    run_module.run()

    index = json.loads((tmp_path / "data" / "index.geojson").read_text())
    assert len(index["features"]) == 1
    assert index["features"][0]["properties"]["id"] == "123-ang-mo-kio-ave-3"

    with (tmp_path / "geocode_failures.csv").open() as fh:
        rows = list(csv.DictReader(fh))
    assert rows == [
        {"blk_no": "999", "street_full": "NOWHERE ROAD", "reason": "no_results", "found": "0"}
    ]

    meta = json.loads((tmp_path / "data" / "meta.json").read_text())
    assert meta == {"data_accessed": "2026-10-01"}


def test_run_limit_caps_blocks_before_geocode(tmp_path, monkeypatch):
    monkeypatch.setenv("ONEMAP_EMAIL", "e@x.com")
    monkeypatch.setenv("ONEMAP_PASSWORD", "pw")
    monkeypatch.setattr(config, "APP_DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "FAILURES_PATH", tmp_path / "geocode_failures.csv")

    monkeypatch.setattr(run_module, "get_token", lambda *a, **k: "tok")
    monkeypatch.setattr(
        run_module,
        "fetch_blocks",
        lambda *a, **k: [
            {
                "blk_no": str(i),
                "street": "X RD",
                "street_full": "X ROAD",
                "bldg_contract_town": "AMK",
            }
            for i in range(5)
        ],
    )
    seen = {}

    def fake_geocode_all(session, token, blocks, **kw):
        seen["n"] = len(blocks)
        return [], []

    monkeypatch.setattr(run_module, "geocode_all", fake_geocode_all)

    run_module.run(limit=2)

    assert seen["n"] == 2


def test_write_failures_sorted(tmp_path):
    path = tmp_path / "f.csv"
    run_module.write_failures(
        [
            {"blk_no": "9", "street_full": "Z RD", "reason": "no_match", "found": 2},
            {"blk_no": "1", "street_full": "A RD", "reason": "no_results", "found": 0},
        ],
        path=path,
    )
    with path.open() as fh:
        rows = list(csv.DictReader(fh))
    assert [r["blk_no"] for r in rows] == ["1", "9"]


def _write_index(data_dir, n):
    data_dir.mkdir(parents=True, exist_ok=True)
    features = [{"type": "Feature", "properties": {"id": str(i)}} for i in range(n)]
    (data_dir / "index.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features})
    )


def test_check_block_count_allows_up_to_one_percent_drop(tmp_path):
    _write_index(tmp_path, 1000)
    run_module.check_block_count(990, tmp_path / "index.geojson")


def test_check_block_count_rejects_larger_drop(tmp_path):
    _write_index(tmp_path, 1000)
    with pytest.raises(RuntimeError, match="989 blocks"):
        run_module.check_block_count(989, tmp_path / "index.geojson")


def test_check_block_count_skips_when_no_index_yet(tmp_path):
    run_module.check_block_count(0, tmp_path / "index.geojson")


def _stub_stages(monkeypatch, tmp_path, n_records):
    monkeypatch.setenv("ONEMAP_EMAIL", "e@x.com")
    monkeypatch.setenv("ONEMAP_PASSWORD", "pw")
    monkeypatch.setattr(config, "APP_DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "FAILURES_PATH", tmp_path / "geocode_failures.csv")
    monkeypatch.setattr(run_module, "get_token", lambda *a, **k: "tok")
    monkeypatch.setattr(run_module, "fetch_blocks", lambda *a, **k: [{}] * 1000)
    monkeypatch.setattr(run_module, "geocode_all", lambda s, t, blocks, **kw: (blocks, []))
    monkeypatch.setattr(run_module, "transform", lambda s, t: [{}] * n_records)
    writes = []
    monkeypatch.setattr(run_module, "write_outputs", lambda *a, **k: writes.append("outputs"))
    monkeypatch.setattr(run_module, "write_meta", lambda *a, **k: writes.append("meta"))
    monkeypatch.setattr(run_module, "write_failures", lambda *a, **k: writes.append("failures"))
    return writes


def test_run_writes_nothing_when_output_shrinks(tmp_path, monkeypatch):
    _write_index(tmp_path / "data", 1000)
    writes = _stub_stages(monkeypatch, tmp_path, n_records=500)

    with pytest.raises(RuntimeError, match="Refusing to write 500 blocks"):
        run_module.run()

    assert writes == []


def test_run_limit_skips_block_count_check(tmp_path, monkeypatch):
    _write_index(tmp_path / "data", 1000)
    writes = _stub_stages(monkeypatch, tmp_path, n_records=20)

    run_module.run(limit=20)

    assert writes == ["outputs", "meta", "failures"]
