import pytest
import requests
import responses

import config
from stations import fetch_exits

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
