import json

import pytest

import config
from towns import load_towns


def test_load_canonical_towns_has_27_rows():
    towns = load_towns(config.TOWNS_PATH)
    assert len(towns) == 27
    assert all({"town", "town_slug", "town_code"} <= t.keys() for t in towns)


def test_town_slugs_are_unique():
    towns = load_towns(config.TOWNS_PATH)
    slugs = [t["town_slug"] for t in towns]
    assert len(slugs) == len(set(slugs))


def test_kallang_whampoa_slug():
    towns = load_towns(config.TOWNS_PATH)
    kw = next(t for t in towns if t["town_code"] == "KWN")
    assert kw["town"] == "KALLANG/WHAMPOA"
    assert kw["town_slug"] == "kallang-whampoa"


def test_malformed_row_raises(tmp_path):
    bad = tmp_path / "towns.json"
    bad.write_text(json.dumps([{"town": "X"}]), encoding="utf-8")
    with pytest.raises(ValueError):
        load_towns(bad)
