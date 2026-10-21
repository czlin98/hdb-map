import math
import re
import time

import requests

from config import (
    EXITS_DATASET_ID,
    ONEMAP_SEARCH_URL,
    OPEN_LINES,
    STATION_NAME_OVERRIDES,
    slugify,
)
from fetch import _api_get, _download_url

_TRANSIENT = {429, 500, 502, 503, 504}

# LTA names each stop "X MRT STATION" or "X LRT STATION"; stripping the suffix merges the MRT and
# LRT stops that share a name (Punggol, Sengkang, Choa Chu Kang, Bukit Panjang).
_STATION_SUFFIX = re.compile(r"^(.*\S)\s+(MRT|LRT) STATION$")


def fetch_exits(session: requests.Session) -> list[dict]:
    """Every exit point, one row per point: some exits have several, at separate entrances."""
    url = _download_url(session, EXITS_DATASET_ID)
    features = _api_get(session, url).json()["features"]
    if not features:
        raise ValueError("the exits dataset has no exits")

    exits = []
    for feature in features:
        name = feature["properties"]["STATION_NA"]
        match = _STATION_SUFFIX.match(name)
        if not match:
            raise ValueError(f"unexpected station name: {name!r}")
        geometry = feature["geometry"]
        if geometry["type"] != "Point":
            raise ValueError(f"{name}: expected a Point exit, got {geometry['type']}")
        lon, lat = geometry["coordinates"][:2]
        exits.append(
            {
                "station": match.group(1),
                "kind": match.group(2),
                "exit": feature["properties"]["EXIT_CODE"],
                "lon": lon,
                "lat": lat,
            }
        )
    return exits


def _search_page(
    session: requests.Session,
    token: str,
    query: str,
    page: int,
    max_retries: int = 3,
    backoff: float = 1.0,
) -> dict:
    params = {"searchVal": query, "returnGeom": "N", "getAddrDetails": "N", "pageNum": page}
    headers = {"Authorization": f"Bearer {token}"}
    for attempt in range(max_retries):
        try:
            resp = session.get(ONEMAP_SEARCH_URL, params=params, headers=headers, timeout=30)
        except requests.RequestException:
            resp = None
        if resp is not None and resp.status_code == 200:
            return resp.json()
        if resp is not None and resp.status_code not in _TRANSIENT:
            break
        time.sleep(backoff * (2**attempt))
    status = resp.status_code if resp is not None else "no response"
    # Fatal, unlike a block's geocode: a station's codes can't be partly right.
    raise RuntimeError(f"OneMap search for {query!r} page {page} failed: {status}")


def lookup_codes(session: requests.Session, token: str, station: str) -> list[str]:
    """Every line code OneMap gives the station, closed lines included, in the order found."""
    # OneMap lists each code as its own entry, "OUTRAM PARK MRT STATION (EW16)", among the exits
    # and buildings; a fullmatch keeps out stations that only start the same (Orchard Boulevard).
    entry = re.compile(rf"{re.escape(station)} (?:MRT|LRT) STATION \((.+)\)")
    codes: list[str] = []
    for query in (f"{station} MRT STATION", f"{station} LRT STATION"):
        page, pages = 1, 1
        while page <= pages:
            data = _search_page(session, token, query, page)
            pages = int(data.get("totalNumPages") or 1)
            for result in data.get("results", []):
                match = entry.fullmatch(result["SEARCHVAL"])
                if match:
                    codes += [c.strip() for c in match.group(1).split("/")]
            page += 1
            time.sleep(0.2)
    return list(dict.fromkeys(codes))


def _code_order(code: str) -> tuple[int, int]:
    prefix = re.match(r"[A-Z]+", code).group()
    number = code[len(prefix) :]
    # STC and PTC (the Sengkang and Punggol LRT hubs) have no number.
    return OPEN_LINES.index(prefix), int(number) if number.isdigit() else 0


def _is_open(code: str) -> bool:
    # The whole prefix must match, so STC is never read as an SE code.
    prefix = re.match(r"[A-Z]+", code)
    return prefix is not None and prefix.group() in OPEN_LINES


def build_stations(exits: list[dict], codes_by_station: dict[str, list[str]]) -> list[dict]:
    """One station per name with its open line codes, mean point and exits, sorted by id."""
    by_station: dict[str, list[dict]] = {}
    for row in exits:
        by_station.setdefault(row["station"], []).append(row)

    stations, uncoded = [], []
    for raw_name, rows in by_station.items():
        codes = sorted(
            {c for c in codes_by_station.get(raw_name, []) if _is_open(c)}, key=_code_order
        )
        if not codes:
            uncoded.append(raw_name)
            continue
        # A merged stop can have an "Exit A" in both buildings.
        merged = len({row["kind"] for row in rows}) > 1
        name = STATION_NAME_OVERRIDES.get(raw_name, raw_name.title())
        stations.append(
            {
                "id": slugify(name),
                "name": name,
                "codes": codes,
                "lon": sum(row["lon"] for row in rows) / len(rows),
                "lat": sum(row["lat"] for row in rows) / len(rows),
                "exits": sorted(
                    (
                        {
                            "exit": f"{row['kind']} {row['exit']}" if merged else row["exit"],
                            "lon": row["lon"],
                            "lat": row["lat"],
                        }
                        for row in rows
                    ),
                    key=lambda e: (e["exit"], e["lon"], e["lat"]),
                ),
            }
        )
    if uncoded:
        raise ValueError(
            "stations with no code on an open line (add the new line to OPEN_LINES): "
            + ", ".join(sorted(uncoded))
        )
    return sorted(stations, key=lambda s: s["id"])


def fetch_stations(session: requests.Session, token: str) -> list[dict]:
    exits = fetch_exits(session)
    names = sorted({row["station"] for row in exits})
    return build_stations(exits, {name: lookup_codes(session, token, name) for name in names})


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Straight-line (great-circle) distance in metres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlam = phi2 - phi1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(a))


def nearest_station(lon: float, lat: float, stations: list[dict]) -> dict:
    """The station of the exit nearest the point, with that exit and its distance."""
    best = None
    # Sorted, with a strict comparison below, so an exact tie goes to the lower id.
    for station in sorted(stations, key=lambda s: s["id"]):
        for exit_ in station["exits"]:
            distance = haversine_m(lon, lat, exit_["lon"], exit_["lat"])
            if best is None or distance < best[0]:
                best = (distance, station, exit_["exit"])
    distance, station, exit_name = best
    return {
        "id": station["id"],
        "name": station["name"],
        "codes": station["codes"],
        "exit": exit_name,
        "distance": round(distance),
    }
