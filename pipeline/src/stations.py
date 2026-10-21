import re

import requests

from config import EXITS_DATASET_ID
from fetch import _api_get, _download_url

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
