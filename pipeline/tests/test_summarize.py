import csv
import json

import pytest

from export import write_outputs
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


def _snap(*blocks, failures=()):
    return Snapshot(
        blocks={f"{b['blk_no']}-amk": b for b in blocks},
        failures={(f["blk_no"], f["street_full"]): f for f in failures},
    )


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
        "nearest_station": station,
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
