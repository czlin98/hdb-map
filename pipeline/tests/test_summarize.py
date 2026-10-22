import csv
import json

import pytest

from export import write_outputs, write_stations
from summarize import LIST_LIMIT, Snapshot, load_snapshot, summarize, write_summary

TOWNS = [
    {"town": "ANG MO KIO", "town_slug": "ang-mo-kio", "town_code": "AMK"},
    {"town": "BEDOK", "town_slug": "bedok", "town_code": "BD"},
]


def _block(blk_no="123", **over):
    base = {
        "blk_no": blk_no,
        "street": "ANG MO KIO AVE 3",
        "street_full": "ANG MO KIO AVENUE 3",
        "postal": "560123",
        "town": "ANG MO KIO",
        "year_completed": 1978,
        "max_floor_lvl": 12,
        "total_dwelling_units": 100,
        "sold_units_by_type": {"3room": 40, "4room": 60},
        "rental_units_by_type": {},
        "lon": 103.84,
        "lat": 1.36,
    }
    base.update(over)
    return base


def _snap(*blocks, failures=(), stations=None, exits=None):
    return Snapshot(
        blocks={f"{b['blk_no']}-amk": b for b in blocks},
        failures={(f["blk_no"], f["street_full"]): f for f in failures},
        stations=stations or {},
        exits=exits or {},
    )


def _nearest(name="Bishan", distance=350):
    return {
        "id": name.lower(),
        "name": name,
        "codes": ["NS17"],
        "exit": "Exit A",
        "distance": distance,
    }


AMK = {"ang-mo-kio": {"name": "Ang Mo Kio", "codes": ["NS16"]}}
AMK_EXITS = {("ang-mo-kio", "Exit A"): [(103.849, 1.369)]}


def _failure(blk_no, reason="no_match", found="", street_full="ANG MO KIO AVENUE 3"):
    return {"blk_no": blk_no, "street_full": street_full, "reason": reason, "found": found}


def test_no_differences_is_kind_none():
    s = summarize(_snap(_block()), _snap(_block()))
    assert (s.kind, s.added, s.removed, s.changed) == ("none", 0, 0, 0)
    assert (
        s.text == "1 → 1 blocks (+0 added, 0 removed, 0 changed)\n\nFailed blocks: 0 (unchanged)\n"
    )


def test_added_blocks_are_listed_by_label():
    s = summarize(_snap(_block()), _snap(_block(), _block("124")))
    assert (s.kind, s.added) == ("refresh", 1)
    assert "Added (1):\n- 124 ANG MO KIO AVE 3 (ANG MO KIO)" in s.text


def test_a_removed_block_says_whether_it_failed_or_left_hdbs_data():
    before = _snap(_block(), _block("124"), _block("125"))
    after = _snap(_block(), failures=[_failure("124", "no_results", found="0")])
    s = summarize(before, after)
    assert s.removed == 2
    assert "- 124 ANG MO KIO AVE 3 (ANG MO KIO): failed, no_results\n" in s.text
    assert "- 125 ANG MO KIO AVE 3 (ANG MO KIO): no longer in HDB's data" in s.text


def test_changed_fields_are_named_with_both_values():
    after = _block(
        year_completed=1979,
        total_dwelling_units=101,
        sold_units_by_type={"3room": 40, "4room": 59, "5room": 2},
        rental_units_by_type={"1room": 5},
    )
    s = summarize(_snap(_block()), _snap(after))
    assert s.changed == 1
    assert (
        "- 123 ANG MO KIO AVE 3 (ANG MO KIO): year 1978 → 1979; total units 100 → 101; "
        "sold 4room 60 → 59; sold 5room 0 → 2; rental 1room 0 → 5"
    ) in s.text


def test_any_coordinate_change_is_reported_as_stored():
    s = summarize(_snap(_block()), _snap(_block(lon=103.840001)))
    assert s.changed == 1
    assert "lon/lat 103.84, 1.36 → 103.840001, 1.36" in s.text


def test_long_sections_are_capped_but_counted_in_full():
    extra = [_block(str(n)) for n in range(1000, 1000 + LIST_LIMIT + 5)]
    s = summarize(_snap(), _snap(*extra))
    assert s.added == LIST_LIMIT + 5
    assert f"Added ({LIST_LIMIT + 5}):" in s.text
    assert "- … and 5 more" in s.text
    assert s.text.count("\n- ") == LIST_LIMIT + 1


def test_only_failure_changes_is_kind_failures():
    before = _snap(_block(), failures=[_failure("9", "no_match"), _failure("8")])
    after = _snap(
        _block(),
        failures=[_failure("9", "no_match", found="2"), _failure("7", "missing_year")],
    )
    s = summarize(before, after)
    assert s.kind == "failures"
    assert "Failed blocks: 2 (was 2)" in s.text
    assert "Newly failing (1):\n- 7 ANG MO KIO AVENUE 3: missing_year" in s.text
    assert "Fixed (1):\n- 8 ANG MO KIO AVENUE 3: no_match" in s.text
    assert (
        "Failure details changed (1):\n"
        "- 9 ANG MO KIO AVENUE 3: no_match → no_match, 2 OneMap results"
    ) in s.text


def test_load_snapshot_reads_what_export_writes(tmp_path):
    station = {"id": "a", "name": "A", "codes": ["NS1"], "exit": "Exit A", "distance": 350}
    rec = {
        **_block(),
        "id": "123-amk",
        "town_slug": "ang-mo-kio",
        "station_distance": 350,
        "nearest_stations": [station],
    }
    write_outputs([rec], TOWNS, app_data_dir=tmp_path)
    failed = tmp_path / "failed.csv"
    with failed.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["blk_no", "street_full", "reason", "found"])
        writer.writeheader()
        writer.writerow(_failure("9"))

    snap = load_snapshot(tmp_path, failed)
    block = snap.blocks["123-amk"]
    assert (block["lon"], block["lat"], block["total_dwelling_units"]) == (103.84, 1.36, 100)
    assert block["sold_units_by_type"] == {"3room": 40, "4room": 60}
    assert list(snap.failures) == [("9", "ANG MO KIO AVENUE 3")]


def test_load_snapshot_of_a_first_run_is_empty(tmp_path):
    snap = load_snapshot(tmp_path / "missing", tmp_path / "missing.csv")
    assert (snap.blocks, snap.failures) == ({}, {})


@pytest.mark.parametrize("kind", ["refresh", "none"])
def test_write_summary_is_json_the_workflow_can_read(tmp_path, kind):
    before = _snap(_block())
    after = _snap(_block(), _block("124")) if kind == "refresh" else _snap(_block())
    path = tmp_path / "summary.json"
    write_summary(summarize(before, after), path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["kind"] == kind
    assert set(data) == {"kind", "added", "removed", "changed", "text"}


def test_a_changed_distance_and_station_are_named_with_both_values():
    before = _block(station_distance=350, nearest_station=_nearest("Bishan", 350))
    after = _block(station_distance=420, nearest_station=_nearest("Marymount", 420))
    s = summarize(_snap(before), _snap(after))
    assert s.changed == 1
    assert "(ANG MO KIO): MRT distance 350 → 420; station Bishan → Marymount" in s.text


def test_station_sections_list_names_and_codes():
    before = {
        **AMK,
        "bishan": {"name": "Bishan", "codes": ["NS17"]},
        "old": {"name": "Old", "codes": ["EW1"]},
    }
    after = {
        **AMK,
        "bishan": {"name": "Bishan", "codes": ["NS17", "CC15"]},
        "new": {"name": "New", "codes": ["TE30", "CR2"]},
    }
    s = summarize(
        _snap(_block(), stations=before, exits=AMK_EXITS),
        _snap(_block(), stations=after, exits=AMK_EXITS),
    )
    assert "Stations added (1):\n- New (TE30 CR2)" in s.text
    assert "Stations removed (1):\n- Old (EW1)" in s.text
    assert "Station codes changed (1):\n- Bishan: NS17 → NS17 CC15" in s.text


def test_the_exits_line_counts_added_removed_and_moved_exits():
    before = {
        ("ang-mo-kio", "Exit A"): [(103.849, 1.369)],
        ("ang-mo-kio", "Exit B"): [(103.85, 1.37)],
        ("ang-mo-kio", "Exit C"): [(103.851, 1.371)],
    }
    after = {
        ("ang-mo-kio", "Exit A"): [(103.849, 1.369)],
        ("ang-mo-kio", "Exit B"): [(103.8501, 1.37)],
        ("ang-mo-kio", "Exit D"): [(103.852, 1.372)],
    }
    s = summarize(
        _snap(_block(), stations=AMK, exits=before), _snap(_block(), stations=AMK, exits=after)
    )
    assert "Exits: +1 added, 1 removed, 1 moved" in s.text


def test_an_exit_with_two_points_that_moves_counts_once():
    before = {("ang-mo-kio", "Exit A"): [(103.849, 1.369), (103.84, 1.36)]}
    after = {("ang-mo-kio", "Exit A"): [(103.8491, 1.369), (103.84, 1.3601)]}
    s = summarize(
        _snap(_block(), stations=AMK, exits=before), _snap(_block(), stations=AMK, exits=after)
    )
    assert "Exits: +0 added, 0 removed, 1 moved" in s.text


def test_unchanged_exits_add_no_line():
    s = summarize(
        _snap(_block(), stations=AMK, exits=AMK_EXITS),
        _snap(_block(), stations=AMK, exits=AMK_EXITS),
    )
    assert s.kind == "none"
    assert "Exits" not in s.text


def test_station_changes_without_a_block_change_are_kind_stations():
    moved = {("ang-mo-kio", "Exit A"): [(103.8491, 1.369)]}
    s = summarize(
        _snap(_block(), stations=AMK, exits=AMK_EXITS), _snap(_block(), stations=AMK, exits=moved)
    )
    assert s.kind == "stations"


def test_a_block_change_keeps_kind_refresh_and_still_lists_stations():
    after_stations = {**AMK, "new": {"name": "New", "codes": ["TE30"]}}
    s = summarize(
        _snap(_block(), stations=AMK, exits=AMK_EXITS),
        _snap(_block(), _block("124"), stations=after_stations, exits=AMK_EXITS),
    )
    assert s.kind == "refresh"
    assert "Stations added (1):\n- New (TE30)" in s.text


def test_station_and_failure_changes_together_are_kind_stations():
    after_stations = {**AMK, "new": {"name": "New", "codes": ["TE30"]}}
    s = summarize(
        _snap(_block(), stations=AMK, exits=AMK_EXITS),
        _snap(_block(), failures=[_failure("9")], stations=after_stations, exits=AMK_EXITS),
    )
    assert s.kind == "stations"
    assert "Newly failing (1):" in s.text


def test_a_first_run_without_stations_before_has_no_station_sections():
    s = summarize(_snap(_block()), _snap(_block(), stations=AMK, exits=AMK_EXITS))
    assert s.kind == "none"
    assert "Station" not in s.text and "Exits" not in s.text


def test_load_snapshot_reads_the_stations_file(tmp_path):
    station = {
        "id": "ang-mo-kio",
        "name": "Ang Mo Kio",
        "codes": ["NS16"],
        "lon": 103.85,
        "lat": 1.37,
        "exits": [
            {"exit": "Exit A", "lon": 103.849, "lat": 1.369},
            {"exit": "Exit A", "lon": 103.84, "lat": 1.36},
        ],
    }
    write_stations([station], app_data_dir=tmp_path)

    snap = load_snapshot(tmp_path, tmp_path / "failed.csv")
    assert snap.stations == AMK
    assert snap.exits == {("ang-mo-kio", "Exit A"): [(103.84, 1.36), (103.849, 1.369)]}
