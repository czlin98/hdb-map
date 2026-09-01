import geocode
from geocode import geocode_all

BLOCKS = [
    {"blk_no": "1", "street_full": "A ROAD", "bldg_contract_town": "AMK"},
    {"blk_no": "2", "street_full": "B ROAD", "bldg_contract_town": "AMK"},
]


def test_geocode_all_splits_successes_and_failures(monkeypatch):
    calls = {"sleep": 0}

    def _count_sleep(*_):
        calls["sleep"] += 1

    monkeypatch.setattr(geocode.time, "sleep", _count_sleep)

    def fake_block(session, token, block, **kw):
        if block["blk_no"] == "1":
            return {"ok": True, "postal": "111111", "lat": "1.1", "lon": "103.1"}
        return {"ok": False, "reason": "no_match", "found": 3}

    monkeypatch.setattr(geocode, "geocode_block", fake_block)

    successes, failures = geocode_all(session=None, token="tok", blocks=BLOCKS)

    assert len(successes) == 1
    assert successes[0]["blk_no"] == "1"
    assert successes[0]["postal"] == "111111"
    assert successes[0]["lat"] == "1.1"
    assert successes[0]["bldg_contract_town"] == "AMK"  # original fields preserved

    assert failures == [
        {"blk_no": "2", "street_full": "B ROAD", "reason": "no_match", "found": 3}
    ]
    assert calls["sleep"] == 2  # paced once per block
