"""Load the canonical town master list."""

import json
from pathlib import Path

REQUIRED_KEYS = {"town", "town_slug", "town_code"}


def load_towns(path: Path) -> list[dict]:
    towns = json.loads(Path(path).read_text(encoding="utf-8"))
    for row in towns:
        if not REQUIRED_KEYS <= row.keys():
            raise ValueError(f"Malformed town row (missing keys): {row!r}")
    return towns
