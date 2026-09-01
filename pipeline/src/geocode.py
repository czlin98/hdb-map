"""Stage 2: OneMap geocoding (token, per-block gate, batch loop)."""

import requests

from config import ONEMAP_TOKEN_URL


def get_token(session: requests.Session, email: str, password: str) -> str:
    resp = session.post(
        ONEMAP_TOKEN_URL, json={"email": email, "password": password}, timeout=30
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError("OneMap token request returned no access_token")
    return token
