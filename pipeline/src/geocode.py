"""Stage 2: OneMap geocoding (token, per-block gate, batch loop)."""

import logging
import time

import requests

from config import ONEMAP_SEARCH_URL, ONEMAP_TOKEN_URL

log = logging.getLogger("pipeline.geocode")


def get_token(session: requests.Session, email: str, password: str) -> str:
    resp = session.post(
        ONEMAP_TOKEN_URL, json={"email": email, "password": password}, timeout=30
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError("OneMap token request returned no access_token")
    return token


_TRANSIENT = {429, 500, 502, 503, 504}


def _norm(value: str | None) -> str:
    return (value or "").strip().upper()


def _valid_postal(postal: str | None) -> bool:
    # OneMap returns "NIL" for results with no postal (e.g. businesses sharing
    # a block); such a result must not qualify.
    return _norm(postal) not in ("", "NIL")


def _postal_matches_block(postal: str | None, blk_no: str) -> bool:
    # Every HDB postal code ends with its block number (2 Queen's Road is
    # 260002, not the co-located 266733). Several buildings can share a BLK_NO
    # and ROAD_NAME, so without this check OneMap's first match may be the wrong
    # one. Block numbers can carry a letter suffix (216B); only the digits reach
    # the postal, so compare on the digits alone.
    digits = "".join(c for c in blk_no if c.isdigit())
    if not digits:
        return True
    return _norm(postal).endswith(digits)


def geocode_block(
    session: requests.Session,
    token: str,
    block: dict,
    max_retries: int = 3,
    backoff: float = 1.0,
) -> dict:
    params = {
        "searchVal": f"{block['blk_no']} {block['street_full']}",
        "returnGeom": "Y",
        "getAddrDetails": "Y",
        "pageNum": 1,
    }
    headers = {"Authorization": f"Bearer {token}"}
    for attempt in range(max_retries):
        try:
            resp = session.get(
                ONEMAP_SEARCH_URL, params=params, headers=headers, timeout=30
            )
        except requests.RequestException:
            resp = None

        if resp is not None and resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            found = data.get("found", len(results))
            if not results:
                return {"ok": False, "reason": "no_results", "found": found}
            blk, road = _norm(block["blk_no"]), _norm(block["street_full"])
            for r in results:
                if (
                    _norm(r.get("BLK_NO")) == blk
                    and _norm(r.get("ROAD_NAME")) == road
                    and _valid_postal(r.get("POSTAL"))
                    and _postal_matches_block(r.get("POSTAL"), block["blk_no"])
                ):
                    return {
                        "ok": True,
                        "postal": r.get("POSTAL"),
                        "lat": r.get("LATITUDE"),
                        "lon": r.get("LONGITUDE"),
                    }
            return {"ok": False, "reason": "no_match", "found": found}

        # Non-transient HTTP error: give up immediately.
        if resp is not None and resp.status_code not in _TRANSIENT:
            return {"ok": False, "reason": "api_error", "found": 0}

        # Transient or connection error: back off and retry.
        time.sleep(backoff * (2 ** attempt))

    return {"ok": False, "reason": "api_error", "found": 0}


def geocode_all(
    session: requests.Session,
    token: str,
    blocks: list[dict],
    sleep: float = 0.2,
) -> tuple[list[dict], list[dict]]:
    successes: list[dict] = []
    failures: list[dict] = []
    total = len(blocks)
    for i, block in enumerate(blocks, 1):
        log.info("[%d/%d] Geocoding %s %s", i, total, block["blk_no"], block["street_full"])
        result = geocode_block(session, token, block)
        if result["ok"]:
            successes.append({
                **block,
                "postal": result["postal"],
                "lat": result["lat"],
                "lon": result["lon"],
            })
        else:
            failures.append({
                "blk_no": block["blk_no"],
                "street_full": block["street_full"],
                "reason": result["reason"],
                "found": result["found"],
            })
            log.warning(
                "[%d/%d] FAILED %s %s: %s (found %s)",
                i, total, block["blk_no"], block["street_full"],
                result["reason"], result["found"],
            )
        time.sleep(sleep)
    return successes, failures
