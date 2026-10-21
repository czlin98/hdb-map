import re
import time

import requests

from config import EXITS_DATASET_ID, ONEMAP_SEARCH_URL
from fetch import _api_get, _download_url

_TRANSIENT = {429, 500, 502, 503, 504}

# LTA names each stop "X MRT STATION" or "X LRT STATION"; stripping the suffix merges the MRT and
# LRT stops that share a name (Punggol, Sengkang, Choa Chu Kang, Bukit Panjang).
_STATION_SUFFIX = re.compile(r"^(.*\S)\s+(?:MRT|LRT) STATION$")


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
