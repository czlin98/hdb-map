import math

import pytest
import requests
import responses
from responses import matchers

import config
import stations
from stations import build_stations, fetch_exits, haversine_m, lookup_codes, nearest_stations

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
        {"station": "OUTRAM PARK", "kind": "MRT", "exit": "Exit 4", "lon": 103.8395, "lat": 1.2802}
    ]


@responses.activate
def test_fetch_exits_merges_mrt_and_lrt_stops_of_the_same_name():
    _serve(
        _exit("PUNGGOL MRT STATION", "Exit A", 103.9022, 1.4052),
        _exit("PUNGGOL LRT STATION", "Exit B", 103.9025, 1.4049),
    )

    rows = fetch_exits(requests.Session())

    assert [(row["station"], row["kind"]) for row in rows] == [
        ("PUNGGOL", "MRT"),
        ("PUNGGOL", "LRT"),
    ]


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


def _row(station, exit_name, lon, lat, kind="MRT"):
    return {"station": station, "kind": kind, "exit": exit_name, "lon": lon, "lat": lat}


def _one(stations, station_id):
    return next(s for s in stations if s["id"] == station_id)


def test_build_stations_drops_codes_on_lines_not_yet_open():
    result = build_stations(
        [_row("ANG MO KIO", "Exit A", 103.85, 1.37)], {"ANG MO KIO": ["CR11", "NS16"]}
    )

    assert result[0]["codes"] == ["NS16"]


def test_build_stations_orders_codes_by_line_then_number_without_duplicates():
    result = build_stations(
        [_row("OUTRAM PARK", "Exit 1", 103.84, 1.28), _row("SENGKANG", "Exit A", 103.89, 1.39)],
        {
            "OUTRAM PARK": ["TE17", "EW16", "NE3", "EW16"],
            "SENGKANG": ["STC", "SE5", "NE16"],
        },
    )

    assert _one(result, "outram-park")["codes"] == ["EW16", "NE3", "TE17"]
    assert _one(result, "sengkang")["codes"] == ["NE16", "STC", "SE5"]


def test_build_stations_raises_when_two_names_share_an_id():
    rows = [_row("ONE-NORTH", "Exit A", 103.787, 1.299), _row("ONE NORTH", "Exit B", 103.788, 1.3)]

    with pytest.raises(ValueError, match="Duplicate station id"):
        build_stations(rows, {"ONE-NORTH": ["CC23"], "ONE NORTH": ["CC23"]})


def test_build_stations_orders_codes_on_one_line_by_number():
    result = build_stations([_row("X", "Exit A", 103.8, 1.3)], {"X": ["DT10", "DT9"]})

    assert result[0]["codes"] == ["DT9", "DT10"]


def test_build_stations_names_every_station_left_without_an_open_code():
    exits = [
        _row("ANG MO KIO", "Exit A", 103.85, 1.37),
        _row("NEW ONE", "Exit A", 103.8, 1.3),
        _row("OTHER NEW", "Exit A", 103.81, 1.31),
    ]
    codes = {"ANG MO KIO": ["NS16"], "NEW ONE": ["CR5"], "OTHER NEW": []}

    with pytest.raises(ValueError, match="NEW ONE.*OTHER NEW"):
        build_stations(exits, codes)


def test_build_stations_title_cases_names_with_official_spellings():
    exits = [
        _row("OUTRAM PARK", "Exit 1", 103.84, 1.28),
        _row("HARBOURFRONT", "Exit A", 103.82, 1.26),
        _row("ONE-NORTH", "Exit A", 103.79, 1.30),
    ]
    codes = {"OUTRAM PARK": ["EW16"], "HARBOURFRONT": ["NE1"], "ONE-NORTH": ["CC23"]}

    result = build_stations(exits, codes)

    assert [(s["id"], s["name"]) for s in result] == [
        ("harbourfront", "HarbourFront"),
        ("one-north", "one-north"),
        ("outram-park", "Outram Park"),
    ]


def test_build_stations_places_the_station_at_the_mean_of_every_exit_point():
    exits = [
        _row("HARBOURFRONT", "Exit A", 103.80, 1.20),
        _row("HARBOURFRONT", "Exit A", 103.84, 1.24),
        _row("HARBOURFRONT", "Exit B", 103.82, 1.25),
    ]

    station = build_stations(exits, {"HARBOURFRONT": ["NE1"]})[0]

    assert station["lon"] == pytest.approx(103.82)
    assert station["lat"] == pytest.approx(1.23)
    assert station["exits"] == [
        {"exit": "Exit A", "lon": 103.80, "lat": 1.20},
        {"exit": "Exit A", "lon": 103.84, "lat": 1.24},
        {"exit": "Exit B", "lon": 103.82, "lat": 1.25},
    ]


def test_build_stations_prefixes_exit_names_only_at_a_merged_stop():
    exits = [
        _row("BUKIT PANJANG", "Exit A", 103.76, 1.38, kind="MRT"),
        _row("BUKIT PANJANG", "Exit A", 103.77, 1.38, kind="LRT"),
        _row("OUTRAM PARK", "Exit 1", 103.84, 1.28),
    ]
    codes = {"BUKIT PANJANG": ["DT1", "BP6"], "OUTRAM PARK": ["EW16"]}

    result = build_stations(exits, codes)

    assert [e["exit"] for e in _one(result, "bukit-panjang")["exits"]] == [
        "LRT Exit A",
        "MRT Exit A",
    ]
    assert [e["exit"] for e in _one(result, "outram-park")["exits"]] == ["Exit 1"]


def _station(station_id, lon, lat, exits, codes=("NS1",)):
    return {
        "id": station_id,
        "name": station_id.title(),
        "codes": list(codes),
        "lon": lon,
        "lat": lat,
        "exits": [{"exit": name, "lon": x, "lat": y} for name, x, y in exits],
    }


def test_haversine_m_measures_a_thousandth_of_a_degree_of_latitude():
    assert haversine_m(103.8, 1.3, 103.8, 1.301) == pytest.approx(111.2, abs=0.1)


# Metres along the earth per degree of latitude, at the radius haversine_m uses.
_M_PER_DEG = 6_371_000 * math.pi / 180


def _north(station_id, metres, codes=("NS1",)):
    """A station with one exit the given distance due north of the block at (103.8, 1.3)."""
    lat = 1.3 + metres / _M_PER_DEG
    return _station(station_id, 103.8, lat, [("Exit A", 103.8, lat)], codes)


def _picked(*stations_):
    return [(s["id"], s["distance"]) for s in nearest_stations(103.8, 1.3, list(stations_))]


def test_nearest_stations_lists_every_station_within_the_radius_nearest_first():
    assert _picked(_north("c", 900), _north("a", 300), _north("b", 600)) == [
        ("a", 300),
        ("b", 600),
        ("c", 900),
    ]


def test_nearest_stations_leaves_out_a_station_past_the_radius():
    assert _picked(_north("a", 300), _north("b", 1200)) == [("a", 300)]


def test_nearest_stations_keeps_the_nearest_even_past_the_radius():
    assert _picked(_north("a", 1200), _north("b", 1500)) == [("a", 1200)]


def test_nearest_stations_measures_the_radius_in_whole_metres():
    assert _picked(_north("a", 300), _north("b", 1000.4), _north("c", 1000.6)) == [
        ("a", 300),
        ("b", 1000),
    ]


def test_nearest_stations_takes_at_most_three():
    nearby = [_north(name, metres) for name, metres in [("a", 100), ("b", 200), ("c", 300)]]

    assert _picked(*nearby, _north("d", 400)) == [("a", 100), ("b", 200), ("c", 300)]


def test_nearest_stations_puts_an_mrt_station_in_before_a_nearer_lrt_stop():
    lrt = [_north(name, metres, ["BP1"]) for name, metres in [("a", 200), ("b", 400), ("c", 600)]]

    assert _picked(*lrt, _north("mrt", 800)) == [("a", 200), ("b", 400), ("mrt", 800)]


def test_nearest_stations_keeps_the_nearest_lrt_stop_ahead_of_two_mrt_stations():
    lrt = [_north(name, metres, ["BP1"]) for name, metres in [("a", 200), ("b", 400), ("c", 600)]]

    assert _picked(*lrt, _north("m1", 800), _north("m2", 900)) == [
        ("a", 200),
        ("m1", 800),
        ("m2", 900),
    ]


def test_nearest_stations_counts_a_shared_stop_as_mrt():
    lrt = [_north(name, metres, ["PE1"]) for name, metres in [("a", 200), ("b", 400), ("c", 600)]]

    assert _picked(*lrt, _north("punggol", 800, ["NE17", "PTC"])) == [
        ("a", 200),
        ("b", 400),
        ("punggol", 800),
    ]


def test_nearest_stations_gives_each_station_its_own_nearest_exit():
    a = _station("a", 103.8, 1.301, [("Exit 1", 103.8, 1.302), ("Exit 2", 103.8, 1.301)])
    b = _station("b", 103.8, 1.304, [("Exit C", 103.8, 1.303), ("Exit D", 103.8, 1.305)])

    result = nearest_stations(103.8, 1.3, [b, a])

    assert result == [
        {
            "id": "a",
            "name": "A",
            "codes": ["NS1"],
            "exit": "Exit 2",
            "distance": round(haversine_m(103.8, 1.3, 103.8, 1.301)),
        },
        {
            "id": "b",
            "name": "B",
            "codes": ["NS1"],
            "exit": "Exit C",
            "distance": round(haversine_m(103.8, 1.3, 103.8, 1.303)),
        },
    ]
    assert [list(entry) for entry in result] == [["id", "name", "codes", "exit", "distance"]] * 2
    assert all(isinstance(entry["distance"], int) for entry in result)


def test_nearest_stations_goes_by_the_nearest_exit_not_the_station_point():
    # "far" has its point beside the block but its only exit 300 m away; "near" the reverse.
    far = _station("far", 103.8001, 1.3, [("Exit A", 103.8027, 1.3)])
    near = _station("near", 103.805, 1.3, [("Exit 1", 103.8, 1.3015)])

    assert [s["id"] for s in nearest_stations(103.8, 1.3, [far, near])] == ["near", "far"]


def test_nearest_stations_breaks_an_exact_tie_by_the_lower_id():
    a = _station("a", 103.8, 1.3, [("Exit A", 103.8, 1.301)])
    b = _station("b", 103.8, 1.3, [("Exit B", 103.8, 1.299)])

    assert [s["id"] for s in nearest_stations(103.8, 1.3, [b, a])] == ["a", "b"]


def test_lrt_lines_are_open_lines():
    assert config.LRT_LINES <= set(config.OPEN_LINES)


@responses.activate
def test_lookup_codes_does_not_wait_after_the_last_attempt(monkeypatch):
    waits = []
    monkeypatch.setattr(stations.time, "sleep", waits.append)
    for _ in range(3):
        _onemap("OUTRAM PARK MRT STATION", status=500)

    with pytest.raises(RuntimeError):
        lookup_codes(requests.Session(), "tok", "OUTRAM PARK")

    assert waits == [1.0, 2.0]
