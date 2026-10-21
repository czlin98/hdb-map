import pytest
import requests
import responses
from responses import matchers

import config
import stations
from stations import fetch_exits, lookup_codes

INIT_URL = f"{config.DATASETS_API_BASE}/{config.EXITS_DATASET_ID}/initiate-download"
POLL_URL = f"{config.DATASETS_API_BASE}/{config.EXITS_DATASET_ID}/poll-download"
GEOJSON_URL = "https://download.example.com/exits.geojson"


def _exit(name, code, lon, lat, geometry_type="Point"):
    return {
        "type": "Feature",
        "geometry": {"type": geometry_type, "coordinates": [lon, lat]},
        "properties": {"OBJECTID": 1, "STATION_NA": name, "EXIT_CODE": code},
    }


def _serve(*features):
    responses.add(responses.GET, INIT_URL, json={"code": 0, "data": {}}, status=201)
    responses.add(
        responses.GET, POLL_URL, json={"code": 0, "data": {"url": GEOJSON_URL}}, status=200
    )
    responses.add(
        responses.GET,
        GEOJSON_URL,
        json={"type": "FeatureCollection", "features": list(features)},
        status=200,
    )


@responses.activate
def test_fetch_exits_returns_rows_with_the_suffix_stripped():
    _serve(_exit("OUTRAM PARK MRT STATION", "Exit 4", 103.8395, 1.2802))

    assert fetch_exits(requests.Session()) == [
        {"station": "OUTRAM PARK", "exit": "Exit 4", "lon": 103.8395, "lat": 1.2802}
    ]


@responses.activate
def test_fetch_exits_merges_mrt_and_lrt_stops_of_the_same_name():
    _serve(
        _exit("PUNGGOL MRT STATION", "Exit A", 103.9022, 1.4052),
        _exit("PUNGGOL LRT STATION", "Exit B", 103.9025, 1.4049),
    )

    assert [row["station"] for row in fetch_exits(requests.Session())] == ["PUNGGOL", "PUNGGOL"]


@responses.activate
def test_fetch_exits_rejects_a_name_without_the_station_suffix():
    _serve(_exit("OUTRAM PARK", "Exit 4", 103.8395, 1.2802))

    with pytest.raises(ValueError, match="OUTRAM PARK"):
        fetch_exits(requests.Session())


@responses.activate
def test_fetch_exits_rejects_a_geometry_that_is_not_a_point():
    _serve(_exit("OUTRAM PARK MRT STATION", "Exit 4", 103.8395, 1.2802, "MultiPoint"))

    with pytest.raises(ValueError, match="MultiPoint"):
        fetch_exits(requests.Session())


@responses.activate
def test_fetch_exits_rejects_an_empty_collection():
    _serve()

    with pytest.raises(ValueError, match="no exits"):
        fetch_exits(requests.Session())


def _result(searchval):
    return {"SEARCHVAL": searchval, "LATITUDE": "1.28", "LONGITUDE": "103.84"}


def _onemap(query, *searchvals, page=1, pages=1, status=200):
    responses.add(
        responses.GET,
        config.ONEMAP_SEARCH_URL,
        match=[
            matchers.query_param_matcher(
                {"searchVal": query, "pageNum": str(page)}, strict_match=False
            )
        ],
        json={
            "found": len(searchvals),
            "totalNumPages": pages,
            "pageNum": page,
            "results": [_result(v) for v in searchvals],
        },
        status=status,
    )


@pytest.fixture
def no_sleep(monkeypatch):
    monkeypatch.setattr(stations.time, "sleep", lambda *_: None)


@responses.activate
def test_lookup_codes_reads_each_station_entry_among_the_exits(no_sleep):
    _onemap(
        "OUTRAM PARK MRT STATION",
        "OUTRAM PARK MRT STATION (EW16)",
        "OUTRAM PARK MRT STATION EXIT 1",
        "OUTRAM PARK MRT STATION (NE3)",
        "OUTRAM PARK MRT STATION (TE17)",
    )
    _onemap("OUTRAM PARK LRT STATION")

    assert lookup_codes(requests.Session(), "tok", "OUTRAM PARK") == ["EW16", "NE3", "TE17"]


@responses.activate
def test_lookup_codes_splits_an_entry_that_names_several_codes(no_sleep):
    _onemap("RAFFLES PLACE MRT STATION", "RAFFLES PLACE MRT STATION (EW14 / NS26)")
    _onemap("RAFFLES PLACE LRT STATION")

    assert lookup_codes(requests.Session(), "tok", "RAFFLES PLACE") == ["EW14", "NS26"]


@responses.activate
def test_lookup_codes_reads_both_the_mrt_and_lrt_queries(no_sleep):
    _onemap("SENGKANG MRT STATION", "SENGKANG MRT STATION (NE16)")
    _onemap("SENGKANG LRT STATION", "SENGKANG LRT STATION (STC)")

    assert lookup_codes(requests.Session(), "tok", "SENGKANG") == ["NE16", "STC"]


@responses.activate
def test_lookup_codes_ignores_a_station_whose_name_only_starts_the_same(no_sleep):
    _onemap(
        "ORCHARD MRT STATION",
        "ORCHARD BOULEVARD MRT STATION (TE13)",
        "ORCHARD MRT STATION (NS22)",
    )
    _onemap("ORCHARD LRT STATION")

    assert lookup_codes(requests.Session(), "tok", "ORCHARD") == ["NS22"]


@responses.activate
def test_lookup_codes_reads_every_page(no_sleep):
    _onemap("ORCHARD MRT STATION", "ORCHARD MRT STATION (NS22)", pages=2)
    _onemap("ORCHARD MRT STATION", "ORCHARD MRT STATION (TE14)", page=2, pages=2)
    _onemap("ORCHARD LRT STATION")

    assert lookup_codes(requests.Session(), "tok", "ORCHARD") == ["NS22", "TE14"]


@responses.activate
def test_lookup_codes_sends_the_run_token(no_sleep):
    _onemap("OUTRAM PARK MRT STATION", "OUTRAM PARK MRT STATION (EW16)")
    _onemap("OUTRAM PARK LRT STATION")

    lookup_codes(requests.Session(), "tok", "OUTRAM PARK")

    assert all(c.request.headers["Authorization"] == "Bearer tok" for c in responses.calls)


@responses.activate
def test_lookup_codes_retries_a_transient_error(no_sleep):
    _onemap("OUTRAM PARK MRT STATION", status=429)
    _onemap("OUTRAM PARK MRT STATION", "OUTRAM PARK MRT STATION (EW16)")
    _onemap("OUTRAM PARK LRT STATION")

    assert lookup_codes(requests.Session(), "tok", "OUTRAM PARK") == ["EW16"]


@responses.activate
def test_lookup_codes_raises_when_errors_outlast_the_retries(no_sleep):
    for _ in range(3):
        _onemap("OUTRAM PARK MRT STATION", status=500)

    with pytest.raises(RuntimeError, match="OUTRAM PARK MRT STATION"):
        lookup_codes(requests.Session(), "tok", "OUTRAM PARK")
