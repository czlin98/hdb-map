import csv
import json
from dataclasses import dataclass, field
from pathlib import Path

from stations import load_live_stations

# Per section, so a large refresh keeps the commit message readable; the count line stays exact.
LIST_LIMIT = 30

# (field, label) compared on every block, in the order they are reported.
SCALAR_FIELDS = [
    ("street_full", "street"),
    ("postal", "postal"),
    ("town", "town"),
    ("year_completed", "year"),
    ("max_floor_lvl", "floors"),
    ("total_dwelling_units", "total units"),
    ("station_distance", "MRT distance"),
]
UNIT_FIELDS = [("sold_units_by_type", "sold"), ("rental_units_by_type", "rental")]


@dataclass
class Snapshot:
    blocks: dict[str, dict] = field(default_factory=dict)
    failures: dict[tuple[str, str], dict] = field(default_factory=dict)
    # id -> {name, codes}
    stations: dict[str, dict] = field(default_factory=dict)
    # (station id, exit name) -> sorted points: an exit name can have several (stations.py).
    exits: dict[tuple[str, str], list[tuple[float, float]]] = field(default_factory=dict)


@dataclass
class RunSummary:
    # "refresh" (blocks differ), "stations" (only station data, maybe failures too), "failures"
    # (only the failure list), or "none"; the first that applies.
    kind: str
    added: int
    removed: int
    changed: int
    text: str


def load_snapshot(app_data_dir: Path, failed_path: Path) -> Snapshot:
    """Each block's index and shard entries merged by id, plus the failure rows."""
    snap = Snapshot()
    index_path = Path(app_data_dir) / "index.geojson"
    if index_path.exists():
        for f in json.loads(index_path.read_text(encoding="utf-8"))["features"]:
            lon, lat = f["geometry"]["coordinates"]
            snap.blocks[f["properties"]["id"]] = {**f["properties"], "lon": lon, "lat": lat}
    for shard in sorted((Path(app_data_dir) / "block-details").glob("*.json")):
        for block_id, entry in json.loads(shard.read_text(encoding="utf-8")).items():
            if block_id in snap.blocks:
                snap.blocks[block_id].update(entry)
    stations_path = Path(app_data_dir) / "stations.geojson"
    for f in load_live_stations(stations_path):
        props = f["properties"]
        snap.stations[props["id"]] = {"name": props["name"], "codes": props["codes"]}
    if stations_path.exists():
        for f in json.loads(stations_path.read_text(encoding="utf-8"))["features"]:
            props = f["properties"]
            if props["kind"] == "exit":
                key = (props["station"], props["exit"])
                snap.exits.setdefault(key, []).append(tuple(f["geometry"]["coordinates"]))
        for points in snap.exits.values():
            points.sort()
    if Path(failed_path).exists():
        with Path(failed_path).open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                snap.failures[(row["blk_no"], row["street_full"])] = row
    return snap


def _label(block: dict) -> str:
    return f"{block['blk_no']} {block['street']} ({block['town']})"


def _station_names(block: dict) -> list[str]:
    if "nearest_stations" in block:
        return [s["name"] for s in block["nearest_stations"]]
    nearest = block.get("nearest_station")
    return [nearest["name"]] if nearest else []


def _changes(old: dict, new: dict) -> list[str]:
    out = [
        f"{label} {old.get(key)} → {new.get(key)}"
        for key, label in SCALAR_FIELDS
        if old.get(key) != new.get(key)
    ]
    for key, label in UNIT_FIELDS:
        before, after = old.get(key) or {}, new.get(key) or {}
        for flat_type in sorted(before.keys() | after.keys()):
            if before.get(flat_type, 0) != after.get(flat_type, 0):
                out.append(
                    f"{label} {flat_type} {before.get(flat_type, 0)} → {after.get(flat_type, 0)}"
                )
    # Names only: the distances shift by a metre with every small geocode move.
    old_names, new_names = _station_names(old), _station_names(new)
    # A snapshot from before the list holds only the nearest station; comparing the whole list
    # would report every block that gained a second station.
    compared = new_names if "nearest_stations" in old else new_names[:1]
    if old_names != compared:
        out.append(f"stations {', '.join(old_names)} → {', '.join(new_names)}")
    if (old["lon"], old["lat"]) != (new["lon"], new["lat"]):
        out.append(f"lon/lat {old['lon']}, {old['lat']} → {new['lon']}, {new['lat']}")
    return out


def _section(title: str, lines: list[str]) -> list[str]:
    if not lines:
        return []
    shown = [f"- {line}" for line in lines[:LIST_LIMIT]]
    if len(lines) > LIST_LIMIT:
        shown.append(f"- … and {len(lines) - LIST_LIMIT} more")
    return ["", f"{title} ({len(lines)}):", *shown]


def _failure_detail(row: dict) -> str:
    # `found` is OneMap's result count: blank for transform skips, "0" when nothing came back.
    found = int(row["found"] or 0)
    return f"{row['reason']}, {found} OneMap results" if found else row["reason"]


def _failure_line(row: dict) -> str:
    return f"{row['blk_no']} {row['street_full']}: {_failure_detail(row)}"


def _removal(block: dict, failures: dict[tuple[str, str], dict]) -> str:
    # A block missing this month is either gone from HDB's data or failed this run.
    failure = failures.get((block["blk_no"], block["street_full"]))
    reason = f"failed, {_failure_detail(failure)}" if failure else "no longer in HDB's data"
    return f"{_label(block)}: {reason}"


def _station_lines(before: Snapshot, after: Snapshot) -> list[str]:
    if not before.stations:
        return []  # first run with stations: every one would read as added
    added = sorted(after.stations.keys() - before.stations.keys())
    removed = sorted(before.stations.keys() - after.stations.keys())
    recoded = sorted(
        i
        for i in before.stations.keys() & after.stations.keys()
        if before.stations[i]["codes"] != after.stations[i]["codes"]
    )

    def named(station: dict) -> str:
        return f"{station['name']} ({' '.join(station['codes'])})"

    lines = _section("Stations added", [named(after.stations[i]) for i in added])
    lines += _section("Stations removed", [named(before.stations[i]) for i in removed])
    lines += _section(
        "Station codes changed",
        [
            f"{after.stations[i]['name']}: {' '.join(before.stations[i]['codes'])} → "
            f"{' '.join(after.stations[i]['codes'])}"
            for i in recoded
        ],
    )
    exits_added = len(after.exits.keys() - before.exits.keys())
    exits_removed = len(before.exits.keys() - after.exits.keys())
    exits_moved = sum(
        1 for k in before.exits.keys() & after.exits.keys() if before.exits[k] != after.exits[k]
    )
    if exits_added or exits_removed or exits_moved:
        lines += ["", f"Exits: +{exits_added} added, {exits_removed} removed, {exits_moved} moved"]
    return lines


def summarize(before: Snapshot, after: Snapshot) -> RunSummary:
    added = sorted(after.blocks.keys() - before.blocks.keys())
    removed = sorted(before.blocks.keys() - after.blocks.keys())
    changed = {
        block_id: lines
        for block_id in sorted(before.blocks.keys() & after.blocks.keys())
        if (lines := _changes(before.blocks[block_id], after.blocks[block_id]))
    }

    newly_failing = sorted(after.failures.keys() - before.failures.keys())
    fixed = sorted(before.failures.keys() - after.failures.keys())
    failure_changed = sorted(
        key
        for key in before.failures.keys() & after.failures.keys()
        if before.failures[key] != after.failures[key]
    )
    failures_differ = bool(newly_failing or fixed or failure_changed)
    station_lines = _station_lines(before, after)

    if added or removed or changed:
        kind = "refresh"
    elif station_lines:
        kind = "stations"
    elif failures_differ:
        kind = "failures"
    else:
        kind = "none"

    lines = [
        f"{len(before.blocks):,} → {len(after.blocks):,} blocks "
        f"(+{len(added)} added, {len(removed)} removed, {len(changed)} changed)"
    ]
    lines += _section("Added", [_label(after.blocks[i]) for i in added])
    lines += _section("Removed", [_removal(before.blocks[i], after.failures) for i in removed])
    lines += _section(
        "Changed", [f"{_label(after.blocks[i])}: {'; '.join(c)}" for i, c in changed.items()]
    )
    lines += station_lines

    if failures_differ:
        lines += ["", f"Failed blocks: {len(after.failures)} (was {len(before.failures)})"]
    else:
        lines += ["", f"Failed blocks: {len(after.failures)} (unchanged)"]
    lines += _section("Newly failing", [_failure_line(after.failures[k]) for k in newly_failing])
    lines += _section("Fixed", [_failure_line(before.failures[k]) for k in fixed])
    lines += _section(
        "Failure details changed",
        [
            f"{_failure_line(before.failures[k])} → {_failure_detail(after.failures[k])}"
            for k in failure_changed
        ],
    )
    return RunSummary(kind, len(added), len(removed), len(changed), "\n".join(lines) + "\n")


def write_summary(summary: RunSummary, path: Path) -> None:
    Path(path).write_text(json.dumps(summary.__dict__, ensure_ascii=False) + "\n", encoding="utf-8")
